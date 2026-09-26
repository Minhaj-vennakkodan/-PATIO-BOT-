import fs from 'fs';
import path from 'path';
import { Collection, REST, Routes } from 'discord.js';
import { Command } from '../types';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export const commands = new Collection<string, Command>();

export const loadCommands = async () => {
  const commandsPath = path.join(__dirname, '../commands');
  if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath, { recursive: true });
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  const slashCommands: any[] = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command: Command = (await import(filePath)).default;
    
    if ('data' in command && 'execute' in command) {
      commands.set(command.data.name, command);
      slashCommands.push(command.data.toJSON());
      logger.debug(`Loaded command: ${command.data.name}`);
    } else {
      logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  try {
    logger.info(`Started refreshing ${slashCommands.length} application (/) commands.`);

    await rest.put(
      Routes.applicationCommands(env.CLIENT_ID),
      { body: slashCommands },
    );

    logger.info(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    logger.error('Error refreshing application commands:', error);
  }
};
