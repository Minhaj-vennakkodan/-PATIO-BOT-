import { 
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
  StringSelectMenuBuilder, Interaction, Guild, ChannelSelectMenuBuilder, 
  RoleSelectMenuBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, 
  TextInputBuilder, TextInputStyle 
} from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { isAdministrator, canBotManageRole } from './permissions';
import * as os from 'os';

// ------------------------------------------------------------------
// Main Dashboard Generator
// ------------------------------------------------------------------
export async function generateMainDashboard(guild: Guild) {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ PATIO BOT CONFIGURATION')
    .setDescription(`Welcome to the central configuration dashboard for **${guild.name}**.\n\nSelect a module below to configure it.`)
    .setColor('#2b2d31')
    .setThumbnail(guild.iconURL());
    
  if (config) {
    embed.addFields(
      { name: '👋 Welcome', value: config.welcomeEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🎫 Tickets', value: config.ticketEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔢 Counting', value: config.countingEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔇 ChatBan', value: config.chatBanEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🛡️ AutoMod', value: config.autoModEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🔘 Reaction Roles', value: config.reactionRolesEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '🎉 Giveaways', value: config.giveawaysEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: '💡 Suggestions', value: config.suggestionsEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true }
    );
  } else {
    embed.addFields({ name: 'Status', value: '⚠️ Configuration not found. Please click Refresh to initialize.', inline: false });
  }

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_menu_welcome').setLabel('Welcome').setEmoji('👋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_tickets').setLabel('Tickets').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_counting').setLabel('Counting').setEmoji('🔢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_chatban').setLabel('ChatBan').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_automod').setLabel('AutoMod').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_menu_reactionroles').setLabel('Reaction Roles').setEmoji('🔘').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_giveaways').setLabel('Giveaways').setEmoji('🎉').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_suggestions').setLabel('Suggestions').setEmoji('💡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_logging').setLabel('Logging').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_menu_permissions').setLabel('Permissions').setEmoji('🔐').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_menu_status').setLabel('System Status').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_action_refresh').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config_action_close').setLabel('Close').setEmoji('✖️').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

// ------------------------------------------------------------------
// Sub-Dashboard Generators
// ------------------------------------------------------------------

export async function generateSuggestionsDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const suggestions = await prisma.suggestion.findMany({ where: { guildId } });
  const pendingCount = suggestions.filter(s => s.status === 'PENDING').length;
  const approvedCount = suggestions.filter(s => s.status === 'APPROVED').length;
  const implementedCount = suggestions.filter(s => s.status === 'IMPLEMENTED').length;

  const embed = new EmbedBuilder()
    .setTitle('💡 Suggestions Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.suggestionsEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Anonymous', value: config.suggestionAnonymousEnabled ? '🟢 YES' : '🔴 NO', inline: true },
      { name: 'Total Suggestions', value: `${suggestions.length}`, inline: true },
      { name: 'Pending', value: `${pendingCount}`, inline: true },
      { name: 'Approved', value: `${approvedCount}`, inline: true },
      { name: 'Implemented', value: `${implementedCount}`, inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_suggestions_toggle').setLabel(config.suggestionsEnabled ? 'Disable' : 'Enable').setStyle(config.suggestionsEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_suggestions_anon').setLabel('Toggle Anonymous').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
}

export async function generateGiveawaysDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const giveaways = await prisma.giveaway.findMany({ where: { guildId } });
  const activeCount = giveaways.filter(g => g.status === 'ACTIVE').length;
  const scheduledCount = giveaways.filter(g => g.status === 'SCHEDULED').length;

  const embed = new EmbedBuilder()
    .setTitle('🎉 Giveaways Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.giveawaysEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Total Giveaways', value: `${giveaways.length}`, inline: true },
      { name: 'Active', value: `${activeCount}`, inline: true },
      { name: 'Scheduled', value: `${scheduledCount}`, inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_giveaways_toggle').setLabel(config.giveawaysEnabled ? 'Disable' : 'Enable').setStyle(config.giveawaysEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
}

