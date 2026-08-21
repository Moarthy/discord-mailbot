const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const pkg = require('../../package.json');
const config = require('../config');
const logger = require('../utils/logger');
const { isModerator } = require('../utils/permissions');

const STARTED_AT = Date.now();

// ---------------------------------------------------------------------------
// System / process metrics
// ---------------------------------------------------------------------------

function ramUsage() {
  const mem = process.memoryUsage();
  const systemTotal = os.totalmem();
  const systemFree = os.freemem();
  const systemUsed = systemTotal - systemFree;

  return {
    process: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers
    },
    system: {
      total: systemTotal,
      free: systemFree,
      used: systemUsed,
      usedPercent: systemTotal ? (systemUsed / systemTotal) * 100 : 0
    },
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    processUptime: process.uptime(),
    systemUptime: os.uptime()
  };
}

function projectStatus() {
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    node: process.version,
    pid: process.pid,
    startedAt: new Date(STARTED_AT).toISOString(),
    dataFile: config.dataFile,
    logDir: logger.logDir,
    configuration: {
      categoryId: config.categoryId,
      guildId: config.guildId,
      moderatorRoleConfigured: Boolean(config.moderatorRoleId),
      logChannelConfigured: Boolean(config.logChannelId),
      transcriptChannelConfigured: Boolean(config.transcriptChannelId),
      dashboardPort: config.dashboardPort,
      dashboardAuthEnabled: Boolean(config.dashboardToken)
    }
  };
}

function botStatus(client) {
  const ready = client.isReady();
  return {
    ready,
    wsStatus: ready ? client.ws.status : 'disconnected',
    pingMs: ready ? client.ws.ping : null,
    user: ready
      ? {
          id: client.user.id,
          tag: client.user.tag,
          username: client.user.username,
          avatar: client.user.displayAvatarURL({ size: 256 })
        }
      : null,
    guildCount: ready ? client.guilds.cache.size : 0,
    gatewayLatency: ready ? client.ws.ping : null
  };
}

// ---------------------------------------------------------------------------
// Discord data resolution
// ---------------------------------------------------------------------------

function resolveGuild(client) {
  if (!client.isReady()) return null;
  if (config.guildId) return client.guilds.cache.get(config.guildId) ?? null;

  for (const guild of client.guilds.cache.values()) {
    if (guild.channels.cache.has(config.categoryId)) return guild;
  }

  return client.guilds.cache.first() ?? null;
}

function memberProfile(member) {
  return {
    id: member.id,
    tag: member.user.tag,
    username: member.user.username,
    displayName: member.displayName,
    avatar: member.user.displayAvatarURL({ size: 256 }),
    bot: member.user.bot,
    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
    roles: member.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .map((role) => ({ id: role.id, name: role.name, color: role.hexColor }))
  };
}

// ---------------------------------------------------------------------------
// Aggregations over the ticket store
// ---------------------------------------------------------------------------

function collectClaims(store, client) {
  const claims = [];

  for (const ticket of store.getOpenTickets()) {
    if (!ticket.claimedBy) continue;
    claims.push({
      ticketNumber: ticket.number,
      userId: ticket.userId,
      channelId: ticket.channelId,
      moderatorId: ticket.claimedBy,
      claimedByName: resolveUserName(client, ticket.claimedBy),
      createdAt: ticket.createdAt,
      anonymous: Boolean(ticket.anonymous)
    });
  }

  return claims;
}

function resolveUserName(client, userId) {
  return client.users.cache.get(userId)?.tag ?? null;
}

function buildModerators(client, guild, store) {
  if (!guild) return [];

  const activeClaims = new Map();
  const totalClosures = new Map();

  for (const ticket of store.getOpenTickets()) {
    if (ticket.claimedBy) {
      activeClaims.set(ticket.claimedBy, (activeClaims.get(ticket.claimedBy) ?? 0) + 1);
    }
  }

  for (const ticket of Object.values(store.data.archive)) {
    if (ticket.closedBy) {
      totalClosures.set(ticket.closedBy, (totalClosures.get(ticket.closedBy) ?? 0) + 1);
    }
  }

  const moderators = [];

  for (const member of guild.members.cache.values()) {
    let isMod = false;
    try {
      isMod = isModerator(member);
    } catch {
      continue;
    }
    if (!isMod) continue;

    const id = member.id;
    moderators.push({
      ...memberProfile(member),
      activeClaims: activeClaims.get(id) ?? 0,
      totalClosedTickets: totalClosures.get(id) ?? 0
    });
  }

  return moderators.sort((a, b) => b.activeClaims - a.activeClaims || a.tag.localeCompare(b.tag));
}

function buildUsers(store, client) {
  const byId = new Map();

  for (const ticket of store.getOpenTickets()) {
    upsertUser(byId, ticket, client, 'open');
  }

  for (const ticket of Object.values(store.data.archive)) {
    upsertUser(byId, ticket, client, 'closed');
  }

  return [...byId.values()].sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''));
}

