import { Client } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { endGiveaway, refreshGiveawayMessage, updateGiveawayStatus } from './giveawayService';

let schedulerInterval: NodeJS.Timeout | null = null;

export function startGiveawayScheduler(client: Client) {
  if (schedulerInterval) return; // Already running
  
  const tick = async () => {
    try {
      const now = new Date();
      
      // 1. SCHEDULED -> ACTIVE
      const toActivate = await prisma.giveaway.findMany({
        where: {
          status: 'SCHEDULED',
          startAt: { lte: now }
        }
      });

      for (const g of toActivate) {
        await updateGiveawayStatus(g.id, 'ACTIVE');
        await refreshGiveawayMessage(client, g.id);
        logger.info(`Giveaway ${g.id} in guild ${g.guildId} automatically started.`);
      }

      // 2. ACTIVE -> ENDED
      const toEnd = await prisma.giveaway.findMany({
        where: {
          status: 'ACTIVE',
          endAt: { lte: now }
        }
      });

      for (const g of toEnd) {
        const winners = await endGiveaway(client, g.guildId, g.id);
        if (winners && winners.length > 0) {
          const guild = await client.guilds.fetch(g.guildId).catch(() => null);
          if (guild) {
            const channel = await guild.channels.fetch(g.channelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              await channel.send({ content: `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${g.prize}**!` }).catch(() => null);
            }
          }
        }
        logger.info(`Giveaway ${g.id} in guild ${g.guildId} automatically ended.`);
      }

    } catch (error) {
      logger.error('Error in giveaway scheduler tick:', error);
    }
  };

  // Run once immediately, then every 30 seconds
  tick();
  schedulerInterval = setInterval(tick, 30000);
  logger.info('Giveaway background scheduler started.');
}

export function stopGiveawayScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Giveaway background scheduler stopped.');
  }
}
