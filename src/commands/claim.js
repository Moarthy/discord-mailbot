const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const embeds = require('../utils/embeds');
const claimService = require('../services/claimService');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim or release this ticket.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({
        embeds: [embeds.errorEmbed('You do not have permission to claim tickets.')],
        flags: MessageFlags.Ephemeral
      });
    }

    return claimService.executeClaim(interaction);
  }
};
