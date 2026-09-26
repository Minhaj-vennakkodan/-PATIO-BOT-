import { prisma } from '../database/client';
import { logger } from './logger';
import { Guild, TextChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from 'discord.js';
import { randomInt } from 'node:crypto';

export async function createGiveaway(data: {
  guildId: string;
  channelId: string;
  hostUserId: string;
  prize: string;
  description?: string;
  winnerCount: number;
  startAt: Date;
  endAt: Date;
  requiredRoleId?: string;
  minimumAccountAge?: number;
  minimumServerAge?: number;
}) {
  return await prisma.giveaway.create({
    data: {
      ...data,
      status: data.startAt <= new Date() ? 'ACTIVE' : 'SCHEDULED'
    }
  });
}

export async function getGiveaway(guildId: string, giveawayId: string) {
  return await prisma.giveaway.findFirst({
    where: { guildId, id: giveawayId },
    include: { entries: true, winners: true }
  });
}

export async function enterGiveaway(giveawayId: string, userId: string) {
  try {
    await prisma.giveawayEntry.create({
      data: { giveawayId, userId }
    });
    return true;
  } catch (error: any) {
    // Unique constraint failed means they already entered
    if (error.code === 'P2002') return false;
    throw error;
  }
}

export async function updateGiveawayStatus(id: string, status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED') {
  return await prisma.giveaway.update({
    where: { id },
    data: { status }
  });
}

export async function endGiveaway(client: Client, guildId: string, giveawayId: string) {
  // Concurrency safe: only one process can transition from ACTIVE/SCHEDULED to ENDED
  const transition = await prisma.giveaway.updateMany({
    where: { 
      id: giveawayId,
      guildId,
      status: { in: ['ACTIVE', 'SCHEDULED'] }
    },
    data: { status: 'ENDED' }
  });

  if (transition.count === 0) {
    // Already ended/cancelled by another process, or doesn't exist
    return null;
  }

  const giveaway = await getGiveaway(guildId, giveawayId);
  if (!giveaway) return null;

  // Select winners securely using node:crypto randomInt without replacement
  const entries = giveaway.entries.map(e => e.userId);
  const winners: string[] = [];
  
  const numWinners = Math.min(giveaway.winnerCount, entries.length);
  
  for (let i = 0; i < numWinners; i++) {
    // Pick a random index between 0 and entries.length - 1
    const idx = randomInt(0, entries.length);
    winners.push(entries[idx]);
    // Remove the chosen entry to prevent replacement
    entries.splice(idx, 1);
  }

  // Persist winners
  for (const w of winners) {
    try {
      await prisma.giveawayWinner.create({ data: { giveawayId, userId: w } });
    } catch(e) {}
  }

  await refreshGiveawayMessage(client, giveaway.id);
  
  return winners;
}

export async function refreshGiveawayMessage(client: Client, giveawayId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: { _count: { select: { entries: true } }, winners: true }
  });
  if (!giveaway || !giveaway.messageId) return;

  try {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null) as TextChannel;
    if (!channel) return;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return;

    const embed = new EmbedBuilder()
      .setTitle(`🎉 GIVEAWAY: ${giveaway.prize}`)
      .setColor(giveaway.status === 'ACTIVE' ? '#2ecc71' : (giveaway.status === 'ENDED' ? '#3498db' : '#e74c3c'))
      .setDescription(giveaway.description || 'Join the giveaway!')
      .addFields(
        { name: 'Host', value: `<@${giveaway.hostUserId}>`, inline: true },
        { name: 'Winners', value: `${giveaway.winnerCount}`, inline: true },
        { name: 'Entries', value: `${giveaway._count.entries}`, inline: true },
        { name: 'Ends', value: `<t:${Math.floor(giveaway.endAt.getTime() / 1000)}:R>`, inline: true },
        { name: 'Status', value: giveaway.status, inline: true }
      );

    if (giveaway.requiredRoleId) embed.addFields({ name: 'Required Role', value: `<@&${giveaway.requiredRoleId}>`, inline: true });

    if (giveaway.status === 'ENDED') {
      const winnerList = giveaway.winners.length > 0 ? giveaway.winners.map(w => `<@${w.userId}>`).join(', ') : 'None';
      embed.addFields({ name: 'Winner(s)', value: winnerList, inline: false });
    }

    const row = new ActionRowBuilder<ButtonBuilder>();
    const btn = new ButtonBuilder()
      .setCustomId(`giveaway:enter:${giveaway.id}`)
      .setLabel('🎉 Enter Giveaway')
      .setStyle(giveaway.status === 'ACTIVE' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(giveaway.status !== 'ACTIVE');
      
    row.addComponents(btn);

    await message.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    logger.error(`Failed to refresh giveaway message ${giveawayId}:`, error);
  }
}