export async function generateReactionRolesDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  const panels = await prisma.reactionRolePanel.findMany({ where: { guildId }, include: { roles: true } });
  
  const publishedPanels = panels.filter(p => p.messageId).length;
  const totalRoles = panels.reduce((sum, p) => sum + p.roles.length, 0);

  const embed = new EmbedBuilder()
    .setTitle('🔘 Reaction Roles Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.reactionRolesEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Total Panels', value: `${panels.length}`, inline: true },
      { name: 'Published Panels', value: `${publishedPanels}`, inline: true },
      { name: 'Configured Roles', value: `${totalRoles}`, inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_reactionroles_toggle').setLabel(config.reactionRolesEnabled ? 'Disable' : 'Enable').setStyle(config.reactionRolesEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1] };
}

export async function generateWelcomeDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({
    where: { guildId },
    update: {},
    create: { guildId }
  });
  
  const embed = new EmbedBuilder()
    .setTitle('👋 Welcome Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.welcomeEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Channel', value: config.welcomeChannel ? `<#${config.welcomeChannel}>` : 'None', inline: true },
      { name: 'Button', value: config.welcomeButtonEnabled ? 'Enabled' : 'Disabled', inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_welcome_toggle').setLabel(config.welcomeEnabled ? 'Disable' : 'Enable').setStyle(config.welcomeEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_welcome_edit_msg').setLabel('Edit Message').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_welcome_edit_btn').setLabel('Edit Button').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_welcome_test').setLabel('Test Welcome').setStyle(ButtonStyle.Primary)
  );
  
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('config_welcome_channel')
      .setPlaceholder('Select Welcome Channel')
      .setChannelTypes(ChannelType.GuildText)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_welcome_reset').setLabel('Reset Settings').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateTicketDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.ticketEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Category', value: config.ticketCategoryId ? `<#${config.ticketCategoryId}>` : 'None', inline: true },
      { name: 'Staff Role', value: config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : 'None', inline: true },
      { name: 'Log Channel', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : 'None', inline: true },
      { name: 'Panel Channel', value: config.ticketPanelChannelId ? `<#${config.ticketPanelChannelId}>` : 'None', inline: true },
      { name: 'Max / Cooldown', value: `${config.ticketMaxPerUser} / ${config.ticketCooldownSeconds}s`, inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_ticket_toggle').setLabel(config.ticketEnabled ? 'Disable' : 'Enable').setStyle(config.ticketEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_ticket_limits').setLabel('Edit Limits').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_ticket_send_panel').setLabel('Send Panel').setStyle(ButtonStyle.Primary)
  );
  
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_ticket_category').setPlaceholder('Select Ticket Category').setChannelTypes(ChannelType.GuildCategory)
  );
  
  const row3 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_ticket_panel').setPlaceholder('Select Panel Channel').setChannelTypes(ChannelType.GuildText)
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_ticket_reset').setLabel('Reset Settings').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function generateCountingDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('🔢 Counting Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.countingEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Channel', value: config.countingChannelId ? `<#${config.countingChannelId}>` : 'None', inline: true },
      { name: 'Current / Highest', value: `${config.countingCurrent} / ${config.countingHighest}`, inline: true },
      { name: 'Total Counts', value: `${config.countingTotalValid}`, inline: true },
      { name: 'Streak', value: `${config.countingStreak}`, inline: true },
      { name: 'Last Counter', value: config.countingLastUserId ? `<@${config.countingLastUserId}>` : 'None', inline: true }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_counting_toggle').setLabel(config.countingEnabled ? 'Disable' : 'Enable').setStyle(config.countingEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_counting_reset_prompt').setLabel('Reset Counter').setStyle(ButtonStyle.Danger)
  );
  
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_counting_channel').setPlaceholder('Select Counting Channel').setChannelTypes(ChannelType.GuildText)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateChatBanDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('🔇 ChatBan Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Status', value: config.chatBanEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'ChatBan Role', value: config.chatBanRoleId ? `<@&${config.chatBanRoleId}>` : 'None', inline: true },
      { name: 'Category', value: config.chatBanCategoryId ? `<#${config.chatBanCategoryId}>` : 'None', inline: true },
      { name: 'Moderator Role', value: config.chatBanModeratorRoleId ? `<@&${config.chatBanModeratorRoleId}>` : 'None', inline: true },
      { name: 'Log Channel', value: config.chatBanLogChannelId ? `<#${config.chatBanLogChannelId}>` : 'None', inline: true },
      { name: 'Toggles', value: `DMs: ${config.chatBanDmEnabled ? 'On' : 'Off'} | Iso: ${config.chatBanIsolationEnabled ? 'On' : 'Off'} | Heal: ${config.chatBanSelfHealingEnabled ? 'On' : 'Off'}`, inline: false }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_chatban_toggle').setLabel(config.chatBanEnabled ? 'Disable' : 'Enable').setStyle(config.chatBanEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_chatban_toggledm').setLabel('Toggle DMs').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_chatban_toggleiso').setLabel('Toggle Iso').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('config_chatban_toggleheal').setLabel('Toggle Heal').setStyle(ButtonStyle.Secondary)
  );
  
  const row2 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId('config_chatban_role').setPlaceholder('Select ChatBan Role')
  );

  const row3 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_chatban_category').setPlaceholder('Select Isolation Category').setChannelTypes(ChannelType.GuildCategory)
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function generateLoggingDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('📋 Logging Configuration')
    .setColor('#2b2d31')
    .addFields(
      { name: 'Main Log Channel', value: config.mainLogChannelId ? `<#${config.mainLogChannelId}>` : 'None', inline: true },
      { name: 'Mod Log Channel', value: config.modLogChannelId ? `<#${config.modLogChannelId}>` : 'None', inline: true },
      { name: 'Ticket Log Channel', value: config.ticketLogChannelId ? `<#${config.ticketLogChannelId}>` : 'None', inline: true },
      { name: 'Transcript Channel', value: config.ticketTranscriptChannelId ? `<#${config.ticketTranscriptChannelId}>` : 'None', inline: true },
      { name: 'ChatBan Log Channel', value: config.chatBanLogChannelId ? `<#${config.chatBanLogChannelId}>` : 'None', inline: true }
    );

  const row1 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_log_main').setPlaceholder('Select Main Log Channel').setChannelTypes(ChannelType.GuildText)
  );
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_log_mod').setPlaceholder('Select Moderation Log Channel').setChannelTypes(ChannelType.GuildText)
  );
  const row3 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_log_ticket').setPlaceholder('Select Ticket Log Channel').setChannelTypes(ChannelType.GuildText)
  );
  const row4 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_log_transcript').setPlaceholder('Select Transcript Channel').setChannelTypes(ChannelType.GuildText)
  );
  const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4, row5] };
}

