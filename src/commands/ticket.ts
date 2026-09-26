import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  TextChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { createTicketPanel } from '../utils/ticketService';

const ticketCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Configure the Advanced Ticket System')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('setup').setDescription('Interactive ticket system setup'))
    .addSubcommand(sub => sub.setName('panel').setDescription('Send the ticket panel to the configured channel'))
    .addSubcommand(sub => sub.setName('config').setDescription('View current ticket configuration')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    const sub = interaction.options.getSubcommand();
    
    let config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config) {
      config = await prisma.guildConfig.create({ data: { guildId: interaction.guildId } });
    }

    if (sub === 'setup') {
      const channelSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket_category_select')
          .setPlaceholder('Select Ticket Category')
          .addChannelTypes(ChannelType.GuildCategory)
      );

      const panelSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket_panel_channel_select')
          .setPlaceholder('Select Panel Channel')
          .addChannelTypes(ChannelType.GuildText)
      );

      const roleSelect = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('ticket_staff_role_select')
          .setPlaceholder('Select Staff Role')
      );

      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('ticket_edit_limits').setLabel('Edit Limits/Cooldown').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ticket_toggle_enable').setLabel(config.ticketEnabled ? '✅ Enabled' : '❌ Disabled').setStyle(config.ticketEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle('Ticket System Setup')
        .setDescription('Use the dropdowns below to configure the ticket system parameters.')
        .setColor('#5865F2');

      await interaction.reply({ embeds: [embed], components: [channelSelect, panelSelect, roleSelect, buttonRow], ephemeral: true });
    } 
    else if (sub === 'panel') {
      if (!config.ticketEnabled || !config.ticketPanelChannelId || !config.ticketCategoryId) {
        await interaction.reply({ content: 'Ticket system is not fully set up or enabled. Run `/ticket setup`.', ephemeral: true });
        return;
      }
      
      const channel = interaction.guild.channels.cache.get(config.ticketPanelChannelId) as TextChannel;
      if (!channel) {
        await interaction.reply({ content: 'Configured panel channel not found.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      const msg = await createTicketPanel(channel, interaction.guildId);
      
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketPanelMessageId: msg.id } });
      await interaction.followUp({ content: 'Ticket panel sent!' });
    }
    else if (sub === 'config') {
      const embed = new EmbedBuilder()
        .setTitle('Ticket Configuration')
        .addFields(
          { name: 'Enabled', value: config.ticketEnabled ? 'Yes' : 'No', inline: true },
          { name: 'Category', value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'Not set', inline: true },
          { name: 'Panel Channel', value: config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : 'Not set', inline: true },
          { name: 'Staff Role', value: config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : 'Not set', inline: true },
          { name: 'Max Tickets/User', value: String(config.ticketMaxPerUser), inline: true },
          { name: 'Cooldown (s)', value: String(config.ticketCooldownSeconds), inline: true }
        )
        .setColor('#5865F2');
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

export default ticketCommand;
