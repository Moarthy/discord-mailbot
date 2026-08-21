const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');

module.exports = {
  name: 'channelDelete',
  async execute(client, channel) {
    try {
      const ticket = store.getByChannelId(channel.id);
      if (!ticket) return;

      const user = await client.users.fetch(ticket.userId).catch(() => null);

      if (user) {
        await user.send({
          embeds: [embeds.closeEmbed({ ticket, reason: 'Your ticket was closed by staff.', closedByTag: 'Staff' })]
        }).catch(() => {});
      }

      store.closeTicket(ticket.userId, { closedBy: null, reason: 'Channel manually deleted.' });
      auditService.ticket.channelDeleted(ticket, { channelId: channel.id });
      logger.info(`Archived ticket #${ticket.number} after manual channel deletion.`);
    } catch (error) {
      logger.error('Failed to clean ticket data after channel delete.', error);
    }
  }
};
