import { prisma } from '../database/client';
import { logger } from './logger';
import { editMessage, getGuildMember } from './discordRest';

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

export async function refreshSuggestionMessage(client: any, guildId: string, suggestionId: string) {
  const suggestion = await getSuggestion(guildId, suggestionId);
  if (!suggestion || !suggestion.messageId || !suggestion.channelId) return;

  try {
    let upvotes = 0;
    let downvotes = 0;
    for (const v of suggestion.votes) {
      if (v.vote === 'UP') upvotes++;
      if (v.vote === 'DOWN') downvotes++;
    }

    const embed: any = {
      title: `Suggestion #${suggestion.suggestionNumber}`,
      description: suggestion.content,
      timestamp: suggestion.createdAt.toISOString(),
      fields: []
    };

    if (suggestion.anonymous) {
      embed.author = { name: 'Anonymous' };
    } else {
      try {
        const authorMember = await getGuildMember(guildId, suggestion.authorId);
        embed.author = { 
          name: authorMember.user.username, // Simplified for REST
          icon_url: `https://cdn.discordapp.com/avatars/${authorMember.user.id}/${authorMember.user.avatar}.png`
        };
      } catch {
        embed.author = { name: `User ID: ${suggestion.authorId}` };
      }
    }

    switch (suggestion.status) {
      case 'PENDING': embed.color = 0xf1c40f; break;
      case 'APPROVED': embed.color = 0x2ecc71; break;
      case 'DENIED': embed.color = 0xe74c3c; break;
      case 'IMPLEMENTED': embed.color = 0x3498db; break;
      case 'ARCHIVED': embed.color = 0x95a5a6; break;
    }

    embed.fields.push({ name: 'Status', value: suggestion.status, inline: true });
    embed.fields.push({ name: 'Votes', value: `👍 ${upvotes} | 👎 ${downvotes}`, inline: true });

    if (suggestion.staffReason) {
      embed.fields.push({ name: 'Staff Reason', value: suggestion.staffReason, inline: false });
    }

    const row1 = {
      type: 1,
      components: [
        {
          type: 2,
          custom_id: `suggestion:upvote:${suggestion.id}`,
          label: `Upvote (${upvotes})`,
          emoji: { name: '👍' },
          style: 3,
          disabled: suggestion.status !== 'PENDING'
        },
        {
          type: 2,
          custom_id: `suggestion:downvote:${suggestion.id}`,
          label: `Downvote (${downvotes})`,
          emoji: { name: '👎' },
          style: 4,
          disabled: suggestion.status !== 'PENDING'
        }
      ]
    };

    const staffRow = {
      type: 1,
      components: [
        { type: 2, custom_id: `suggestion:approve:${suggestion.id}`, label: 'Approve', style: 3, disabled: suggestion.status !== 'PENDING' },
        { type: 2, custom_id: `suggestion:deny:${suggestion.id}`, label: 'Deny', style: 4, disabled: suggestion.status !== 'PENDING' },
        { type: 2, custom_id: `suggestion:implement:${suggestion.id}`, label: 'Implement', style: 1, disabled: suggestion.status !== 'APPROVED' },
        { type: 2, custom_id: `suggestion:archive:${suggestion.id}`, label: 'Archive', style: 2, disabled: suggestion.status === 'ARCHIVED' }
      ]
    };

    await editMessage(suggestion.channelId, suggestion.messageId, {
      embeds: [embed],
      components: [row1, staffRow]
    });
  } catch (error) {
    logger.error(`Failed to refresh suggestion message ${suggestionId}:`, error);
  }
}
