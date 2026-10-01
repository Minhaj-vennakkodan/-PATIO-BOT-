import { Events, GuildMember, CategoryChannel } from 'discord.js';
import { BotEvent } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const guildMemberAddEvent: BotEvent = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    const guildId = member.guild.id;
    
    const config = await prisma.guildConfig.findUnique({ where: { guildId } });
    if (!config) return;

    // Check if user is actively ChatBanned
    const record = await prisma.chatBanRecord.findFirst({
      where: { guildId, userId: member.id, active: true }
    });

    if (record) {
      if (config.chatBanEnabled && config.chatBanRoleId) {
        const chatBanRole = member.guild.roles.cache.get(config.chatBanRoleId);
        if (chatBanRole) {
          try {
            await member.roles.add(chatBanRole);
            logger.info(`Reapplied ChatBan role for rejoined user ${member.id}`);
          } catch (err) {
            logger.error(`Failed to reapply ChatBan role to ${member.id}`, err);
          }
        }
      }
    }

    // Welcome Logic
    if (config.welcomeEnabled && config.welcomeChannel) {
      const channel = member.guild.channels.cache.get(config.welcomeChannel) || await member.guild.channels.fetch(config.welcomeChannel).catch(() => null);
      
      if (channel && channel.isTextBased()) {
        try {
          // Find or create member record to get member number
          let memberRecord = await prisma.memberRecord.findUnique({
            where: { guildId_userId: { guildId, userId: member.id } }
          });
          
          if (!memberRecord) {
            // Count existing records to assign a number
            const count = await prisma.memberRecord.count({ where: { guildId } });
            memberRecord = await prisma.memberRecord.create({
              data: {
                guildId,
                userId: member.id,
                memberNumber: count + 1
              }
            });
          }

          const { buildWelcomeMessage } = require('../utils/welcomeUtils');
          const messagePayload = buildWelcomeMessage(member, member.guild, config, memberRecord.memberNumber);
          
          await (channel as any).send(messagePayload);
          logger.info(`Sent welcome message for ${member.id} in ${guildId}`);
        } catch (error) {
          logger.error(`Failed to send welcome message for ${member.id}:`, error);
        }
      }
    }
  }
};

export default guildMemberAddEvent;
