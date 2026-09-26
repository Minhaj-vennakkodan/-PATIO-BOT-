import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './database/client';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { stopGiveawayScheduler } from './utils/giveawayScheduler';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User,
  ],
});

const bootstrap = async () => {
  try {
    logger.info('Starting PATIO BOT...');

    // Connect Database
    await prisma.$connect();
    logger.info('Connected to the database.');

    // Load Events
    await loadEvents(client);

    // Load and Register Commands
    await loadCommands();

    // Login to Discord
    await client.login(env.DISCORD_TOKEN);
  } catch (error) {
    logger.error('Error during startup:', error);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  try {
    stopGiveawayScheduler();

    // Destroy Discord client
    client.destroy();
    logger.info('Discord client destroyed.');

    // Disconnect from database
    await prisma.$disconnect();
    logger.info('Database connection closed.');

    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});

bootstrap();
