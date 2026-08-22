require('dotenv').config();

const path = require('node:path');

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
const dataFileRaw = optional('DATA_FILE');

// Owner of the bot; the only account allowed to run owner-only prefix
// commands such as `--dashboard`.
const dashboardOwnerId = optional('DASHBOARD_OWNER_ID') ?? '1509316121549996042';

// Local web dashboard. Defaults keep it reachable only from this machine.
const dashboardHost = optional('DASHBOARD_HOST') ?? '127.0.0.1';
const dashboardPortRaw = Number(optional('DASHBOARD_PORT') ?? '8123');
const dashboardPort = Number.isInteger(dashboardPortRaw) && dashboardPortRaw > 0 && dashboardPortRaw < 65536
  ? dashboardPortRaw
  : 8123;

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
  dashboardOwnerId,
  dashboardHost,
  dashboardPort
};
