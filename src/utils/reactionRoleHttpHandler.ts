import { prisma } from '../database/client';
import { logger } from './logger';
import { HttpInteractionContext } from './httpInteractionContext';
import { addGuildMemberRole, removeGuildMemberRole, getGuildRole, getGuildMember } from './discordRest';

export async function handleHttpReactionRoleInteraction(ctx: HttpInteractionContext, respond: any): Promise<boolean> {
  if (!ctx.guildId || !ctx.userId || !ctx.customId) return false;

  // Custom ID format: rr:panel:<panelId>:role:<roleId>
  if (!ctx.customId.startsWith('rr:panel:')) return false;

  const parts = ctx.customId.split(':');
  if (parts.length !== 5 || parts[0] !== 'rr' || parts[1] !== 'panel' || parts[3] !== 'role') {
    return false;
  }

  const panelId = parts[2];
  const roleId = parts[4];

  try {
    const config = await prisma.guildConfig.findUnique({
      where: { guildId: ctx.guildId },
      select: { reactionRolesEnabled: true }
    });

    if (config && !config.reactionRolesEnabled) {
      respond({ content: '❌ Reaction roles are currently disabled in this server.', flags: 64 });
      return true;
    }

    const panel = await prisma.reactionRolePanel.findUnique({
      where: { guildId_id: { guildId: ctx.guildId, id: panelId } },
      include: { roles: true }
    });

    if (!panel || !panel.enabled) {
      respond({ content: '❌ This reaction role panel is no longer active.', flags: 64 });
      return true;
    }

    const roleConfig = panel.roles.find(r => r.roleId === roleId);
    if (!roleConfig || !roleConfig.enabled) {
      respond({ content: '❌ This role is no longer available on this panel.', flags: 64 });
      return true;
    }

    const guildRole = await getGuildRole(ctx.guildId, roleId);
    if (!guildRole) {
      respond({ content: '❌ The configured role no longer exists in this server.', flags: 64 });
      return true;
    }

    // Safety checks
    if (guildRole.managed || guildRole.id === ctx.guildId || (guildRole.permissions & 0x8) === 0x8) { // 0x8 is Administrator
      respond({ content: '❌ This role cannot be safely assigned.', flags: 64 });
      return true;
    }

    const member = await getGuildMember(ctx.guildId, ctx.userId);
    const hasRole = member.roles.includes(roleId);

    if (hasRole) {
      await removeGuildMemberRole(ctx.guildId, ctx.userId, roleId);
      respond({ content: `✅ Removed role **${guildRole.name}**.`, flags: 64 });
    } else {
      await addGuildMemberRole(ctx.guildId, ctx.userId, roleId);
      respond({ content: `✅ Added role **${guildRole.name}**.`, flags: 64 });
    }
  } catch (error) {
    logger.error(`Error handling HTTP reaction role interaction for panel ${panelId} role ${roleId}:`, error);
    respond({ content: '❌ An error occurred while assigning the role.', flags: 64 });
  }

  return true;
}
