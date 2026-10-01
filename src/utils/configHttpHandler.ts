import { prisma } from '../database/client';
import { logger } from './logger';
import { HttpInteractionContext } from './httpInteractionContext';
import { PermissionFlagsBits } from 'discord.js';
import * as os from 'os';
export async function isAdministrator(ctx: HttpInteractionContext): Promise<boolean> {
  if (!ctx.memberPermissions) return false;
  return (BigInt(ctx.memberPermissions) & BigInt(PermissionFlagsBits.Administrator)) !== 0n;
}

export async function generateMainDashboardJson(guildId: string, guildName: string, iconUrl?: string) {
  console.log('[DIAGNOSTIC-CONFIG] generateMainDashboardJson: findUnique');
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) {
    console.log('[DIAGNOSTIC-CONFIG] generateMainDashboardJson: create');
    config = await prisma.guildConfig.create({ data: { guildId } });
  }
  console.log('[DIAGNOSTIC-CONFIG] generateMainDashboardJson: success');

  const embed: any = {
    title: '⚙️ PATIO BOT CONFIGURATION',
    description: `Welcome to the central configuration dashboard for **${guildName}**.\n\nSelect a module below to configure it.`,
    color: 0x2b2d31,
    fields: [
      { name: '👋 Welcome', value: config.welcomeEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🎫 Tickets', value: config.ticketEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔢 Counting', value: config.countingEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔇 ChatBan', value: config.chatBanEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🛡️ AutoMod', value: config.autoModEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔘 Reaction Roles', value: config.reactionRolesEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🎉 Giveaways', value: config.giveawaysEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '💡 Suggestions', value: config.suggestionsEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true }
    ]
  };
  if (iconUrl) embed.thumbnail = { url: iconUrl };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_menu_welcome', label: 'Welcome', emoji: { name: '👋' }, style: 2 },
    { type: 2, custom_id: 'config_menu_tickets', label: 'Tickets', emoji: { name: '🎫' }, style: 2 },
    { type: 2, custom_id: 'config_menu_counting', label: 'Counting', emoji: { name: '🔢' }, style: 2 },
    { type: 2, custom_id: 'config_menu_chatban', label: 'ChatBan', emoji: { name: '🔇' }, style: 2 },
    { type: 2, custom_id: 'config_menu_automod', label: 'AutoMod', emoji: { name: '🛡️' }, style: 2 }
  ]};
  const row2 = { type: 1, components: [
    { type: 2, custom_id: 'config_menu_reactionroles', label: 'Reaction Roles', emoji: { name: '🔘' }, style: 2 },
    { type: 2, custom_id: 'config_menu_giveaways', label: 'Giveaways', emoji: { name: '🎉' }, style: 2 },
    { type: 2, custom_id: 'config_menu_suggestions', label: 'Suggestions', emoji: { name: '💡' }, style: 2 },
    { type: 2, custom_id: 'config_menu_logging', label: 'Logging', emoji: { name: '📋' }, style: 2 },
    { type: 2, custom_id: 'config_menu_permissions', label: 'Permissions', emoji: { name: '🔐' }, style: 2 }
  ]};
  const row3 = { type: 1, components: [
    { type: 2, custom_id: 'config_menu_status', label: 'System Status', emoji: { name: '🛠️' }, style: 2 },
    { type: 2, custom_id: 'config_action_refresh', label: 'Refresh', emoji: { name: '🔄' }, style: 1 },
    { type: 2, custom_id: 'config_action_close', label: 'Close', emoji: { name: '✖️' }, style: 4 }
  ]};

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateWelcomeDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '👋 Welcome Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.welcomeEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Channel', value: config.welcomeChannel ? `<#${config.welcomeChannel}>` : 'None', inline: true },
      { name: 'Button', value: config.welcomeButtonEnabled ? 'Enabled' : 'Disabled', inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_welcome_toggle', label: config.welcomeEnabled ? 'Disable' : 'Enable', style: config.welcomeEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_welcome_edit_msg', label: 'Edit Message', style: 2 },
    { type: 2, custom_id: 'config_welcome_edit_btn', label: 'Edit Button', style: 2 },
    { type: 2, custom_id: 'config_welcome_test', label: 'Test Welcome', style: 1 }
  ]};
  const row2 = { type: 1, components: [{ type: 8, custom_id: 'config_welcome_channel', placeholder: 'Select Welcome Channel', channel_types: [0] }]};
  const row3 = { type: 1, components: [
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 },
    { type: 2, custom_id: 'config_welcome_reset', label: 'Reset Settings', style: 4 }
  ]};

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateTicketDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '🎫 Ticket Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.ticketEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Category', value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'None', inline: true },
      { name: 'Staff Role', value: config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : 'None', inline: true },
      { name: 'Log Channel', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : 'None', inline: true },
      { name: 'Panel Channel', value: config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : 'None', inline: true },
      { name: 'Max / Cooldown', value: `${config.ticketMaxPerUser} / ${config.ticketCooldownSeconds}s`, inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_ticket_toggle', label: config.ticketEnabled ? 'Disable' : 'Enable', style: config.ticketEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_ticket_limits', label: 'Edit Limits', style: 2 },
    { type: 2, custom_id: 'config_ticket_send_panel', label: 'Send Panel', style: 1 }
  ]};
  const row2 = { type: 1, components: [{ type: 8, custom_id: 'config_ticket_category', placeholder: 'Select Ticket Category', channel_types: [4] }]}; // GUILD_CATEGORY
  const row3 = { type: 1, components: [{ type: 8, custom_id: 'config_ticket_panel', placeholder: 'Select Panel Channel', channel_types: [0] }]}; // GUILD_TEXT
  const row4 = { type: 1, components: [
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 },
    { type: 2, custom_id: 'config_ticket_reset', label: 'Reset Settings', style: 4 }
  ]};

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function generateCountingDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '🔢 Counting Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.countingEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Channel', value: config.countingChannelId ? `<#${config.countingChannelId}>` : 'None', inline: true },
      { name: 'Current / Highest', value: `${config.countingCurrent} / ${config.countingHighest}`, inline: true },
      { name: 'Total Counts', value: `${config.countingTotalValid}`, inline: true },
      { name: 'Streak', value: `${config.countingStreak}`, inline: true },
      { name: 'Last Counter', value: config.countingLastUserId ? `<@${config.countingLastUserId}>` : 'None', inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_counting_toggle', label: config.countingEnabled ? 'Disable' : 'Enable', style: config.countingEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_counting_reset_prompt', label: 'Reset Counter', style: 4 }
  ]};
  const row2 = { type: 1, components: [{ type: 8, custom_id: 'config_counting_channel', placeholder: 'Select Counting Channel', channel_types: [0] }]};
  const row3 = { type: 1, components: [{ type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }]};

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateChatBanDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '🔇 ChatBan Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.chatBanEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'ChatBan Role', value: config.chatBanRoleId ? `<@&${config.chatBanRoleId}>` : 'None', inline: true },
      { name: 'Category', value: config.chatBanCategoryId ? `<#${config.chatBanCategoryId}>` : 'None', inline: true },
      { name: 'Moderator Role', value: config.chatBanModeratorRoleId ? `<@&${config.chatBanModeratorRoleId}>` : 'None', inline: true },
      { name: 'Log Channel', value: config.chatBanLogChannelId ? `<#${config.chatBanLogChannelId}>` : 'None', inline: true },
      { name: 'Toggles', value: `DMs: ${config.chatBanDmEnabled ? 'On' : 'Off'} | Iso: ${config.chatBanIsolationEnabled ? 'On' : 'Off'} | Heal: ${config.chatBanSelfHealingEnabled ? 'On' : 'Off'}`, inline: false }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_chatban_toggle', label: config.chatBanEnabled ? 'Disable' : 'Enable', style: config.chatBanEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_chatban_toggledm', label: 'Toggle DMs', style: 2 },
    { type: 2, custom_id: 'config_chatban_toggleiso', label: 'Toggle Iso', style: 2 },
    { type: 2, custom_id: 'config_chatban_toggleheal', label: 'Toggle Heal', style: 2 }
  ]};
  const row2 = { type: 1, components: [{ type: 6, custom_id: 'config_chatban_role', placeholder: 'Select ChatBan Role' }]}; // ROLE_SELECT
  const row3 = { type: 1, components: [{ type: 8, custom_id: 'config_chatban_category', placeholder: 'Select Isolation Category', channel_types: [4] }]};
  const row4 = { type: 1, components: [
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 },
    { type: 2, custom_id: 'config_chatban_reset', label: 'Reset Settings', style: 4 }
  ]};

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function generateAutoModDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });
  const rules = await prisma.autoModRule.findMany({ where: { guildId, enabled: true } });

  const embed = {
    title: '🛡️ AutoMod Configuration',
    color: 0x2b2d31,
    description: 'Configure full rules via `/automod rule configure`.\nCustom words via `/automod words`.',
    fields: [
      { name: 'Status', value: config.autoModEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Log Channel', value: config.autoModLogChannelId ? `<#${config.autoModLogChannelId}>` : 'None', inline: true },
      { name: 'Exempt Channels', value: config.autoModExemptChannels ? `${config.autoModExemptChannels.split(',').length}` : '0', inline: true },
      { name: 'Exempt Roles', value: config.autoModExemptRoles ? `${config.autoModExemptRoles.split(',').length}` : '0', inline: true },
      { name: 'Active Rules', value: rules.length > 0 ? rules.map(r => `\`${r.ruleType}\``).join(', ') : 'None', inline: false }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_automod_toggle', label: config.autoModEnabled ? 'Disable' : 'Enable', style: config.autoModEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 },
    { type: 2, custom_id: 'config_automod_reset', label: 'Reset Settings', style: 4 }
  ]};
  const row2 = { type: 1, components: [{ type: 8, custom_id: 'config_automod_log', placeholder: 'Select Log Channel', channel_types: [0] }]};

  return { embeds: [embed], components: [row1, row2] };
}

