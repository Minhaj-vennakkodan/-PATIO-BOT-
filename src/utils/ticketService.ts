import { Guild, GuildMember, TextChannel, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, OverwriteResolvable } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { generateAndSendTranscript } from './ticketTranscriptService';

export const createTicketPanel = async (channel: TextChannel, guildId: string) => {
  const types = await prisma.ticketType.findMany({ where: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('Need Help?')
    .setDescription('Select a ticket type below to open a new ticket and contact our staff team.')
    .setColor('#5865F2');

  const selectOptions = types.length > 0 
    ? types.map(t => ({ label: t.name, description: t.description || undefined, value: t.key, emoji: t.emoji || undefined }))
    : [
        { label: 'General Support', value: 'general' },
        { label: 'Report', value: 'report' },
        { label: 'Appeal', value: 'appeal' }
      ];

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_create_select')
      .setPlaceholder('Select Ticket Type')
      .addOptions(selectOptions)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });
  return msg;
};

export const handleTicketCreation = async (interaction: Interaction, typeKey: string) => {
  if (!interaction.isStringSelectMenu() || !interaction.guild || !interaction.member) return;

  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config || !config.ticketEnabled || !config.ticketCategoryId) {
    return interaction.reply({ content: 'Ticket system is not fully configured or disabled.', ephemeral: true });
  }

  const memberRecord = await prisma.memberRecord.findUnique({ where: { guildId_userId: { guildId, userId } } });
  
  if (config.chatBanEnabled && config.chatBanIsolationEnabled) {
    const isBanned = await prisma.chatBanRecord.findFirst({ where: { guildId, userId, active: true } });
    if (isBanned) {
      return interaction.reply({ content: 'You are currently ChatBanned and cannot create tickets.', ephemeral: true });
    }
  }
  
  // Cooldown check
  if (memberRecord?.lastTicketAt) {
    const elapsed = (Date.now() - memberRecord.lastTicketAt.getTime()) / 1000;
    if (elapsed < config.ticketCooldownSeconds) {
      return interaction.reply({ content: `You are on cooldown. Try again in Math.ceil(${config.ticketCooldownSeconds - elapsed}) seconds.`, ephemeral: true });
    }
  }

  // Max tickets check
  const activeTickets = await prisma.ticketRecord.count({
    where: { guildId, creatorId: userId, status: 'open' }
  });

  if (activeTickets >= config.ticketMaxPerUser) {
    return interaction.reply({ content: `You already have ${activeTickets} active tickets. You cannot create more right now.`, ephemeral: true });
  }

  // Generate channel name
  const allTicketsCount = await prisma.ticketRecord.count({ where: { guildId } });
  const ticketNumber = (allTicketsCount + 1).toString().padStart(4, '0');
  
  let channelName = config.ticketNameFormat
    .replace('{username}', interaction.user.username)
    .replace('{userId}', interaction.user.id)
    .replace('{ticketType}', typeKey)
    .replace('{ticketNumber}', ticketNumber);

  channelName = channelName.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32);

  const permissionOverwrites: OverwriteResolvable[] = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
    }
  ];

  if (config.ticketStaffRoleId) {
    permissionOverwrites.push({
      id: config.ticketStaffRoleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  try {
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites
    });

    const ticketRecord = await prisma.ticketRecord.create({
      data: {
        ticketId: ticketNumber,
        guildId,
        channelId: channel.id,
        creatorId: userId,
        ticketType: typeKey,
        status: 'open'
      }
    });

    await prisma.memberRecord.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { lastTicketAt: new Date() },
      create: { guildId, userId, lastTicketAt: new Date() }
    });

    const embed = new EmbedBuilder()
      .setTitle(`Ticket: ${channelName}`)
      .setDescription(`Welcome to your ticket, <@${userId}>. Please describe your issue. Support will be with you shortly.`)
      .setColor('#5865F2');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket_rename').setLabel('Rename').setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ticket_adduser').setLabel('Add User').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ticket_removeuser').setLabel('Remove User').setStyle(ButtonStyle.Secondary)
    );

    await channel.send({ content: `<@${userId}> ${config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : ''}`, embeds: [embed], components: [row, row2] });

    await interaction.reply({ content: `Ticket created: <#${channel.id}>`, ephemeral: true });
    logger.info(`Ticket ${ticketRecord.id} created by ${userId} in ${guildId}`);

    if (config.ticketLogChannelId) {
      const logChannel = interaction.guild.channels.cache.get(config.ticketLogChannelId) as TextChannel;
      if (logChannel) {
        logChannel.send(`🎫 Ticket **#${ticketNumber}** created by <@${userId}> in <#${channel.id}>`);
      }
    }
  } catch (error) {
    logger.error('Error creating ticket:', error);
    await interaction.reply({ content: 'Failed to create ticket.', ephemeral: true });
  }
};
