/**
 * Local web dashboard service.
 *
 * `--dashboard` spins up a tiny zero-dependency HTTP server that renders a
 * live dashboard for the ModMail team: ticket moderator count, active
 * tickets, bot uptime, plus a stack of extra statistics. The server only
 * listens on the machine running the bot (127.0.0.1 by default) and every
 * request is protected by a random per-session token so nothing is exposed
 * to the network.
 *
 * Lifecycle is owned by this singleton: start() boots the server, stop()
 * shuts it down (the Close button on the Discord message), restart() boots
 * a fresh session. Live browsers are fed updates over Server-Sent Events.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');

const config = require('../config');
const store = require('../store/ticketStore');
const logger = require('../utils/logger');
const { isModerator } = require('../utils/permissions');
const { durationHuman } = require('../utils/time');

const PUBLIC_DIR = path.join(__dirname, '..', 'dashboard', 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const MAX_PORT_TRIES = 50;

/** @type {import('node:http').Server | null} */
let server = null;

/** @type {{ token: string, port: number, url: string, startedAt: string, statusMessageId: string|null, statusChannelId: string|null } | null} */
let state = null;

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

let statsTimer = null;

// Guild member lists don't change every second; cache the fetch briefly.
let membersCache = { at: 0, promise: null };

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Boots (or reuses) the local dashboard server.
 * @returns {Promise<{ alreadyRunning: boolean, url: string, port: number, token: string, startedAt: string }>}
 */
async function start(client) {
  if (server) {
    return { alreadyRunning: true, ...snapshot() };
  }

  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const token = crypto.randomBytes(16).toString('hex');
  let port = config.dashboardPort;
  let bound = null;

  // Try the configured port, then bump until we find a free one.
  for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt += 1) {
    bound = await listenOn(port, token, html, client).catch(() => null);
    if (bound) break;
    port += 1;
  }

  if (!bound) {
    throw new Error(`Could not bind the dashboard to any port ${config.dashboardPort}–${config.dashboardPort + MAX_PORT_TRIES}.`);
  }

  const displayHost = config.dashboardHost === '0.0.0.0' ? '127.0.0.1' : config.dashboardHost;
  const url = `http://${displayHost}:${port}/?token=${token}`;

  server = bound.server;
  state = {
    token,
    port,
    url,
    startedAt: new Date().toISOString(),
    statusMessageId: null,
    statusChannelId: null
  };

  // Push fresh stats to every connected browser every few seconds.
  statsTimer = setInterval(() => {
    if (sseClients.size === 0) return;
    computeStats(client).then(broadcast).catch(() => {});
  }, 4000);
  statsTimer.unref();

  logger.info(`Dashboard started at ${url}`);

  return { alreadyRunning: false, ...snapshot() };
}

function listenOn(port, token, html, client) {
  return new Promise((resolve, reject) => {
    const candidate = http.createServer(createHandler(client, html));
    candidate.once('error', reject);
    candidate.listen(port, config.dashboardHost, () => {
      candidate.removeListener('error', reject);
      resolve({ server: candidate, port });
    });
  });
}

/**
 * Shuts the dashboard server down. Optionally updates the pinned Discord
 * status message so the button row reflects the closed state.
 * @returns {Promise<boolean>} true if a server was actually stopped.
 */
async function stop(reason = 'Closed from Discord.', client = null) {
  const closed = Boolean(server);

  if (server) {
    for (const res of sseClients) {
      try { res.end(); } catch { /* ignore */ }
    }
    sseClients.clear();

    if (statsTimer) clearInterval(statsTimer);
    statsTimer = null;

    // Drop idle keep-alive connections so close() resolves immediately.
    server.closeIdleConnections?.();
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }

  const finalState = state;
  state = null;
  membersCache = { at: 0, promise: null };

  logger.info(`Dashboard stopped: ${reason}`);

  if (closed && client && finalState?.statusMessageId) {
    await updateStatusMessage(client, {
      closed: true,
      reason,
      url: finalState.url,
      startedAt: finalState.startedAt,
      channelId: finalState.statusChannelId,
      messageId: finalState.statusMessageId
    }).catch(() => {});
  }

  return closed;
}

async function restart(client) {
  await stop('Restarted from Discord.', null);
  return start(client);
}

function isRunning() {
  return Boolean(server);
}

