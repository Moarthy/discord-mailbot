const { MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const ticketService = require('./ticketService');

async function executeClaim(interaction) {
  const ticket = store.getByChannelId(interaction.channelId);

  if (!ticket) {
    return interaction.reply({
      embeds: [embeds.errorEmbed('This channel is not a ticket.')],
      flags: MessageFlags.Ephemeral
    });
  }

  // The claimant releases the ticket.
  if (ticket.claimedBy === interaction.user.id) {
    store.setClaim(ticket.userId, null);
    await ticketService.refreshHeader(interaction.client, ticket);
    return interaction.reply({ embeds: [embeds.systemEmbed('🎫 Ticket released.')] });
  }

  // Claimed by someone else: locked — unless that person is no longer in the server.
  if (ticket.claimedBy) {
    const claimant = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);

    if (claimant) {
      return interaction.reply({
        embeds: [embeds.claimLockedEmbed(ticket)],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const takeover = Boolean(ticket.claimedBy);

  store.setClaim(ticket.userId, interaction.user.id);
  await ticketService.refreshHeader(interaction.client, ticket);

  return interaction.reply({
    embeds: [
      embeds.systemEmbed(
        takeover
          ? `🎫 The previous claimant is no longer in the server. Ticket claimed by <@${interaction.user.id}>.`
          : `🎫 Ticket claimed by <@${interaction.user.id}>.`
      )
    ]
  });
}

module.exports = { executeClaim };
