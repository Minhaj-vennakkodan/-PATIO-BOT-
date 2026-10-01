import { Events, Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionFlagsBits } from 'discord.js';
import { BotEvent } from '../types';
import { commands } from '../handlers/commandHandler';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

const interactionCreateEvent: BotEvent = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) {
          logger.warn(`No command matching ${interaction.commandName} was found.`);
          return;
        }
        await command.execute(interaction);
      } else {
        // Handle components/modals
        const { handleConfigInteractions } = await import('../utils/configDashboard');
        const handledByConfig = await handleConfigInteractions(interaction);
        if (!handledByConfig) {
          const { handleReactionRoleInteractions } = await import('../utils/reactionRoleInteractionHandler');
          const handledByRR = await handleReactionRoleInteractions(interaction);
          if (!handledByRR) {
            const { handleGiveawayInteractions } = await import('../utils/giveawayInteractionHandler');
            const handledByGiveaway = await handleGiveawayInteractions(interaction);
            if (!handledByGiveaway) {
              const { handleSuggestionInteractions } = await import('../utils/suggestionInteractionHandler');
              const handledBySuggestion = await handleSuggestionInteractions(interaction);
              if (!handledBySuggestion) {
                await handleWelcomeInteractions(interaction);
                await handleTicketInteractions(interaction);
                await handleCountingInteractions(interaction);
                await handleChatBanInteractions(interaction);
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error executing interaction`, error);
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while executing this interaction!', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while executing this interaction!', ephemeral: true });
        }
      }
    }
  },
};

// Extracted handler for welcome setup components
async function handleWelcomeInteractions(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isChannelSelectMenu() && interaction.customId === 'welcome_channel_select') {
    const channelId = interaction.values[0];
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { welcomeChannel: channelId } });
    await interaction.reply({ content: `Welcome channel set to <#${channelId}>.`, ephemeral: true });
    logger.info(`Guild ${interaction.guildId} updated welcome channel to ${channelId}`);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'welcome_dummy_btn') {
      await interaction.reply({ content: 'Welcome to the server!', ephemeral: true });
      return;
    }

    if (interaction.customId === 'welcome_enable') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      const newState = !config?.welcomeEnabled;
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { welcomeEnabled: newState } });
      await interaction.reply({ content: `Welcome system is now ${newState ? 'enabled' : 'disabled'}.`, ephemeral: true });
      logger.info(`Guild ${interaction.guildId} toggled welcome enabled to ${newState}`);
    }
    
    if (interaction.customId === 'welcome_edit_text') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      
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
    }
    
    if (interaction.customId === 'welcome_edit_btn') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      
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
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'welcome_text_modal') {
      const msg = interaction.fields.getTextInputValue('msg');
      const title = interaction.fields.getTextInputValue('title');
      const desc = interaction.fields.getTextInputValue('desc');
      const color = interaction.fields.getTextInputValue('color');
      const img = interaction.fields.getTextInputValue('img');

      await prisma.guildConfig.update({
        where: { guildId: interaction.guildId },
        data: {
          welcomeMessage: msg || null,
          welcomeTitle: title || null,
          welcomeDescription: desc || null,
          welcomeColor: color || null,
          welcomeImageUrl: img || null,
        }
      });
      
      await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
      logger.info(`Guild ${interaction.guildId} updated welcome text/embed configuration`);
    }

    if (interaction.customId === 'welcome_btn_modal') {
      const enabled = interaction.fields.getTextInputValue('enabled').toLowerCase() === 'true';
      const label = interaction.fields.getTextInputValue('label');
      const styleStr = interaction.fields.getTextInputValue('style');
      let style = parseInt(styleStr);
      if (isNaN(style) || style < 1 || style > 5) style = 1;

      await prisma.guildConfig.update({
        where: { guildId: interaction.guildId },
        data: {
          welcomeButtonEnabled: enabled,
          welcomeButtonLabel: label || null,
          welcomeButtonStyle: style,
        }
      });
      
      await interaction.reply({ content: 'Welcome button updated.', ephemeral: true });
      logger.info(`Guild ${interaction.guildId} updated welcome button configuration`);
    }
  }
}

