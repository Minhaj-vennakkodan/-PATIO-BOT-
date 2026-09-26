import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildMember, Guild, TextChannel, ColorResolvable } from 'discord.js';
import { GuildConfig } from '@prisma/client';
import { generateReplacements, replaceVariables } from './variables';
import { logger } from './logger';

export const buildWelcomeMessage = (
  member: GuildMember,
  guild: Guild,
  config: GuildConfig,
  memberNumber: number
) => {
  const replacements = generateReplacements(member, guild, memberNumber);

  const embed = new EmbedBuilder();
  let content = config.welcomeMessage ? replaceVariables(config.welcomeMessage, replacements) : undefined;

  if (config.welcomeTitle) {
    embed.setTitle(replaceVariables(config.welcomeTitle, replacements));
  }

  if (config.welcomeDescription) {
    embed.setDescription(replaceVariables(config.welcomeDescription, replacements));
  }

  if (config.welcomeColor) {
    try {
      embed.setColor(config.welcomeColor as ColorResolvable);
    } catch (error) {
      logger.warn(`Invalid color format in guild ${guild.id}: ${config.welcomeColor}`);
    }
  } else {
    embed.setColor('#5865F2'); // Default Discord Blurple
  }

  if (config.welcomeImageUrl) {
    try {
      new URL(config.welcomeImageUrl); // Validate URL
      embed.setImage(config.welcomeImageUrl);
    } catch {
      logger.warn(`Invalid image URL in guild ${guild.id}: ${config.welcomeImageUrl}`);
    }
  }

  if (config.welcomeThumbnailUrl) {
    try {
      new URL(config.welcomeThumbnailUrl); // Validate URL
      embed.setThumbnail(config.welcomeThumbnailUrl);
    } catch {
      logger.warn(`Invalid thumbnail URL in guild ${guild.id}: ${config.welcomeThumbnailUrl}`);
    }
  }

  if (config.welcomeFooterText) {
    embed.setFooter({ text: replaceVariables(config.welcomeFooterText, replacements) });
  }

  if (config.welcomeShowTimestamp) {
    embed.setTimestamp();
  }

  const components = [];
  
  if (config.welcomeButtonEnabled) {
    const btnLabel = config.welcomeButtonLabel ? replaceVariables(config.welcomeButtonLabel, replacements) : '👋 Welcome';
    const btnStyle = config.welcomeButtonStyle ? config.welcomeButtonStyle : ButtonStyle.Primary;
    
    const button = new ButtonBuilder()
      .setCustomId('welcome_dummy_btn') // Dummy ID, it just sits there or can be handled later
      .setLabel(btnLabel)
      .setStyle(btnStyle as ButtonStyle)
      .setDisabled(true); // Since it has no action, make it disabled-safe to avoid "Interaction failed"
    
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    components.push(row);
  }

  // If there's no embed data, we can't send an empty embed. We just skip it or only send content.
  const hasEmbed = config.welcomeTitle || config.welcomeDescription || config.welcomeImageUrl || config.welcomeThumbnailUrl || config.welcomeFooterText;
  
  return {
    content,
    embeds: hasEmbed ? [embed] : [],
    components
  };
};
