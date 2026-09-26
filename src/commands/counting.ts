import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  ChannelType
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const countingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Configure the Counting System')
    .addSubcommand(sub => 
      sub.setName('setup')
         .setDescription('Interactive counting system setup')
    )
    .addSubcommand(sub => 
      sub.setName('enable')
         .setDescription('Enable the counting system')
    )
    .addSubcommand(sub => 
      sub.setName('disable')
         .setDescription('Disable the counting system')
    )
    .addSubcommand(sub => 
      sub.setName('reset')
         .setDescription('Reset the current count to a specific number')
         .addIntegerOption(opt => opt.setName('number').setDescription('The number to start counting from').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('stats')
         .setDescription('View counting statistics')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    const sub = interaction.options.getSubcommand();
    
    // Non-admin can only use stats
    if (sub !== 'stats' && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      return;
    }

    let config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config) {
      config = await prisma.guildConfig.create({ data: { guildId: interaction.guildId } });
    }

    if (sub === 'setup') {
      const channelSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('counting_channel_select')
          .setPlaceholder('Select Counting Channel')
          .addChannelTypes(ChannelType.GuildText)
      );

      const embed = new EmbedBuilder()
        .setTitle('Counting System Setup')
        .setDescription(`Current channel: ${config.countingChannelId ? `<#${config.countingChannelId}>` : 'None'}\nUse the dropdown below to set or change the counting channel.`)
        .setColor('#5865F2');

      await interaction.reply({ embeds: [embed], components: [channelSelect], ephemeral: true });
    } 
    else if (sub === 'enable') {
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { countingEnabled: true } });
      await interaction.reply({ content: 'Counting system enabled.', ephemeral: true });
      logger.info(`Counting system enabled in ${interaction.guildId}`);
    }
    else if (sub === 'disable') {
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { countingEnabled: false } });
      await interaction.reply({ content: 'Counting system disabled.', ephemeral: true });
      logger.info(`Counting system disabled in ${interaction.guildId}`);
    }
    else if (sub === 'reset') {
      const num = interaction.options.getInteger('number', true);
      if (num < 1) {
        await interaction.reply({ content: 'Starting number must be at least 1.', ephemeral: true });
        return;
      }
      
      await prisma.guildConfig.update({ 
        where: { guildId: interaction.guildId }, 
        data: { 
          countingCurrent: num,
          countingStreak: 0,
          countingLastUserId: null
        } 
      });
      await interaction.reply({ content: `Counter reset. The next expected number is **${num}**.`, ephemeral: false });
      logger.info(`Counting reset to ${num} in ${interaction.guildId} by ${interaction.user.id}`);
    }
    else if (sub === 'stats') {
      const embed = new EmbedBuilder()
        .setTitle('📊 Counting Statistics')
        .addFields(
          { name: 'Current Expected Number', value: String(config.countingCurrent), inline: true },
          { name: 'Current Streak', value: String(config.countingStreak), inline: true },
          { name: 'Highest Number Reached', value: String(config.countingHighest), inline: true },
          { name: 'Total Valid Counts', value: String(config.countingTotalValid), inline: true },
          { name: 'Last Counted By', value: config.countingLastUserId ? `<@${config.countingLastUserId}>` : 'Nobody', inline: true },
        )
        .setColor('#5865F2')
        .setTimestamp(config.countingLastCountAt);

      await interaction.reply({ embeds: [embed], ephemeral: false });
    }
  },
};

export default countingCommand;
