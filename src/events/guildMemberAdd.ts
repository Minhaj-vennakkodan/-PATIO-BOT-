import { Events, GuildMember, CategoryChannel } from 'discord.js';
import { BotEvent } from '../types';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const guildMemberAddEvent: BotEvent = {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    const guildId = member.guild.id;
    
    // Check if user is actively ChatBanned
    const record = await prisma.chatBanRecord.findFirst({
      where: { guildId, userId: member.id, active: true }
    });

    if (record) {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (config && config.chatBanEnabled && config.chatBanRoleId) {
        const chatBanRole = member.guild.roles.cache.get(config.chatBanRoleId);
        if (chatBanRole) {
          try {
            // Reapply role
            await member.roles.add(chatBanRole);
            logger.info(`Reapplied ChatBan role for rejoined user ${member.id}`);
          } catch (err) {
            logger.error(`Failed to reapply ChatBan role to ${member.id}`, err);
          }
        }
      }
    }
  }
};

export default guildMemberAddEvent;
