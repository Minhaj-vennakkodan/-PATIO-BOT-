import { prisma } from '../database/client';
import { logger } from './logger';
import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';

export async function createSuggestion(guildId: string, authorId: string, content: string, anonymous: boolean) {
  // Use Prisma atomic update to get the next suggestion number safely
  const config = await prisma.guildConfig.update({
    where: { guildId },
    data: { nextSuggestionNumber: { increment: 1 } },
    select: { nextSuggestionNumber: true }
  });

  const suggestionNumber = config.nextSuggestionNumber - 1;

  const suggestion = await prisma.suggestion.create({
    data: {
      guildId,
      suggestionNumber,
      authorId,
      content,
      anonymous
    }
  });

  return suggestion;
}

export async function getSuggestion(guildId: string, suggestionId: string) {
  return await prisma.suggestion.findFirst({
    where: { guildId, id: suggestionId },
    include: { votes: true }
  });
}

export async function submitVote(suggestionId: string, userId: string, voteType: 'UP' | 'DOWN') {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.suggestionVote.findUnique({
        where: { suggestionId_userId: { suggestionId, userId } }
      });

      if (existing) {
        if (existing.vote === voteType) {
          // Remove vote if clicking same button
          await tx.suggestionVote.delete({
            where: { id: existing.id }
          });
          return { action: 'removed' };
        } else {
          // Update to opposite
          await tx.suggestionVote.update({
            where: { id: existing.id },
            data: { vote: voteType }
          });
          return { action: 'switched' };
        }
      } else {
        // Create new
        await tx.suggestionVote.create({
          data: { suggestionId, userId, vote: voteType }
        });
        return { action: 'added' };
      }
    });
  } catch (error: any) {
    // If P2002 uniqueness violation occurs during concurrent create, treat as 'added' or just ignore
    if (error.code === 'P2002') {
      return { action: 'ignored (concurrent)' };
    }
    throw error;
  }
}

export async function moderateSuggestion(
  suggestionId: string,
  guildId: string,
  status: 'APPROVED' | 'DENIED' | 'IMPLEMENTED' | 'ARCHIVED',
  reviewerId: string,
  reason?: string
) {
  const validTransitions: Record<string, string[]> = {
    PENDING: ['APPROVED', 'DENIED', 'ARCHIVED'],
    APPROVED: ['IMPLEMENTED', 'ARCHIVED'],
    IMPLEMENTED: ['ARCHIVED'],
    DENIED: ['ARCHIVED'],
    ARCHIVED: []
  };

  const current = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
  if (!current || !validTransitions[current.status].includes(status)) {
    return null;
  }

  const result = await prisma.suggestion.updateMany({
    where: { id: suggestionId, guildId, status: current.status },
    data: {
      status,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      staffReason: reason
    }
  });

  return result.count > 0;
}

export async function refreshSuggestionMessage(client: Client, guildId: string, suggestionId: string) {
  const suggestion = await getSuggestion(guildId, suggestionId);
  if (!suggestion || !suggestion.messageId || !suggestion.channelId) return;

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const channel = await guild.channels.fetch(suggestion.channelId).catch(() => null) as TextChannel;
    if (!channel) return;
    const message = await channel.messages.fetch(suggestion.messageId).catch(() => null);
    if (!message) return;

    let upvotes = 0;
    let downvotes = 0;
    for (const v of suggestion.votes) {
      if (v.vote === 'UP') upvotes++;
      if (v.vote === 'DOWN') downvotes++;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Suggestion #${suggestion.suggestionNumber}`)
      .setDescription(suggestion.content)
      .setTimestamp(suggestion.createdAt);

    if (suggestion.anonymous) {
      embed.setAuthor({ name: 'Anonymous' });
    } else {
      const authorMember = await guild.members.fetch(suggestion.authorId).catch(() => null);
      if (authorMember) {
        embed.setAuthor({ name: authorMember.user.tag, iconURL: authorMember.user.displayAvatarURL() });
      } else {
        embed.setAuthor({ name: `User ID: ${suggestion.authorId}` });
      }
    }

    switch (suggestion.status) {
      case 'PENDING': embed.setColor('#f1c40f'); break;
      case 'APPROVED': embed.setColor('#2ecc71'); break;
      case 'DENIED': embed.setColor('#e74c3c'); break;
      case 'IMPLEMENTED': embed.setColor('#3498db'); break;
      case 'ARCHIVED': embed.setColor('#95a5a6'); break;
    }

    embed.addFields({ name: 'Status', value: suggestion.status, inline: true });
    embed.addFields({ name: 'Votes', value: `👍 ${upvotes} | 👎 ${downvotes}`, inline: true });

    if (suggestion.staffReason) {
      embed.addFields({ name: 'Staff Reason', value: suggestion.staffReason, inline: false });
    }

    const row = new ActionRowBuilder<ButtonBuilder>();
    
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`suggestion:upvote:${suggestion.id}`)
        .setLabel(`Upvote (${upvotes})`)
        .setEmoji('👍')
        .setStyle(ButtonStyle.Success)
        .setDisabled(suggestion.status !== 'PENDING'),
      new ButtonBuilder()
        .setCustomId(`suggestion:downvote:${suggestion.id}`)
        .setLabel(`Downvote (${downvotes})`)
        .setEmoji('👎')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(suggestion.status !== 'PENDING')
    );

    const staffRow = new ActionRowBuilder<ButtonBuilder>();
    staffRow.addComponents(
      new ButtonBuilder().setCustomId(`suggestion:approve:${suggestion.id}`).setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(suggestion.status !== 'PENDING'),
      new ButtonBuilder().setCustomId(`suggestion:deny:${suggestion.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger).setDisabled(suggestion.status !== 'PENDING'),
      new ButtonBuilder().setCustomId(`suggestion:implement:${suggestion.id}`).setLabel('Implement').setStyle(ButtonStyle.Primary).setDisabled(suggestion.status !== 'APPROVED'),
      new ButtonBuilder().setCustomId(`suggestion:archive:${suggestion.id}`).setLabel('Archive').setStyle(ButtonStyle.Secondary).setDisabled(suggestion.status === 'ARCHIVED')
    );

    await message.edit({ embeds: [embed], components: [row, staffRow] });
  } catch (error) {
    logger.error(`Failed to refresh suggestion message ${suggestionId}:`, error);
  }
}
