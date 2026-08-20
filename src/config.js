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

module.exports = {
  token: required('DISCORD_TOKEN'),
  categoryId: required('CATEGORY_ID'),
  guildId: optional('GUILD_ID'),
  moderatorRoleId: optional('MODERATOR_ROLE_ID'),
  logChannelId: optional('LOG_CHANNEL_ID'),
  transcriptChannelId: optional('TRANSCRIPT_CHANNEL_ID'),
  dataFile: optional('DATA_FILE')
    ? path.resolve(optional('DATA_FILE'))
    : path.join(process.cwd(), 'data', 'tickets.json')
};
