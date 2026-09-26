import { Interaction, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../database/client';
import { isRoleSafeToAssign } from './reactionRoleService';
import { logger } from './logger';

// In-memory lock to prevent race conditions from rapid duplicate clicks
const activeInteractions = new Set<string>();

export async function handleReactionRoleInteractions(interaction: Interaction) {
  if (!interaction.isButton() || !interaction.guildId || !interaction.guild || !interaction.member) return false;

  // Custom ID format: rr:panel:<panelId>:role:<roleId>
  if (!interaction.customId.startsWith('rr:panel:')) return false;

  const parts = interaction.customId.split(':');
  if (parts.length !== 5 || parts[0] !== 'rr' || parts[1] !== 'panel' || parts[3] !== 'role') {
    return false;
  }

  const panelId = parts[2];
  const roleId = parts[4];

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guildId },
      select: { reactionRolesEnabled: true }
    });

    if (config && !config.reactionRolesEnabled) {
      await interaction.reply({ content: '❌ Reaction roles are currently disabled in this server.', ephemeral: true });
      return true; // Handled
    }

    const panel = await prisma.reactionRolePanel.findUnique({
      where: { guildId_id: { guildId: interaction.guildId, id: panelId } },
      include: { roles: true }
    });

    if (!panel || !panel.enabled) {
      await interaction.reply({ content: '❌ This reaction role panel is no longer active.', ephemeral: true });
      return true;
    }

    const roleConfig = panel.roles.find(r => r.roleId === roleId);
    if (!roleConfig || !roleConfig.enabled) {
      await interaction.reply({ content: '❌ This role is no longer available on this panel.', ephemeral: true });
      return true;
    }

    const guildRole = interaction.guild.roles.cache.get(roleId);
    if (!guildRole) {
      await interaction.reply({ content: '❌ The configured role no longer exists in this server.', ephemeral: true });
      return true;
    }

    const botMember = await interaction.guild.members.fetch(interaction.client.user!.id);
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: '❌ The bot is missing the **Manage Roles** permission.', ephemeral: true });
      logger.warn(`Bot missing ManageRoles permission in guild ${interaction.guildId} during Reaction Roles`);
      return true;
    }

    if (!isRoleSafeToAssign(interaction.guild, guildRole, botMember)) {
      await interaction.reply({ content: '❌ This role can no longer be safely assigned by the bot. Please contact an administrator.', ephemeral: true });
      logger.warn(`Unsafe reaction role assignment blocked in guild ${interaction.guildId} for role ${roleId}`);
      return true;
    }

    const lockKey = `${interaction.guildId}:${interaction.user.id}:${roleId}`;
    if (activeInteractions.has(lockKey)) {
      // Rapid click detected, ignore or warn
      await interaction.reply({ content: '⏳ Please wait a moment before clicking again.', ephemeral: true });
      return true;
    }

    activeInteractions.add(lockKey);
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasRole = member.roles.cache.has(roleId);

      if (hasRole) {
        await member.roles.remove(roleId);
        await interaction.reply({ content: `✅ Removed role **${guildRole.name}**.`, ephemeral: true });
      } else {
        await member.roles.add(roleId);
        await interaction.reply({ content: `✅ Added role **${guildRole.name}**.`, ephemeral: true });
      }
    } finally {
      activeInteractions.delete(lockKey);
    }

  } catch (error) {
    logger.error(`Error handling reaction role interaction for panel ${panelId} role ${roleId}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred while assigning the role.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.followUp({ content: '❌ An error occurred while assigning the role.', ephemeral: true }).catch(() => {});
    }
  }

  return true;
}
