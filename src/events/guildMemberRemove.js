const store = require('../store/ticketStore');
const ticketService = require('../services/ticketService');
const notifyService = require('../services/notifyService');
const logService = require('../services/logService');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(client, member) {
    try {
      const leaverName = member.displayName || member.user?.username || 'A staff member';

      for (const ticket of store.getOpenTickets()) {
        if (ticket.claimedBy !== member.id) continue;

        store.addLog(ticket.userId, {
          type: 'system',
          authorName: 'System',
          content: `Claim released automatically (${leaverName} left the server).`
        });

        store.setClaim(ticket.userId, null);
        await ticketService.refreshHeader(client, ticket);

        await notifyService.sendClaimantLeftNotice(client, ticket, { name: leaverName });

        await logService.send(
          client,
          embeds.systemEmbed(
            `🎫 Claim released on ticket ${embeds.ticketNumberLabel(ticket.number)} (claimant left the server).`
          )
        );
      }
    } catch (error) {
      logger.error('Failed to handle guildMemberRemove.', error);
    }
  }
};
