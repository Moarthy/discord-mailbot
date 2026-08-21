const logger = require('../utils/logger');

/**
 * Semantic wrapper around the durable audit log. Provides a consistent,
 * namespaced vocabulary for the sensitive/important events the bot records,
 * so every audit entry is structured, accurate and fully traceable.
 *
 * `actor`  — who performed the action: { id, tag }
 * `target` — what the action affected: { type, number, userId, ... }
 * `data`   — machine-readable supplementary detail.
 */

function audit(event, message, { severity = 'info', actor = null, target = null, data } = {}) {
  return logger.audit(event, { severity, actor, target, message, data });
}

module.exports = {
  audit,
  bot: {
    ready: (data) => audit('bot.ready', 'Bot connected to the Discord gateway.', { data }),
    loginFailed: (data) => audit('bot.login_failed', 'Bot failed to log in — check DISCORD_TOKEN.', {
      severity: 'critical', data
    }),
    shutdown: (data) => audit('bot.shutdown', 'Bot shutting down.', { severity: 'warn', data })
  },
  dashboard: {
    started: (data) => audit('dashboard.started', 'Web dashboard started.', { data }),
    stopped: (data) => audit('dashboard.stopped', 'Web dashboard stopped.', { data })
  },
  process: {
    unhandledRejection: (data) => audit('process.unhandled_rejection', 'Unhandled promise rejection.', {
      severity: 'critical', data
    }),
    uncaughtException: (data) => audit('process.uncaught_exception', 'Uncaught exception.', {
      severity: 'critical', data
    })
  },
  ticket: {
    opened: (ticket) => audit('ticket.opened', `Ticket #${ticket.number} opened.`, {
      target: { type: 'ticket', number: ticket.number, userId: ticket.userId },
      data: { userId: ticket.userId, channelId: ticket.channelId, guildId: ticket.guildId }
    }),
    recovered: (ticket) => audit('ticket.recovered', `Ticket #${ticket.number} recovered from an orphaned channel.`, {
      severity: 'warn',
      target: { type: 'ticket', number: ticket.number, userId: ticket.userId },
      data: { userId: ticket.userId, channelId: ticket.channelId }
    }),
    claimed: (ticket, actor) => audit('ticket.claimed', `Ticket #${ticket.number} claimed by ${actor.tag}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }
    }),
    released: (ticket, actor) => audit('ticket.released', `Ticket #${ticket.number} released by ${actor.tag}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }
    }),
    takeover: (ticket, actor) => audit('ticket.takeover', `Ticket #${ticket.number} taken over by ${actor.tag}.`, {
      severity: 'warn', actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }
    }),
    closed: (ticket, actor, data) => audit('ticket.closed', `Ticket #${ticket.number} closed by ${actor.tag}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }, data
    }),
    channelDeleted: (ticket, data) => audit('ticket.channel_deleted', `Ticket #${ticket.number} archived after its channel was manually deleted.`, {
      severity: 'warn', target: { type: 'ticket', number: ticket.number, userId: ticket.userId }, data
    }),
    claimReleasedByLeave: (ticket, data) => audit('ticket.claim_released_leave', `Claim on ticket #${ticket.number} released (claimant left the server).`, {
      severity: 'warn', target: { type: 'ticket', number: ticket.number, userId: ticket.userId }, data
    }),
    archivedAtStartup: (ticket, data) => audit('ticket.archived_startup', `Ticket #${ticket.number} archived at startup (channel missing).`, {
      severity: 'warn', target: { type: 'ticket', number: ticket.number, userId: ticket.userId }, data
    }),
    orphanChannelRemoved: (data) => audit('ticket.orphan_channel_removed', 'Orphaned ticket channel removed at startup.', {
      severity: 'warn', data
    }),
    anonToggled: (ticket, actor, data) => audit('ticket.anon_toggled', `Anonymous replies ${data.value ? 'ON' : 'OFF'} for ticket #${ticket.number}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }, data
    }),
    noteAdded: (ticket, actor) => audit('ticket.note_added', `Internal note added to ticket #${ticket.number} by ${actor.tag}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }
    }),
    feedbackReceived: (ticket, actor) => audit('ticket.feedback_received', `Feedback received on ticket #${ticket.number}.`, {
      actor, target: { type: 'ticket', number: ticket.number, userId: ticket.userId }
    }),
    blockedUserRefused: (data) => audit('ticket.blocked_user_refused', 'Blocked user attempted to contact ModMail.', {
      severity: 'warn', data
    })
  },
  blacklist: {
    added: (actor, data) => audit('blacklist.added', `${data.targetTag} was blacklisted by ${actor.tag}.`, {
      severity: 'warn', actor, data
    }),
    removed: (actor, data) => audit('blacklist.removed', `${data.targetTag} was removed from the blacklist by ${actor.tag}.`, {
      actor, data
    })
  }
};
