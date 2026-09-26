import { Interaction } from 'discord.js';
import { prisma } from '../database/client';
import { enterGiveaway } from './giveawayService';
import { logger } from './logger';

export async function handleGiveawayInteractions(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.guildId || !interaction.guild || !interaction.member) return false;

  if (!interaction.customId.startsWith('giveaway:')) return false;

  const parts = interaction.customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'giveaway' || parts[1] !== 'enter') return false;

  const giveawayId = parts[2];

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guildId },
      select: { giveawaysEnabled: true }
    });

    if (config && !config.giveawaysEnabled) {
      await interaction.reply({ content: '❌ Giveaways are currently disabled in this server.', ephemeral: true });
      return true;
    }

    const giveaway = await prisma.giveaway.findUnique({
      where: { id: giveawayId }
    });

    if (!giveaway) {
      await interaction.reply({ content: '❌ Giveaway not found or deleted.', ephemeral: true });
      return true;
    }

    if (giveaway.guildId !== interaction.guildId) {
      await interaction.reply({ content: '❌ This giveaway belongs to a different server.', ephemeral: true });
      return true;
    }

    if (giveaway.status !== 'ACTIVE') {
      await interaction.reply({ content: `❌ This giveaway is currently ${giveaway.status.toLowerCase()} and not accepting entries.`, ephemeral: true });
      return true;
    }

    const now = new Date();
    if (now < giveaway.startAt || now > giveaway.endAt) {
      await interaction.reply({ content: `❌ This giveaway is not in its active window.`, ephemeral: true });
      return true;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    if (giveaway.requiredRoleId && !member.roles.cache.has(giveaway.requiredRoleId)) {
      await interaction.reply({ content: `❌ You must have the <@&${giveaway.requiredRoleId}> role to enter this giveaway.`, ephemeral: true });
      return true;
    }

    if (giveaway.minimumAccountAge) {
      const accAgeMs = now.getTime() - interaction.user.createdAt.getTime();
      const accAgeDays = accAgeMs / (1000 * 60 * 60 * 24);
      if (accAgeDays < giveaway.minimumAccountAge) {
        await interaction.reply({ content: `❌ Your Discord account must be at least ${giveaway.minimumAccountAge} days old to enter.`, ephemeral: true });
        return true;
      }
    }

    if (giveaway.minimumServerAge) {
      if (!member.joinedAt) {
        await interaction.reply({ content: `❌ Unable to determine when you joined the server.`, ephemeral: true });
        return true;
      }
      const srvAgeMs = now.getTime() - member.joinedAt.getTime();
      const srvAgeDays = srvAgeMs / (1000 * 60 * 60 * 24);
      if (srvAgeDays < giveaway.minimumServerAge) {
        await interaction.reply({ content: `❌ You must have been in this server for at least ${giveaway.minimumServerAge} days to enter.`, ephemeral: true });
        return true;
      }
    }

    const success = await enterGiveaway(giveaway.id, interaction.user.id);
    
    if (success) {
      await interaction.reply({ content: '🎉 You have successfully entered the giveaway!', ephemeral: true });
      // We purposefully don't refresh the message on every entry to avoid rate limits, unless it's a specific requirement.
      // A background scheduler can update it, or it updates when it ends.
    } else {
      await interaction.reply({ content: '❌ You have already entered this giveaway.', ephemeral: true });
    }

  } catch (error) {
    logger.error(`Error handling giveaway entry for ${giveawayId}:`, error);
    await interaction.reply({ content: '❌ An error occurred while processing your entry.', ephemeral: true }).catch(() => {});
  }

  return true;
}
