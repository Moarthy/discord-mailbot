const path = require('node:path');
const { spawn } = require('node:child_process');
const { REST, Routes, ChannelType } = require('discord.js');

const config = require('../config');
const store = require('../store/ticketStore');
const logger = require('../utils/logger');
const embeds = require('../utils/embeds');
const ticketService = require('../services/ticketService');
const transcriptService = require('../services/transcriptService');
const logService = require('../services/logService');
const envFile = require('./envFile');
const { isModerator } = require('../utils/permissions');
const commands = require('../commands');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getGuild(client) {
  if (!config.categoryId) throw new Error('CATEGORY_ID is not configured.');
  const category = await client.channels.fetch(config.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('CATEGORY_ID does not point to a category channel.');
  }
  return category.guild;
}

// Resolves the operator (the Discord member acting through the dashboard) and
// enforces the same moderator requirement used by the slash commands.
async function resolveOperator(client, operatorId) {
  if (!operatorId) throw new Error('Select "You are" before performing actions.');
  const guild = await getGuild(client);
  const member = await guild.members.fetch(operatorId).catch(() => null);
  if (!member) throw new Error('Operator is not a member of the ModMail guild.');
  if (!isModerator(member)) throw new Error('Operator does not have staff permissions.');
  return member;
}

async function resolveClaimant(client, claimedBy) {
  if (!claimedBy) return null;
  const guild = await getGuild(client).catch(() => null);
  if (!guild) return null;
  const member = await guild.members.fetch(claimedBy).catch(() => null);
  return member ? member.displayName || member.user.username : null;
}

function requiredTicket(userId) {
  const ticket = store.getByUserId(userId);
  if (!ticket) throw new Error('Ticket not found.');
  return ticket;
}

// ---------------------------------------------------------------------------
// Status / read-only views
// ---------------------------------------------------------------------------

async function getStatus(client) {
  let categoryName = null;
  let guildName = null;

  if (config.categoryId && client.isReady()) {
    const category = await client.channels.fetch(config.categoryId).catch(() => null);
    if (category) {
      categoryName = category.name;
      guildName = category.guild?.name ?? null;
    }
  }

  return {
    ready: client.isReady(),
    botTag: client.user?.tag ?? null,
    botId: client.user?.id ?? null,
    categoryName,
    guildName,
    openTickets: store.getOpenTickets().length,
    archiveCount: Object.keys(store.data.archive).length,
    blacklistCount: Object.keys(store.data.blacklist).length,
    missingConfig: !config.token || !config.categoryId
  };
}

function getConfigView() {
  const current = envFile.read(config.envFile);
  return {
    tokenSet: Boolean(current.DISCORD_TOKEN),
    values: {
      DISCORD_TOKEN: '',
      CATEGORY_ID: current.CATEGORY_ID ?? '',
      GUILD_ID: current.GUILD_ID ?? '',
      MODERATOR_ROLE_ID: current.MODERATOR_ROLE_ID ?? '',
      LOG_CHANNEL_ID: current.LOG_CHANNEL_ID ?? '',
      TRANSCRIPT_CHANNEL_ID: current.TRANSCRIPT_CHANNEL_ID ?? '',
      DATA_FILE: current.DATA_FILE ?? '',
      WEB_HOST: current.WEB_HOST ?? '',
      WEB_PORT: current.WEB_PORT ?? ''
    }
  };
}

function saveConfig(values) {
  const updates = {};
  const current = envFile.read(config.envFile);

  for (const key of envFile.KEYS) {
    const value = String(values[key] ?? '').trim();
    if (key === 'DISCORD_TOKEN' && !value && current.DISCORD_TOKEN) continue; // keep token
    updates[key] = value;
  }

  envFile.write(config.envFile, updates);
  return { ok: true, restartRequired: true };
}

async function listOperators(client) {
  const guild = await getGuild(client);
  await guild.members.fetch().catch(() => {});

  const moderators = guild.members.cache.filter((m) => !m.user.bot && isModerator(m));
  const pool = moderators.size ? moderators : guild.members.cache.filter((m) => !m.user.bot);

  return [...pool.values()]
    .sort((a, b) => (a.displayName || a.user.username).localeCompare(b.displayName || b.user.username))
    .map((m) => ({
      id: m.id,
      name: m.displayName || m.user.username,
      username: m.user.username,
      avatar: m.user.displayAvatarURL({ size: 64 })
    }));
}

async function listTickets(client) {
  const tickets = await Promise.all(
    store.getOpenTickets().map(async (ticket) => ({
      number: ticket.number,
      userId: ticket.userId,
      userName: (await client.users.fetch(ticket.userId).catch(() => null))?.username ?? 'Unknown',
      claimedBy: ticket.claimedBy,
      claimedByName: await resolveClaimant(client, ticket.claimedBy),
      anonymous: ticket.anonymous,
      createdAt: ticket.createdAt,
      messageCount: (ticket.log ?? []).length
    }))
  );

  return tickets.sort((a, b) => a.number - b.number);
}

