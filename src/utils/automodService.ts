import { Message, TextChannel } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { isAdministrator, hasModeratorPermission } from './permissions';
import { applyChatBan } from './chatBanService';
import { createCase } from './moderationCaseService';
import { logModerationCase } from './moderationLogService';

// In-memory cache for anti-spam/flood/duplicate to avoid DB hammering
// Key: guildId_userId, Value: { messages: number[], lastContent: string, duplicateCount: number }
const userStateMap = new Map<string, { timestamps: number[], lastContent: string, duplicateCount: number }>();
const cooldownMap = new Map<string, number>();

// Periodic memory cleanup every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of userStateMap.entries()) {
    state.timestamps = state.timestamps.filter(t => now - t < 10000);
    if (state.timestamps.length === 0) {
      userStateMap.delete(key);
    }
  }
  for (const [key, time] of cooldownMap.entries()) {
    if (now - time >= 5000) cooldownMap.delete(key);
  }
}, 60000);

function cleanUserState(guildId: string, userId: string) {
  const key = `${guildId}_${userId}`;
  const state = userStateMap.get(key);
  if (!state) return;
  const now = Date.now();
  state.timestamps = state.timestamps.filter(t => now - t < 10000); // Keep last 10 seconds
  if (state.timestamps.length === 0) {
    userStateMap.delete(key);
  }
}

export async function processAutoMod(message: Message) {
  if (!message.guild || message.author.bot) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  
  // Cooldown check (prevent repeated punishments for 5 seconds)
  const cdKey = `${guildId}_${userId}_action`;
  if (cooldownMap.has(cdKey) && Date.now() - cooldownMap.get(cdKey)! < 5000) return;

  const config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config?.autoModEnabled) return;

  // Exemptions
  if (config.autoModExemptChannels && config.autoModExemptChannels.includes(message.channelId)) return;
  
  if (message.member) {
    if (isAdministrator(message.member) || hasModeratorPermission(message.member)) return;
    if (config.autoModExemptRoles) {
      const exemptRoles = config.autoModExemptRoles.split(',');
      if (exemptRoles.some(r => message.member!.roles.cache.has(r.trim()))) return;
    }
  }

  // Counting integration: If this is the counting channel, defer to Counting service's strict validation
  if (config.countingEnabled && message.channelId === config.countingChannelId) {
    return;
  }

  // Load Rules
  const rules = await prisma.autoModRule.findMany({ where: { guildId, enabled: true } });
  if (rules.length === 0) return;

  const content = message.content;
  const now = Date.now();
  
  // Update state
  const stateKey = `${guildId}_${userId}`;
  if (!userStateMap.has(stateKey)) userStateMap.set(stateKey, { timestamps: [], lastContent: '', duplicateCount: 0 });
  const state = userStateMap.get(stateKey)!;
  state.timestamps.push(now);
  
  if (content === state.lastContent && content.length > 5) {
    state.duplicateCount++;
  } else {
    state.lastContent = content;
    state.duplicateCount = 1;
  }
  
  cleanUserState(guildId, userId);

  let violation: { ruleType: string, action: string, reason: string } | null = null;

  // Evaluate Rules
  for (const rule of rules) {
    const threshold = rule.threshold || 5;
    
    if (rule.ruleType === 'spam' || rule.ruleType === 'flood') {
      const timeWindow = (rule.timeWindow || 5) * 1000;
      const recent = state.timestamps.filter(t => now - t <= timeWindow).length;
      if (recent >= threshold) {
        violation = { ruleType: rule.ruleType, action: rule.action, reason: `Sent ${recent} messages in ${rule.timeWindow}s` };
        break;
      }
    }

    if (rule.ruleType === 'duplicate') {
      if (state.duplicateCount >= threshold) {
        violation = { ruleType: 'duplicate', action: rule.action, reason: `Sent identical message ${state.duplicateCount} times` };
        break;
      }
    }

    if (rule.ruleType === 'mentions') {
      if (message.mentions.users.size + message.mentions.roles.size >= threshold) {
        violation = { ruleType: 'mentions', action: rule.action, reason: 'Excessive mentions' };
        break;
      }
      if (message.mentions.everyone) {
        violation = { ruleType: 'mentions', action: rule.action, reason: 'Mentioned @everyone / @here' };
        break;
      }
    }

    const contentViolation = await evaluateAutoModContentOnly(guildId, rule, content);
    if (contentViolation) {
      violation = contentViolation;
      break;
    }
  }

  if (violation) {
    cooldownMap.set(cdKey, now);
    
    // Action Validation
    const allowedActions = ['delete', 'warn', 'timeout', 'chatban', 'delete_warn', 'delete_timeout', 'delete_chatban', 'log_only'];
    if (!allowedActions.includes(violation.action)) {
      logger.warn(`Invalid AutoMod action configured: ${violation.action} for rule ${violation.ruleType} in guild ${guildId}`);
      return;
    }

    await executeAutomodAction(message, violation.ruleType, violation.action, violation.reason, config);
  }
}

