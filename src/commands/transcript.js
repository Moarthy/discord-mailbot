const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const transcriptService = require('../services/transcriptService');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Download the full staff transcript (includes internal notes).')
    .setDMPermission(false),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({ embeds: [embeds.errorEmbed('Staff only.')], flags: MessageFlags.Ephemeral });
    }

    const ticket = store.getByChannelId(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ embeds: [embeds.errorEmbed('This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    return interaction.reply({
      files: [transcriptService.toAttachment(ticket, true)],
      flags: MessageFlags.Ephemeral
    });
  }
};
