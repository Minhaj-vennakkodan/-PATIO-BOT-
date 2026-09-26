import fs from 'fs';
import path from 'path';
import { Client } from 'discord.js';
import { BotEvent } from '../types';
import { logger } from '../utils/logger';

export const loadEvents = async (client: Client) => {
  const eventsPath = path.join(__dirname, '../events');
  if (!fs.existsSync(eventsPath)) {
    fs.mkdirSync(eventsPath, { recursive: true });
  }

  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event: BotEvent = (await import(filePath)).default;
    
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    logger.debug(`Loaded event: ${event.name}`);
  }
  
  logger.info(`Successfully loaded ${eventFiles.length} events.`);
};
