const fs = require('node:fs');
const path = require('node:path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  throw new Error(
    'node:sqlite is unavailable. The ticket store needs Node.js v22.13+ / v23.4+ (built-in SQLite).'
  );
}

const config = require('../config');
const logger = require('../utils/logger');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tickets (
    user_id           TEXT PRIMARY KEY,
    channel_id        TEXT NOT NULL UNIQUE,
    webhook_id        TEXT,
    webhook_token     TEXT,
    guild_id          TEXT,
    number            INTEGER NOT NULL UNIQUE,
    claimed_by        TEXT,
    anonymous         INTEGER NOT NULL DEFAULT 0,
    header_message_id TEXT,
    created_at        TEXT NOT NULL,
    log               TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS archive (
    number INTEGER PRIMARY KEY,
    data   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blacklist (
    user_id TEXT PRIMARY KEY,
    reason  TEXT NOT NULL,
    by_id   TEXT,
    at      TEXT NOT NULL
  );
`;

function rowToTicket(row) {
  const record = {
    userId: row.user_id,
    channelId: row.channel_id,
    webhookId: row.webhook_id,
    webhookToken: row.webhook_token,
    guildId: row.guild_id,
    number: Number(row.number),
    claimedBy: row.claimed_by,
    anonymous: Boolean(row.anonymous),
    headerMessageId: row.header_message_id,
    createdAt: row.created_at,
    log: []
  };
  try {
    const parsed = JSON.parse(row.log);
    if (Array.isArray(parsed)) record.log = parsed;
  } catch {
    record.log = [];
  }
  return record;
}

class TicketStore {
  constructor(dbPath, legacyJsonPath) {
    this.dbPath = dbPath;
    this.tickets = new Map();
    this.byChannel = new Map();
    this.blacklist = new Map();
    this.counter = 0;

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec(SCHEMA);

    this.stmtUpsertTicket = this.db.prepare(`
      INSERT INTO tickets
        (user_id, channel_id, webhook_id, webhook_token, guild_id, number, claimed_by, anonymous, header_message_id, created_at, log)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        webhook_id = excluded.webhook_id,
        webhook_token = excluded.webhook_token,
        guild_id = excluded.guild_id,
        number = excluded.number,
        claimed_by = excluded.claimed_by,
        anonymous = excluded.anonymous,
        header_message_id = excluded.header_message_id,
        created_at = excluded.created_at,
        log = excluded.log
    `);
    this.stmtDeleteTicket = this.db.prepare('DELETE FROM tickets WHERE user_id = ?');
    this.stmtInsertArchive = this.db.prepare('INSERT OR REPLACE INTO archive (number, data) VALUES (?, ?)');
    this.stmtUpdateArchive = this.db.prepare('UPDATE archive SET data = ? WHERE number = ?');
    this.stmtGetArchive = this.db.prepare('SELECT data FROM archive WHERE number = ?');
    this.stmtSetCounter = this.db.prepare(`
      INSERT INTO meta (key, value) VALUES ('counter', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    this.stmtBlacklistUpsert = this.db.prepare(`
      INSERT INTO blacklist (user_id, reason, by_id, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET reason = excluded.reason, by_id = excluded.by_id, at = excluded.at
    `);
    this.stmtBlacklistDelete = this.db.prepare('DELETE FROM blacklist WHERE user_id = ?');

    this.loadFromDb();

    if (legacyJsonPath && fs.existsSync(legacyJsonPath)) {
      this.migrateLegacy(legacyJsonPath);
    }

    logger.info(
      `Store ready (${this.dbPath}): ${this.tickets.size} open, ${this.countArchive()} archived, ${this.blacklist.size} blacklisted.`
    );
  }

  loadFromDb() {
    const counterRow = this.db.prepare("SELECT value FROM meta WHERE key = 'counter'").get();
    if (counterRow) this.counter = Number(counterRow.value) || 0;

    this.tickets.clear();
    this.byChannel.clear();
    for (const row of this.db.prepare('SELECT * FROM tickets').all()) {
      const record = rowToTicket(row);
      this.tickets.set(record.userId, record);
      this.byChannel.set(record.channelId, record.userId);
    }

    this.blacklist.clear();
    for (const row of this.db.prepare('SELECT * FROM blacklist').all()) {
      this.blacklist.set(row.user_id, { reason: row.reason, byId: row.by_id, at: row.at });
    }
  }

  countArchive() {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM archive').get().n);
  }

  // One-time import of the legacy JSON store. The file is renamed (never
  // deleted) after a successful import; a corrupt file is backed up instead
  // of being silently discarded.
  migrateLegacy(jsonPath) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      const backup = `${jsonPath}.corrupt-${Date.now()}`;
      fs.renameSync(jsonPath, backup);
      logger.error(`Legacy store ${jsonPath} is unreadable; moved to ${backup} and ignored.`, error);
      return;
    }

    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (parsed.counter != null) {
        this.counter = Number(parsed.counter) || 0;
        this.stmtSetCounter.run(String(this.counter));
      }

      for (const [userId, raw] of Object.entries(parsed.users ?? {})) {
        if (!raw?.channelId || !raw?.userId) continue;
        const number = Number.isFinite(raw.number) ? raw.number : ++this.counter;
        this.stmtUpsertTicket.run(
          raw.userId,
          raw.channelId,
          raw.webhookId ?? null,
          raw.webhookToken ?? null,
          raw.guildId ?? null,
          number,
          raw.claimedBy ?? null,
          raw.anonymous ? 1 : 0,
          raw.headerMessageId ?? null,
          raw.createdAt ?? new Date().toISOString(),
          JSON.stringify(Array.isArray(raw.log) ? raw.log : [])
        );
      }

      for (const [number, raw] of Object.entries(parsed.archive ?? {})) {
        const numeric = Number(number);
        if (!Number.isFinite(numeric)) continue;
        const { log: _dropped, ...rest } = raw;
        this.stmtInsertArchive.run(numeric, JSON.stringify(rest));
      }

      for (const [userId, entry] of Object.entries(parsed.blacklist ?? {})) {
        this.stmtBlacklistUpsert.run(
          userId,
          entry?.reason || 'No reason provided.',
          entry?.byId ?? null,
          entry?.at ?? new Date().toISOString()
        );
      }

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    this.loadFromDb();

    const backup = `${jsonPath}.imported-${Date.now()}`;
    fs.renameSync(jsonPath, backup);
    logger.info(`Migrated legacy store ${jsonPath} into SQLite; original kept as ${backup}.`);
  }

  persist(record) {
    this.stmtUpsertTicket.run(
      record.userId,
      record.channelId,
      record.webhookId ?? null,
      record.webhookToken ?? null,
      record.guildId ?? null,
      record.number,
      record.claimedBy ?? null,
      record.anonymous ? 1 : 0,
      record.headerMessageId ?? null,
      record.createdAt,
      JSON.stringify(record.log)
    );
  }

  getByUserId(userId) {
    return this.tickets.get(userId) ?? null;
  }

  getByChannelId(channelId) {
    const userId = this.byChannel.get(channelId);
    return userId ? this.tickets.get(userId) ?? null : null;
  }

  getOpenTickets() {
    return Array.from(this.tickets.values());
  }

  createTicket({ userId, channelId, webhookId, webhookToken, guildId }) {
    if (this.tickets.has(userId)) return this.tickets.get(userId);

    this.counter += 1;
    this.stmtSetCounter.run(String(this.counter));

    const now = new Date().toISOString();
    const record = {
      userId,
      channelId,
      webhookId: webhookId ?? null,
      webhookToken: webhookToken ?? null,
      guildId: guildId ?? null,
      number: this.counter,
      claimedBy: null,
      anonymous: false,
      headerMessageId: null,
      createdAt: now,
      log: [{ t: now, type: 'system', authorName: 'System', content: 'Ticket opened via DM.' }]
    };

    this.persist(record);
    this.tickets.set(userId, record);
    this.byChannel.set(channelId, userId);
    return record;
  }

  updateTicket(userId, patch) {
    const record = this.tickets.get(userId);
    if (!record) return;
    Object.assign(record, patch);
    this.persist(record);
  }

  addLog(userId, entry) {
    const record = this.tickets.get(userId);
    if (!record) return;
    record.log.push({ t: new Date().toISOString(), ...entry });
    this.persist(record);
  }

  setClaim(userId, memberId) {
    this.updateTicket(userId, { claimedBy: memberId });
  }

  setAnonymous(userId, value) {
    this.updateTicket(userId, { anonymous: Boolean(value) });
  }

  closeTicket(userId, { closedBy, reason, staffTranscript = null, userTranscript = null } = {}) {
    const record = this.tickets.get(userId);
    if (!record) return null;

    const closedAt = record.closedAt ?? new Date().toISOString();
    const messageCount = Array.isArray(record.log) ? record.log.length : 0;

    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.stmtInsertArchive.run(
        record.number,
        JSON.stringify({
          userId: record.userId,
          channelId: record.channelId,
          webhookId: record.webhookId,
          webhookToken: record.webhookToken,
          guildId: record.guildId,
          number: record.number,
          claimedBy: record.claimedBy,
          anonymous: record.anonymous,
          headerMessageId: record.headerMessageId,
          createdAt: record.createdAt,
          closedAt,
          closedBy: closedBy ?? null,
          reason: reason ?? '',
          feedback: null,
          messageCount,
          staffTranscript: staffTranscript ?? null,
          userTranscript: userTranscript ?? null
        })
      );
      this.stmtDeleteTicket.run(userId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    this.tickets.delete(userId);
    this.byChannel.delete(record.channelId);

    return this.getArchive(record.number);
  }

  getArchive(number) {
    const numeric = Number(number);
    if (!Number.isFinite(numeric)) return null;
    const row = this.stmtGetArchive.get(numeric);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch (error) {
      logger.error(`Archived ticket #${numeric} has corrupt metadata.`, error);
      return null;
    }
  }

  setFeedback(number, text) {
    const numeric = Number(number);
    const record = this.getArchive(numeric);
    if (!record) return;

    record.feedback = text;
    record.feedbackAt = new Date().toISOString();
    this.stmtUpdateArchive.run(JSON.stringify(record), numeric);
  }

  blacklistAdd(userId, { reason, byId }) {
    const entry = {
      reason: reason || 'No reason provided.',
      byId: byId ?? null,
      at: new Date().toISOString()
    };
    this.stmtBlacklistUpsert.run(userId, entry.reason, entry.byId, entry.at);
    this.blacklist.set(userId, entry);
  }

  blacklistRemove(userId) {
    this.stmtBlacklistDelete.run(userId);
    this.blacklist.delete(userId);
  }

  getBlacklist(userId) {
    return this.blacklist.get(userId) ?? null;
  }

  listBlacklist() {
    return Array.from(this.blacklist.entries()).map(([userId, entry]) => ({ userId, ...entry }));
  }

  close() {
    try {
      this.db.close();
    } catch (error) {
      logger.warn('Error while closing the database.', error);
    }
  }
}

module.exports = new TicketStore(config.dbFile, config.legacyDataFile);
module.exports.TicketStore = TicketStore;
