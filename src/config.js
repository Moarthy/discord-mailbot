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

module.exports = {
  token: required('DISCORD_TOKEN'),
  categoryId: required('CATEGORY_ID'),
  guildId,
  moderatorRoleId,
  logChannelId,
  transcriptChannelId,
  dataFile: dataFileRaw
    ? path.resolve(dataFileRaw)
    : path.join(process.cwd(), 'data', 'tickets.json')
};
