import { Interaction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ModalSubmitInteraction, ButtonInteraction } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from './logger';
import { createSuggestion, submitVote, refreshSuggestionMessage, moderateSuggestion } from './suggestionService';
import { hasModeratorPermission } from './permissions';

import { evaluateAutoModContentOnly } from './automodService';

export async function handleSuggestionInteractions(interaction: Interaction) {
  if (!interaction.guildId || !interaction.guild || !interaction.member) return false;

  // 1. Submit Button
  if (interaction.isButton() && interaction.customId === 'suggestion:submit') {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config || !config.suggestionsEnabled) {
      await interaction.reply({ content: '❌ Suggestions are currently disabled.', ephemeral: true });
      return true;
    }

    const cooldownRecord = await prisma.suggestionCooldown.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } }
    });
    const cooldownMs = (config.suggestionCooldownSeconds || 300) * 1000;
    
    if (cooldownRecord) {
      const elapsed = Date.now() - cooldownRecord.lastSubmitAt.getTime();
      if (elapsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        await interaction.reply({ content: `⏳ Please wait ${remaining} seconds before submitting another suggestion.`, ephemeral: true });
        return true;
      }
    }

    const modal = new ModalBuilder()
      .setCustomId('suggestion:modal_submit')
      .setTitle('Submit a Suggestion');

    const contentInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('Your suggestion')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(config.suggestionMinLength || 10)
      .setMaxLength(config.suggestionMaxLength || 1000)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput));

    if (config.suggestionAnonymousEnabled) {
      const anonInput = new TextInputBuilder()
        .setCustomId('anonymous')
        .setLabel('Anonymous? (Type "yes" or leave blank)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(3);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(anonInput));
    }

    await interaction.showModal(modal);
    return true;
  }

  // 2. Modal Submission
  if (interaction.isModalSubmit() && interaction.customId === 'suggestion:modal_submit') {
    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config || !config.suggestionsEnabled) {
      await interaction.reply({ content: '❌ Suggestions are currently disabled.', ephemeral: true });
      return true;
    }

    const content = interaction.fields.getTextInputValue('content');
    let anonymous = false;
    try {
      const anonVal = interaction.fields.getTextInputValue('anonymous');
      if (anonVal.toLowerCase() === 'yes') anonymous = true;
    } catch(e) {}

    // 1. ChatBan Check
    const chatBan = await prisma.chatBanRecord.findFirst({
      where: { guildId: interaction.guildId, userId: interaction.user.id, active: true }
    });
    if (chatBan) {
      await interaction.reply({ content: '❌ You are ChatBanned and cannot submit suggestions.', ephemeral: true });
      return true;
    }

    // 2. AutoMod Check
    if (config.autoModEnabled) {
      const rules = await prisma.autoModRule.findMany({ where: { guildId: interaction.guildId, enabled: true } });
      let isBlocked = false;
      let blockReason = '';
      for (const rule of rules) {
        const violation = await evaluateAutoModContentOnly(interaction.guildId, rule, content);
        if (violation) {
          isBlocked = true;
          blockReason = violation.reason;
          break;
        }
      }
      if (isBlocked) {
        await interaction.reply({ content: `❌ Suggestion blocked by AutoMod: ${blockReason}`, ephemeral: true });
        return true;
      }
    }

    // 3. DB Cooldown Check (Concurrency safe)
    const cooldownMs = (config.suggestionCooldownSeconds || 300) * 1000;
    const now = new Date();
    const cutoff = new Date(now.getTime() - cooldownMs);
    
    // We try to update a record if it's older than cutoff
    const cdUpdate = await prisma.suggestionCooldown.updateMany({
      where: { 
        guildId: interaction.guildId, 
        userId: interaction.user.id,
        lastSubmitAt: { lte: cutoff }
      },
      data: { lastSubmitAt: now }
    });

    if (cdUpdate.count === 0) {
      // It might not exist, or it's too recent
      const existing = await prisma.suggestionCooldown.findUnique({
        where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } }
      });
      
      if (existing) {
        // Too recent
        const elapsed = Date.now() - existing.lastSubmitAt.getTime();
        const remaining = Math.ceil((cooldownMs - elapsed) / 1000);
        await interaction.reply({ content: `⏳ Please wait ${remaining} seconds before submitting.`, ephemeral: true });
        return true;
      } else {
        // Doesn't exist, create it. If two requests do this simultaneously, one fails unique constraint
        try {
          await prisma.suggestionCooldown.create({
            data: { guildId: interaction.guildId, userId: interaction.user.id, lastSubmitAt: now }
          });
        } catch (e) {
          await interaction.reply({ content: `⏳ Please wait before submitting another suggestion.`, ephemeral: true });
          return true;
        }
      }
    }

    const suggestion = await createSuggestion(interaction.guildId, interaction.user.id, content, anonymous);

    await interaction.reply({ content: `✅ Your suggestion has been submitted as **#${suggestion.suggestionNumber}**.`, ephemeral: true });

    // Send to channel if configured
    if (config.suggestionChannelId) {
      const channel = await interaction.guild.channels.fetch(config.suggestionChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const msg = await channel.send({ content: `Processing suggestion #${suggestion.suggestionNumber}...` });
        await prisma.suggestion.update({ where: { id: suggestion.id }, data: { channelId: channel.id, messageId: msg.id } });
        await refreshSuggestionMessage(interaction.client, interaction.guildId, suggestion.id);
      }
    }

    logger.info(`Suggestion #${suggestion.suggestionNumber} submitted in ${interaction.guildId} by ${interaction.user.id}`);
    return true;
  }

  // 3. Voting
  if (interaction.isButton() && (interaction.customId.startsWith('suggestion:upvote:') || interaction.customId.startsWith('suggestion:downvote:'))) {
    const parts = interaction.customId.split(':');
    if (parts.length !== 3) return false;

    const action = parts[1]; // 'upvote' or 'downvote'
    const suggestionId = parts[2];

    const config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config || !config.suggestionsEnabled) {
      await interaction.reply({ content: '❌ Suggestions are currently disabled.', ephemeral: true });
      return true;
    }

    const suggestion = await prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.guildId !== interaction.guildId) {
      await interaction.reply({ content: '❌ Suggestion not found.', ephemeral: true });
      return true;
    }

    if (suggestion.status !== 'PENDING') {
      await interaction.reply({ content: '❌ You can no longer vote on this suggestion.', ephemeral: true });
      return true;
    }

    const voteType = action === 'upvote' ? 'UP' : 'DOWN';
    const result = await submitVote(suggestionId, interaction.user.id, voteType);

    await interaction.reply({ content: `✅ Vote ${result.action}.`, ephemeral: true });
    
    // Async refresh to avoid blocking
    refreshSuggestionMessage(interaction.client, interaction.guildId, suggestionId).catch(() => {});
    return true;
  }

  // 4. Staff Moderation Action
  if (interaction.isButton() && interaction.customId.startsWith('suggestion:')) {
    const parts = interaction.customId.split(':');
    if (parts.length !== 3) return false;
    
    const action = parts[1];
    if (!['approve', 'deny', 'implement', 'archive'].includes(action)) return false;

    const suggestionId = parts[2];

    const hasPerm = await hasModeratorPermission(interaction.member as any);
    if (!hasPerm) {
      await interaction.reply({ content: '❌ You lack permission to moderate suggestions.', ephemeral: true });
      return true;
    }

    let newStatus: 'APPROVED' | 'DENIED' | 'IMPLEMENTED' | 'ARCHIVED' = 'ARCHIVED';
    if (action === 'approve') newStatus = 'APPROVED';
    if (action === 'deny') newStatus = 'DENIED';
    if (action === 'implement') newStatus = 'IMPLEMENTED';
    if (action === 'archive') newStatus = 'ARCHIVED';

    const result = await moderateSuggestion(suggestionId, interaction.guildId, newStatus, interaction.user.id);
    
    if (result) {
      await interaction.reply({ content: `✅ Suggestion marked as ${newStatus}.`, ephemeral: true });
      await refreshSuggestionMessage(interaction.client, interaction.guildId, suggestionId);
      logger.info(`Suggestion ${suggestionId} in ${interaction.guildId} marked ${newStatus} by ${interaction.user.id}`);
    } else {
      await interaction.reply({ content: '❌ Could not apply status (invalid transition or not found).', ephemeral: true });
    }
    
    return true;
  }
  
  return false;
}
