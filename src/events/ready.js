const { ChannelType, PermissionsBitField, ActivityType } = require('discord.js');

const config = require('../config');
const store = require('../store/ticketStore');
const ticketService = require('../services/ticketService');
const notifyService = require('../services/notifyService');
const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  async execute(client) {
    logger.info(`Logged in as ${client.user.tag}.`);

    client.user.setPresence({
      activities: [{ type: ActivityType.Playing, name: '/help for the 30-second guide' }],
      status: 'online'
    });

    try {
      const category = await client.channels.fetch(config.categoryId);

      if (!category || category.type !== ChannelType.GuildCategory) {
        logger.error('CATEGORY_ID does not point to a category channel.');
        return;
      }

      logger.info(`ModMail category set to "${category.name}" in guild "${category.guild.name}".`);

      const me = category.guild.members.me;

      if (!me) {
        logger.warn('Could not resolve the bot member in the ModMail guild.');
      } else {
        // Named so the warning is actionable — logging the raw bitfield value
        // ("16") told nobody which permission to grant.
        const recommended = [
          'ManageChannels',
          'ManageWebhooks',
          'ManageRoles',
          'ManageMessages',
          'ViewChannel',
          'SendMessages',
          'ReadMessageHistory'
        ];

        const missing = recommended.filter(
          (name) => !me.permissions.has(PermissionsBitField.Flags[name])
        );

        if (missing.length) {
          logger.warn(
            `Bot is missing recommended permission(s): ${missing.join(', ')}. ` +
            'Ticket creation, webhook relaying or cleanup may fail.'
          );
        }
      }

      await reconcile(client, category);
    } catch (error) {
      logger.error('Could not validate configured CATEGORY_ID.', error);
    }
  }
};

// Repairs state after crashes, restarts AND offline periods:
//  - deletes ticket channels that have no active ticket (failed deletions)
//  - archives tickets whose channel no longer exists
//  - releases claims held by members who left while the bot was offline,
//    and notifies the affected ticket owners
async function reconcile(client, category) {
  const guild = category.guild;
  await guild.channels.fetch().catch(() => {});

  const ticketChannels = guild.channels.cache.filter(
    (channel) =>
      channel.parentId === category.id &&
      channel.type === ChannelType.GuildText &&
      typeof channel.topic === 'string' &&
      channel.topic.startsWith('modmail-ticket:')
  );

  for (const channel of ticketChannels.values()) {
    if (!store.getByChannelId(channel.id)) {
      logger.warn(`Removing orphaned ticket channel #${channel.name} (no active ticket).`);
      await channel.delete('Orphaned ModMail ticket channel.').catch(() => {});
    }
  }

  const pendingDeletion = guild.channels.cache.filter(
    (channel) =>
      channel.parentId === category.id &&
      channel.type === ChannelType.GuildText &&
      typeof channel.topic === 'string' &&
      /^Closed ticket #\d{4,} - pending deletion/.test(channel.topic)
  );

  for (const channel of pendingDeletion.values()) {
    if (store.getByChannelId(channel.id)) continue;
    logger.warn(`Deleting leftover pending-deletion channel #${channel.name}.`);
    await channel.delete('Leftover closed ModMail ticket.').catch(() => {});
  }

  for (const ticket of store.getOpenTickets()) {
    const cachedChannel = guild.channels.cache.get(ticket.channelId);
    if (!cachedChannel || cachedChannel.parentId !== category.id) {
      logger.warn(`Archiving ticket #${ticket.number} whose channel no longer exists or was moved out of the ModMail category.`);
      await notifyService.archiveDeletedTicket(client, ticket, {
        reason: 'Channel missing at startup.',
        // Moved-out channels are still alive; only truly gone channels warrant a user notice.
        silent: Boolean(cachedChannel)
      });
      continue;
    }

    if (ticket.claimedBy) {
      const claimant = await guild.members.fetch(ticket.claimedBy).catch(() => null);

      if (!claimant) {
        const leaverUser = await client.users.fetch(ticket.claimedBy).catch(() => null);
        const leaverName = leaverUser?.username ?? 'A former staff member';

        store.addLog(ticket.userId, {
          type: 'system',
          authorName: 'System',
          content: 'Claim released automatically (claimant left the server while the bot was offline).'
        });

        store.setClaim(ticket.userId, null);
        await ticketService.refreshHeader(client, ticket);

        await notifyService.sendClaimantLeftNotice(client, ticket, { name: leaverName });

        logger.warn(`Released claim on ticket #${ticket.number}: claimant is no longer in the server.`);
      }
    }
  }
}
