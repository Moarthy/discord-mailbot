const { MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const config = require('../config');
const embeds = require('../utils/embeds');
const transcriptService = require('./transcriptService');
const logService = require('./logService');
const { isModerator } = require('../utils/permissions');
const logger = require('../utils/logger');

async function executeClose(interaction, reason = '') {
  const client = interaction.client;
  const ticket = store.getByChannelId(interaction.channelId);

  if (!ticket) {
    return interaction.reply({
      embeds: [embeds.errorEmbed('This channel is not a ModMail ticket.')],
      flags: MessageFlags.Ephemeral
    });
  }

  if (!isModerator(interaction.member)) {
    return interaction.reply({
      embeds: [embeds.errorEmbed('You do not have permission to close tickets.')],
      flags: MessageFlags.Ephemeral
    });
  }

  if (ticket.claimedBy !== interaction.user.id) {
    return interaction.reply({
      embeds: [embeds.claimWarningEmbed(ticket)],
      flags: MessageFlags.Ephemeral
    });
  }

  // Acknowledge immediately so slow DM/file sends can't hit the 3s timeout.
  await interaction.deferReply().catch(() => {});

  store.addLog(ticket.userId, {
    type: 'system',
    authorName: 'System',
    content: `Closed by ${interaction.user.tag}${reason ? ` — ${reason}` : ''}`
  });

  const finalTicket = store.getByUserId(ticket.userId);
  const transcripts = transcriptService.writeArchives(finalTicket);

  const user = await client.users.fetch(ticket.userId).catch(() => null);

  if (user) {
    await user.send({
      embeds: [
        embeds.closeEmbed({ ticket: finalTicket, reason, closedByTag: interaction.user.tag }),
        embeds.feedbackPromptEmbed(finalTicket)
      ],
      components: [embeds.feedbackButton(finalTicket)],
      files: [transcriptService.toAttachment(finalTicket, false)]
    }).catch(() => {});
  }

  if (config.transcriptChannelId) {
    const transcriptChannel = await client.channels.fetch(config.transcriptChannelId).catch(() => null);

    if (transcriptChannel) {
      await transcriptChannel.send({
        embeds: [embeds.closeEmbed({ ticket: finalTicket, reason, closedByTag: interaction.user.tag })],
        files: [transcriptService.toAttachment(finalTicket, true)]
      }).catch(() => {});
    }
  }

  await logService.send(
    client,
    embeds.systemEmbed(`🔒 Ticket ${embeds.ticketNumberLabel(ticket.number)} closed by ${interaction.user.tag}.`, embeds.Colors.danger)
  );

  store.closeTicket(ticket.userId, {
    closedBy: interaction.user.id,
    reason,
    staffTranscript: transcripts.staffTranscript,
    userTranscript: transcripts.userTranscript
  });

  await interaction.editReply({
    embeds: [embeds.systemEmbed(`Ticket closed.${reason ? ` Reason: ${reason}` : ''} Deleting channel…`)]
  }).catch(() => {});

  setTimeout(() => {
    interaction.channel.delete('Ticket closed.').catch((error) => logger.error('Failed to delete ticket channel.', error));
  }, 1500);
}

module.exports = { executeClose };
