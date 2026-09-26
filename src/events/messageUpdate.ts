import { Events, Message, PartialMessage } from 'discord.js';
import { BotEvent } from '../types';
import { handleEditedMessage } from '../utils/countingService';
import { processAutoMod } from '../utils/automodService';

const messageUpdateEvent: BotEvent = {
  name: Events.MessageUpdate,
  async execute(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch (error) {
        return;
      }
    }

    if (newMessage.guildId && newMessage.author && !newMessage.author.bot) {
      await processAutoMod(newMessage as Message).catch(() => {});
    }

    // Hand off to counting service for edit protection
    handleEditedMessage(oldMessage, newMessage).catch(() => {});
  }
};

export default messageUpdateEvent;