export async function generateReactionRolesDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });
  const panels = await prisma.reactionRolePanel.findMany({ where: { guildId }, include: { roles: true } });
  const publishedPanels = panels.filter(p => p.messageId).length;
  const totalRoles = panels.reduce((sum, p) => sum + p.roles.length, 0);

  const embed = {
    title: '🔘 Reaction Roles Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.reactionRolesEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Total Panels', value: `${panels.length}`, inline: true },
      { name: 'Published Panels', value: `${publishedPanels}`, inline: true },
      { name: 'Configured Roles', value: `${totalRoles}`, inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_reactionroles_toggle', label: config.reactionRolesEnabled ? 'Disable' : 'Enable', style: config.reactionRolesEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }
  ]};

  return { embeds: [embed], components: [row1] };
}

export async function generateGiveawaysDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });
  const giveaways = await prisma.giveaway.findMany({ where: { guildId } });
  const activeCount = giveaways.filter(g => g.status === 'ACTIVE').length;
  const scheduledCount = giveaways.filter(g => g.status === 'SCHEDULED').length;

  const embed = {
    title: '🎉 Giveaways Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.giveawaysEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Total Giveaways', value: `${giveaways.length}`, inline: true },
      { name: 'Active', value: `${activeCount}`, inline: true },
      { name: 'Scheduled', value: `${scheduledCount}`, inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_giveaways_toggle', label: config.giveawaysEnabled ? 'Disable' : 'Enable', style: config.giveawaysEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }
  ]};

  return { embeds: [embed], components: [row1] };
}

