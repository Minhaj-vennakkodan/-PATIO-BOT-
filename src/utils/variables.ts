import { GuildMember, Guild } from 'discord.js';

export interface VariableReplacements {
  user: string;
  username: string;
  displayName: string;
  server: string;
  memberNumber: string | number;
  memberCount: number;
  joinedAt: string;
  accountCreated: string;
  accountAge: string;
  userId: string;
}

export const generateReplacements = (
  member: GuildMember,
  guild: Guild,
  memberNumber: number
): VariableReplacements => {
  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const daysOld = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));

  return {
    user: member.toString(),
    username: member.user.username,
    displayName: member.displayName,
    server: guild.name,
    memberNumber,
    memberCount: guild.memberCount,
    joinedAt: member.joinedAt ? member.joinedAt.toDateString() : new Date().toDateString(),
    accountCreated: member.user.createdAt.toDateString(),
    accountAge: `${daysOld} days`,
    userId: member.user.id,
  };
};

export const replaceVariables = (text: string, replacements: VariableReplacements): string => {
  if (!text) return '';
  return text
    .replace(/{user}/g, replacements.user)
    .replace(/{username}/g, replacements.username)
    .replace(/{displayName}/g, replacements.displayName)
    .replace(/{server}/g, replacements.server)
    .replace(/{memberNumber}/g, String(replacements.memberNumber))
    .replace(/{memberCount}/g, String(replacements.memberCount))
    .replace(/{joinedAt}/g, replacements.joinedAt)
    .replace(/{accountCreated}/g, replacements.accountCreated)
    .replace(/{accountAge}/g, replacements.accountAge)
    .replace(/{userId}/g, replacements.userId);
};