// Extracted handler for ticket interactions
async function handleTicketInteractions(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') {
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketCategoryId: interaction.values[0] } });
      await interaction.reply({ content: `Ticket category updated.`, ephemeral: true });
    }
    if (interaction.customId === 'ticket_panel_channel_select') {
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketPanelChannelId: interaction.values[0] } });
      await interaction.reply({ content: `Ticket panel channel updated.`, ephemeral: true });
    }
    // Also we need to ensure the transcript and log channels can be set... For brevity, we let admins set those in config, or we assume panel=transcript=log for now unless explicitly modeled.
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === 'ticket_staff_role_select') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketStaffRoleId: interaction.values[0] } });
    await interaction.reply({ content: `Ticket staff role updated.`, ephemeral: true });
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'ticket_toggle_enable') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      const newState = !config?.ticketEnabled;
      await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketEnabled: newState } });
      await interaction.reply({ content: `Ticket system is now ${newState ? 'enabled' : 'disabled'}.`, ephemeral: true });
    }

    if (interaction.customId === 'ticket_edit_limits') {
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      const modal = new ModalBuilder().setCustomId('ticket_limits_modal').setTitle('Ticket Limits');
      const maxInput = new TextInputBuilder().setCustomId('max').setLabel('Max Tickets Per User').setStyle(TextInputStyle.Short).setValue(String(config?.ticketMaxPerUser || 1));
      const cdInput = new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (Seconds)').setStyle(TextInputStyle.Short).setValue(String(config?.ticketCooldownSeconds || 300));
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(maxInput), new ActionRowBuilder<TextInputBuilder>().addComponents(cdInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'ticket_claim') {
      const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId! } } });
      if (!record || record.status !== 'open') return interaction.reply({ content: 'Invalid ticket or already closed.', ephemeral: true });
      if (record.claimedById) return interaction.reply({ content: `Ticket already claimed by <@${record.claimedById}>.`, ephemeral: true });

      await prisma.ticketRecord.update({ where: { id: record.id }, data: { claimedById: interaction.user.id } });
      await interaction.reply({ content: `Ticket claimed by <@${interaction.user.id}>.` });
    }

    if (interaction.customId === 'ticket_close') {
      const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId! } } });
      if (!record || record.status === 'closed') return interaction.reply({ content: 'Ticket already closed.', ephemeral: true });

      // Generate transcript inline (requires importing generateAndSendTranscript, done separately)
      // Remove permissions for creator
      const channel = interaction.channel as any;
      await channel.permissionOverwrites.edit(record.creatorId, { ViewChannel: false });
      
      await prisma.ticketRecord.update({ where: { id: record.id }, data: { status: 'closed', closedAt: new Date() } });
      
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('ticket_reopen').setLabel('Reopen').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ content: 'Ticket closed by staff.', components: [row] });
    }

    if (interaction.customId === 'ticket_reopen') {
      const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId! } } });
      if (!record) return;

      const channel = interaction.channel as any;
      await channel.permissionOverwrites.edit(record.creatorId, { ViewChannel: true });
      await prisma.ticketRecord.update({ where: { id: record.id }, data: { status: 'open', closedAt: null } });
      await interaction.reply({ content: 'Ticket reopened.' });
    }

    if (interaction.customId === 'ticket_delete') {
      const channel = interaction.channel as any;
      await interaction.reply('Deleting ticket in 5 seconds...');
      setTimeout(() => channel.delete().catch(() => {}), 5000);
      await prisma.ticketRecord.update({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: channel.id } }, data: { status: 'deleted', deletedAt: new Date() } });
    }

    if (interaction.customId === 'ticket_rename') {
      const modal = new ModalBuilder().setCustomId('ticket_rename_modal').setTitle('Rename Ticket');
      const nameInput = new TextInputBuilder().setCustomId('new_name').setLabel('New Channel Name').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));
      await interaction.showModal(modal);
    }

    if (interaction.customId === 'ticket_adduser' || interaction.customId === 'ticket_removeuser') {
      const action = interaction.customId === 'ticket_adduser' ? 'add' : 'remove';
      const { UserSelectMenuBuilder } = await import('discord.js');
      const select = new UserSelectMenuBuilder().setCustomId(`ticket_${action}user_select`).setPlaceholder(`Select user to ${action}`);
      const row = new ActionRowBuilder<any>().addComponents(select);
      await interaction.reply({ content: `Select a user to ${action}:`, components: [row], ephemeral: true });
    }
  }

  if (interaction.isUserSelectMenu()) {
    if (interaction.customId === 'ticket_adduser_select' || interaction.customId === 'ticket_removeuser_select') {
      const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId! } } });
      if (!record || record.status !== 'open') return interaction.reply({ content: 'Invalid ticket.', ephemeral: true });
      
      const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
      const member = interaction.member as any;
      const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) || (config?.ticketStaffRoleId && member.roles.cache.has(config.ticketStaffRoleId));
      if (!isStaff) return interaction.reply({ content: 'You do not have permission to manage users in this ticket.', ephemeral: true });

      const targetId = interaction.values[0];
      if (targetId === record.creatorId) return interaction.reply({ content: 'Cannot modify permissions for the ticket creator.', ephemeral: true });
      
      const channel = interaction.channel as any;
      if (interaction.customId === 'ticket_adduser_select') {
        await channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        await interaction.reply({ content: `Added <@${targetId}> to the ticket.`, ephemeral: true });
      } else {
        await channel.permissionOverwrites.edit(targetId, { ViewChannel: false });
        await interaction.reply({ content: `Removed <@${targetId}> from the ticket.`, ephemeral: true });
      }
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket_rename_modal') {
    const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId! } } });
    if (!record || record.status !== 'open') return interaction.reply({ content: 'Invalid ticket.', ephemeral: true });

    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    const member = interaction.member as any;
    const isStaff = member.permissions.has(PermissionFlagsBits.Administrator) || (config?.ticketStaffRoleId && member.roles.cache.has(config.ticketStaffRoleId));
    if (!isStaff) return interaction.reply({ content: 'You do not have permission to rename this ticket.', ephemeral: true });

    const newName = interaction.fields.getTextInputValue('new_name').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32);
    if (!newName) return interaction.reply({ content: 'Invalid name.', ephemeral: true });
    
    const channel = interaction.channel as any;
    await channel.setName(newName);
    await interaction.reply({ content: `Ticket renamed to ${newName}.`, ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_create_select') {
    // Requires importing handleTicketCreation from ticketService.ts
    // For now, we will handle this in interactionCreate.ts or pass it through.
    const { handleTicketCreation } = await import('../utils/ticketService');
    await handleTicketCreation(interaction, interaction.values[0]);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket_limits_modal') {
    const max = parseInt(interaction.fields.getTextInputValue('max')) || 1;
    const cd = parseInt(interaction.fields.getTextInputValue('cooldown')) || 300;
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { ticketMaxPerUser: max, ticketCooldownSeconds: cd } });
    await interaction.reply({ content: 'Ticket limits updated.', ephemeral: true });
  }
}

