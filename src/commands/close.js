const { SlashCommandBuilder } = require('discord.js');

const closeService = require('../services/closeService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this ModMail ticket and notify the user.')
    .addStringOption((option) => option.setName('reason').setDescription('Reason shown to the user.').setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    const reason = interaction.options.getString('reason') ?? '';
    await closeService.executeClose(interaction, reason);
  }
};
