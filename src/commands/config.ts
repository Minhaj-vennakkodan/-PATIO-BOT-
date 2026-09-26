import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { Command } from '../types';
import { generateMainDashboard } from '../utils/configDashboard';

const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Open the PATIO BOT Central Configuration Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;
    
    // Defer reply as ephemeral so the config dashboard is private to the admin
    await interaction.deferReply({ ephemeral: true });
    
    const { embeds, components } = await generateMainDashboard(interaction.guild);
    
    await interaction.editReply({ embeds, components });
  },
};

export default configCommand;
