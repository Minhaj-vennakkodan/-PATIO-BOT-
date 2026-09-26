import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const automodCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage PATIO BOT Auto Moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('status').setDescription('View AutoMod status'))
    .addSubcommand(sub => sub.setName('enable').setDescription('Enable AutoMod'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable AutoMod'))
    .addSubcommandGroup(group => group
      .setName('rule')
      .setDescription('Manage AutoMod Rules')
      .addSubcommand(sub => sub
        .setName('configure')
        .setDescription('Configure a rule')
        .addStringOption(opt => opt.setName('type').setDescription('Rule Type').setRequired(true).addChoices(
          { name: 'Spam', value: 'spam' },
          { name: 'Flood', value: 'flood' },
          { name: 'Duplicate', value: 'duplicate' },
          { name: 'Mentions', value: 'mentions' },
          { name: 'Links', value: 'links' },
          { name: 'Invites', value: 'invites' },
          { name: 'Caps', value: 'caps' },
          { name: 'Emoji', value: 'emoji' },
          { name: 'Repeated Characters', value: 'repeated' },
          { name: 'Profanity', value: 'profanity' }
        ))
        .addBooleanOption(opt => opt.setName('enabled').setDescription('Enable Rule').setRequired(true))
        .addStringOption(opt => opt.setName('action').setDescription('Action').setRequired(true).addChoices(
          { name: 'Delete', value: 'delete' },
          { name: 'Warn', value: 'warn' },
          { name: 'Timeout', value: 'timeout' },
          { name: 'ChatBan', value: 'chatban' },
          { name: 'Delete & Warn', value: 'delete_warn' },
          { name: 'Delete & Timeout', value: 'delete_timeout' }
        ))
        .addIntegerOption(opt => opt.setName('threshold').setDescription('Threshold (if applicable)'))
        .addIntegerOption(opt => opt.setName('timewindow').setDescription('Time Window (seconds)'))
      )
    )
    .addSubcommandGroup(group => group
      .setName('words')
      .setDescription('Manage custom blocked words')
      .addSubcommand(sub => sub.setName('add').setDescription('Add a blocked word').addStringOption(opt => opt.setName('word').setDescription('Word to block').setRequired(true)))
      .addSubcommand(sub => sub.setName('remove').setDescription('Remove a blocked word').addStringOption(opt => opt.setName('word').setDescription('Word to unblock').setRequired(true)))
      .addSubcommand(sub => sub.setName('list').setDescription('List blocked words'))
    )
    .addSubcommandGroup(group => group
      .setName('warnings')
      .setDescription('Manage user warnings')
      .addSubcommand(sub => sub.setName('view').setDescription('View warnings').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
      .addSubcommand(sub => sub.setName('clear').setDescription('Clear warnings').addUserOption(opt => opt.setName('user').setDescription('User').setRequired(true)))
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;
    const guildId = interaction.guildId;
    const subCommandGroup = interaction.options.getSubcommandGroup();
    const subCommand = interaction.options.getSubcommand();

    try {
      if (!subCommandGroup) {
        if (subCommand === 'enable' || subCommand === 'disable') {
          const enabled = subCommand === 'enable';
          await prisma.guildConfig.upsert({
            where: { guildId },
            update: { autoModEnabled: enabled },
            create: { guildId, autoModEnabled: enabled }
          });
          await interaction.reply({ content: `AutoMod has been **${enabled ? 'Enabled' : 'Disabled'}**.`, ephemeral: true });
          return;
        }

        if (subCommand === 'status') {
          const config = await prisma.guildConfig.findUnique({ where: { guildId } });
          const rules = await prisma.autoModRule.findMany({ where: { guildId } });
          
          const embed = new EmbedBuilder()
            .setTitle('🛡️ AutoMod Status')
            .setColor('#2b2d31')
            .addFields({ name: 'System', value: config?.autoModEnabled ? '🟢 ENABLED' : '🔴 DISABLED' });
            
          let ruleStr = '';
          for (const rule of rules) {
            ruleStr += `${rule.ruleType}: ${rule.enabled ? '🟢' : '🔴'} | Action: ${rule.action}\n`;
          }
          if (ruleStr) embed.addFields({ name: 'Rules', value: ruleStr });
          
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
      }

      if (subCommandGroup === 'rule' && subCommand === 'configure') {
        const type = interaction.options.getString('type', true);
        const enabled = interaction.options.getBoolean('enabled', true);
        const action = interaction.options.getString('action', true);
        const threshold = interaction.options.getInteger('threshold');
        const timeWindow = interaction.options.getInteger('timewindow');

        await prisma.autoModRule.upsert({
          where: { guildId_ruleType: { guildId, ruleType: type } },
          update: { enabled, action, threshold, timeWindow },
          create: { guildId, ruleType: type, enabled, action, threshold, timeWindow }
        });

        logger.info(`Guild ${guildId} configured AutoMod rule ${type}`);
        await interaction.reply({ content: `Rule **${type}** updated.\nEnabled: ${enabled}\nAction: ${action}`, ephemeral: true });
        return;
      }

      if (subCommandGroup === 'words') {
        if (subCommand === 'add') {
          const word = interaction.options.getString('word', true).toLowerCase();
          await prisma.autoModWord.upsert({
            where: { guildId_word: { guildId, word } },
            update: {},
            create: { guildId, word }
          });
          await interaction.reply({ content: `Added \`${word}\` to blocked words.`, ephemeral: true });
          return;
        }
        if (subCommand === 'remove') {
          const word = interaction.options.getString('word', true).toLowerCase();
          await prisma.autoModWord.deleteMany({ where: { guildId, word } });
          await interaction.reply({ content: `Removed \`${word}\` from blocked words.`, ephemeral: true });
          return;
        }
        if (subCommand === 'list') {
          const words = await prisma.autoModWord.findMany({ where: { guildId } });
          if (words.length === 0) {
            await interaction.reply({ content: 'No blocked words found.', ephemeral: true });
            return;
          }
          await interaction.reply({ content: `**Blocked Words:**\n${words.map(w => w.word).join(', ')}`, ephemeral: true });
          return;
        }
      }

      if (subCommandGroup === 'warnings') {
        const user = interaction.options.getUser('user', true);
        if (subCommand === 'view') {
          const warnings = await prisma.moderationWarning.findMany({ where: { guildId, userId: user.id } });
          if (warnings.length === 0) {
            await interaction.reply({ content: 'No warnings found for this user.', ephemeral: true });
            return;
          }
          
          let wStr = '';
          warnings.forEach(w => { wStr += `• **[${w.rule || 'Manual'}]** ${w.reason} (<t:${Math.floor(w.createdAt.getTime()/1000)}:R>)\n`; });
          
          const embed = new EmbedBuilder().setTitle(`Warnings for ${user.tag}`).setDescription(wStr).setColor('#FFA500');
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        if (subCommand === 'clear') {
          await prisma.moderationWarning.deleteMany({ where: { guildId, userId: user.id } });
          await interaction.reply({ content: `Cleared all warnings for <@${user.id}>.`, ephemeral: true });
          return;
        }
      }

    } catch (error) {
      logger.error('Error handling automod command:', error);
      await interaction.reply({ content: 'An error occurred. Check logs.', ephemeral: true }).catch(() => {});
      return;
    }
  },
};

export default automodCommand;
