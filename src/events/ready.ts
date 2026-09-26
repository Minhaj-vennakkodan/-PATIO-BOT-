import { Events, Client } from 'discord.js';
import { BotEvent } from '../types';
import { logger } from '../utils/logger';
import { startGiveawayScheduler } from '../utils/giveawayScheduler';

const readyEvent: BotEvent = {
  name: Events.ClientReady,
  once: true,
  execute(client: Client) {
    logger.info(`Ready! Logged in as ${client.user?.tag}`);
    startGiveawayScheduler(client);
  },
};

export default readyEvent;
