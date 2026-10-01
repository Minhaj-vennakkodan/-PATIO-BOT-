import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './database/client';
import { loadEvents } from './handlers/eventHandler';
import { startGiveawayScheduler, stopGiveawayScheduler } from './utils/giveawayScheduler';

// We explicitly don't load commands here in the worker to avoid handling interactions

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
    logger.info('Starting PATIO BOT Persistent Worker...');

    // Connect Database
    await prisma.$connect();
    logger.info('Connected to the MongoDB database.');

    // Load Events (this will still load interactionCreate if it exists, so we may need to disable it here if fully migrated)
    await loadEvents(client);

    // Login to Discord
    await client.login(env.DISCORD_TOKEN);
    
    // Start Giveaway background scheduler
    startGiveawayScheduler(client);
  } catch (error) {
    logger.error('Error during worker startup:', error);
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
