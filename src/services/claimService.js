const { MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const ticketService = require('./ticketService');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

// Replies, or edits the existing response when the interaction was deferred.
function respond(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

// An interaction token dies after 3 seconds, so every branch below answers
// Discord before touching the API. refreshHeader() in particular costs several
// round trips and used to run first, which expired the token on slow networks
// and surfaced as DiscordAPIError 10062.
async function executeClaim(interaction) {
  const ticket = store.getByChannelId(interaction.channelId);

  // Store lookups are in-memory, so this branch is always safely within budget.
  if (!ticket) {
    return interaction.reply({
      embeds: [embeds.errorEmbed('This channel is not a ticket.')],
      ...EPHEMERAL
    });
  }

  // The claimant releases the ticket.
  if (ticket.claimedBy === interaction.user.id) {
    store.setClaim(ticket.userId, null);

    await interaction.reply({ embeds: [embeds.systemEmbed('🎫 Ticket released.')] });
    await ticketService.refreshHeader(interaction.client, ticket);
    return undefined;
  }

  // Claimed by someone else: locked — unless that person left the server.
  if (ticket.claimedBy) {
    let claimant = interaction.guild.members.cache.get(ticket.claimedBy) ?? null;

    // Cache miss means a network fetch, which can outlive the token; defer
    // first so the reply survives.
    if (!claimant) {
      await interaction.deferReply(EPHEMERAL).catch(() => {});
      claimant = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
    }

    if (claimant) {
      return respond(interaction, { embeds: [embeds.claimLockedEmbed(ticket)], ...EPHEMERAL });
    }
  }

  const takeover = Boolean(ticket.claimedBy);
  store.setClaim(ticket.userId, interaction.user.id);

  const announcement = embeds.systemEmbed(
    takeover
      ? `🎫 The previous claimant is no longer in the server. Ticket claimed by <@${interaction.user.id}>.`
      : `🎫 Ticket claimed by <@${interaction.user.id}>.`
  );

  // A deferred response is ephemeral, so the claim is announced in-channel to
  // keep it visible to the rest of the team.
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [announcement] }).catch(() => {});
    await interaction.channel.send({ embeds: [announcement] }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [announcement] });
  }

  await ticketService.refreshHeader(interaction.client, ticket);
  return undefined;
}

module.exports = { executeClaim };
