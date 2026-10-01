import { env } from '../config/env';

const DISCORD_API = 'https://discord.com/api/v10';
const headers = {
  Authorization: `Bot ${env.DISCORD_TOKEN}`,
  'Content-Type': 'application/json',
};

export async function addGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'PUT',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  }
}

export async function removeGuildMemberRole(guildId: string, userId: string, roleId: string): Promise<void> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  }
}

export async function getGuildRole(guildId: string, roleId: string): Promise<any> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  }
  const roles = await res.json();
  return roles.find((r: any) => r.id === roleId) || null;
}

export async function getGuildMember(guildId: string, userId: string): Promise<any> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

export async function createMessage(channelId: string, payload: any): Promise<any> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function editMessage(channelId: string, messageId: string, payload: any): Promise<any> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function createChannel(guildId: string, payload: any): Promise<any> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function editChannel(channelId: string, payload: any): Promise<any> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function deleteChannel(channelId: string): Promise<any> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
  return await res.json();
}

export async function editChannelPermission(channelId: string, overwriteId: string, payload: { allow: string, deny: string, type: number }): Promise<void> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${overwriteId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
}

export async function deleteChannelPermission(channelId: string, overwriteId: string): Promise<void> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/permissions/${overwriteId}`, {
    method: 'DELETE',
    headers
  });
  if (!res.ok) throw new Error(`Discord API Error: ${res.status} ${res.statusText}`);
}