function snapshot() {
  return {
    url: state?.url ?? null,
    port: state?.port ?? null,
    token: state?.token ?? null,
    startedAt: state?.startedAt ?? null,
    statusMessageId: state?.statusMessageId ?? null
  };
}

function attachStatusMessage(message) {
  if (!state) return;
  state.statusMessageId = message.id;
  state.statusChannelId = message.channelId;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

function fetchGuildMembers(client) {
  const now = Date.now();
  if (membersCache.promise && now - membersCache.at < 30_000) {
    return membersCache.promise;
  }

  const promise = (async () => {
    const category = await client.channels.fetch(config.categoryId).catch(() => null);
    const guild = category?.guild ?? null;
    if (!guild) return { guild: null, members: [] };
    await guild.members.fetch().catch(() => {});
    return { guild, members: [...guild.members.cache.values()] };
  })();

  membersCache = { at: now, promise };
  return promise;
}

async function computeStats(client) {
  const open = store.getOpenTickets() ?? [];
  const archive = store.listArchive() ?? [];
  const now = Date.now();

  const { guild, members } = await fetchGuildMembers(client);

  // "Ticket moderators" = staff who can actually work tickets today:
  // members holding the moderator role / admin-style permissions.
  const moderatorCount = members.filter((member) => !member.user.bot && isModerator(member)).length;

  // Plus the people who have actually handled tickets at some point.
  const handlers = new Set();
  for (const ticket of open) if (ticket.claimedBy) handlers.add(ticket.claimedBy);
  for (const ticket of archive) if (ticket.closedBy) handlers.add(ticket.closedBy);

  const claimed = open.filter((ticket) => ticket.claimedBy).length;
  const unclaimed = open.length - claimed;

  const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(now);
  const allTickets = [...open, ...archive];
  const openedToday = allTickets.filter((t) => startOfDay(new Date(t.createdAt)) === today).length;
  const openedThisWeek = allTickets.filter((t) => startOfDay(new Date(t.createdAt)) >= today - 6 * 86_400_000).length;

  const perDay = [];
  for (let i = 13; i >= 0; i -= 1) {
    const dayStart = today - i * 86_400_000;
    const dayEnd = dayStart + 86_400_000;
    const count = allTickets.filter((ticket) => {
      const ts = new Date(ticket.createdAt).getTime();
      return ts >= dayStart && ts < dayEnd;
    }).length;
    perDay.push({ day: new Date(dayStart).toISOString().slice(5, 10), count });
  }

  const handlerCounts = new Map();
  for (const ticket of open) {
    if (ticket.claimedBy) {
      handlerCounts.set(ticket.claimedBy, (handlerCounts.get(ticket.claimedBy) ?? 0) + 1);
    }
  }
  const topHandlers = [...handlerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id, count }));

  // Resolve names for the queue + leaderboard (cached by discord.js).
  const resolveUser = (id) =>
    client.users.fetch(id).then((u) => u.tag).catch(() => null);

  const queue = await Promise.all(open
    .sort((a, b) => b.number - a.number)
    .map(async (ticket) => ({
      number: ticket.number,
      userId: ticket.userId,
      userTag: await resolveUser(ticket.userId),
      claimedBy: ticket.claimedBy ?? null,
      claimantTag: ticket.claimedBy ? await resolveUser(ticket.claimedBy) : null,
      anonymous: Boolean(ticket.anonymous),
      messages: (ticket.log ?? []).length,
      openedAt: ticket.createdAt
    })));

  const topHandlersResolved = await Promise.all(topHandlers
    .map(async ({ id, count }) => ({ id, tag: await resolveUser(id), count })));

  const activity = [];
  for (const ticket of open) {
    for (const entry of ticket.log ?? []) {
      activity.push({
        t: entry.t,
        type: entry.type,
        authorName: entry.authorName ?? 'Unknown',
        content: String(entry.content ?? '').slice(0, 90),
        ticketNumber: ticket.number
      });
    }
  }
  activity.sort((a, b) => new Date(b.t) - new Date(a.t));

  const uptimeMs = client.uptime ?? process.uptime() * 1000;

  return {
    generatedAt: new Date().toISOString(),
    guildName: guild?.name ?? null,
    guildId: guild?.id ?? null,
    bot: {
      tag: client.user?.tag ?? null,
      id: client.user?.id ?? null,
      avatarURL: client.user?.displayAvatarURL?.({ size: 128 }) ?? null
    },
    latency: client.ws?.ping ?? null,
    moderators: { count: moderatorCount, uniqueHandlers: handlers.size },
    tickets: {
      open: open.length,
      claimed,
      unclaimed,
      archived: archive.length,
      openedToday,
      openedThisWeek,
      perDay,
      topHandlers: topHandlersResolved,
      queue
    },
    blacklist: { count: store.listBlacklist().length },
    uptime: {
      ms: uptimeMs,
      human: durationHuman(uptimeMs),
      bootedAt: new Date(Date.now() - uptimeMs).toISOString()
    },
    activity: activity.slice(0, 10)
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function createHandler(client, html) {
  return (req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    } catch {
      return json(res, 400, { error: 'bad request' });
    }

    const token = url.searchParams.get('token');
    if (token !== state?.token) {
      if (url.pathname === '/') {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('<!doctype html><meta charset="utf-8"><title>403</title><body style="background:#111;color:#eee;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1 style="margin:0">🔒 403</h1><p>This dashboard is private.<br>Run <code>--dashboard</code> in Discord to get a valid link.</p></div>');
      }
      return json(res, 403, { error: 'forbidden' });
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/api/stats') {
      return computeStats(client)
        .then((stats) => json(res, 200, stats))
        .catch((error) => json(res, 500, { error: error.message }));
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      return handleSSE(req, res, client);
    }

    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><meta charset="utf-8"><title>Closed</title><body style="background:#111;color:#eee;font-family:system-ui;display:grid;place-items:center;min-height:100vh"><div style="text-align:center"><h1>⏹ Dashboard closed</h1><p>You can close this tab. Use <code>--dashboard</code> in Discord to start a new session.</p>');
      setTimeout(() => stop('Closed from the dashboard page.', client), 300);
      return null;
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      return res.end();
    }

    return json(res, 404, { error: 'not found' });
  };
}

