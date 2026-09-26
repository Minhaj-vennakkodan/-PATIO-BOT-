import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel, EmbedBuilder } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { hasModeratorPermission } from '../utils/permissions';
import { createGiveaway, endGiveaway, refreshGiveawayMessage, updateGiveawayStatus } from '../utils/giveawayService';
import { randomInt } from 'node:crypto';

// Basic parser for duration (e.g. 10m, 2h, 1d)
function parseDurationToMs(duration: string): number | null {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  if (isNaN(val) || val <= 0) return null;
  const unit = match[2];
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage server giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub => 
      sub.setName('create')
      .setDescription('Create a new giveaway')
      .addStringOption(opt => opt.setName('prize').setDescription('Giveaway prize').setRequired(true))
      .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 10m, 2h, 1d)').setRequired(true))
      .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(true))
      .addStringOption(opt => opt.setName('description').setDescription('Giveaway description').setRequired(false))
      .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in').setRequired(false))
      .addRoleOption(opt => opt.setName('required_role').setDescription('Role required to enter').setRequired(false))
      .addIntegerOption(opt => opt.setName('min_account_age').setDescription('Minimum account age in days').setRequired(false))
      .addIntegerOption(opt => opt.setName('min_server_age').setDescription('Minimum server membership age in days').setRequired(false))
    )
    .addSubcommand(sub => 
      sub.setName('end')
      .setDescription('End an active giveaway early')
      .addStringOption(opt => opt.setName('id').setDescription('Giveaway ID').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('cancel')
      .setDescription('Cancel an active giveaway')
      .addStringOption(opt => opt.setName('id').setDescription('Giveaway ID').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('reroll')
      .setDescription('Reroll an ended giveaway')
      .addStringOption(opt => opt.setName('id').setDescription('Giveaway ID').setRequired(true))
    )
    .addSubcommand(sub => 
      sub.setName('list')
      .setDescription('List giveaways')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;
    const guildId = interaction.guild.id;

    const hasPerm = await hasModeratorPermission(interaction.member as any);
    if (!hasPerm) {
      await interaction.reply({ content: '❌ You lack permission to manage giveaways.', ephemeral: true });
      return;
    }

    const config = await prisma.guildConfig.findUnique({ where: { guildId }, select: { giveawaysEnabled: true } });
    if (config && !config.giveawaysEnabled) {
      await interaction.reply({ content: '❌ Giveaways are currently disabled in this server.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'create') {
        const prize = interaction.options.getString('prize', true);
        const durationStr = interaction.options.getString('duration', true);
        const winners = interaction.options.getInteger('winners', true);
        const description = interaction.options.getString('description') || undefined;
        const channelInput = interaction.options.getChannel('channel') || interaction.channel;
        const requiredRole = interaction.options.getRole('required_role');
        const minAcc = interaction.options.getInteger('min_account_age') || undefined;
        const minSrv = interaction.options.getInteger('min_server_age') || undefined;

        if (winners < 1) {
          await interaction.reply({ content: '❌ Winner count must be at least 1.', ephemeral: true });
          return;
        }

        const durationMs = parseDurationToMs(durationStr);
        if (!durationMs || durationMs < 10000 || durationMs > 30 * 24 * 60 * 60 * 1000) {
          await interaction.reply({ content: '❌ Invalid duration. Must be between 10s and 30d.', ephemeral: true });
          return;
        }

        if (channelInput?.type !== 0) { // TextChannel
          await interaction.reply({ content: '❌ Channel must be a standard text channel.', ephemeral: true });
          return;
        }

        const channel = channelInput as TextChannel;
        
        // Ensure bot can send/edit
        const me = await interaction.guild.members.fetch(interaction.client.user!.id);
        if (!channel.permissionsFor(me).has(['SendMessages', 'ViewChannel'])) {
          await interaction.reply({ content: '❌ Bot lacks permission to send messages in that channel.', ephemeral: true });
          return;
        }

        const startAt = new Date();
        const endAt = new Date(Date.now() + durationMs);

        const giveaway = await createGiveaway({
          guildId,
          channelId: channel.id,
          hostUserId: interaction.user.id,
          prize,
          description,
          winnerCount: winners,
          startAt,
          endAt,
          requiredRoleId: requiredRole?.id,
          minimumAccountAge: minAcc,
          minimumServerAge: minSrv
        });

        // Send placeholder message so we get an ID
        const msg = await channel.send({ content: '🎉 Setting up giveaway...' });
        await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: msg.id } });

        await refreshGiveawayMessage(interaction.client, giveaway.id);
        
        await interaction.reply({ content: `✅ Giveaway for **${prize}** created in <#${channel.id}>. ID: \`${giveaway.id}\``, ephemeral: true });
        logger.info(`Giveaway ${giveaway.id} created in ${guildId} by ${interaction.user.id}`);
        return;
      }

      if (sub === 'end') {
        const id = interaction.options.getString('id', true);
        const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId } });
        if (!giveaway) {
          await interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
          return;
        }
        if (giveaway.status === 'ENDED' || giveaway.status === 'CANCELLED') {
          await interaction.reply({ content: `❌ Giveaway is already ${giveaway.status.toLowerCase()}.`, ephemeral: true });
          return;
        }

        const winners = await endGiveaway(interaction.client, guildId, id);
        if (winners && winners.length > 0) {
          const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null) as TextChannel;
          if (channel) {
            await channel.send({ content: `🎉 Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${giveaway.prize}**!` }).catch(() => null);
          }
          await interaction.reply({ content: '✅ Giveaway ended and winners announced.', ephemeral: true });
        } else {
          await interaction.reply({ content: '✅ Giveaway ended, but no eligible winners could be selected.', ephemeral: true });
        }
        logger.info(`Giveaway ${id} ended manually by ${interaction.user.id}`);
        return;
      }

      if (sub === 'cancel') {
        const id = interaction.options.getString('id', true);
        const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId } });
        if (!giveaway) {
          await interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });
          return;
        }
        if (giveaway.status === 'ENDED' || giveaway.status === 'CANCELLED') {
          await interaction.reply({ content: `❌ Giveaway is already ${giveaway.status.toLowerCase()}.`, ephemeral: true });
          return;
        }
        
        await updateGiveawayStatus(id, 'CANCELLED');
        await refreshGiveawayMessage(interaction.client, id);
        await interaction.reply({ content: '✅ Giveaway cancelled.', ephemeral: true });
        logger.info(`Giveaway ${id} cancelled by ${interaction.user.id}`);
        return;
      }

      if (sub === 'reroll') {
        const id = interaction.options.getString('id', true);
        const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId }, include: { entries: true, winners: true } });
        if (!giveaway || giveaway.status !== 'ENDED') {
          await interaction.reply({ content: '❌ Giveaway not found or not ended.', ephemeral: true });
          return;
        }

        const existingWinners = new Set(giveaway.winners.map(w => w.userId));
        const eligibleEntries = giveaway.entries.filter(e => !existingWinners.has(e.userId));

        if (eligibleEntries.length === 0) {
          await interaction.reply({ content: '❌ No eligible alternate entries available to reroll.', ephemeral: true });
          return;
        }

        const idx = randomInt(0, eligibleEntries.length);
        const rerolledWinner = eligibleEntries[idx];
        await prisma.giveawayWinner.create({
          data: {
            giveawayId: id,
            userId: rerolledWinner.userId,
            rerollNumber: giveaway.winners.length + 1
          }
        });

        const channel = await interaction.guild.channels.fetch(giveaway.channelId).catch(() => null) as TextChannel;
        if (channel) {
          await channel.send({ content: `🎲 **Reroll:** Congratulations <@${rerolledWinner.userId}>! You won **${giveaway.prize}**!` }).catch(() => null);
        }

        await refreshGiveawayMessage(interaction.client, id);
        await interaction.reply({ content: `✅ Rerolled winner: <@${rerolledWinner.userId}>`, ephemeral: true });
        logger.info(`Giveaway ${id} rerolled by ${interaction.user.id}`);
        return;
      }

      if (sub === 'list') {
        const list = await prisma.giveaway.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 10 });
        if (list.length === 0) {
          await interaction.reply({ content: 'No giveaways found.', ephemeral: true });
          return;
        }
        const embed = new EmbedBuilder().setTitle('Recent Giveaways').setColor('#2b2d31');
        let desc = '';
        for (const g of list) {
          desc += `\`${g.id}\` - **${g.prize}** (${g.status})\n`;
        }
        embed.setDescription(desc);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

    } catch (error) {
      logger.error('Error in /giveaway command:', error);
      await interaction.reply({ content: '❌ An error occurred processing the command.', ephemeral: true }).catch(() => {});
    }
  }
};
