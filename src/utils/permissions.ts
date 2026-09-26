import { GuildMember, PermissionFlagsBits, Guild } from 'discord.js';

export const isAdministrator = (member: GuildMember): boolean => {
  return member.permissions.has(PermissionFlagsBits.Administrator);
};

export const hasModeratorPermission = (member: GuildMember, modRoleId?: string | null): boolean => {
  if (isAdministrator(member)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
  if (modRoleId && member.roles.cache.has(modRoleId)) return true;
  return false;
};

export const canManageRole = (member: GuildMember, roleId: string): boolean => {
  if (!hasModeratorPermission(member)) return false;
  
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return false;
  
  // A member can only manage roles lower than their own highest role
  // (unless they are the server owner)
  if (member.id === member.guild.ownerId) return true;
  
  return member.roles.highest.position > role.position;
};

export const canBotManageRole = (guild: Guild, roleId: string): boolean => {
  if (!guild.members.me) return false;
  
  const role = guild.roles.cache.get(roleId);
  if (!role || role.managed) return false;

  return guild.members.me.roles.highest.position > role.position;
};
