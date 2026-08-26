const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const transcriptService = require('./transcriptService');
const logService = require('./logService');
const logger = require('../utils/logger');

// Channels the bot deletes for its own reasons (setup rollback). The
// channelDelete event cannot tell these apart from staff deleting a channel
// by hand, so the deletion is registered here first and consumed on arrival.
// Timestamped so stale marks expire; consumed marks are removed immediately.
const BOT_DELETION_TTL_MS = 5 * 60_000;
const botSideDeletions = new Map();

function markBotSideDeletion(channelId) {
  botSideDeletions.set(channelId, Date.now());
}

function wasBotSideDeletion(channelId) {
  const markedAt = botSideDeletions.get(channelId);
  if (!markedAt) return false;

  botSideDeletions.delete(channelId);
  return Date.now() - markedAt <= BOT_DELETION_TTL_MS;
}

async function sendClaimantLeftNotice(client, ticket, { name } = {}) {
  const leaverName = name || 'A staff member';

  try {
    const user = await client.users.fetch(ticket.userId).catch(() => null);
    if (user) {
      await user.send({ embeds: [embeds.claimantLeftEmbed({ ticket, leaverName })] }).catch(() => {});
    }

    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embeds.claimReleasedEmbed({ ticket, leaverName })] }).catch(() => {});
    }
  } catch (error) {
    logger.warn('Could not send claimant-left notice.', error);
  }
}

// Ends a ticket whose channel disappeared outside the usual /close flow:
// notifies the owner (with their transcript — the conversation lives in
// SQLite, so it survives the channel), writes the HTML archives, closes the
// record transactionally and reports to the staff log.
//
// silent=true skips the user-facing notice and transcript files for
// deletions the bot caused itself; the record is still archived quietly.
async function archiveDeletedTicket(client, ticket, { reason = 'Channel manually deleted.', silent = false } = {}) {
  const finalTicket = store.getByUserId(ticket.userId);
  if (!finalTicket) return false;

  store.addLog(finalTicket.userId, {
    type: 'system',
    authorName: 'System',
    content: `Ticket ended abnormally: ${reason}`
  });

  store.updateTicket(finalTicket.userId, { closedAt: new Date().toISOString() });

  const transcripts = silent
    ? { staffTranscript: null, userTranscript: null }
    : transcriptService.writeArchives(finalTicket);

  let notified = false;

  if (!silent) {
    const user = await client.users.fetch(finalTicket.userId).catch(() => null);

    if (user) {
      notified = await user.send({
        embeds: [embeds.ticketDeletedEmbed({ ticket: finalTicket })],
        files: [transcriptService.toAttachment(finalTicket, false)]
      }).then(() => true).catch(() => false);
    }
  }

  store.closeTicket(finalTicket.userId, {
    closedBy: null,
    reason,
    staffTranscript: transcripts.staffTranscript,
    userTranscript: transcripts.userTranscript
  });

  if (!silent) {
    const cause = reason.replace(/\.$/, '').toLowerCase();
    await logService.send(
      client,
      embeds.systemEmbed(
        `Ticket ${embeds.ticketNumberLabel(finalTicket.number)} (${cause}) — owner ${notified ? 'notified with transcript' : 'could not be reached'}.`,
        embeds.Colors.danger
      )
    );
  }

  logger.info(
    `Archived ticket #${finalTicket.number}: ${reason.toLowerCase()}${silent ? '' : notified ? '; owner notified.' : '; owner unreachable.'}`
  );

  return notified;
}

module.exports = { markBotSideDeletion, wasBotSideDeletion, sendClaimantLeftNotice, archiveDeletedTicket };
