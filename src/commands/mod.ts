import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { isAdministrator, hasModeratorPermission } from '../utils/permissions';
import { createCase, getUserHistory, getCaseByNumber } from '../utils/moderationCaseService';
import { logModerationCase } from '../utils/moderationLogService';
import { applyChatBan } from '../utils/chatBanService';

export default {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Advanced Moderation Commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    // /mod warn
    .addSubcommand(sub =>
      sub
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning').setRequired(false))
    )
    // /mod timeout
    .addSubcommand(sub =>
      sub
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to timeout').setRequired(true))
        .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for timeout').setRequired(false))
    )
    // /mod kick
    .addSubcommand(sub =>
      sub
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick').setRequired(false))
    )
    // /mod ban
    .addSubcommand(sub =>
      sub
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban').setRequired(false))
    )
    // /mod unban
    .addSubcommand(sub =>
      sub
        .setName('unban')
        .setDescription('Unban a user by ID')
        .addStringOption(opt => opt.setName('userid').setDescription('User ID to unban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for unban').setRequired(false))
    )
    // /mod chatban
    .addSubcommand(sub =>
      sub
        .setName('chatban')
        .setDescription('ChatBan a user (isolate from server communication)')
        .addUserOption(opt => opt.setName('user').setDescription('User to ChatBan').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ChatBan').setRequired(false))
    )
    // /mod history
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('View a user\'s moderation history')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
    )
    // /mod case
    .addSubcommand(sub =>
      sub
        .setName('case')
        .setDescription('View a specific moderation case')
        .addIntegerOption(opt => opt.setName('number').setDescription('Case number').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;
    
    // Check baseline permissions for all subcommands
    const modMember = await interaction.guild.members.fetch(interaction.user.id);
    const isMod = await hasModeratorPermission(modMember);
    const isAdmin = isAdministrator(modMember);

    if (!isMod && !isAdmin) {
      await interaction.reply({ content: '❌ You do not have permission to use moderation commands.', ephemeral: true });
      return;
    }

    const subCommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const moderator = interaction.user;

    try {
      if (['warn', 'timeout', 'kick', 'ban', 'chatban'].includes(subCommand)) {
        const targetUser = interaction.options.getUser('user', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (targetUser.id === moderator.id) {
          await interaction.reply({ content: '❌ You cannot moderate yourself.', ephemeral: true });
          return;
        }

        if (targetMember) {
          if (targetMember.roles.highest.position >= modMember.roles.highest.position && !isAdmin) {
            await interaction.reply({ content: '❌ You cannot moderate a user with an equal or higher role.', ephemeral: true });
            return;
          }
        }

        let actionExecuted = false;
        let actionName: any = '';
        let durationSecs: number | undefined = undefined;

        if (subCommand === 'warn') {
          // Warning doesn't have a Discord API action inherently, so it's always "successful"
          actionExecuted = true;
          actionName = 'WARN';
        } else if (subCommand === 'timeout') {
          if (!targetMember || !targetMember.moderatable) {
            await interaction.reply({ content: '❌ I cannot timeout this user. They are not in the server or have a higher role than the bot.', ephemeral: true });
            return;
          }
          const durationMins = interaction.options.getInteger('duration', true);
          durationSecs = durationMins * 60;
          await targetMember.timeout(durationMins * 60 * 1000, reason);
          actionExecuted = true;
          actionName = 'TIMEOUT';
        } else if (subCommand === 'kick') {
          if (!targetMember || !targetMember.kickable) {
            await interaction.reply({ content: '❌ I cannot kick this user. They are not in the server or have a higher role than the bot.', ephemeral: true });
            return;
          }
          await targetMember.kick(reason);
          actionExecuted = true;
          actionName = 'KICK';
        } else if (subCommand === 'ban') {
          if (targetMember && !targetMember.bannable) {
            await interaction.reply({ content: '❌ I cannot ban this user. They have a higher role than the bot.', ephemeral: true });
            return;
          }
          await interaction.guild.members.ban(targetUser.id, { reason });
          actionExecuted = true;
          actionName = 'BAN';
        } else if (subCommand === 'chatban') {
          if (!targetMember) {
            await interaction.reply({ content: '❌ User is not in the server.', ephemeral: true });
            return;
          }
          try {
            await applyChatBan(interaction.guild, targetMember, moderator, reason);
            actionExecuted = true;
            actionName = 'CHATBAN';
          } catch (e: any) {
            await interaction.reply({ content: `❌ Failed to ChatBan: ${e.message}`, ephemeral: true });
            return;
          }
        }

        if (actionExecuted) {
          let caseCreated = false;
          let caseNum = 0;
          try {
            const modCase = await createCase({
              guildId,
              userId: targetUser.id,
              moderatorId: moderator.id,
              action: actionName,
              reason,
              source: 'MANUAL',
              duration: durationSecs
            });
            caseCreated = true;
            caseNum = modCase.caseNumber;
            await logModerationCase(interaction.client, modCase);
          } catch (err) {
            logger.error(`Failed to create moderation case for ${actionName} on ${targetUser.id}`, err);
          }

          const actionVerbs: Record<string, string> = { WARN: 'Warned', TIMEOUT: 'Timed out', KICK: 'Kicked', BAN: 'Banned', CHATBAN: 'ChatBanned' };
          let msg = `✅ ${actionVerbs[actionName]} <@${targetUser.id}>.`;
          if (caseCreated) {
            msg += ` (Case #${caseNum})`;
          } else {
            msg += ` ⚠️ Action succeeded but failed to log case in database.`;
          }
          await interaction.reply({ content: msg });
        }
        return;
      }

      if (subCommand === 'unban') {
        const userId = interaction.options.getString('userid', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        await interaction.guild.members.unban(userId, reason).catch(() => null);

        let caseCreated = false;
        let caseNum = 0;
        try {
          const modCase = await createCase({
            guildId,
            userId,
            moderatorId: moderator.id,
            action: 'UNBAN',
            reason,
            source: 'MANUAL'
          });
          caseCreated = true;
          caseNum = modCase.caseNumber;
          await logModerationCase(interaction.client, modCase);
        } catch (err) {
          logger.error(`Failed to create unban case for ${userId}`, err);
        }

        let msg = `✅ Unbanned user ID \`${userId}\`.`;
        if (caseCreated) msg += ` (Case #${caseNum})`;
        else msg += ` ⚠️ Action succeeded but failed to log case in database.`;
        
        await interaction.reply({ content: msg });
        return;
      }

      if (subCommand === 'history') {
        const targetUser = interaction.options.getUser('user', true);
        const history = await getUserHistory(guildId, targetUser.id, 10);
        
        if (history.length === 0) {
          await interaction.reply({ content: `No moderation history found for <@${targetUser.id}>.`, ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`Moderation History for ${targetUser.tag}`)
          .setColor('#2b2d31');

        let desc = '';
        for (const c of history) {
          desc += `**Case #${c.caseNumber}** — ${c.action} [${c.source}]\nReason: ${c.reason}\n\n`;
        }
        embed.setDescription(desc);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subCommand === 'case') {
        const caseNumber = interaction.options.getInteger('number', true);
        const modCase = await getCaseByNumber(guildId, caseNumber);

        if (!modCase) {
          await interaction.reply({ content: `❌ Case #${caseNumber} not found in this server.`, ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(`Case #${modCase.caseNumber} | ${modCase.action}`)
          .setColor('#2b2d31')
          .addFields(
            { name: 'User', value: `<@${modCase.userId}> (${modCase.userId})`, inline: true },
            { name: 'Moderator', value: `<@${modCase.moderatorId}>`, inline: true },
            { name: 'Source', value: modCase.source, inline: true },
            { name: 'Reason', value: modCase.reason || 'None', inline: false },
            { name: 'Created At', value: `<t:${Math.floor(modCase.createdAt.getTime() / 1000)}:f>`, inline: false }
          );

        if (modCase.duration) {
          embed.addFields({ name: 'Duration', value: `${modCase.duration} seconds`, inline: true });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

    } catch (error) {
      logger.error('Error in /mod command:', error);
      await interaction.reply({ content: 'An error occurred while processing the moderation command.', ephemeral: true }).catch(() => {});
    }
  }
};
