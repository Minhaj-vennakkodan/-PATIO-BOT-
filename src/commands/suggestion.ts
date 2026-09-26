import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { hasModeratorPermission } from '../utils/permissions';

export default {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Manage suggestions system')
    .addSubcommand(sub => 
      sub.setName('panel')
      .setDescription('Post the suggestion submission panel (Admin only)')
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('approve')
      .setDescription('Approve a suggestion')
      .addIntegerOption(opt => opt.setName('number').setDescription('Suggestion Number').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Optional reason').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('deny')
      .setDescription('Deny a suggestion')
      .addIntegerOption(opt => opt.setName('number').setDescription('Suggestion Number').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Optional reason').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('implement')
      .setDescription('Mark a suggestion as implemented')
      .addIntegerOption(opt => opt.setName('number').setDescription('Suggestion Number').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Optional reason').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('archive')
      .setDescription('Archive a suggestion')
      .addIntegerOption(opt => opt.setName('number').setDescription('Suggestion Number').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Optional reason').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('list')
      .setDescription('List recent suggestions')
    )
    .addSubcommand(sub => 
      sub.setName('info')
      .setDescription('Get detailed info on a suggestion')
      .addIntegerOption(opt => opt.setName('number').setDescription('Suggestion Number').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;
    const guildId = interaction.guild.id;

    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config || !config.suggestionsEnabled) {
      await interaction.reply({ content: '❌ Suggestions are currently disabled in this server.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'panel') {
        const hasPerm = await hasModeratorPermission(interaction.member as any);
        if (!hasPerm && !(interaction.member.permissions as Readonly<any>).has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: '❌ You lack permission to create a suggestion panel.', ephemeral: true });
          return;
        }

        const channelInput = interaction.options.getChannel('channel') || interaction.channel;
        if (channelInput?.type !== 0) { // TextChannel
          await interaction.reply({ content: '❌ Channel must be a standard text channel.', ephemeral: true });
          return;
        }

        const channel = channelInput as TextChannel;
        const me = await interaction.guild.members.fetch(interaction.client.user!.id);
        if (!channel.permissionsFor(me).has(['SendMessages', 'ViewChannel'])) {
          await interaction.reply({ content: '❌ Bot lacks permission to send messages in that channel.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('💡 Submit a Suggestion')
          .setDescription('Click the button below to submit a suggestion to the server.')
          .setColor('#2b2d31');

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('suggestion:submit')
            .setLabel('Submit Suggestion')
            .setEmoji('💡')
            .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Suggestion panel created in <#${channel.id}>.`, ephemeral: true });
        logger.info(`Suggestion panel created in ${guildId} by ${interaction.user.id}`);
        return;
      }

      if (sub === 'list') {
        const list = await prisma.suggestion.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 10 });
        if (list.length === 0) {
          await interaction.reply({ content: 'No suggestions found.', ephemeral: true });
          return;
        }
        const embed = new EmbedBuilder().setTitle('Recent Suggestions').setColor('#2b2d31');
        let desc = '';
        for (const s of list) {
          desc += `\`#${s.suggestionNumber}\` - ${s.status}\n`;
        }
        embed.setDescription(desc);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (sub === 'info') {
        const number = interaction.options.getInteger('number', true);
        const suggestion = await prisma.suggestion.findFirst({
          where: { guildId, suggestionNumber: number },
          include: { votes: true }
        });

        if (!suggestion) {
          await interaction.reply({ content: '❌ Suggestion not found.', ephemeral: true });
          return;
        }

        let isStaff = false;
        try {
          isStaff = await hasModeratorPermission(interaction.member as any);
        } catch(e) {}

        const embed = new EmbedBuilder()
          .setTitle(`Suggestion #${suggestion.suggestionNumber} Info`)
          .setColor('#2b2d31')
          .addFields(
            { name: 'Status', value: suggestion.status, inline: true },
            { name: 'Anonymous', value: suggestion.anonymous ? 'Yes' : 'No', inline: true }
          )
          .setTimestamp(suggestion.createdAt);

        if (suggestion.anonymous && !isStaff) {
          embed.addFields({ name: 'Author', value: 'Anonymous', inline: true });
        } else {
          embed.addFields({ name: 'Author ID', value: suggestion.authorId, inline: true });
        }

        embed.addFields(
          { name: 'Content', value: suggestion.content, inline: false },
          { name: 'Votes', value: `${suggestion.votes.filter(v => v.vote === 'UP').length} UP | ${suggestion.votes.filter(v => v.vote === 'DOWN').length} DOWN`, inline: true }
        );

        if (suggestion.staffReason) {
          embed.addFields({ name: 'Staff Reason', value: suggestion.staffReason, inline: false });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (['approve', 'deny', 'implement', 'archive'].includes(sub)) {
        const number = interaction.options.getInteger('number', true);
        const reason = interaction.options.getString('reason') || undefined;

        const hasPerm = await hasModeratorPermission(interaction.member as any);
        if (!hasPerm) {
          await interaction.reply({ content: '❌ You lack permission to moderate suggestions.', ephemeral: true });
          return;
        }

        const suggestion = await prisma.suggestion.findFirst({
          where: { guildId, suggestionNumber: number }
        });

        if (!suggestion) {
          await interaction.reply({ content: '❌ Suggestion not found.', ephemeral: true });
          return;
        }

        let newStatus: 'APPROVED' | 'DENIED' | 'IMPLEMENTED' | 'ARCHIVED' = 'ARCHIVED';
        if (sub === 'approve') newStatus = 'APPROVED';
        if (sub === 'deny') newStatus = 'DENIED';
        if (sub === 'implement') newStatus = 'IMPLEMENTED';
        if (sub === 'archive') newStatus = 'ARCHIVED';

        // Valid transitions check
        const validTransitions: Record<string, string[]> = {
          PENDING: ['APPROVED', 'DENIED', 'ARCHIVED'],
          APPROVED: ['IMPLEMENTED', 'ARCHIVED'],
          IMPLEMENTED: ['ARCHIVED'],
          DENIED: ['ARCHIVED'],
          ARCHIVED: []
        };

        if (!validTransitions[suggestion.status].includes(newStatus)) {
          await interaction.reply({ content: `❌ Cannot transition suggestion #${number} from ${suggestion.status} to ${newStatus}.`, ephemeral: true });
          return;
        }

        const { moderateSuggestion, refreshSuggestionMessage } = await import('../utils/suggestionService');
        await moderateSuggestion(suggestion.id, guildId, newStatus, interaction.user.id, reason);
        await refreshSuggestionMessage(interaction.client, guildId, suggestion.id);

        await interaction.reply({ content: `✅ Suggestion #${number} marked as ${newStatus}.`, ephemeral: true });
        logger.info(`Suggestion #${number} in ${guildId} marked ${newStatus} by ${interaction.user.id}`);
        return;
      }

    } catch (error) {
      logger.error('Error in /suggestion command:', error);
      await interaction.reply({ content: '❌ An error occurred processing the command.', ephemeral: true }).catch(() => {});
    }
  }
};
