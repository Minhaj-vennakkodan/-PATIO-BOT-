import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  PermissionFlagsBits,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember
} from 'discord.js';
import { Command } from '../types';
import { prisma } from '../database/client';
import { applyChatBan } from '../utils/chatBanService';

const chatbanCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('chatban')
    .setDescription('Apply ChatBan to a user or setup the system')
    .addSubcommand(sub => 
      sub.setName('setup')
         .setDescription('Setup ChatBan configuration')
    )
    .addSubcommand(sub => 
      sub.setName('user')
         .setDescription('ChatBan a user')
         .addUserOption(opt => opt.setName('target').setDescription('User to ChatBan').setRequired(true))
         .addStringOption(opt => opt.setName('reason').setDescription('Reason for ChatBan').setRequired(true))
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    const sub = interaction.options.getSubcommand();
    
    let config = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
    if (!config) {
      config = await prisma.guildConfig.create({ data: { guildId: interaction.guildId } });
    }

    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: 'Only Administrators can setup the ChatBan system.', ephemeral: true });
        return;
      }

      const roleSelect = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('chatban_role_select')
          .setPlaceholder('Select ChatBan Role')
      );

      const categorySelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('chatban_category_select')
          .setPlaceholder('Select ChatBan Category')
          .addChannelTypes(ChannelType.GuildCategory)
      );

      const logChannelSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('chatban_log_channel_select')
          .setPlaceholder('Select Log Channel')
          .addChannelTypes(ChannelType.GuildText)
      );

      const toggles = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('chatban_toggle_enable').setLabel(config.chatBanEnabled ? 'Disable' : 'Enable').setStyle(config.chatBanEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setTitle('ChatBan System Setup')
        .setDescription('Use the components below to configure ChatBan.')
        .setColor('#FF0000');

      await interaction.reply({ embeds: [embed], components: [roleSelect, categorySelect, logChannelSelect, toggles], ephemeral: true });
    } 
    else if (sub === 'user') {
      // Check moderator role or permissions
      const member = interaction.member as GuildMember;
      const hasPerm = member.permissions.has(PermissionFlagsBits.ManageRoles);
      const hasModRole = config.chatBanModeratorRoleId && member.roles.cache.has(config.chatBanModeratorRoleId);
      
      if (!hasPerm && !hasModRole) {
        await interaction.reply({ content: 'You do not have permission to ChatBan.', ephemeral: true });
        return;
      }

      const targetUser = interaction.options.getUser('target', true);
      const reason = interaction.options.getString('reason', true);

      if (targetUser.id === interaction.client.user.id) {
        await interaction.reply({ content: 'I cannot ChatBan myself.', ephemeral: true });
        return;
      }

      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!targetMember) {
        await interaction.reply({ content: 'User is not in the server.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        await applyChatBan(interaction.guild, targetMember, interaction.user, reason);
        await interaction.editReply(`✅ Successfully ChatBanned <@${targetUser.id}> for: ${reason}`);
      } catch (error: any) {
        await interaction.editReply(`❌ Failed to ChatBan: ${error.message}`);
      }
    }
  },
};

export default chatbanCommand;
