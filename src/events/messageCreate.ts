import { Events, Message } from 'discord.js';
import { BotEvent } from '../types';
import { processCountingMessage } from '../utils/countingService';
import { processAutoMod } from '../utils/automodService';

const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    if (!message.guildId) return;

    // Run AutoMod first
    await processAutoMod(message).catch(() => {});

    // Hand off to counting service if message still exists
    if (!message.deletable) return; // If AutoMod deleted it, it might no longer be resolvable for counting properly, though counting checks that anyway.
    processCountingMessage(message).catch(() => {});
  }
};

export default messageCreateEvent;
