import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, InteractionContextType, ApplicationIntegrationType } from 'discord.js';
import { Command } from '../types';
import { generateMainDashboard } from '../utils/configDashboard';

const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Open the PATIO BOT Central Configuration Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }
    
    // Defer reply as ephemeral so the config dashboard is private to the admin
    await interaction.deferReply({ ephemeral: true });
    
    const guild = interaction.guild ?? await interaction.client.guilds.fetch(interaction.guildId).catch(() => null);
    if (!guild) {
      await interaction.editReply({ content: 'Could not fetch server information.' });
      return;
    }

    const { embeds, components } = await generateMainDashboard(guild);
    
    await interaction.editReply({ embeds, components });
  },
};

export default configCommand;
