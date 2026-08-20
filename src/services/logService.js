const config = require('../config');
const logger = require('../utils/logger');

async function send(client, embed) {
  if (!config.logChannelId) return;

  try {
    const channel = await client.channels.fetch(config.logChannelId);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.warn('Could not post to LOG_CHANNEL_ID.', error);
  }
}

module.exports = { send };
