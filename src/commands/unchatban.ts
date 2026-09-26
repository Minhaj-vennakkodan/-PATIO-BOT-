import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits,
  GuildMember
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { removeChatBan } from '../utils/chatBanService';

const unchatbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('unchatban')
    .setDescription('Remove ChatBan from a user')
    .addUserOption(opt => opt.setName('target').setDescription('User to UnChatBan').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    let config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config) return;

    const member = interaction.member as GuildMember;
    const hasPerm = member.permissions.has(PermissionFlagsBits.ManageRoles);
    const hasModRole = config.chatBanModeratorRoleId && member.roles.cache.has(config.chatBanModeratorRoleId);
    
    if (!hasPerm && !hasModRole) {
      await interaction.reply({ content: 'You do not have permission to UnChatBan.', ephemeral: true });
      return;
    }

    const targetUser = interaction.options.getUser('target', true);
    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    
    if (!targetMember) {
      await interaction.reply({ content: 'User is not in the server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await removeChatBan(interaction.guild, targetMember, interaction.user);
      await interaction.editReply(`✅ Successfully UnChatBanned <@${targetUser.id}>.`);
    } catch (error: any) {
      await interaction.editReply(`❌ Failed to UnChatBan: ${error.message}`);
    }
  },
};

export default unchatbanCommand;