// Extracted handler for counting interactions
async function handleCountingInteractions(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isChannelSelectMenu() && interaction.customId === 'counting_channel_select') {
    const channelId = interaction.values[0];
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { countingChannelId: channelId } });
    await interaction.reply({ content: `Counting channel set to <#${channelId}>.`, ephemeral: true });
    logger.info(`Guild ${interaction.guildId} updated counting channel to ${channelId}`);
  }
}

// Extracted handler for chatban interactions
async function handleChatBanInteractions(interaction: Interaction) {
  if (!interaction.guildId) return;

  if (interaction.isRoleSelectMenu() && interaction.customId === 'chatban_role_select') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { chatBanRoleId: interaction.values[0] } });
    await interaction.reply({ content: `ChatBan role updated.`, ephemeral: true });
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === 'chatban_category_select') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { chatBanCategoryId: interaction.values[0] } });
    await interaction.reply({ content: `ChatBan category updated.`, ephemeral: true });
  }

  if (interaction.isChannelSelectMenu() && interaction.customId === 'chatban_log_channel_select') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { chatBanLogChannelId: interaction.values[0] } });
    await interaction.reply({ content: `ChatBan log channel updated.`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'chatban_toggle_enable') {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    const newState = !config?.chatBanEnabled;
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { chatBanEnabled: newState } });
    await interaction.reply({ content: `ChatBan system is now ${newState ? 'enabled' : 'disabled'}.`, ephemeral: true });
  }
}

export default interactionCreateEvent;