export async function generatePermissionsDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  
  const embed = new EmbedBuilder()
    .setTitle('🔐 Permissions Configuration')
    .setColor('#2b2d31')
    .setDescription('Select the roles that are authorized to manage these systems. Note: The bot will never modify roles equal or higher than its own highest role.')
    .addFields(
      { name: 'Ticket Staff Role', value: config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : 'None', inline: true },
      { name: 'ChatBan Mod Role', value: config.chatBanModeratorRoleId ? `<@&${config.chatBanModeratorRoleId}>` : 'None', inline: true }
    );

  const row1 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId('config_perm_ticket').setPlaceholder('Select Ticket Staff Role')
  );
  const row2 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder().setCustomId('config_perm_chatban').setPlaceholder('Select ChatBan Moderator Role')
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function generateAutoModDashboard(guildId: string) {
  const config = await prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } });
  const rules = await prisma.autoModRule.findMany({ where: { guildId, enabled: true } });
  
  const embed = new EmbedBuilder()
    .setTitle('🛡️ AutoMod Configuration')
    .setColor('#2b2d31')
    .setDescription('Configure full rules via `/automod rule configure`.\nCustom words via `/automod words`.')
    .addFields(
      { name: 'Status', value: config.autoModEnabled ? '🟢 ENABLED' : '🔴 DISABLED', inline: true },
      { name: 'Log Channel', value: config.autoModLogChannelId ? `<#${config.autoModLogChannelId}>` : 'None', inline: true },
      { name: 'Exempt Channels', value: config.autoModExemptChannels ? `${config.autoModExemptChannels.split(',').length}` : '0', inline: true },
      { name: 'Exempt Roles', value: config.autoModExemptRoles ? `${config.autoModExemptRoles.split(',').length}` : '0', inline: true },
      { name: 'Active Rules', value: rules.length > 0 ? rules.map(r => `\`${r.ruleType}\``).join(', ') : 'None', inline: false }
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_automod_toggle').setLabel(config.autoModEnabled ? 'Disable' : 'Enable').setStyle(config.autoModEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('config_automod_log').setPlaceholder('Select Log Channel').setChannelTypes(ChannelType.GuildText)
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function generateStatusDashboard(guild: Guild) {
  const config = await prisma.guildConfig.upsert({ where: { guildId: guild.id }, update: {}, create: { guildId: guild.id } });
  
  const uptime = Math.floor(process.uptime());
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);

  const embed = new EmbedBuilder()
    .setTitle('🛠️ System Status')
    .setColor('#2b2d31')
    .addFields(
      { name: 'PATIO BOT', value: '🟢 Online', inline: true },
      { name: 'Database', value: '🟢 Connected', inline: true },
      { name: 'Discord API', value: `🟢 Connected (${guild.client.ws.ping}ms)`, inline: true },
      { name: 'Uptime', value: `${hours}h ${minutes}m`, inline: true },
      { name: 'Node.js', value: process.version, inline: true },
      { name: 'Guild Name', value: guild.name, inline: true },
      { name: 'Systems', value: `Welcome: ${config.welcomeEnabled ? '🟢' : '🔴'} | Tickets: ${config.ticketEnabled ? '🟢' : '🔴'}\nCounting: ${config.countingEnabled ? '🟢' : '🔴'} | ChatBan: ${config.chatBanEnabled ? '🟢' : '🔴'}`, inline: false }
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('config_back_main').setLabel('Back to Menu').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// ------------------------------------------------------------------
// Interaction Handler
// ------------------------------------------------------------------
export async function handleConfigInteractions(interaction: Interaction) {
  if (!interaction.guildId) return false;
  if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith('config_')) return false;

  const memberPerms = interaction.memberPermissions;
  if (!memberPerms || !memberPerms.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: '❌ You must be an administrator to use the configuration dashboard.', ephemeral: true });
    return true;
  }

  try {
    const customId = interaction.customId;
    const guildId = interaction.guildId;

    // Acknowledge interaction quickly to avoid timeouts
    if (interaction.isMessageComponent()) {
      if (customId === 'config_welcome_test') {
        await interaction.deferReply({ ephemeral: true });
      } else if (customId !== 'config_welcome_edit_msg' && 
                 customId !== 'config_welcome_edit_btn' && 
                 customId !== 'config_ticket_limits') {
        await interaction.deferUpdate();
      }
    } else if (interaction.isModalSubmit()) {
      await interaction.deferReply({ ephemeral: true });
    }


    // Navigation
    if (customId === 'config_action_close') {
      if (interaction.isMessageComponent()) await interaction.message.delete().catch(() => {});
      return true;
    }
    
    if (customId === 'config_back_main' || customId === 'config_action_refresh') {
      const guild = interaction.guild ?? await interaction.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        if (interaction.isRepliable()) await interaction.followUp({ content: 'Could not fetch server information.', ephemeral: true });
        return true;
      }
      const { embeds, components } = await generateMainDashboard(guild);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }

    if (customId === 'config_menu_welcome') {
      const { embeds, components } = await generateWelcomeDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_tickets') {
      const { embeds, components } = await generateTicketDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_counting') {
      const { embeds, components } = await generateCountingDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_chatban') {
      const { embeds, components } = await generateChatBanDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_automod') {
      const { embeds, components } = await generateAutoModDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_reactionroles') {
      const { embeds, components } = await generateReactionRolesDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_giveaways') {
      const { embeds, components } = await generateGiveawaysDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_logging') {
      const { embeds, components } = await generateLoggingDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_permissions') {
      const { embeds, components } = await generatePermissionsDashboard(guildId);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }
    if (customId === 'config_menu_status') {
      const guild = interaction.guild ?? await interaction.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        if (interaction.isRepliable()) await interaction.followUp({ content: 'Could not fetch server information.', ephemeral: true });
        return true;
      }
      const { embeds, components } = await generateStatusDashboard(guild);
      if (interaction.isMessageComponent()) await interaction.editReply({ embeds, components });
      return true;
    }

    // Reset Prompts
    if (customId === 'config_counting_reset_prompt' || customId === 'config_welcome_reset' || customId === 'config_ticket_reset') {
      const typeMap: Record<string, string> = {
        'config_counting_reset_prompt': 'counting',
        'config_welcome_reset': 'welcome',
        'config_ticket_reset': 'ticket'
      };
      const sysType = typeMap[customId];
      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`config_confirm_${sysType}_reset`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`config_menu_${sysType}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      );
      if (interaction.isMessageComponent()) await interaction.editReply({ content: `⚠️ Are you sure you want to reset the **${sysType}** configuration?`, embeds: [], components: [confirmRow] });
      return true;
    }

    // Confirm Resets
    if (customId.startsWith('config_confirm_')) {
      if (customId.includes('_counting_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { countingCurrent: 1, countingHighest: 0, countingTotalValid: 0, countingStreak: 0, countingLastUserId: null, countingLastCountAt: null } });
        logger.info(`ADMIN CONFIG - User: ${interaction.user.id} reset Counting`);
        const d = await generateCountingDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply({ content: '', ...d });
        return true;
      }
      if (customId.includes('_welcome_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { welcomeEnabled: false, welcomeChannel: null, welcomeTitle: null, welcomeDescription: null, welcomeMessage: null, welcomeColor: null, welcomeImageUrl: null, welcomeThumbnailUrl: null, welcomeFooterText: null, welcomeShowTimestamp: true, welcomeButtonEnabled: true, welcomeButtonLabel: null, welcomeButtonStyle: null } });
        logger.info(`ADMIN CONFIG - User: ${interaction.user.id} reset Welcome`);
        const d = await generateWelcomeDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply({ content: '', ...d });
        return true;
      }
      if (customId.includes('_ticket_')) {
        await prisma.guildConfig.update({ where: { guildId }, data: { ticketEnabled: false, ticketCategoryId: null, ticketStaffRoleId: null, ticketLogChannelId: null, ticketTranscriptChannelId: null, ticketPanelChannelId: null, ticketPanelMessageId: null, ticketMaxPerUser: 1, ticketCooldownSeconds: 300, ticketNameFormat: 'ticket-{username}' } });
        logger.info(`ADMIN CONFIG - User: ${interaction.user.id} reset Ticket`);
        const d = await generateTicketDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply({ content: '', ...d });
        return true;
      }
    }

    // Toggles
    if (customId.endsWith('_toggle')) {
      const config = await prisma.guildConfig.findUnique({ where: { guildId } });
      if (!config) return true;
      
      let updateData = {};
      if (customId === 'config_welcome_toggle') {
        if (!config.welcomeEnabled && !config.welcomeChannel) {
          if (interaction.isMessageComponent()) await interaction.followUp({ content: '❌ Cannot enable Welcome system: No channel configured.', ephemeral: true });
          return true;
        }
        updateData = { welcomeEnabled: !config.welcomeEnabled };
      }
      if (customId === 'config_ticket_toggle') {
        if (!config.ticketEnabled && !config.ticketCategoryId) {
          if (interaction.isMessageComponent()) await interaction.followUp({ content: '❌ Cannot enable Ticket system: No category configured.', ephemeral: true });
          return true;
        }
        updateData = { ticketEnabled: !config.ticketEnabled };
      }
      if (customId === 'config_counting_toggle') {
        if (!config.countingEnabled && !config.countingChannelId) {
          if (interaction.isMessageComponent()) await interaction.followUp({ content: '❌ Cannot enable Counting system: No channel configured.', ephemeral: true });
          return true;
        }
        updateData = { countingEnabled: !config.countingEnabled };
      }
      if (customId === 'config_chatban_toggle') {
        if (!config.chatBanEnabled && !config.chatBanRoleId) {
          if (interaction.isMessageComponent()) await interaction.followUp({ content: '❌ Cannot enable ChatBan system: No ChatBan role configured.', ephemeral: true });
          return true;
        }
        updateData = { chatBanEnabled: !config.chatBanEnabled };
      }
      if (customId === 'config_automod_toggle') {
        updateData = { autoModEnabled: !config.autoModEnabled };
      }
      if (customId === 'config_reactionroles_toggle') {
        updateData = { reactionRolesEnabled: !config.reactionRolesEnabled };
      }
      if (customId === 'config_giveaways_toggle') {
        updateData = { giveawaysEnabled: !config.giveawaysEnabled };
      }
      if (customId === 'config_suggestions_toggle') {
        updateData = { suggestionsEnabled: !config.suggestionsEnabled };
      }

      if (customId === 'config_chatban_toggledm') {
        updateData = { chatBanDmEnabled: !config.chatBanDmEnabled };
      } else if (customId === 'config_chatban_toggleiso') {
        updateData = { chatBanIsolationEnabled: !config.chatBanIsolationEnabled };
      } else if (customId === 'config_chatban_toggleheal') {
        updateData = { chatBanSelfHealingEnabled: !config.chatBanSelfHealingEnabled };
      } else if (customId === 'config_suggestions_anon') {
        updateData = { suggestionAnonymousEnabled: !config.suggestionAnonymousEnabled };
      }


      if (Object.keys(updateData).length > 0) {
        await prisma.guildConfig.update({ where: { guildId }, data: updateData });
        logger.info(`ADMIN CONFIG - User: ${interaction.user.id} toggled ${customId}`);
      }
      
      // Refresh respective dashboard
      if (customId.includes('welcome')) {
        const d = await generateWelcomeDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('ticket')) {
        const d = await generateTicketDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('counting')) {
        const d = await generateCountingDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('chatban')) {
        const d = await generateChatBanDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('automod')) {
        const d = await generateAutoModDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('reactionroles')) {
        const d = await generateReactionRolesDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('giveaways')) {
        const d = await generateGiveawaysDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      } else if (customId.includes('suggestions')) {
        const d = await generateSuggestionsDashboard(guildId);
        if (interaction.isMessageComponent()) await interaction.editReply(d);
      }
      return true;
    }

    // Role / Channel Selects
    if (interaction.isAnySelectMenu()) {
      const val = interaction.values[0];
      let updateData: any = null;
      let refreshFunc = null;

      if (customId === 'config_welcome_channel') { updateData = { welcomeChannel: val }; refreshFunc = generateWelcomeDashboard; }
      else if (customId === 'config_ticket_category') { updateData = { ticketCategoryId: val }; refreshFunc = generateTicketDashboard; }
      else if (customId === 'config_ticket_panel') { updateData = { ticketPanelChannelId: val }; refreshFunc = generateTicketDashboard; }
      else if (customId === 'config_counting_channel') { updateData = { countingChannelId: val }; refreshFunc = generateCountingDashboard; }
      else if (customId === 'config_chatban_role') { updateData = { chatBanRoleId: val }; refreshFunc = generateChatBanDashboard; }
      else if (customId === 'config_chatban_category') { updateData = { chatBanCategoryId: val }; refreshFunc = generateChatBanDashboard; }
      else if (customId === 'config_log_main') { updateData = { mainLogChannelId: val }; refreshFunc = generateLoggingDashboard; }
      else if (customId === 'config_log_mod') { updateData = { modLogChannelId: val }; refreshFunc = generateLoggingDashboard; }
      else if (customId === 'config_log_ticket') { updateData = { ticketLogChannelId: val }; refreshFunc = generateLoggingDashboard; }
      else if (customId === 'config_log_transcript') { updateData = { ticketTranscriptChannelId: val }; refreshFunc = generateLoggingDashboard; }
      else if (customId === 'config_perm_ticket') { updateData = { ticketStaffRoleId: val }; refreshFunc = generatePermissionsDashboard; }
      else if (customId === 'config_perm_chatban') { updateData = { chatBanModeratorRoleId: val }; refreshFunc = generatePermissionsDashboard; }
      else if (customId === 'config_automod_log') { updateData = { autoModLogChannelId: val }; refreshFunc = generateAutoModDashboard; }

      if (updateData && refreshFunc) {
        await prisma.guildConfig.update({ where: { guildId }, data: updateData });
        logger.info(`ADMIN CONFIG - User: ${interaction.user.id} updated ${customId} to ${val}`);
        const d = await refreshFunc(guildId);
        await interaction.editReply(d);
        return true;
      }
    }

    // Welcome specific actions
    if (interaction.isButton()) {
      if (customId === 'config_welcome_edit_msg') {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        
        const modal = new ModalBuilder()
          .setCustomId('welcome_text_modal')
          .setTitle('Edit Welcome Message');

        const msgInput = new TextInputBuilder().setCustomId('msg').setLabel('Content (Outside Embed)').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config?.welcomeMessage || '');
        const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Embed Title').setStyle(TextInputStyle.Short).setRequired(false).setValue(config?.welcomeTitle || '');
        const descInput = new TextInputBuilder().setCustomId('desc').setLabel('Embed Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(config?.welcomeDescription || '');
        const colorInput = new TextInputBuilder().setCustomId('color').setLabel('Embed Color (Hex)').setStyle(TextInputStyle.Short).setRequired(false).setValue(config?.welcomeColor || '');
        const imgInput = new TextInputBuilder().setCustomId('img').setLabel('Image URL').setStyle(TextInputStyle.Short).setRequired(false).setValue(config?.welcomeImageUrl || '');

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(msgInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(imgInput)
        );

        await interaction.showModal(modal);
        return true;
      }
      
      if (customId === 'config_welcome_edit_btn') {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        
        const modal = new ModalBuilder()
          .setCustomId('welcome_btn_modal')
          .setTitle('Edit Welcome Button');

        const enabledInput = new TextInputBuilder().setCustomId('enabled').setLabel('Enable Button? (true/false)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(config?.welcomeButtonEnabled ?? true));
        const labelInput = new TextInputBuilder().setCustomId('label').setLabel('Button Label').setStyle(TextInputStyle.Short).setRequired(false).setValue(config?.welcomeButtonLabel || '');
        const styleInput = new TextInputBuilder().setCustomId('style').setLabel('Style (1:Primary, 2:Secondary, etc)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(config?.welcomeButtonStyle || 1));

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(enabledInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(labelInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(styleInput)
        );

        await interaction.showModal(modal);
        return true;
      }

      if (customId === 'config_welcome_test') {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        
        if (!config || !config.welcomeChannel) {
          await interaction.editReply({ content: 'Welcome channel is not set up!' });
          return true;
        }
        
        const memberRecord = await prisma.memberRecord.findUnique({
          where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } }
        });
        const memberNumber = memberRecord?.memberNumber || 999;
        
        const { buildWelcomeMessage } = await import('./welcomeUtils');
        const guild = interaction.guild ?? await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          await interaction.editReply({ content: 'Could not fetch server information.' });
          return true;
        }
        const messagePayload = buildWelcomeMessage(interaction.member as any, guild, config, memberNumber);
        
        await interaction.editReply({ content: '**[PREVIEW]**\n' + (messagePayload.content || ''), embeds: messagePayload.embeds, components: messagePayload.components });
        return true;
      }
      
      if (customId === 'config_ticket_limits') {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        const modal = new ModalBuilder().setCustomId('ticket_limits_modal').setTitle('Ticket Limits');
        const maxInput = new TextInputBuilder().setCustomId('max').setLabel('Max Tickets Per User').setStyle(TextInputStyle.Short).setValue(String(config?.ticketMaxPerUser || 1));
        const cdInput = new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (Seconds)').setStyle(TextInputStyle.Short).setValue(String(config?.ticketCooldownSeconds || 300));
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(maxInput), new ActionRowBuilder<TextInputBuilder>().addComponents(cdInput));
        await interaction.showModal(modal);
        return true;
      }
      
      if (customId === 'config_ticket_send_panel') {
        const config = await prisma.guildConfig.findUnique({ where: { guildId } });
        if (!config || !config.ticketPanelChannelId) {
          await interaction.followUp({ content: '❌ Ticket panel channel is not configured.', ephemeral: true });
          return true;
        }
        const guild = interaction.guild ?? await interaction.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          await interaction.followUp({ content: 'Could not fetch server information.', ephemeral: true });
          return true;
        }
        const panelChannel = guild.channels.cache.get(config.ticketPanelChannelId) ?? await guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
        if (panelChannel && panelChannel.isTextBased()) {
          const { createTicketPanel } = await import('./ticketService');
          await createTicketPanel(panelChannel as any, guildId);
          await interaction.followUp({ content: '✅ Ticket panel sent to <#' + config.ticketPanelChannelId + '>.', ephemeral: true });
        } else {
          await interaction.followUp({ content: '❌ Invalid ticket panel channel.', ephemeral: true });
        }
        return true;
      }
    }

    return true; // We handled it
  } catch (error) {
    logger.error('Error handling config interaction', error);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ An error occurred processing this configuration change.', ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ An error occurred processing this configuration change.', ephemeral: true }).catch(() => {});
      }
    }
    return true;
  }
}
