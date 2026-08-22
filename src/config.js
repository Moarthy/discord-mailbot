require('dotenv').config();

const path = require('node:path');

// When the dashboard (`--web`) is running, a missing token or category should
// not crash the process — the user may be about to configure them for the
// first time through the web UI. In normal (bot) mode we keep the strict,
// fail-fast behaviour.
const WEB_MODE = process.argv.slice(2).includes('--web');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (WEB_MODE) return null;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name) {
  return process.env[name]?.trim() || null;
}

const guildId = optional('GUILD_ID');
const moderatorRoleId = optional('MODERATOR_ROLE_ID');
const logChannelId = optional('LOG_CHANNEL_ID');
const transcriptChannelId = optional('TRANSCRIPT_CHANNEL_ID');
const dataFileRaw = optional('DATA_FILE');

module.exports = {
  token: required('DISCORD_TOKEN'),
  categoryId: required('CATEGORY_ID'),
  guildId,
  moderatorRoleId,
  logChannelId,
  transcriptChannelId,
  dataFile: dataFileRaw
    ? path.resolve(dataFileRaw)
    : path.join(process.cwd(), 'data', 'tickets.json'),
  // Web dashboard settings.
  webHost: optional('WEB_HOST') || '127.0.0.1',
  webPort: Number.parseInt(optional('WEB_PORT') || '3000', 10),
  webOpenBrowser: optional('WEB_OPEN_BROWSER') !== 'false',
  envFile: path.resolve(optional('ENV_FILE') || path.join(process.cwd(), '.env'))
};
