import { prisma } from '../database/client';
import { GuildMember, Role, Guild } from 'discord.js';

export async function createPanel(guildId: string, title: string, description?: string) {
  return await prisma.reactionRolePanel.create({
    data: {
      guildId,
      title,
      description,
    }
  });
}

export async function getPanel(guildId: string, panelId: string) {
  return await prisma.reactionRolePanel.findUnique({
    where: { guildId_id: { guildId, id: panelId } },
    include: { roles: true }
  });
}

export async function getPanelsByGuild(guildId: string) {
  return await prisma.reactionRolePanel.findMany({
    where: { guildId },
    include: { _count: { select: { roles: true } } }
  });
}

export async function addRoleToPanel(panelId: string, roleId: string, label: string, emoji?: string, description?: string, style: number = 1) {
  return await prisma.reactionRole.create({
    data: {
      panelId,
      roleId,
      label,
      emoji,
      description,
      style,
    }
  });
}

export async function removeRoleFromPanel(panelId: string, roleId: string) {
  return await prisma.reactionRole.delete({
    where: { panelId_roleId: { panelId, roleId } }
  });
}

export async function deletePanel(guildId: string, panelId: string) {
  return await prisma.reactionRolePanel.delete({
    where: { guildId_id: { guildId, id: panelId } }
  });
}

export async function updatePanelMessage(guildId: string, panelId: string, channelId: string, messageId: string) {
  return await prisma.reactionRolePanel.update({
    where: { guildId_id: { guildId, id: panelId } },
    data: { channelId, messageId }
  });
}

export async function editPanel(guildId: string, panelId: string, title?: string, description?: string, enabled?: boolean) {
  return await prisma.reactionRolePanel.update({
    where: { guildId_id: { guildId, id: panelId } },
    data: { 
      ...(title !== undefined && { title }), 
      ...(description !== undefined && { description }),
      ...(enabled !== undefined && { enabled })
    }
  });
}

export async function editRoleInPanel(panelId: string, roleId: string, label?: string, emoji?: string, description?: string, style?: number, enabled?: boolean) {
  return await prisma.reactionRole.update({
    where: { panelId_roleId: { panelId, roleId } },
    data: {
      ...(label !== undefined && { label }),
      ...(emoji !== undefined && { emoji }),
      ...(description !== undefined && { description }),
      ...(style !== undefined && { style }),
      ...(enabled !== undefined && { enabled })
    }
  });
}

export function isRoleSafeToAssign(guild: Guild, role: Role, botMember: GuildMember): boolean {
  if (!role || !guild || !botMember) return false;
  
  // Can't assign @everyone
  if (role.id === guild.id) return false;

  // Can't assign managed roles (e.g. integration roles, bot roles)
  if (role.managed) return false;

  // Can't assign roles above the bot
  if (role.position >= botMember.roles.highest.position) return false;

  // Can't assign Administrator roles safely via reaction roles
  if (role.permissions.has('Administrator')) return false;

  return true;
}
