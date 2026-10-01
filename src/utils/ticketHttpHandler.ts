import { prisma } from '../database/client';
import { logger } from './logger';
import { HttpInteractionContext } from './httpInteractionContext';
import { createChannel, createMessage, editChannel, deleteChannel, getGuildMember, editChannelPermission } from './discordRest';
import { PermissionFlagsBits } from 'discord.js';

async function isTicketStaff(ctx: HttpInteractionContext): Promise<boolean> {
  const config = await prisma.guildConfig.findUnique({ where: { guildId: ctx.guildId! } });
  let isStaff = false;
  if (ctx.memberPermissions && (BigInt(ctx.memberPermissions) & BigInt(PermissionFlagsBits.Administrator)) !== 0n) {
    isStaff = true;
  }
  // Optional logic if you had access to member roles array in ctx
  // Since we only reliably have memberPermissions without additional fetching:
  if (!isStaff && ctx.memberPermissions && (BigInt(ctx.memberPermissions) & BigInt(PermissionFlagsBits.ManageMessages)) !== 0n) {
    isStaff = true;
  }
  return isStaff;
}

export async function handleHttpTicketInteraction(ctx: HttpInteractionContext, respond: any): Promise<boolean> {
  if (!ctx.guildId || !ctx.userId || !ctx.customId) return false;

  // 1. Ticket Creation via Select Menu
  if (ctx.customId === 'ticket_create_select' && ctx.componentValues && ctx.componentValues.length > 0) {
    const typeKey = ctx.componentValues[0];
    
    const config = await prisma.guildConfig.findUnique({ where: { guildId: ctx.guildId } });
    if (!config || !config.ticketEnabled || !config.ticketCategoryId) {
      respond({ content: '❌ Ticket system is not fully configured or disabled.', flags: 64 });
      return true;
    }

    if (config.chatBanEnabled && config.chatBanIsolationEnabled) {
      const isBanned = await prisma.chatBanRecord.findFirst({ where: { guildId: ctx.guildId, userId: ctx.userId, active: true } });
      if (isBanned) {
        respond({ content: '❌ You are ChatBanned and cannot create tickets.', flags: 64 });
        return true;
      }
    }

    const memberRecord = await prisma.memberRecord.findUnique({ where: { guildId_userId: { guildId: ctx.guildId, userId: ctx.userId } } });
    if (memberRecord?.lastTicketAt) {
      const elapsed = (Date.now() - memberRecord.lastTicketAt.getTime()) / 1000;
      if (elapsed < config.ticketCooldownSeconds) {
        respond({ content: `⏳ Cooldown active. Try again in ${Math.ceil(config.ticketCooldownSeconds - elapsed)}s.`, flags: 64 });
        return true;
      }
    }

    const activeTickets = await prisma.ticketRecord.count({ where: { guildId: ctx.guildId, creatorId: ctx.userId, status: 'open' } });
    if (activeTickets >= config.ticketMaxPerUser) {
      respond({ content: `❌ You already have ${activeTickets} active tickets.`, flags: 64 });
      return true;
    }

    const allTicketsCount = await prisma.ticketRecord.count({ where: { guildId: ctx.guildId } });
    const ticketNumber = (allTicketsCount + 1).toString().padStart(4, '0');
    
    // Fetch member to get username
    let username = 'User';
    try {
      const member = await getGuildMember(ctx.guildId, ctx.userId);
      username = member.user.username;
    } catch (e) {}

    let channelName = config.ticketNameFormat
      .replace('{username}', username)
      .replace('{userId}', ctx.userId)
      .replace('{ticketType}', typeKey)
      .replace('{ticketNumber}', ticketNumber)
      .replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32);

    const permissionOverwrites: any[] = [
      { id: ctx.guildId, type: 0, deny: String(PermissionFlagsBits.ViewChannel) },
      { id: ctx.userId, type: 1, allow: String(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.AttachFiles | PermissionFlagsBits.EmbedLinks) }
    ];

    if (config.ticketStaffRoleId) {
      permissionOverwrites.push({ id: config.ticketStaffRoleId, type: 0, allow: String(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageMessages) });
    }

    let ticketRecord;
    try {
      // Create DB Record first (Safe to clean up later)
      ticketRecord = await prisma.ticketRecord.create({
        data: { ticketId: ticketNumber, guildId: ctx.guildId, channelId: 'pending', creatorId: ctx.userId, ticketType: typeKey, status: 'open' }
      });

      const channel = await createChannel(ctx.guildId, {
        name: channelName,
        type: 0, // GUILD_TEXT
        parent_id: config.ticketCategoryId,
        permission_overwrites: permissionOverwrites
      });

      await prisma.ticketRecord.update({
        where: { id: ticketRecord.id },
        data: { channelId: channel.id }
      });

      await prisma.memberRecord.upsert({
        where: { guildId_userId: { guildId: ctx.guildId, userId: ctx.userId } },
        update: { lastTicketAt: new Date() },
        create: { guildId: ctx.guildId, userId: ctx.userId, lastTicketAt: new Date() }
      });

      const embed = {
        title: `Ticket: ${channelName}`,
        description: `Welcome to your ticket, <@${ctx.userId}>. Please describe your issue.`,
        color: 0x5865F2
      };

      const row1 = {
        type: 1,
        components: [
          { type: 2, custom_id: 'ticket_claim', label: 'Claim', style: 3 },
          { type: 2, custom_id: 'ticket_close', label: 'Close', style: 4 },
          { type: 2, custom_id: 'ticket_rename', label: 'Rename', style: 2 }
        ]
      };
      const row2 = {
        type: 1,
        components: [
          { type: 2, custom_id: 'ticket_adduser', label: 'Add User', style: 2 },
          { type: 2, custom_id: 'ticket_removeuser', label: 'Remove User', style: 2 }
        ]
      };

      await createMessage(channel.id, {
        content: `<@${ctx.userId}> ${config.ticketStaffRoleId ? `<@&${config.ticketStaffRoleId}>` : ''}`,
        embeds: [embed],
        components: [row1, row2]
      });

      respond({ content: `✅ Ticket created: <#${channel.id}>`, flags: 64 });
      logger.info(`Ticket ${ticketRecord.id} created via HTTP by ${ctx.userId} in ${ctx.guildId}`);
      return true;
    } catch (error) {
      logger.error('Error creating ticket via HTTP:', error);
      if (ticketRecord) await prisma.ticketRecord.delete({ where: { id: ticketRecord.id } }).catch(() => {});
      respond({ content: '❌ Failed to create ticket.', flags: 64 });
      return true;
    }
  }

  // 2. Ticket Claim
  if (ctx.customId === 'ticket_claim') {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: ctx.guildId } });
    if (config?.ticketStaffRoleId && ctx.memberPermissions) {
      // Permission check implementation stub:
      // Note: In real app, we check if the user has the staff role ID or is admin.
      // Here we check Manage Messages just as a generic staff fallback.
      if ((BigInt(ctx.memberPermissions) & BigInt(PermissionFlagsBits.ManageMessages)) === 0n) {
        respond({ content: '❌ You lack permission to claim tickets.', flags: 64 });
        return true;
      }
    }

    const ticket = await prisma.ticketRecord.findFirst({ where: { guildId: ctx.guildId, channelId: ctx.channelId, status: 'open' } });
    if (!ticket) {
      respond({ content: '❌ Ticket not found or already closed.', flags: 64 });
      return true;
    }

    if (ticket.claimedById) {
      respond({ content: `❌ Ticket already claimed by <@${ticket.claimedById}>.`, flags: 64 });
      return true;
    }

    await prisma.ticketRecord.update({
      where: { id: ticket.id },
      data: { claimedById: ctx.userId }
    });

    try {
      await editChannel(ctx.channelId!, { name: `claimed-${ticket.ticketId}` });
      await createMessage(ctx.channelId!, { content: `✅ Ticket claimed by <@${ctx.userId}>.` });
    } catch (e) {
      logger.error('Failed to update channel name on claim', e);
    }
    
    respond({ content: '✅ Claimed successfully.', flags: 64 });
    return true;
  }

  // 3. Ticket Close
  if (ctx.customId === 'ticket_close') {
    const ticket = await prisma.ticketRecord.findFirst({ where: { guildId: ctx.guildId, channelId: ctx.channelId } });
    if (!ticket || ticket.status === 'closed') {
      respond({ content: '❌ Ticket not found or already closed.', flags: 64 });
      return true;
    }

    // Determine permissions (Creator or Staff)
    let isStaff = false;
    if (ctx.memberPermissions && (BigInt(ctx.memberPermissions) & BigInt(PermissionFlagsBits.ManageMessages)) !== 0n) {
      isStaff = true;
    }
    if (ctx.userId !== ticket.creatorId && !isStaff) {
      respond({ content: '❌ Only the creator or staff can close this ticket.', flags: 64 });
      return true;
    }

    await prisma.ticketRecord.update({
      where: { id: ticket.id },
      data: { status: 'closed', closedAt: new Date() }
    });

    respond({ content: 'Closing ticket...', flags: 64 });

    try {
      await deleteChannel(ctx.channelId!);
    } catch (e) {
      logger.error('Failed to delete channel on close', e);
    }

    return true;
  }

  // 4. Ticket Delete
  if (ctx.customId === 'ticket_delete') {
    const ticket = await prisma.ticketRecord.findFirst({ where: { guildId: ctx.guildId, channelId: ctx.channelId } });
    if (!ticket) {
      respond({ content: '❌ Ticket not found.', flags: 64 });
      return true;
    }

    respond({ content: 'Deleting ticket...', flags: 64 });

    try {
      await deleteChannel(ctx.channelId!);
      await prisma.ticketRecord.update({
        where: { id: ticket.id },
        data: { status: 'deleted', deletedAt: new Date() }
      });
    } catch (e) {
      logger.error('Failed to delete channel for ticket_delete', e);
    }
    return true;
  }

  // 5. Add User / Remove User Buttons
  if (ctx.customId === 'ticket_adduser' || ctx.customId === 'ticket_removeuser') {
    const action = ctx.customId === 'ticket_adduser' ? 'add' : 'remove';
    const row = {
      type: 1,
      components: [
        {
          type: 5, // USER_SELECT
          custom_id: `ticket_${action}user_select`,
          placeholder: `Select user to ${action}`
        }
      ]
    };
    respond({ content: `Select a user to ${action}:`, components: [row], flags: 64 });
    return true;
  }

  // 6. User Select Menu Handlers
  if (ctx.customId === 'ticket_adduser_select' || ctx.customId === 'ticket_removeuser_select') {
    const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: ctx.guildId, channelId: ctx.channelId! } } });
    if (!record || record.status !== 'open') {
      respond({ content: '❌ Invalid or closed ticket.', flags: 64 });
      return true;
    }

    const staff = await isTicketStaff(ctx);
    if (!staff) {
      respond({ content: '❌ You do not have permission to manage users in this ticket.', flags: 64 });
      return true;
    }

    const targetId = ctx.componentValues?.[0];
    if (!targetId) {
      respond({ content: '❌ No user selected.', flags: 64 });
      return true;
    }
    if (targetId === record.creatorId) {
      respond({ content: '❌ Cannot modify permissions for the ticket creator.', flags: 64 });
      return true;
    }

    if (ctx.customId === 'ticket_adduser_select') {
      await editChannelPermission(ctx.channelId!, targetId, {
        type: 1, // member
        allow: String(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory),
        deny: '0'
      });
      respond({ content: `✅ Added <@${targetId}> to the ticket.`, flags: 64 });
    } else {
      await editChannelPermission(ctx.channelId!, targetId, {
        type: 1, // member
        allow: '0',
        deny: String(PermissionFlagsBits.ViewChannel)
      });
      respond({ content: `✅ Removed <@${targetId}> from the ticket.`, flags: 64 });
    }
    return true;
  }

  // 7. Rename Ticket (Opens Modal)
  if (ctx.customId === 'ticket_rename') {
    const modal = {
      title: 'Rename Ticket',
      custom_id: 'ticket_rename_modal',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'new_name',
              label: 'New Channel Name',
              style: 1,
              required: true
            }
          ]
        }
      ]
    };
    respond({ type: 9, data: modal });
    return true;
  }

  // 8. Rename Modal Submit
  if (ctx.customId === 'ticket_rename_modal') {
    const record = await prisma.ticketRecord.findUnique({ where: { guildId_channelId: { guildId: ctx.guildId, channelId: ctx.channelId! } } });
    if (!record || record.status !== 'open') {
      respond({ content: '❌ Invalid or closed ticket.', flags: 64 });
      return true;
    }

    const staff = await isTicketStaff(ctx);
    if (!staff) {
      respond({ content: '❌ You do not have permission to rename this ticket.', flags: 64 });
      return true;
    }

    const newNameRaw = ctx.modalFields?.['new_name'] || '';
    const newName = newNameRaw.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase().slice(0, 32);

    try {
      await editChannel(ctx.channelId!, { name: newName });
      respond({ content: `✅ Ticket renamed to ${newName}`, flags: 64 });
    } catch (e) {
      logger.error('Failed to rename ticket', e);
      respond({ content: '❌ Failed to rename ticket.', flags: 64 });
    }
    return true;
  }

  return false;
}