async function getTicketDetail(client, userId) {
  const ticket = requiredTicket(userId);
  const user = await client.users.fetch(userId).catch(() => null);

  return {
    number: ticket.number,
    userId: ticket.userId,
    userName: user?.username ?? 'Unknown',
    userTag: user?.tag ?? ticket.userId,
    avatar: user?.displayAvatarURL({ size: 128 }) ?? null,
    accountCreated: user?.createdAt ?? null,
    claimedBy: ticket.claimedBy,
    claimedByName: await resolveClaimant(client, ticket.claimedBy),
    anonymous: ticket.anonymous,
    createdAt: ticket.createdAt,
    channelId: ticket.channelId,
    log: ticket.log ?? []
  };
}

async function listArchive() {
  return Object.values(store.data.archive)
    .map((record) => ({
      number: record.number,
      userId: record.userId,
      closedAt: record.closedAt,
      closedBy: record.closedBy,
      reason: record.reason,
      feedback: record.feedback ?? null
    }))
    .sort((a, b) => a.number - b.number);
}

// ---------------------------------------------------------------------------
// Ticket actions
// ---------------------------------------------------------------------------

async function claim(client, { userId, operatorId }) {
  const member = await resolveOperator(client, operatorId);
  const ticket = requiredTicket(userId);

  if (ticket.claimedBy === operatorId) {
    store.setClaim(userId, null);
    await ticketService.refreshHeader(client, ticket);
    return { released: true };
  }

  if (ticket.claimedBy) {
    const guild = await getGuild(client);
    const claimant = await guild.members.fetch(ticket.claimedBy).catch(() => null);
    if (claimant) throw new Error('Ticket is already claimed by another staff member.');
  }

  store.setClaim(userId, operatorId);
  await ticketService.refreshHeader(client, ticket);
  return { claimed: true, by: member.displayName || member.user.username };
}

async function toggleAnonymous(client, { userId, operatorId }) {
  await resolveOperator(client, operatorId);
  const ticket = requiredTicket(userId);
  if (ticket.claimedBy !== operatorId) throw new Error('Only the claimant can toggle anonymous mode.');

  const value = !ticket.anonymous;
  store.setAnonymous(userId, value);
  await ticketService.refreshHeader(client, ticket);
  return { anonymous: value };
}

async function addNote(client, { userId, operatorId, text }) {
  const member = await resolveOperator(client, operatorId);
  const ticket = requiredTicket(userId);
  if (ticket.claimedBy !== operatorId) throw new Error('Only the claimant can add notes.');

  const content = String(text ?? '').trim();
  if (!content) throw new Error('Note cannot be empty.');

  const authorName = member.displayName || member.user.username;
  store.addLog(userId, { type: 'note', authorName, content });

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel) {
    await channel.send({ embeds: [embeds.noteEmbed(authorName, content, ticket)] }).catch(() => {});
  }

  return { ok: true };
}

async function reply(client, { userId, operatorId, text }) {
  const member = await resolveOperator(client, operatorId);
  const ticket = requiredTicket(userId);
  if (ticket.claimedBy !== operatorId) throw new Error('Only the claimant can reply to the user.');

  const content = String(text ?? '').trim();
  if (!content) throw new Error('Reply cannot be empty.');

  const anonymous = Boolean(ticket.anonymous);
  const senderName = anonymous ? 'Anonymous' : member.displayName || member.user.username;

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    await user
      .send({
        embeds: [
          embeds.staffReplyEmbed({
            senderName,
            iconURL: anonymous ? null : member.user.displayAvatarURL({ size: 256 }),
            content,
            anonymous
          })
        ]
      })
      .catch(() => {});
  }

  store.addLog(userId, {
    type: anonymous ? 'anon' : 'staff',
    authorName: senderName,
    content,
    attachments: []
  });

  return { ok: true };
}

