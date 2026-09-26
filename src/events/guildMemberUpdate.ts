import { Events, GuildMember } from 'discord.js';
import { BotEvent } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { canBotManageRole } from '../utils/permissions';

const debounceMap = new Map<string, number>();

const guildMemberUpdateEvent: BotEvent = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember: GuildMember, newMember: GuildMember) {
    if (oldMember.roles.cache.size === newMember.roles.cache.size) return; // Not a role change

    const guildId = newMember.guild.id;
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    
    if (!config || !config.chatBanEnabled || !config.chatBanSelfHealingEnabled) return;

    // Check if user is actively ChatBanned
    const record = await prisma.chatBanRecord.findFirst({
      where: { guildId, userId: newMember.id, active: true }
    });

    if (!record) return;

    const chatBanRoleId = config.chatBanRoleId;
    if (!chatBanRoleId) return;

    const chatBanRole = newMember.guild.roles.cache.get(chatBanRoleId);
    const highestBotRole = newMember.guild.members.me?.roles.highest;

    if (!chatBanRole || !highestBotRole || highestBotRole.position <= chatBanRole.position) return;

    // Debounce to prevent rapid loop (cooldown 3 seconds per user per guild)
    const debounceKey = `${guildId}_${newMember.id}`;
    const lastAction = debounceMap.get(debounceKey);
    if (lastAction && Date.now() - lastAction < 3000) {
      return;
    }

    let modified = false;

    // SCENARIO 1: Someone removed the ChatBan role
    if (oldMember.roles.cache.has(chatBanRoleId) && !newMember.roles.cache.has(chatBanRoleId)) {
      try {
        await newMember.roles.add(chatBanRole);
        logger.info(`Self-healed ChatBan role for ${newMember.id} in ${guildId}`);
        modified = true;
      } catch (err) {
        logger.error(`Failed to self-heal ChatBan role for ${newMember.id}`, err);
      }
    }

    // SCENARIO 2: Someone gave them a manageable role
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    for (const role of addedRoles.values()) {
      if (canBotManageRole(newMember.guild, role.id) && role.id !== chatBanRoleId) {
        try {
          await newMember.roles.remove(role);
          logger.info(`Removed unauthorized role ${role.id} from ChatBanned user ${newMember.id}`);
          modified = true;
        } catch (err) {
          logger.error(`Failed to remove unauthorized role ${role.id} from ${newMember.id}`, err);
        }
      }
    }

    if (modified) {
      debounceMap.set(debounceKey, Date.now());
    }
  }
};

export default guildMemberUpdateEvent;