function handleSSE(req, res, client) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 4000\n\n');

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));

  // Push a snapshot immediately so the page paints instantly.
  computeStats(client)
    .then((stats) => writeSSE(res, stats))
    .catch(() => {});
}

function writeSSE(res, stats) {
  try {
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  } catch {
    sseClients.delete(res);
  }
}

function broadcast(stats) {
  for (const res of sseClients) writeSSE(res, stats);
}

// ---------------------------------------------------------------------------
// Discord message helpers (embed + buttons)
// ---------------------------------------------------------------------------

function buildDashboardEmbed({ url, startedAt, closed = false, reason = null }) {
  if (closed) {
    return new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('⏹ Dashboard closed')
      .setDescription(
        `The local web dashboard has been shut down${reason ? ` — ${reason}` : '.'}\n\n` +
        'Run `--dashboard` again to boot a fresh session.'
      )
      .setFooter({
        text: startedAt
          ? `Session was up for ${durationHuman(Date.now() - new Date(startedAt).getTime())}`
          : 'No active session'
      })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 ModMail Control Dashboard')
    .setDescription(
      '🟢 **Dashboard is LIVE** and listening locally on this machine.\n' +
      `\`${url}\``
    )
    .addFields(
      { name: '🛡 Ticket moderators', value: '…', inline: true },
      { name: '🎫 Active tickets', value: '…', inline: true },
      { name: '⏱ Bot uptime', value: '…', inline: true }
    )
    .setFooter({ text: `Session started ${durationHuman(Date.now() - new Date(startedAt).getTime())} ago` })
    .setTimestamp();
}

async function buildLiveEmbed(client, { url, startedAt }) {
  const stats = await computeStats(client);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 ModMail Control Dashboard')
    .setDescription(
      '🟢 **Dashboard is LIVE** and listening locally on this machine.\n' +
      `\`${url}\``
    )
    .addFields(
      {
        name: '🛡 Ticket moderators',
        value: `**${stats.moderators.count}** in this guild · **${stats.moderators.uniqueHandlers}** have handled tickets`,
        inline: true
      },
      {
        name: '🎫 Active tickets',
        value: `**${stats.tickets.open}** open · ${stats.tickets.claimed} claimed / ${stats.tickets.unclaimed} unclaimed`,
        inline: true
      },
      {
        name: '⏱ Bot uptime',
        value: `**${stats.uptime.human}**${stats.latency != null ? ` · 🌐 ${stats.latency}ms` : ''}`,
        inline: true
      },
      {
        name: '📦 Closed tickets',
        value: String(stats.tickets.archived),
        inline: true
      },
      {
        name: '🚀 Opened today',
        value: `${stats.tickets.openedToday} (${stats.tickets.openedThisWeek} this week)`,
        inline: true
      },
      {
        name: '⛔ Blacklisted',
        value: String(stats.blacklist.count),
        inline: true
      }
    )
    .setFooter({ text: `Session started ${durationHuman(Date.now() - new Date(startedAt).getTime())} ago · stats live` })
    .setTimestamp();

  return embed;
}

function buildDashboardButtons({ url, running }) {
  const buttons = [];

  // The link button only makes sense while a live session exists.
  if (url) {
    buttons.push(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(url)
        .setLabel('Open dashboard')
        .setEmoji('📊')
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId('dashboard:refresh')
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setDisabled(!running),
    new ButtonBuilder()
      .setCustomId('dashboard:restart')
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Restart')
      .setEmoji('♻️')
      .setDisabled(!running),
    new ButtonBuilder()
      .setCustomId('dashboard:close')
      .setStyle(ButtonStyle.Danger)
      .setLabel('Close')
      .setEmoji('⏹')
      .setDisabled(!running)
  );

  return new ActionRowBuilder().addComponents(buttons);
}

async function updateStatusMessage(client, { closed, reason = null, url, startedAt, channelId, messageId }) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  if (closed) {
    await message.edit({
      embeds: [buildDashboardEmbed({ url, startedAt, closed: true, reason })],
      components: [buildDashboardButtons({ url, running: false })]
    });
  } else {
    const embed = await buildLiveEmbed(client, { url, startedAt });
    await message.edit({
      embeds: [embed],
      components: [buildDashboardButtons({ url, running: true })]
    });
  }
}

// ---------------------------------------------------------------------------
// Button interactions (dashboard:*)
// ---------------------------------------------------------------------------

async function handleButton(interaction) {
  if (interaction.user.id !== config.dashboardOwnerId) {
    return interaction.reply({
      content: '⛔ Only the bot owner can control the dashboard.',
      flags: MessageFlags.Ephemeral
    });
  }

  const action = interaction.customId.split(':')[1];
  const client = interaction.client;

  if (action === 'refresh') {
    if (!server) {
      await interaction.update({
        embeds: [buildDashboardEmbed({ url: state?.url, startedAt: state?.startedAt, closed: true })],
        components: [buildDashboardButtons({ url: state?.url, running: false })]
      });
      return interaction.followUp({ content: 'The dashboard is not running.', flags: MessageFlags.Ephemeral });
    }

    const embed = await buildLiveEmbed(client, snapshot());
    await interaction.update({
      embeds: [embed],
      components: [buildDashboardButtons({ url: state.url, running: true })]
    });
    computeStats(client).then(broadcast).catch(() => {});
    return interaction.followUp({ content: '🔄 Stats refreshed.', flags: MessageFlags.Ephemeral });
  }

  if (action === 'restart') {
    if (!server) {
      await interaction.update({
        embeds: [buildDashboardEmbed({ url: state?.url, startedAt: state?.startedAt, closed: true })],
        components: [buildDashboardButtons({ url: state?.url, running: false })]
      });
      return interaction.followUp({ content: 'The dashboard is not running — use `--dashboard`.', flags: MessageFlags.Ephemeral });
    }

    const result = await restart(client);
    const embed = await buildLiveEmbed(client, result);
    await interaction.update({
      embeds: [embed],
      components: [buildDashboardButtons({ url: result.url, running: true })]
    });
    return interaction.followUp({
      content: `♻️ Dashboard restarted.\n\`${result.url}\``,
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'close') {
    const wasRunning = Boolean(server);
    const url = state?.url ?? null;
    const startedAt = state?.startedAt ?? null;

    await stop(wasRunning ? 'Closed from Discord.' : 'Already shut down.', null);

    await interaction.update({
      embeds: [buildDashboardEmbed({ url, startedAt, closed: true, reason: 'Closed from Discord.' })],
      components: [buildDashboardButtons({ url, running: false })]
    });

    return interaction.followUp({
      content: wasRunning ? '⏹ Dashboard closed.' : 'The dashboard was already closed.',
      flags: MessageFlags.Ephemeral
    });
  }

  return null;
}

module.exports = {
  start,
  stop,
  restart,
  isRunning,
  computeStats,
  snapshot,
  attachStatusMessage,
  buildDashboardEmbed,
  buildLiveEmbed,
  buildDashboardButtons,
  handleButton
};
