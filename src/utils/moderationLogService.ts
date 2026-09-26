import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { ModerationCase } from '@prisma/client';

export async function logModerationCase(client: Client, modCase: ModerationCase) {
  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: modCase.guildId },
      select: { modLogChannelId: true }
    });

    if (!config?.modLogChannelId) return; // Silent return, logging is best-effort

    const guild = client.guilds.cache.get(modCase.guildId);
    if (!guild) return;

    const logChannel = guild.channels.cache.get(config.modLogChannelId) as TextChannel;
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle(`Moderation Case #${modCase.caseNumber} | ${modCase.action}`)
      .setColor(getColorForAction(modCase.action))
      .addFields(
        { name: 'Target', value: `<@${modCase.userId}> (${modCase.userId})`, inline: true },
        { name: 'Moderator', value: `<@${modCase.moderatorId}>`, inline: true },
        { name: 'Source', value: modCase.source, inline: true },
        { name: 'Reason', value: modCase.reason || 'No reason provided', inline: false }
      )
      .setFooter({ text: `Case ID: ${modCase.id}` })
      .setTimestamp(modCase.createdAt);

    if (modCase.duration) {
      embed.addFields({ name: 'Duration', value: `${modCase.duration} seconds`, inline: true });
    }

    await logChannel.send({ embeds: [embed] }).catch((err) => {
      logger.warn(`Failed to send moderation log in channel ${config.modLogChannelId}: ${err.message}`);
    });

  } catch (error) {
    logger.error('Failed to log moderation case to Discord channel:', error);
  }
}

function getColorForAction(action: string): number {
  switch (action) {
    case 'WARN': return 0xFFA500; // Orange
    case 'TIMEOUT': return 0xFF8C00; // Dark Orange
    case 'KICK': return 0xFF4500; // Orange Red
    case 'BAN': return 0xFF0000; // Red
    case 'UNBAN': return 0x00FF00; // Green
    case 'CHATBAN': return 0x8B0000; // Dark Red
    default: return 0x808080; // Gray
  }
}
