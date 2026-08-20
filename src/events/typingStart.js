const { ChannelType } = require('discord.js');

const store = require('../store/ticketStore');

module.exports = {
  name: 'typingStart',
  async execute(client, typing) {
    try {
      let channel = typing.channel;

      if (channel?.partial) {
        try {
          channel = await channel.fetch();
        } catch {
          return;
        }
      }

      if (!channel || channel.type !== ChannelType.DM) return;
      if (typing.user?.bot) return;

      const ticket = store.getByUserId(typing.user.id);
      if (!ticket) return;

      const ticketChannel = await client.channels.fetch(ticket.channelId).catch(() => null);
      if (ticketChannel) await ticketChannel.sendTyping();
    } catch {
      // Typing indicators are cosmetic; ignore failures.
    }
  }
};
