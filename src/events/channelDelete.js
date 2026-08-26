const store = require('../store/ticketStore');
const notifyService = require('../services/notifyService');
const logger = require('../utils/logger');

module.exports = {
  name: 'channelDelete',
  async execute(client, channel) {
    try {
      const ticket = store.getByChannelId(channel.id);
      if (!ticket) return;

      // Deletions the bot performed itself (setup rollback) are archived
      // silently; anything else means staff removed the channel by hand.
      await notifyService.archiveDeletedTicket(client, ticket, {
        reason: 'Channel manually deleted.',
        silent: notifyService.wasBotSideDeletion(channel.id)
      });
    } catch (error) {
      logger.error('Failed to clean ticket data after channel delete.', error);
    }
  }
};
