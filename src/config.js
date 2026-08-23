require('dotenv').config();

const path = require('node:path');

const rootDir = path.join(__dirname, '..');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name) {
  return process.env[name]?.trim() || null;
}

const guildId = optional('GUILD_ID');
const moderatorRoleId = optional('MODERATOR_ROLE_ID');
const logChannelId = optional('LOG_CHANNEL_ID');
const transcriptChannelId = optional('TRANSCRIPT_CHANNEL_ID');

// DATA_FILE now only marks where legacy tickets.json lives (for one-time
// migration) and anchors the data directory; live data goes into DB_FILE.
const dataDir = path.dirname(
  optional('DATA_FILE')
    ? path.resolve(optional('DATA_FILE'))
    : path.join(rootDir, 'data', 'tickets.json')
);

module.exports = {
  token: required('DISCORD_TOKEN'),
  categoryId: required('CATEGORY_ID'),
  guildId,
  moderatorRoleId,
  logChannelId,
  transcriptChannelId,
  dataDir,
  dbFile: process.env.DB_FILE?.trim()
    ? path.resolve(process.env.DB_FILE.trim())
    : path.join(dataDir, 'mailbot.db'),
  legacyDataFile: path.join(dataDir, 'tickets.json')
};