// Evaluate pure content (used for modals/suggestions)
export async function evaluateAutoModContentOnly(guildId: string, rule: any, content: string): Promise<{ ruleType: string, action: string, reason: string } | null> {
  const threshold = rule.threshold || 5;
  
  if (rule.ruleType === 'invites') {
    const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
    if (inviteRegex.test(content)) {
      return { ruleType: 'invites', action: rule.action, reason: 'Posted a Discord invite' };
    }
  }

  if (rule.ruleType === 'links') {
    const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    if (linkRegex.test(content)) {
      return { ruleType: 'links', action: rule.action, reason: 'Posted an unauthorized link' };
    }
  }

  if (rule.ruleType === 'emoji') {
    const emojiRegex = /<a?:[a-zA-Z0-9_]+:[0-9]+>|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojis = content.match(emojiRegex);
    if (emojis && emojis.length >= threshold) {
      return { ruleType: 'emoji', action: rule.action, reason: 'Excessive emojis' };
    }
  }

  if (rule.ruleType === 'repeated') {
    const repeatedRegex = /(.)\1{7,}/gi; 
    if (repeatedRegex.test(content)) {
      return { ruleType: 'repeated', action: rule.action, reason: 'Excessive repeated characters' };
    }
  }

  if (rule.ruleType === 'caps') {
    const caps = content.replace(/[^A-Z]/g, '').length;
    if (content.length > 10 && caps / content.length > 0.7) {
      return { ruleType: 'caps', action: rule.action, reason: 'Excessive capital letters' };
    }
  }

  if (rule.ruleType === 'profanity') {
    const words = await prisma.autoModWord.findMany({ where: { guildId } });
    for (const w of words) {
      const escapedWord = w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      if (wordRegex.test(content)) {
        return { ruleType: 'profanity', action: rule.action, reason: 'Used a blocked word' };
      }
    }
  }

  return null;
}

async function executeAutomodAction(message: Message, ruleType: string, action: string, reason: string, config: any) {
  if (!message.guild || !message.member) return;
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    let deleted = false;
    let caseAction: any = null;
    let durationSecs: number | undefined = undefined;

    if (action.includes('delete')) {
      if (message.deletable) {
        await message.delete().catch(() => {});
        deleted = true;
      }
    }

    if (action.includes('warn')) {
      await prisma.moderationWarning.create({
        data: { guildId, userId, reason, rule: ruleType, moderatorId: 'AutoMod' }
      });
      const channel = message.channel;
      if (channel.isTextBased() && !channel.isDMBased()) {
        await channel.send(`<@${userId}>, you have been warned for: ${reason}`).then((m: Message) => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
      }
      caseAction = 'WARN';
    }

    if (action.includes('timeout')) {
      if (message.member.moderatable) {
        await message.member.timeout(5 * 60 * 1000, `AutoMod: ${reason}`); // 5 min default
        caseAction = 'TIMEOUT';
        durationSecs = 300;
      }
    }

    if (action.includes('chatban')) {
      if (config.chatBanEnabled && config.chatBanRoleId) {
        try {
          await applyChatBan(message.guild, message.member, message.client.user!, `AutoMod: ${reason}`);
          caseAction = 'CHATBAN';
        } catch (err) {
          // Silent catch for API failure
        }
      }
    }

    if (caseAction) {
      try {
        const modCase = await createCase({
          guildId,
          userId,
          moderatorId: message.client.user!.id,
          action: caseAction,
          reason: `AutoMod (${ruleType}): ${reason}`,
          source: 'AUTOMOD',
          duration: durationSecs
        });
        await logModerationCase(message.client, modCase);
      } catch (err) {
        logger.error(`Failed to create/log moderation case for AutoMod action ${caseAction} on ${userId}`, err);
      }
    }

    // Logging for AutoMod directly (legacy/basic log channel)
    if (config.autoModLogChannelId || config.mainLogChannelId) {
      const logChannelId = config.autoModLogChannelId || config.mainLogChannelId;
      const logChannel = message.guild.channels.cache.get(logChannelId) as TextChannel;
      if (logChannel) {
        logChannel.send(`🛡️ **AutoMod Triggered**\nUser: <@${userId}>\nRule: \`${ruleType}\`\nAction: \`${action}\`\nReason: ${reason}\nDeleted: ${deleted ? 'Yes' : 'No'}`).catch(() => {});
      }
    }

    logger.info(`AutoMod - Guild: ${guildId} User: ${userId} Rule: ${ruleType} Action: ${action}`);

  } catch (error) {
    logger.error(`Failed to execute AutoMod action for ${userId}`, error);
  }
}

