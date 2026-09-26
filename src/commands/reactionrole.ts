import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { isAdministrator } from '../utils/permissions';
import { createPanel, getPanel, getPanelsByGuild, addRoleToPanel, removeRoleFromPanel, deletePanel, updatePanelMessage, isRoleSafeToAssign, editPanel, editRoleInPanel } from '../utils/reactionRoleService';

export default {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage Reaction Roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new reaction role panel')
        .addStringOption(opt => opt.setName('title').setDescription('Panel title').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('Panel description').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Add a role to a panel')
        .addStringOption(opt => opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('Button label').setRequired(true))
        .addStringOption(opt => opt.setName('emoji').setDescription('Button emoji').setRequired(false))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove a role from a panel')
        .addStringOption(opt => opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edit panel title/description or a specific role')
        .addStringOption(opt => opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('New Panel title'))
        .addStringOption(opt => opt.setName('description').setDescription('New Panel description'))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to edit (if editing role options)'))
        .addStringOption(opt => opt.setName('label').setDescription('New Button label'))
        .addStringOption(opt => opt.setName('emoji').setDescription('New Button emoji'))
        .addIntegerOption(opt => opt.setName('style').setDescription('Button style (1-4)'))
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('Delete a panel')
        .addStringOption(opt => opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('List all panels in this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('publish')
        .setDescription('Publish or refresh a panel to the current channel')
        .addStringOption(opt => opt.setName('panel_id').setDescription('Panel ID').setRequired(true))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) return;
    
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const admin = isAdministrator(member);
    if (!admin) {
      await interaction.reply({ content: '❌ You must be an administrator to manage reaction roles.', ephemeral: true });
      return;
    }

    const subCommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    try {
      if (subCommand === 'create') {
        const title = interaction.options.getString('title', true);
        const description = interaction.options.getString('description') || '';
        
        const panel = await createPanel(guildId, title, description);
        await interaction.reply({ content: `✅ Panel created successfully!\n**ID:** \`${panel.id}\`\n**Title:** ${title}`, ephemeral: true });
        logger.info(`Reaction role panel created by ${interaction.user.id} in ${guildId} (Panel ID: ${panel.id})`);
        return;
      }

      if (subCommand === 'add') {
        const panelId = interaction.options.getString('panel_id', true);
        const role = interaction.options.getRole('role', true);
        const label = interaction.options.getString('label', true);
        const emoji = interaction.options.getString('emoji') || undefined;

        const panel = await getPanel(guildId, panelId);
        if (!panel) {
          await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
          return;
        }

        if (panel.roles.length >= 25) {
          await interaction.reply({ content: '❌ A panel can have a maximum of 25 roles (Discord component limit).', ephemeral: true });
          return;
        }

        // Validate safe assignment
        const botMember = await interaction.guild.members.fetch(interaction.client.user!.id);
        const guildRole = interaction.guild.roles.cache.get(role.id);
        
        if (!guildRole || !isRoleSafeToAssign(interaction.guild, guildRole, botMember)) {
          await interaction.reply({ content: '❌ This role cannot be safely assigned. Ensure it is not an Administrator role, is lower than the bot\'s highest role, and is not managed.', ephemeral: true });
          return;
        }

        if (panel.roles.some(r => r.roleId === role.id)) {
          await interaction.reply({ content: '❌ This role is already configured in this panel.', ephemeral: true });
          return;
        }

        await addRoleToPanel(panelId, role.id, label, emoji);
        await interaction.reply({ content: `✅ Added role **${guildRole.name}** to panel \`${panelId}\`.`, ephemeral: true });
        logger.info(`Reaction role option added by ${interaction.user.id} in ${guildId} to Panel ${panelId} (Role: ${role.id})`);
        return;
      }

      if (subCommand === 'remove') {
        const panelId = interaction.options.getString('panel_id', true);
        const role = interaction.options.getRole('role', true);

        await removeRoleFromPanel(panelId, role.id).catch(() => null);
        await interaction.reply({ content: `✅ Removed role configuration for **${role.name}** from panel \`${panelId}\`.`, ephemeral: true });
        return;
      }

      if (subCommand === 'edit') {
        const panelId = interaction.options.getString('panel_id', true);
        const title = interaction.options.getString('title') || undefined;
        const description = interaction.options.getString('description') || undefined;
        const role = interaction.options.getRole('role');
        const label = interaction.options.getString('label') || undefined;
        const emoji = interaction.options.getString('emoji') || undefined;
        const style = interaction.options.getInteger('style') || undefined;

        const panel = await getPanel(guildId, panelId);
        if (!panel) {
          await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
          return;
        }

        if (title !== undefined || description !== undefined) {
          await editPanel(guildId, panelId, title, description);
          logger.info(`Reaction role panel ${panelId} edited by ${interaction.user.id} in ${guildId}`);
        }

        if (role) {
          if (!panel.roles.some(r => r.roleId === role.id)) {
            await interaction.reply({ content: '❌ Role configuration not found in this panel.', ephemeral: true });
            return;
          }
          await editRoleInPanel(panelId, role.id, label, emoji, description, style);
          logger.info(`Reaction role option ${role.id} in panel ${panelId} edited by ${interaction.user.id} in ${guildId}`);
        }

        await interaction.reply({ content: `✅ Panel \`${panelId}\` edited. Remember to \`/reactionrole publish\` to update the live message.`, ephemeral: true });
        return;
      }

      if (subCommand === 'delete') {
        const panelId = interaction.options.getString('panel_id', true);
        await deletePanel(guildId, panelId).catch(() => null);
        await interaction.reply({ content: `✅ Panel \`${panelId}\` deleted from database. (Discord messages are not deleted automatically).`, ephemeral: true });
        logger.info(`Reaction role panel ${panelId} deleted by ${interaction.user.id} in ${guildId}`);
        return;
      }

      if (subCommand === 'list') {
        const panels = await getPanelsByGuild(guildId);
        if (panels.length === 0) {
          await interaction.reply({ content: 'No reaction role panels configured.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle('Reaction Role Panels')
          .setColor('#2b2d31');

        let desc = '';
        for (const p of panels) {
          desc += `**ID:** \`${p.id}\`\n**Title:** ${p.title}\n**Roles:** ${p._count.roles}\n\n`;
        }
        embed.setDescription(desc);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (subCommand === 'publish') {
        const panelId = interaction.options.getString('panel_id', true);
        const panel = await getPanel(guildId, panelId);
        
        if (!panel) {
          await interaction.reply({ content: '❌ Panel not found.', ephemeral: true });
          return;
        }

        if (panel.roles.length === 0) {
          await interaction.reply({ content: '❌ Cannot publish an empty panel. Add roles first.', ephemeral: true });
          return;
        }

        const embed = new EmbedBuilder()
          .setTitle(panel.title)
          .setColor('#2b2d31');
        
        if (panel.description) embed.setDescription(panel.description);

        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        let currentRow = new ActionRowBuilder<ButtonBuilder>();
        
        for (let i = 0; i < panel.roles.length; i++) {
          const r = panel.roles[i];
          const btn = new ButtonBuilder()
            .setCustomId(`rr:panel:${panel.id}:role:${r.roleId}`)
            .setLabel(r.label)
            .setStyle(r.style as ButtonStyle);
            
          if (r.emoji) btn.setEmoji(r.emoji);
          
          currentRow.addComponents(btn);

          if (currentRow.components.length === 5 || i === panel.roles.length - 1) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder<ButtonBuilder>();
          }
        }

        const channel = interaction.channel as TextChannel;
        let publishedMessage;
        
        // If it was published before, try to edit the existing message
        if (panel.messageId && panel.channelId) {
          try {
            const fetchedChannel = await interaction.guild.channels.fetch(panel.channelId) as TextChannel;
            if (fetchedChannel) {
              const existingMsg = await fetchedChannel.messages.fetch(panel.messageId);
              if (existingMsg) {
                publishedMessage = await existingMsg.edit({ embeds: [embed], components: rows });
              }
            }
          } catch (err) {
            // Message deleted or channel inaccessible, treat as stale
            logger.info(`Stale published reaction role panel detected in ${guildId}. Recovering and republishing.`);
          }
        }

        if (!publishedMessage) {
          publishedMessage = await channel.send({ embeds: [embed], components: rows });
        }

        await updatePanelMessage(guildId, panelId, channel.id, publishedMessage.id);
        
        await interaction.reply({ content: `✅ Panel published successfully!`, ephemeral: true });
        logger.info(`Reaction role panel ${panel.id} published by ${interaction.user.id} in ${guildId}`);
        return;
      }

    } catch (error) {
      logger.error('Error in /reactionrole command:', error);
      await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true }).catch(() => {});
    }
  }
};
