const fs = require('node:fs');
const path = require('node:path');

/**
 * Structured, durable logging for ModMail.
 *
 * Two streams are persisted to disk under `logs/`:
 *   - bot.log   : general application logs (debug/info/warn/error)
 *   - audit.log : sensitive / important events (claims, closes, blacklists, ...)
 *
 * Reliability guarantees:
 *   - Every entry is assigned a monotonically increasing sequence number and an
 *     ISO-8601 timestamp before it is emitted anywhere.
 *   - Entries are appended synchronously (fs.appendFileSync) so a written entry
 *     is guaranteed to be on disk before the caller continues — no data is lost
 *     on a crash between log and flush.
 *   - Files are rotated once they exceed MAX_FILE_BYTES.
 *   - A bounded in-memory ring buffer retains the most recent entries so the
 *     web dashboard can inspect recent activity without parsing the files.
 */

const LOG_DIR = path.join(process.cwd(), 'logs');
const GENERAL_LOG = 'bot.log';
const AUDIT_LOG = 'audit.log';

const RING_LIMIT = 3000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

let sequence = 0;
const ring = [];

function ensureDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    /* ignore */
  }
}

function serialize(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return value;
}

function rotate(file) {
  try {
    const full = path.join(LOG_DIR, file);
    const stat = fs.statSync(full);
    if (stat.size > MAX_FILE_BYTES) {
      fs.renameSync(full, `${full}.1`);
    }
  } catch {
    /* ignore */
  }
}

function appendLine(file, entry) {
  try {
    ensureDir();
    rotate(file);
    fs.appendFileSync(path.join(LOG_DIR, file), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* never let logging itself crash the bot */
  }
}

function commit(entry) {
  sequence += 1;
  entry.seq = sequence;
  entry.timestamp = new Date().toISOString();
  ring.push(entry);
  if (ring.length > RING_LIMIT) ring.shift();
  return entry;
}

function consoleFor(level) {
  switch (level) {
    case 'error': return console.error;
    case 'warn': return console.warn;
    case 'debug': return console.debug;
    default: return console.log;
  }
}

function log(level, ...args) {
  const messageParts = [];
  const data = [];

  for (const arg of args) {
    if (typeof arg === 'string') messageParts.push(arg);
    else data.push(serialize(arg));
  }

  const entry = commit({
    kind: 'log',
    level,
    message: messageParts.join(' ') || '(no message)',
    data: data.length ? (data.length === 1 ? data[0] : data) : undefined
  });

  consoleFor(level)(`[${entry.timestamp}] [${level.toUpperCase()}]`, ...args);
  appendLine(GENERAL_LOG, entry);
  return entry;
}

/**
 * Record a sensitive / important event. `event` should be a namespaced,
 * dot-separated identifier (e.g. "ticket.claimed", "blacklist.added").
 */
function audit(event, { severity = 'info', actor = null, target = null, message = '', data } = {}) {
  const entry = commit({
    kind: 'audit',
    event,
    severity,
    actor: actor ? serialize(actor) : null,
    target: target ? serialize(target) : null,
    message: message || event,
    data: data === undefined ? undefined : serialize(data)
  });

  const label = `[${entry.timestamp}] [AUDIT:${severity.toUpperCase()}] ${event}`;
  const print = severity === 'critical' ? console.error : severity === 'warn' ? console.warn : console.log;
  print(label, message || '');
  appendLine(AUDIT_LOG, entry);
  return entry;
}

module.exports = {
  debug: (...args) => log('debug', ...args),
  info: (...args) => log('info', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args),
  audit,
  getRecentLogs: (n = 500) => ring.slice(-n),
  getRecentAudit: (n = 500) => ring.filter((entry) => entry.kind === 'audit').slice(-n),
  getEntriesSince: (seq) => ring.filter((entry) => entry.seq > seq),
  latestSeq: () => sequence,
  logDir: LOG_DIR,
  generalFile: path.join(LOG_DIR, GENERAL_LOG),
  auditFile: path.join(LOG_DIR, AUDIT_LOG)
};
