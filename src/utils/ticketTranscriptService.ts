import { TextChannel, Collection, Message, AttachmentBuilder } from 'discord.js';
import { logger } from './logger';
import { prisma } from '../database/client';

export const generateAndSendTranscript = async (
  channel: TextChannel,
  transcriptChannelId: string,
  ticketId: string
) => {
  try {
    const transcriptChannel = channel.guild.channels.cache.get(transcriptChannelId) as TextChannel;
    if (!transcriptChannel) {
      logger.warn(`Transcript channel not found for guild ${channel.guildId}`);
      return false;
    }

    let allMessages: Message[] = [];
    let lastId: string | undefined = undefined;

    while (true) {
      const options: any = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = (await channel.messages.fetch(options)) as unknown as Collection<string, Message>;
      if (messages.size === 0) break;

      allMessages.push(...messages.values());
      lastId = messages.last()?.id;
      if (messages.size < 100) break;
    }

    allMessages = allMessages.reverse();

    const ticketRecord = await prisma.ticketRecord.findUnique({
      where: { guildId_channelId: { guildId: channel.guildId, channelId: channel.id } }
    });

    let transcript = `TRANSCRIPT FOR TICKET: ${ticketId}\n`;
    transcript += `Guild: ${channel.guild.name} (${channel.guildId})\n`;
    transcript += `Ticket Creator ID: ${ticketRecord?.creatorId || 'Unknown'}\n`;
    transcript += `Ticket Type: ${ticketRecord?.ticketType || 'Unknown'}\n`;
    transcript += `Claimed By ID: ${ticketRecord?.claimedById || 'None'}\n`;
    transcript += `Generated At: ${new Date().toISOString()}\n`;
    transcript += `========================================================\n\n`;

    for (const msg of allMessages) {
      if (!msg.author) continue;
      const time = new Date(msg.createdTimestamp).toISOString();
      const content = msg.content || '[No Content / Embed]';
      const attachments = msg.attachments.map(a => a.url).join(' | ');

      transcript += `[${time}] ${msg.author.tag} (${msg.author.id}): ${content}\n`;
      if (attachments) {
        transcript += `Attachments: ${attachments}\n`;
      }
    }

    const buffer = Buffer.from(transcript, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: `transcript-${ticketId}.txt` });

    await transcriptChannel.send({
      content: `Transcript for Ticket \`${ticketId}\``,
      files: [attachment]
    });

    return true;
  } catch (error) {
    logger.error(`Failed to generate transcript for ticket ${ticketId}`, error);
    return false;
  }
};