export async function generateSuggestionsDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });
  const suggestions = await prisma.suggestion.findMany({ where: { guildId } });
  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length;
  const approvedCount = suggestions.filter(s => s.status === 'APPROVED').length;
  const implementedCount = suggestions.filter(s => s.status === 'IMPLEMENTED').length;

  const embed = {
    title: '💡 Suggestions Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Status', value: config.suggestionsEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Anonymous', value: config.suggestionAnonymousEnabled ? '🟢 YES' : '🔴 NO', inline: true },
      { name: 'Total Suggestions', value: `${suggestions.length}`, inline: true },
      { name: 'Pending', value: `${pendingCount}`, inline: true },
      { name: 'Approved', value: `${approvedCount}`, inline: true },
      { name: 'Implemented', value: `${implementedCount}`, inline: true }
    ]
  };

  const row1 = { type: 1, components: [
    { type: 2, custom_id: 'config_suggestions_toggle', label: config.suggestionsEnabled ? 'Disable' : 'Enable', style: config.suggestionsEnabled ? 4 : 3 },
    { type: 2, custom_id: 'config_suggestions_anon', label: 'Toggle Anonymous', style: 2 },
    { type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }
  ]};

  return { embeds: [embed], components: [row1] };
}

export async function generateLoggingDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '📋 Logging Configuration',
    color: 0x2b2d31,
    fields: [
      { name: 'Main Log Channel', value: config.mainLogChannelId ? `<#${config.mainLogChannelId}>` : 'None', inline: true },
      { name: 'Mod Log Channel', value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'None', inline: true },
      { name: 'Ticket Log Channel', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : 'None', inline: true },
      { name: 'Transcript Channel', value: config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : 'None', inline: true },
      { name: 'ChatBan Log Channel', value: config.chatBanLogChannelId ? `<#${config.chatBanLogChannelId}>` : 'None', inline: true }
    ]
  };

  const row1 = { type: 1, components: [{ type: 8, custom_id: 'config_log_main', placeholder: 'Select Main Log Channel', channel_types: [0] }]};
  const row2 = { type: 1, components: [{ type: 8, custom_id: 'config_log_mod', placeholder: 'Select Moderation Log Channel', channel_types: [0] }]};
  const row3 = { type: 1, components: [{ type: 8, custom_id: 'config_log_ticket', placeholder: 'Select Ticket Log Channel', channel_types: [0] }]};
  const row4 = { type: 1, components: [{ type: 8, custom_id: 'config_log_transcript', placeholder: 'Select Transcript Channel', channel_types: [0] }]};
  const row5 = { type: 1, components: [{ type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }]};

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