function upsertUser(byId, ticket, client, status) {
  const existing = byId.get(ticket.userId) ?? {
    id: ticket.userId,
    tag: null,
    username: null,
    avatar: null,
    openTickets: 0,
    closedTickets: 0,
    totalTickets: 0,
    blacklisted: false,
    lastActivity: null
  };

  const user = client.users.cache.get(ticket.userId);
  if (user) {
    existing.tag = user.tag;
    existing.username = user.username;
    existing.avatar = user.displayAvatarURL({ size: 256 });
  }

  if (status === 'open') existing.openTickets += 1;
  else existing.closedTickets += 1;
  existing.totalTickets += 1;

  const activity = ticket.closedAt ?? ticket.createdAt ?? null;
  if (activity && (!existing.lastActivity || activity > existing.lastActivity)) {
    existing.lastActivity = activity;
  }

  byId.set(ticket.userId, existing);
}

function buildTickets(store, client) {
  const tickets = [];

  for (const ticket of store.getOpenTickets()) {
    tickets.push(summarizeTicket(ticket, client, 'open'));
  }

  for (const ticket of Object.values(store.data.archive)) {
    tickets.push(summarizeTicket(ticket, client, 'closed'));
  }

  return tickets.sort((a, b) => b.number - a.number);
}

function summarizeTicket(ticket, client, status) {
  const createdAt = ticket.createdAt ? new Date(ticket.createdAt).getTime() : null;
  const closedAt = ticket.closedAt ? new Date(ticket.closedAt).getTime() : null;

  return {
    number: ticket.number,
    status,
    userId: ticket.userId,
    userName: resolveUserName(client, ticket.userId),
    channelId: ticket.channelId,
    claimedBy: ticket.claimedBy ?? null,
    claimedByName: ticket.claimedBy ? resolveUserName(client, ticket.claimedBy) : null,
    anonymous: Boolean(ticket.anonymous),
    createdAt: ticket.createdAt ?? null,
    closedAt: ticket.closedAt ?? null,
    durationMs: closedAt && createdAt ? closedAt - createdAt : (createdAt ? Date.now() - createdAt : null),
    reason: ticket.reason ?? null,
    feedback: ticket.feedback ?? null,
    feedbackAt: ticket.feedbackAt ?? null,
    messageCount: status === 'open' ? (ticket.log ?? []).length : (ticket.messageCount ?? 0),
    staffTranscript: ticket.staffTranscript ?? null,
    userTranscript: ticket.userTranscript ?? null
  };
}

// ---------------------------------------------------------------------------
// Single-ticket detail (includes the conversation for open tickets)
// ---------------------------------------------------------------------------

function ticketDetail(store, client, number) {
  const open = store.getOpenTickets().find((ticket) => ticket.number === number);
  if (open) {
    return {
      ...summarizeTicket(open, client, 'open'),
      conversation: open.log ?? [],
      guildId: open.guildId ?? null,
      webhookId: open.webhookId ?? null,
      headerMessageId: open.headerMessageId ?? null
    };
  }

  const archived = store.getArchive(number);
  if (!archived) return null;

  return {
    ...summarizeTicket(archived, client, 'closed'),
    conversation: [],
    hasTranscript: Boolean(archived.staffTranscript || archived.userTranscript),
    guildId: archived.guildId ?? null
  };
}

function readTranscript(number, { staff }) {
  const label = String(number).padStart(4, '0');
  const dir = path.join(path.dirname(config.dataFile), 'transcripts');
  const fileName = staff ? `ticket-${label}-staff.html` : `ticket-${label}.html`;
  const full = path.join(dir, fileName);

  if (!fs.existsSync(full)) return null;
  return { fileName, html: fs.readFileSync(full, 'utf8') };
}

// ---------------------------------------------------------------------------
// Full snapshot
// ---------------------------------------------------------------------------

function buildOverview(client, store) {
  const guild = resolveGuild(client);
  const openTickets = store.getOpenTickets();
  const archived = Object.values(store.data.archive);
  const moderators = buildModerators(client, guild, store);
  const claims = collectClaims(store, client);
  const users = buildUsers(store, client);

  return {
    generatedAt: new Date().toISOString(),
    status: botStatus(client),
    ram: ramUsage(),
    project: projectStatus(),
    counts: {
      openTickets: openTickets.length,
      archivedTickets: archived.length,
      totalTickets: openTickets.length + archived.length,
      moderators: moderators.length,
      activeClaims: claims.length,
      users: users.length,
      blacklisted: Object.keys(store.data.blacklist).length,
      transcriptFiles: countTranscriptFiles()
    },
    moderators,
    users,
    claims,
    tickets: buildTickets(store, client),
    logs: {
      entries: logger.getRecentLogs(200),
      audit: logger.getRecentAudit(200),
      latestSeq: logger.latestSeq(),
      files: { general: logger.generalFile, audit: logger.auditFile }
    }
  };
}

function countTranscriptFiles() {
  try {
    const dir = path.join(path.dirname(config.dataFile), 'transcripts');
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).filter((file) => file.endsWith('.html')).length;
  } catch {
    return 0;
  }
}

module.exports = {
  buildOverview,
  ticketDetail,
  readTranscript,
  ramUsage,
  botStatus,
  projectStatus
};
