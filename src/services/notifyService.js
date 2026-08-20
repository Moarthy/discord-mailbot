const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

async function sendClaimantLeftNotice(client, ticket, { name } = {}) {
  const leaverName = name || 'A staff member';

  try {
    const user = await client.users.fetch(ticket.userId).catch(() => null);
    if (user) {
      await user.send({ embeds: [embeds.claimantLeftEmbed({ ticket, leaverName })] }).catch(() => {});
    }

    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [embeds.claimReleasedEmbed({ ticket, leaverName })] }).catch(() => {});
    }
  } catch (error) {
    logger.warn('Could not send claimant-left notice.', error);
  }
}

module.exports = { sendClaimantLeftNotice };