export async function generatePermissionsDashboardJson(guildId: string) {
  let config = await prisma.guildConfig.findUnique({ where: { guildId } });
  if (!config) config = await prisma.guildConfig.create({ data: { guildId } });

  const embed = {
    title: '🔐 Permissions Configuration',
    color: 0x2b2d31,
    description: 'Select the roles that are authorized to manage these systems. Note: The bot will never modify roles equal or higher than its own highest role.',
    fields: [
      { name: 'Ticket Staff Role', value: config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : 'None', inline: true },
      { name: 'ChatBan Mod Role', value: config.chatBanModeratorRoleId ? `<@&${config.chatBanModeratorRoleId}>` : 'None', inline: true }
    ]
  };

  const row1 = { type: 1, components: [{ type: 6, custom_id: 'config_perm_ticket', placeholder: 'Select Ticket Staff Role' }]};
  const row2 = { type: 1, components: [{ type: 6, custom_id: 'config_perm_chatban', placeholder: 'Select ChatBan Moderator Role' }]};
  const row3 = { type: 1, components: [{ type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }]};

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateSystemStatusJson(guildId: string) {
  const isDbConnected = await prisma.guildConfig.findFirst().then(() => true).catch(() => false);
  const embed = {
    title: '🛠️ System Status',
    color: 0x2b2d31,
    fields: [
      { name: 'Database', value: isDbConnected ? '🟢 CONNECTED (MongoDB)' : '🔴 DISCONNECTED', inline: true },
      { name: 'Discord API', value: '🟢 Vercel HTTP OK', inline: true },
      { name: 'Worker Status', value: 'ℹ️ Not directly available in serverless execution.', inline: true },
      { name: 'Node Version', value: process.version, inline: true },
      { name: 'OS Platform', value: `${os.type()} ${os.release()}`, inline: true },
      { name: 'Memory', value: `${Math.round(os.freemem() / 1024 / 1024)}MB Free`, inline: true }
    ]
  };
  const row = { type: 1, components: [{ type: 2, custom_id: 'config_back_main', label: 'Back to Menu', style: 2 }]};
  return { embeds: [embed], components: [row] };
}
import { createMessage } from './discordRest';

export async function handleHttpConfigCommand(ctx: HttpInteractionContext, respond: any): Promise<boolean> {
  const t0 = Date.now();
  if (ctx.commandName !== 'config') return false;
  
  if (!ctx.guildId) {
    respond({ content: '❌ This command can only be used in a server.', flags: 64 });
    return true;
  }
  
  const isAdmin = await isAdministrator(ctx);
  if (!isAdmin) {
    respond({ content: '❌ You must be an Administrator to use this command.', flags: 64 });
    return true;
  }
  
  try {
    console.log(`[DIAGNOSTIC-PRISMA] findUnique:start`);
    const t1 = Date.now();
    // Warm up the pool with a simple query first if needed, but we'll do the actual query
    await prisma.guildConfig.findUnique({ where: { guildId: ctx.guildId } });
    console.log(`[DIAGNOSTIC-PRISMA] findUnique:end ${Date.now() - t1}ms`);

    // Actually fetch the full dashboard representation
    const payload = await generateMainDashboardJson(ctx.guildId, `Guild ${ctx.guildId}`);
    
    respond({ ...payload, flags: 64 });
  } catch (err: any) {
    console.error('[DIAGNOSTIC-CONFIG] Prisma or rendering error:', err);
    respond({ content: '❌ Internal error loading config.', flags: 64 });
  }
  
  console.log(`[DIAGNOSTIC-CONFIG] handler:end ${Date.now() - t0}ms`);
  return true;
}

export async function handleHttpConfigInteraction(ctx: HttpInteractionContext, respond: any): Promise<boolean> {
  if (!ctx.guildId || !ctx.userId || !ctx.customId) return false;
  if (!ctx.customId.startsWith('config_')) return false;

  if (!(await isAdministrator(ctx))) {
    respond({ content: '❌ You must be an Administrator to configure the bot.', flags: 64 });
    return true;
  }

  const customId = ctx.customId;
  const guildId = ctx.guildId;

  try {
    // Navigation & Close
    if (customId === 'config_action_close') {
      respond({ type: 7, data: { content: 'Config closed.', embeds: [], components: [] } });
      return true;
    }
    
    if (customId === 'config_back_main' || customId === 'config_action_refresh') {
      const payload = await generateMainDashboardJson(guildId, `Guild ${guildId}`);
      respond({ type: 7, data: payload });
      return true;
    }

    // Dashboard Menus
    if (customId === 'config_menu_status') { respond({ type: 7, data: await generateSystemStatusJson(guildId) }); return true; }
    if (customId === 'config_menu_welcome') { respond({ type: 7, data: await generateWelcomeDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_tickets') { respond({ type: 7, data: await generateTicketDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_counting') { respond({ type: 7, data: await generateCountingDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_chatban') { respond({ type: 7, data: await generateChatBanDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_automod') { respond({ type: 7, data: await generateAutoModDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_reactionroles') { respond({ type: 7, data: await generateReactionRolesDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_giveaways') { respond({ type: 7, data: await generateGiveawaysDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_suggestions') { respond({ type: 7, data: await generateSuggestionsDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_logging') { respond({ type: 7, data: await generateLoggingDashboardJson(guildId) }); return true; }
    if (customId === 'config_menu_permissions') { respond({ type: 7, data: await generatePermissionsDashboardJson(guildId) }); return true; }

    // Reset Prompts
    if (['config_counting_reset_prompt', 'config_welcome_reset', 'config_ticket_reset', 'config_chatban_reset', 'config_automod_reset'].includes(customId)) {
      const typeMap: Record<string, string> = {
        'config_counting_reset_prompt': 'counting', 'config_welcome_reset': 'welcome', 'config_ticket_reset': 'ticket', 'config_chatban_reset': 'chatban', 'config_automod_reset': 'automod'
      };
      const sysType = typeMap[customId];
      const confirmRow = { type: 1, components: [
        { type: 2, custom_id: `config_confirm_${sysType}_reset`, label: 'Confirm Reset', style: 4 },
        { type: 2, custom_id: `config_menu_${sysType}`, label: 'Cancel', style: 2 }
      ]};
      respond({ type: 7, data: { content: `⚠️ Are you sure you want to reset the **${sysType}** configuration?`, embeds: [], components: [confirmRow] } });
      return true;
    }

    // Confirm Resets
    if (customId.startsWith('config_confirm_')) {
      if (customId.includes('_counting_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { countingCurrent: 1, countingHighest: 0, countingTotalValid: 0, countingStreak: 0, countingLastUserId: null, countingLastCountAt: null } });
        respond({ type: 7, data: await generateCountingDashboardJson(guildId) }); return true;
      }
      if (customId.includes('_welcome_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { welcomeEnabled: false, welcomeChannel: null, welcomeTitle: null, welcomeDescription: null, welcomeMessage: null, welcomeColor: null, welcomeImageUrl: null, welcomeThumbnailUrl: null, welcomeFooterText: null, welcomeShowTimestamp: true, welcomeButtonEnabled: true, welcomeButtonLabel: null, welcomeButtonStyle: null } });
        respond({ type: 7, data: await generateWelcomeDashboardJson(guildId) }); return true;
      }
      if (customId.includes('_ticket_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { ticketEnabled: false, ticketCategoryId: null, ticketStaffRoleId: null, ticketLogChannelId: null, ticketTranscriptChannelId: null, ticketPanelChannelId: null, ticketPanelMessageId: null, ticketMaxPerUser: 1, ticketCooldownSeconds: 300, ticketNameFormat: 'ticket-{username}' } });
        respond({ type: 7, data: await generateTicketDashboardJson(guildId) }); return true;
      }
      if (customId.includes('_chatban_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { chatBanEnabled: false, chatBanRoleId: null, chatBanCategoryId: null, chatBanModeratorRoleId: null, chatBanLogChannelId: null, chatBanDmEnabled: true, chatBanIsolationEnabled: true, chatBanSelfHealingEnabled: true, chatBanAppealChannelId: null, chatBanInfoChannelId: null } });
        respond({ type: 7, data: await generateChatBanDashboardJson(guildId) }); return true;
      }
      if (customId.includes('_automod_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { autoModEnabled: false, autoModLogChannelId: null, autoModExemptChannels: null, autoModExemptRoles: null } });
        respond({ type: 7, data: await generateAutoModDashboardJson(guildId) }); return true;
      }
    }

    // Toggles
    if (customId.endsWith('_toggle')) {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config) return true;
      let updateData = {};
      if (customId === 'config_welcome_toggle') {
        if (!config.welcomeEnabled && !config.welcomeChannel) { respond({ content: '❌ Cannot enable Welcome system: No channel configured.', flags: 64 }); return true; }
        updateData = { welcomeEnabled: !config.welcomeEnabled };
      }
      else if (customId === 'config_ticket_toggle') {
        if (!config.ticketEnabled && !config.ticketCategoryId) { respond({ content: '❌ Cannot enable Ticket system: No category configured.', flags: 64 }); return true; }
        updateData = { ticketEnabled: !config.ticketEnabled };
      }
      else if (customId === 'config_counting_toggle') {
        if (!config.countingEnabled && !config.countingChannelId) { respond({ content: '❌ Cannot enable Counting system: No channel configured.', flags: 64 }); return true; }
        updateData = { countingEnabled: !config.countingEnabled };
      }
      else if (customId === 'config_chatban_toggle') {
        if (!config.chatBanEnabled && !config.chatBanRoleId) { respond({ content: '❌ Cannot enable ChatBan system: No ChatBan role configured.', flags: 64 }); return true; }
        updateData = { chatBanEnabled: !config.chatBanEnabled };
      }
      else if (customId === 'config_automod_toggle') updateData = { autoModEnabled: !config.autoModEnabled };
      else if (customId === 'config_reactionroles_toggle') updateData = { reactionRolesEnabled: !config.reactionRolesEnabled };
      else if (customId === 'config_giveaways_toggle') updateData = { giveawaysEnabled: !config.giveawaysEnabled };
      else if (customId === 'config_suggestions_toggle') updateData = { suggestionsEnabled: !config.suggestionsEnabled };

      if (Object.keys(updateData).length > 0) await prisma.guildConfig.update({ where: { guildId }, data: updateData });

      if (customId.includes('welcome')) respond({ type: 7, data: await generateWelcomeDashboardJson(guildId) });
      else if (customId.includes('ticket')) respond({ type: 7, data: await generateTicketDashboardJson(guildId) });
      else if (customId.includes('counting')) respond({ type: 7, data: await generateCountingDashboardJson(guildId) });
      else if (customId.includes('chatban')) respond({ type: 7, data: await generateChatBanDashboardJson(guildId) });
      else if (customId.includes('automod')) respond({ type: 7, data: await generateAutoModDashboardJson(guildId) });
      else if (customId.includes('reactionroles')) respond({ type: 7, data: await generateReactionRolesDashboardJson(guildId) });
      else if (customId.includes('giveaways')) respond({ type: 7, data: await generateGiveawaysDashboardJson(guildId) });
      else if (customId.includes('suggestions')) respond({ type: 7, data: await generateSuggestionsDashboardJson(guildId) });
      return true;
    }

    if (customId === 'config_chatban_toggledm' || customId === 'config_chatban_toggleiso' || customId === 'config_chatban_toggleheal' || customId === 'config_suggestions_anon') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      let updateData = {};
      if (customId === 'config_chatban_toggledm') updateData = { chatBanDmEnabled: !config?.chatBanDmEnabled };
      else if (customId === 'config_chatban_toggleiso') updateData = { chatBanIsolationEnabled: !config?.chatBanIsolationEnabled };
      else if (customId === 'config_chatban_toggleheal') updateData = { chatBanSelfHealingEnabled: !config?.chatBanSelfHealingEnabled };
      else if (customId === 'config_suggestions_anon') updateData = { suggestionAnonymousEnabled: !config?.suggestionAnonymousEnabled };

      if (Object.keys(updateData).length > 0) await prisma.guildConfig.update({ where: { guildId }, data: updateData });
      
      if (customId.includes('chatban')) respond({ type: 7, data: await generateChatBanDashboardJson(guildId) });
      else respond({ type: 7, data: await generateSuggestionsDashboardJson(guildId) });
      return true;
    }

    // Role / Channel Selects
    if (ctx.componentValues && ctx.componentValues.length > 0) {
      const val = ctx.componentValues[0];
      let updateData: any = null;
      let refreshFunc: any = null;

      if (customId === 'config_welcome_channel') { updateData = { welcomeChannel: val }; refreshFunc = generateWelcomeDashboardJson; }
      else if (customId === 'config_ticket_category') { updateData = { ticketCategoryId: val }; refreshFunc = generateTicketDashboardJson; }
      else if (customId === 'config_ticket_panel') { updateData = { ticketPanelChannelId: val }; refreshFunc = generateTicketDashboardJson; }
      else if (customId === 'config_counting_channel') { updateData = { countingChannelId: val }; refreshFunc = generateCountingDashboardJson; }
      else if (customId === 'config_chatban_role') { updateData = { chatBanRoleId: val }; refreshFunc = generateChatBanDashboardJson; }
      else if (customId === 'config_chatban_category') { updateData = { chatBanCategoryId: val }; refreshFunc = generateChatBanDashboardJson; }
      else if (customId === 'config_log_main') { updateData = { mainLogChannelId: val }; refreshFunc = generateLoggingDashboardJson; }
      else if (customId === 'config_log_mod') { updateData = { modLogChannelId: val }; refreshFunc = generateLoggingDashboardJson; }
      else if (customId === 'config_log_ticket') { updateData = { ticketLogChannelId: val }; refreshFunc = generateLoggingDashboardJson; }
      else if (customId === 'config_log_transcript') { updateData = { ticketTranscriptChannelId: val }; refreshFunc = generateLoggingDashboardJson; }
      else if (customId === 'config_perm_ticket') { updateData = { ticketStaffRoleId: val }; refreshFunc = generatePermissionsDashboardJson; }
      else if (customId === 'config_perm_chatban') { updateData = { chatBanModeratorRoleId: val }; refreshFunc = generatePermissionsDashboardJson; }
      else if (customId === 'config_automod_log') { updateData = { autoModLogChannelId: val }; refreshFunc = generateAutoModDashboardJson; }

      if (updateData && refreshFunc) {
        await prisma.guildConfig.update({ where: { guildId }, data: updateData });
        respond({ type: 7, data: await refreshFunc(guildId) });
        return true;
      }
    }

    // Welcome Modals
    if (customId === 'config_welcome_edit_msg') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      respond({ type: 9, data: {
        title: 'Edit Welcome Message', custom_id: 'config_welcome_msg_modal',
        components: [
          { type: 1, components: [{ type: 4, custom_id: 'title', label: 'Embed Title', style: 1, required: false, value: config?.welcomeTitle || '' }] },
          { type: 1, components: [{ type: 4, custom_id: 'description', label: 'Embed Description', style: 2, required: false, value: config?.welcomeDescription || '' }] },
          { type: 1, components: [{ type: 4, custom_id: 'message', label: 'Outside Message', style: 2, required: false, value: config?.welcomeMessage || '' }] },
          { type: 1, components: [{ type: 4, custom_id: 'color', label: 'Hex Color (e.g. #FFFFFF)', style: 1, required: false, value: config?.welcomeColor || '' }] },
          { type: 1, components: [{ type: 4, custom_id: 'image', label: 'Image URL', style: 1, required: false, value: config?.welcomeImageUrl || '' }] }
        ]
      }}); return true;
    }
    
    if (customId === 'config_welcome_msg_modal') {
      let color = ctx.modalFields?.['color'] || null;
      if (color && !/^#[0-9A-F]{6}$/i.test(color)) color = null;
      await prisma.guildConfig.update({ where: { guildId }, data: {
        welcomeTitle: ctx.modalFields?.['title'] || null,
        welcomeDescription: ctx.modalFields?.['description'] || null,
        welcomeMessage: ctx.modalFields?.['message'] || null,
        welcomeColor: color,
        welcomeImageUrl: ctx.modalFields?.['image'] || null
      }});
      respond({ type: 7, data: await generateWelcomeDashboardJson(guildId) }); return true;
    }

    if (customId === 'config_welcome_edit_btn') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      respond({ type: 9, data: {
        title: 'Edit Welcome Button', custom_id: 'config_welcome_btn_modal',
        components: [
          { type: 1, components: [{ type: 4, custom_id: 'enabled', label: 'Enabled? (true/false)', style: 1, required: true, value: config?.welcomeButtonEnabled ? 'true' : 'false' }] },
          { type: 1, components: [{ type: 4, custom_id: 'label', label: 'Button Label', style: 1, required: false, value: config?.welcomeButtonLabel || '' }] },
          { type: 1, components: [{ type: 4, custom_id: 'style', label: 'Style (1=Blue,2=Gray,3=Green,4=Red)', style: 1, required: false, value: config?.welcomeButtonStyle?.toString() || '1' }] }
        ]
      }}); return true;
    }

    if (customId === 'config_welcome_btn_modal') {
      const enabledStr = ctx.modalFields?.['enabled']?.toLowerCase();
      let style = 1;
      const styleStr = ctx.modalFields?.['style'];
      if (styleStr && ['1','2','3','4'].includes(styleStr)) style = parseInt(styleStr, 10);
      await prisma.guildConfig.update({ where: { guildId }, data: {
        welcomeButtonEnabled: enabledStr === 'true' || enabledStr === 'yes',
        welcomeButtonLabel: ctx.modalFields?.['label'] || null,
        welcomeButtonStyle: style
      }});
      respond({ type: 7, data: await generateWelcomeDashboardJson(guildId) }); return true;
    }

    if (customId === 'config_welcome_test') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config) { respond({ content: '❌ Config not found.', flags: 64 }); return true; }
      
      let colorValue = undefined;
      if (config.welcomeColor) colorValue = parseInt(config.welcomeColor.replace('#', ''), 16);
      
      const embed: any = {
        title: config.welcomeTitle?.replace('{user}', 'TestUser').replace('{server}', 'TestServer') || 'Welcome!',
        description: config.welcomeDescription?.replace('{user}', '<@123456789>').replace('{server}', 'TestServer') || 'Welcome to the server!',
        color: colorValue,
      };
      if (config.welcomeImageUrl) embed.image = { url: config.welcomeImageUrl };
      if (config.welcomeThumbnailUrl) embed.thumbnail = { url: config.welcomeThumbnailUrl };
      if (config.welcomeFooterText) embed.footer = { text: config.welcomeFooterText };
      if (config.welcomeShowTimestamp) embed.timestamp = new Date().toISOString();

      const components: any[] = [];
      if (config.welcomeButtonEnabled) {
        components.push({ type: 1, components: [{ type: 2, custom_id: 'welcome_btn_test', label: config.welcomeButtonLabel || 'Welcome!', style: config.welcomeButtonStyle || 1 }] });
      }
      respond({ content: config.welcomeMessage?.replace('{user}', '<@123456789>').replace('{server}', 'TestServer') || '', embeds: [embed], components, flags: 64 });
      return true;
    }

    // Ticket Limits Modal
    if (customId === 'config_ticket_limits') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      respond({ type: 9, data: {
        title: 'Ticket Limits', custom_id: 'config_ticket_limits_modal',
        components: [
          { type: 1, components: [{ type: 4, custom_id: 'max', label: 'Max Tickets Per User', style: 1, required: true, value: String(config?.ticketMaxPerUser || 1) }] },
          { type: 1, components: [{ type: 4, custom_id: 'cooldown', label: 'Cooldown (Seconds)', style: 1, required: true, value: String(config?.ticketCooldownSeconds || 300) }] }
        ]
      }}); return true;
    }

    if (customId === 'config_ticket_limits_modal') {
      const max = parseInt(ctx.modalFields?.['max'] || '1', 10);
      const cd = parseInt(ctx.modalFields?.['cooldown'] || '300', 10);
      await prisma.guildConfig.update({ where: { guildId }, data: { ticketMaxPerUser: isNaN(max) ? 1 : max, ticketCooldownSeconds: isNaN(cd) ? 300 : cd } });
      respond({ type: 7, data: await generateTicketDashboardJson(guildId) }); return true;
    }
    
    // Ticket Panel Send
    if (customId === 'config_ticket_send_panel') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config || !config.ticketPanelChannelId) { respond({ content: '❌ Ticket panel channel is not configured.', flags: 64 }); return true; }
      
      const panelEmbed = {
        title: '🎫 Support Tickets',
        description: 'Click the button below to open a support ticket.',
        color: 0x2b2d31
      };
      
      const panelRow = {
        type: 1,
        components: [{ type: 2, custom_id: 'ticket_create_select', label: 'Open Ticket', emoji: { name: '🎫' }, style: 1 }]
      };
      
      try {
        await createMessage(config.ticketPanelChannelId, { embeds: [panelEmbed], components: [panelRow] });
        respond({ content: `✅ Ticket panel sent to <#${config.ticketPanelChannelId}>.`, flags: 64 });
      } catch (e) {
        logger.error('Failed to send ticket panel', e);
        respond({ content: '❌ Failed to send ticket panel via REST. Check permissions.', flags: 64 });
      }
      return true;
    }

  } catch (err) {
    logger.error('Error handling config interaction', err);
    respond({ content: '❌ An error occurred processing this configuration change.', flags: 64 });
    return true;
  }

  return false;
}
