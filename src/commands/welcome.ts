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
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Interaction,
  GuildMember
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { buildWelcomeMessage } from '../utils/welcomeUtils';

const welcomeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure the Advanced Welcome System')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('setup').setDescription('Interactive welcome system setup'))
    .addSubcommand(sub => sub.setName('test').setDescription('Test the welcome message'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Disable the welcome system'))
    .addSubcommand(sub => sub.setName('config').setDescription('View current welcome configuration')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) return;

    const sub = interaction.options.getSubcommand();
    
    // Ensure GuildConfig exists
    let config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config) {
      config = await prisma.guildConfig.create({ data: { guildId: interaction.guildId } });
    }

    if (sub === 'setup') {
      const channelSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('welcome_channel_select')
          .setPlaceholder('Select Welcome Channel')
          .addChannelTypes(ChannelType.GuildText)
      );

      const textEditButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('welcome_edit_text').setLabel('Edit Message/Embed').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('welcome_edit_btn').setLabel('Edit Button').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('welcome_enable').setLabel(config.welcomeEnabled ? '✅ Enabled (Click to Disable)' : '❌ Disabled (Click to Enable)').setStyle(config.welcomeEnabled ? ButtonStyle.Success : ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle('Welcome System Setup')
        .setDescription('Use the components below to configure the welcome system.\n\n**Variables available:**\n`{user}`, `{username}`, `{displayName}`, `{server}`, `{memberNumber}`, `{memberCount}`, `{joinedAt}`, `{accountCreated}`, `{accountAge}`, `{userId}`')
        .setColor('#5865F2');

      await interaction.reply({ embeds: [embed], components: [channelSelect, textEditButton], ephemeral: true });
      logger.info(`User ${interaction.user.id} initiated welcome setup in guild ${interaction.guildId}`);
    } 
    else if (sub === 'test') {
      if (!config.welcomeChannel) {
        await interaction.reply({ content: 'Welcome channel is not set up!', ephemeral: true });
        return;
      }
      
      const memberRecord = await prisma.memberRecord.findUnique({
        where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } }
      });
      const memberNumber = memberRecord?.memberNumber || 999;
      
      const messagePayload = buildWelcomeMessage(interaction.member as GuildMember, interaction.guild!, config, memberNumber);
      
      await interaction.reply({ content: '**[PREVIEW]**\n' + (messagePayload.content || ''), embeds: messagePayload.embeds, components: messagePayload.components, ephemeral: true });
      logger.info(`User ${interaction.user.id} tested welcome in guild ${interaction.guildId}`);
    }
    else if (sub === 'disable') {
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { welcomeEnabled: false } });
      await interaction.reply({ content: 'Welcome system has been disabled.', ephemeral: true });
      logger.info(`User ${interaction.user.id} disabled welcome in guild ${interaction.guildId}`);
    }
    else if (sub === 'config') {
      const embed = new EmbedBuilder()
        .setTitle('Welcome Configuration')
        .addFields(
          { name: 'Enabled', value: config.welcomeEnabled ? 'Yes' : 'No', inline: true },
          { name: 'Channel', value: config.welcomeChannel ? `<#${config.welcomeChannel}>` : 'Not set', inline: true },
          { name: 'Title', value: config.welcomeTitle || 'Not set', inline: true },
          { name: 'Description', value: config.welcomeDescription || 'Not set', inline: true },
          { name: 'Color', value: config.welcomeColor || 'Default', inline: true },
          { name: 'Button Enabled', value: config.welcomeButtonEnabled ? 'Yes' : 'No', inline: true }
        )
        .setColor('#5865F2');
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};

export default welcomeCommand;