async function close(client, { userId, operatorId, reason }) {
  const member = await resolveOperator(client, operatorId);
  const ticket = requiredTicket(userId);
  if (ticket.claimedBy !== operatorId) throw new Error('Only the claimant can close the ticket.');

  const closedByTag = member.user.tag;
  const reasonText = String(reason ?? '').trim();

  store.addLog(userId, {
    type: 'system',
    authorName: 'System',
    content: `Closed by ${closedByTag}${reasonText ? ` — ${reasonText}` : ''}`
  });

  const finalTicket = store.getByUserId(userId);
  const transcripts = transcriptService.writeArchives(finalTicket);

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    await user
      .send({
        embeds: [
          embeds.closeEmbed({ ticket: finalTicket, reason: reasonText, closedByTag }),
          embeds.feedbackPromptEmbed(finalTicket)
        ],
        components: [embeds.feedbackButton(finalTicket)],
        files: [transcriptService.toAttachment(finalTicket, false)]
      })
      .catch(() => {});
  }

  if (config.transcriptChannelId) {
    const transcriptChannel = await client.channels.fetch(config.transcriptChannelId).catch(() => null);
    if (transcriptChannel) {
      await transcriptChannel
        .send({
          embeds: [embeds.closeEmbed({ ticket: finalTicket, reason: reasonText, closedByTag })],
          files: [transcriptService.toAttachment(finalTicket, true)]
        })
        .catch(() => {});
    }
  }

  await logService.send(
    client,
    embeds.systemEmbed(
      `🔒 Ticket ${embeds.ticketNumberLabel(ticket.number)} closed by ${closedByTag}.`,
      embeds.Colors.danger
    )
  );

  store.closeTicket(userId, {
    closedBy: operatorId,
    reason: reasonText,
    staffTranscript: transcripts.staffTranscript,
    userTranscript: transcripts.userTranscript
  });

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel) {
    setTimeout(() => {
      channel.delete('Ticket closed.').catch((error) => logger.error('Failed to delete ticket channel.', error));
    }, 1500);
  }

  return { ok: true };
}

function transcriptAttachment(userId, includeNotes) {
  const ticket = requiredTicket(userId);
  const { attachment, name } = transcriptService.toAttachment(ticket, includeNotes);
  return { buffer: attachment, name, contentType: 'text/html; charset=utf-8' };
}

function archiveTranscript(number, includeNotes) {
  const record = store.getArchive(Number(number));
  if (!record) throw new Error('Archived ticket not found.');

  const fileName = includeNotes ? record.staffTranscript : record.userTranscript;
  if (!fileName) throw new Error('No transcript available for this ticket.');

  const dir = path.join(path.dirname(config.dataFile), 'transcripts');
  const fs = require('node:fs');
  const filePath = path.join(dir, fileName);

  if (!fs.existsSync(filePath)) throw new Error('Transcript file is missing from disk.');

  return {
    buffer: fs.readFileSync(filePath),
    name: fileName,
    contentType: 'text/html; charset=utf-8'
  };
}

// ---------------------------------------------------------------------------
// Blacklist
// ---------------------------------------------------------------------------

async function blacklistAdd(client, { userId, operatorId, reason }) {
  const member = await resolveOperator(client, operatorId);
  const guild = await getGuild(client);

  const target = await client.users.fetch(userId).catch(() => null);
  if (!target) throw new Error('User not found.');
  if (target.bot) throw new Error('Bots cannot be blacklisted.');
  if (target.id === guild.ownerId) throw new Error('The server owner cannot be blacklisted.');

  const targetMember = await guild.members.fetch(userId).catch(() => null);
  if (targetMember && isModerator(targetMember)) throw new Error('Staff members cannot be blacklisted.');

  const reasonText = String(reason ?? '').trim() || 'No reason provided.';
  store.blacklistAdd(userId, { reason: reasonText, byId: operatorId });

  await logService.send(
    client,
    embeds.systemEmbed(
      `⛔ ${target.tag} was blacklisted by ${member.user.tag}. Reason: ${reasonText}`,
      embeds.Colors.danger
    )
  );

  return { ok: true, tag: target.tag };
}

async function blacklistRemove(client, { userId, operatorId }) {
  const member = await resolveOperator(client, operatorId);
  const target = await client.users.fetch(userId).catch(() => null);

  store.blacklistRemove(userId);

  await logService.send(
    client,
    embeds.systemEmbed(
      `✅ ${target?.tag ?? userId} was removed from the blacklist by ${member.user.tag}.`,
      embeds.Colors.success
    )
  );

  return { ok: true };
}

function listBlacklist() {
  return store.listBlacklist();
}

// ---------------------------------------------------------------------------
// Deploy / restart
// ---------------------------------------------------------------------------

async function deployCommands(client) {
  if (!config.token) throw new Error('DISCORD_TOKEN is not configured.');
  if (!client.user) throw new Error('The bot has not logged in yet.');

  const body = Object.values(commands).map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);
  const appId = client.user.id;

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, config.guildId), { body });
    return { count: body.length, scope: 'guild' };
  }

  await rest.put(Routes.applicationCommands(appId), { body });
  return { count: body.length, scope: 'global' };
}

function restart() {
  const child = spawn(process.argv[0], process.argv.slice(1), {
    detached: true,
    stdio: 'inherit',
    cwd: process.cwd()
  });
  child.unref();

  // Let the replacement process spawn, then exit this one.
  setTimeout(() => process.exit(0), 100);
  return { ok: true };
}

module.exports = {
  getStatus,
  getConfigView,
  saveConfig,
  listOperators,
  listTickets,
  getTicketDetail,
  listArchive,
  claim,
  toggleAnonymous,
  addNote,
  reply,
  close,
  transcriptAttachment,
  archiveTranscript,
  blacklistAdd,
  blacklistRemove,
  listBlacklist,
  deployCommands,
  restart
};
