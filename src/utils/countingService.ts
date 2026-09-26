import { Message, PartialMessage } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';

const VALID_NUMBER_REGEX = /^[1-9]\d*$/; // strictly positive integer, no leading zero, no spaces, no decimals

export const processCountingMessage = async (message: Message) => {
  if (message.author.bot) return;

  const guildId = message.guildId!;
  
  // Minimal lookup first (could cache this in memory for performance)
  const config = await prisma.guildConfig.findUnique({
    where: { guildId },
    select: { countingEnabled: true, countingChannelId: true, chatBanEnabled: true, chatBanIsolationEnabled: true }
  });

  if (!config || !config.countingEnabled || config.countingChannelId !== message.channelId) {
    return;
  }

  if (config.chatBanEnabled && config.chatBanIsolationEnabled) {
    const isBanned = await prisma.chatBanRecord.findFirst({ where: { guildId, userId: message.author.id, active: true } });
    if (isBanned) return; // Completely ignore chatbanned users in counting
  }

  const content = message.content.trim();
  
  // Strict format validation
  if (!VALID_NUMBER_REGEX.test(content)) {
    await rejectAndClean(message, 'INVALID_MESSAGE');
    return;
  }

  const enteredNumber = parseInt(content, 10);

  // We use a Prisma transaction to ensure atomicity. 
  // We'll try to update the row if the current conditions hold (expected number matches).
  // If it fails, another request won the race or the number is wrong.
  
  try {
    const currentState = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!currentState) return;

    if (enteredNumber !== currentState.countingCurrent) {
      await rejectAndClean(message, 'WRONG_NUMBER', currentState.countingCurrent);
      return;
    }

    if (message.author.id === currentState.countingLastUserId) {
      await rejectAndClean(message, 'SAME_USER', currentState.countingCurrent);
      return;
    }

    // Attempt atomic update
    const updated = await prisma.guildConfig.update({
      where: { 
        guildId, 
        countingCurrent: enteredNumber, // OCC: optimistic concurrency control
        countingLastUserId: currentState.countingLastUserId // Ensure user hasn't changed underneath us
      },
      data: {
        countingCurrent: { increment: 1 },
        countingTotalValid: { increment: 1 },
        countingStreak: { increment: 1 },
        countingHighest: Math.max(currentState.countingHighest, enteredNumber),
        countingLastUserId: message.author.id,
        countingLastCountAt: new Date()
      }
    });

    if (updated) {
      // Add a small reaction to indicate success (optional, but requested implicitly to "accept" it visually)
      message.react('✅').catch(() => {});
    }

  } catch (error: any) {
    // If update fails due to P2025 (Record to update not found), it means OCC failed (race condition).
    if (error.code === 'P2025') {
      logger.warn(`Race condition avoided for guild ${guildId} by user ${message.author.id}.`);
      await rejectAndClean(message, 'RACE_CONDITION');
    } else {
      logger.error('Error during counting transaction:', error);
    }
  }
};

export const handleEditedMessage = async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
  if (!newMessage.guildId || newMessage.author?.bot) return;

  const config = await prisma.guildConfig.findUnique({
    where: { guildId: newMessage.guildId },
    select: { countingEnabled: true, countingChannelId: true }
  });

  if (!config || !config.countingEnabled || config.countingChannelId !== newMessage.channelId) {
    return;
  }

  // If someone edits a message in the counting channel, we delete it to prevent cheating
  // We do not roll back the counter because it was already accepted and the community might have moved on.
  // Instead, we just delete the manipulated message and log.
  
  try {
    await newMessage.delete();
    logger.warn(`Deleted edited message in counting channel for guild ${newMessage.guildId} by user ${newMessage.author?.id || 'Unknown'}`);
    
    // Provide feedback if possible
    const channel = await newMessage.client.channels.fetch(newMessage.channelId);
    if (channel && channel.isTextBased()) {
      const fb = await (channel as any).send(`❌ <@${newMessage.author?.id}>, editing messages in the counting channel is not allowed!`);
      setTimeout(() => fb.delete().catch(() => {}), 5000);
    }
  } catch (error) {
    logger.error('Failed to handle edited message in counting channel:', error);
  }
};

async function rejectAndClean(message: Message, reason: string, expected?: number) {
  try {
    await message.delete();
    
    logger.info(`Counting rejected in ${message.guildId} for ${message.author.id}. Reason: ${reason}`);

    let feedbackText = `❌ <@${message.author.id}>, `;
    if (reason === 'WRONG_NUMBER') {
      feedbackText += `wrong number! The next number is **${expected}**.`;
    } else if (reason === 'SAME_USER') {
      feedbackText += `you cannot count twice in a row! Wait for someone else.`;
    } else if (reason === 'RACE_CONDITION') {
      feedbackText += `you were a bit too slow!`;
    } else {
      feedbackText += `invalid message. Only the exact expected number is allowed.`;
    }

    if (message.channel.isTextBased()) {
      const feedbackMessage = await (message.channel as any).send(feedbackText);
      setTimeout(() => {
        feedbackMessage.delete().catch(() => {});
      }, 5000); // 5 seconds feedback
    }

  } catch (error) {
    logger.error('Failed to clean invalid counting message or send feedback:', error);
  }
}
