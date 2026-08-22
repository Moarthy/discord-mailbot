const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const logger = require('../utils/logger');

class TicketStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { counter: 0, users: {}, channels: {}, archive: {}, blacklist: {} };
    this.init();
  }

  init() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.save();
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.data = {
        counter: parsed.counter ?? 0,
        users: parsed.users ?? {},
        channels: parsed.channels ?? {},
        archive: parsed.archive ?? {},
        blacklist: parsed.blacklist ?? {}
      };
    } catch (error) {
      logger.error('Could not parse ticket store; starting empty.', error);
      this.save();
      return;
    }

    // Backfill: older saves did not store userId inside the record.
    let dirty = false;
    for (const [userId, record] of Object.entries(this.data.users)) {
      if (record && !record.userId) {
        record.userId = userId;
        dirty = true;
      }
    }
    if (dirty) this.save();
  }

  save() {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  getByUserId(userId) {
    return this.data.users[userId] ?? null;
  }

  getByChannelId(channelId) {
    const userId = this.data.channels[channelId];
    return userId ? this.data.users[userId] ?? null : null;
  }

  getOpenTickets() {
    return Object.values(this.data.users);
  }

  createTicket({ userId, channelId, webhookId, webhookToken, guildId }) {
    this.data.counter += 1;

    const record = {
      userId,
      channelId,
      webhookId,
      webhookToken,
      guildId,
      number: this.data.counter,
      claimedBy: null,
      anonymous: false,
      headerMessageId: null,
      createdAt: new Date().toISOString(),
      log: [{ t: new Date().toISOString(), type: 'system', authorName: 'System', content: 'Ticket opened via DM.' }]
    };

    this.data.users[userId] = record;
    this.data.channels[channelId] = userId;
    this.save();
    return record;
  }

  updateTicket(userId, patch) {
    if (!this.data.users[userId]) return;
    Object.assign(this.data.users[userId], patch);
    this.save();
  }

  addLog(userId, entry) {
    const record = this.data.users[userId];
    if (!record) return;
    record.log.push({ t: new Date().toISOString(), ...entry });
    this.save();
  }

  setClaim(userId, memberId) {
    this.updateTicket(userId, { claimedBy: memberId });
  }

  setAnonymous(userId, value) {
    this.updateTicket(userId, { anonymous: value });
  }

  closeTicket(userId, { closedBy, reason, staffTranscript = null, userTranscript = null }) {
    const record = this.data.users[userId];
    if (!record) return null;

    record.closedAt = new Date().toISOString();
    record.closedBy = closedBy ?? null;
    record.reason = reason ?? '';
    record.feedback = null;
    record.messageCount = (record.log ?? []).length;
    record.staffTranscript = staffTranscript;
    record.userTranscript = userTranscript;

    // Logs are archived to HTML files at close time; keep the JSON small.
    delete record.log;

    this.data.archive[record.number] = record;
    delete this.data.users[userId];
    delete this.data.channels[record.channelId];
    this.save();
    return record;
  }

  getArchive(number) {
    return this.data.archive[number] ?? null;
  }

  listArchive() {
    return Object.values(this.data.archive);
  }

  setFeedback(number, text) {
    const record = this.data.archive[number];
    if (!record) return;
    record.feedback = text;
    record.feedbackAt = new Date().toISOString();
    this.save();
  }

  blacklistAdd(userId, { reason, byId }) {
    this.data.blacklist[userId] = {
      reason: reason || 'No reason provided.',
      byId,
      at: new Date().toISOString()
    };
    this.save();
  }

  blacklistRemove(userId) {
    delete this.data.blacklist[userId];
    this.save();
  }

  getBlacklist(userId) {
    return this.data.blacklist[userId] ?? null;
  }

  listBlacklist() {
    return Object.entries(this.data.blacklist).map(([userId, entry]) => ({ userId, ...entry }));
  }
}

module.exports = new TicketStore(config.dataFile);
