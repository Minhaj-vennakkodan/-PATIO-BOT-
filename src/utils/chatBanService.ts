import { GuildMember, Guild, TextChannel, User, Role, CategoryChannel, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';

export const applyChatBan = async (guild: Guild, member: GuildMember, moderator: User, reason: string) => {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!config || !config.chatBanEnabled || !config.chatBanRoleId) {
    throw new Error('ChatBan is not fully configured or enabled.');
  }

  // Check if already active
  const existingRecord = await prisma.chatBanRecord.findFirst({
    where: { guildId: guild.id, userId: member.id, active: true }
  });
  if (existingRecord) {
    throw new Error('User is already ChatBanned.');
  }

  const chatBanRole = guild.roles.cache.get(config.chatBanRoleId);
  if (!chatBanRole) throw new Error('Configured ChatBan role not found.');

  const highestBotRole = guild.members.me?.roles.highest;
  if (!highestBotRole || highestBotRole.position <= chatBanRole.position) {
    throw new Error('Bot role hierarchy is too low to assign the ChatBan role.');
  }

  // Backup roles
  const rolesToBackup = member.roles.cache.filter(role => 
    role.id !== guild.id && // Not @everyone
    !role.managed && // Not an integration/bot role
    highestBotRole.position > role.position // Bot can manage it
  );

  // Create record
  const record = await prisma.chatBanRecord.create({
    data: {
      guildId: guild.id,
      userId: member.id,
      reason: reason.substring(0, 1000), // Enforce length
      bannedById: moderator.id,
      roleBackups: {
        create: rolesToBackup.map(r => ({
          roleId: r.id,
          roleNameSnapshot: r.name
        }))
      }
    }
  });

  // Remove roles
  for (const role of rolesToBackup.values()) {
    try {
      await member.roles.remove(role);
    } catch (err) {
      logger.error(`Failed to remove role ${role.id} from ${member.id}`, err);
    }
  }

  // Add ChatBan role
  try {
    await member.roles.add(chatBanRole);
  } catch (err) {
    logger.error(`Failed to assign ChatBan role to ${member.id}`, err);
    throw new Error('Failed to assign the ChatBan role.');
  }

  // Apply isolation if configured
  if (config.chatBanIsolationEnabled && config.chatBanCategoryId) {
    const category = guild.channels.cache.get(config.chatBanCategoryId) as CategoryChannel;
    if (category) {
      try {
        await category.permissionOverwrites.create(chatBanRole, {
          ViewChannel: true,
          SendMessages: true
        });
      } catch (err) {
        logger.error(`Failed to isolate ChatBan category ${category.id}`, err);
      }
    }
  }

  // Send DM
  if (config.chatBanDmEnabled) {
    try {
      await member.send(`You have been ChatBanned from ${guild.name}.\nReason: ${reason}\nDate: ${new Date().toLocaleDateString()}`);
    } catch (err) {
      logger.info(`Could not DM user ${member.id} for ChatBan.`);
    }
  }

  // Log to configured channel
  if (config.chatBanLogChannelId) {
    const logChannel = guild.channels.cache.get(config.chatBanLogChannelId) as TextChannel;
    if (logChannel) {
      await logChannel.send(`🔨 **ChatBan Applied**\nUser: <@${member.id}>\nModerator: <@${moderator.id}>\nReason: ${reason}`).catch(() => {});
    }
  }
};

export const removeChatBan = async (guild: Guild, member: GuildMember, moderator: User) => {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  if (!config) throw new Error('Configuration not found.');

  const record = await prisma.chatBanRecord.findFirst({
    where: { guildId: guild.id, userId: member.id, active: true },
    include: { roleBackups: true }
  });
  if (!record) {
    throw new Error('No active ChatBan record found for this user.');
  }

  const highestBotRole = guild.members.me?.roles.highest;

  // Restore roles
  for (const backup of record.roleBackups) {
    const role = guild.roles.cache.get(backup.roleId);
    if (role && highestBotRole && highestBotRole.position > role.position && !role.managed) {
      try {
        await member.roles.add(role);
      } catch (err) {
        logger.error(`Failed to restore role ${role.id} to ${member.id}`, err);
      }
    }
  }

  // Remove ChatBan role
  if (config.chatBanRoleId) {
    const chatBanRole = guild.roles.cache.get(config.chatBanRoleId);
    if (chatBanRole && highestBotRole && highestBotRole.position > chatBanRole.position) {
      try {
        await member.roles.remove(chatBanRole);
      } catch (err) {
        logger.error(`Failed to remove ChatBan role from ${member.id}`, err);
      }
    }
  }

  // Mark record as inactive
  await prisma.chatBanRecord.update({
    where: { id: record.id },
    data: { active: false, unbannedAt: new Date() }
  });

  // Log to configured channel
  if (config.chatBanLogChannelId) {
    const logChannel = guild.channels.cache.get(config.chatBanLogChannelId) as TextChannel;
    if (logChannel) {
      await logChannel.send(`🔓 **ChatBan Removed**\nUser: <@${member.id}>\nModerator: <@${moderator.id}>`).catch(() => {});
    }
  }
};
