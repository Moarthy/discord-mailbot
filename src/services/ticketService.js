const { ChannelType } = require('discord.js');

const config = require('../config');
const store = require('../store/ticketStore');
const logger = require('../utils/logger');
const webhookService = require('./webhookService');
const notifyService = require('./notifyService');
const embeds = require('../utils/embeds');
const { sanitizeChannelName } = require('../utils/text');

const pendingTickets = new Map();

function ticketTopicPrefix(userId) {
  return `modmail-ticket:${userId}`;
}

async function getCategory(client) {
  const category = await client.channels.fetch(config.categoryId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error('CATEGORY_ID is missing or does not point to a category channel.');
  }

  return category;
}

async function getChannelsInCategory(category) {
  try {
    await category.guild.channels.fetch();
  } catch (error) {
    logger.warn('Could not fetch guild channels; using cached channels.', error);
  }

  return category.guild.channels.cache.filter(
    (channel) => channel.parentId === category.id && channel.type === ChannelType.GuildText
  );
}

function findExistingChannel(channels, user) {
  const prefix = ticketTopicPrefix(user.id);
  return channels.find((channel) => channel.topic?.startsWith(prefix)) ?? null;
}

function chooseChannelName(channels, user) {
  const base = sanitizeChannelName(user.username);

  if (!channels.some((channel) => channel.name === base)) return base;

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const candidate = `${base}-${suffix}`.slice(0, 100);
    if (!channels.some((channel) => channel.name === candidate)) return candidate;
  }

  return `${base}-${user.id}`.slice(0, 100);
}

async function resolveWebhook(channel, user, ticket) {
  const webhook = await webhookService.getOrCreateWebhook(channel, user, ticket);

  if (ticket && (ticket.webhookId !== webhook.id || ticket.webhookToken !== webhook.token)) {
    store.updateTicket(user.id, { webhookId: webhook.id, webhookToken: webhook.token });
  }

  return webhook;
}

// Edits the header; if the header message was deleted, recreates it.
async function refreshHeader(client, ticket) {
  try {
    const channel = await client.channels.fetch(ticket.channelId);
    const user = await client.users.fetch(ticket.userId);
    const member = await channel.guild.members.fetch(ticket.userId).catch(() => null);

    const payload = {
      embeds: [embeds.headerEmbed(ticket, user, member)],
      components: [embeds.headerButtons(ticket)]
    };

    let message = null;
    if (ticket.headerMessageId) {
      message = await channel.messages.fetch(ticket.headerMessageId).catch(() => null);
    }

    if (message) {
      await message.edit(payload);
    } else {
      message = await channel.send(payload);
      store.updateTicket(ticket.userId, { headerMessageId: message.id });
      ticket.headerMessageId = message.id;
    }
  } catch (error) {
    logger.warn('Could not refresh ticket header.', error);
  }
}

async function createOrResolveTicket(client, user) {
  const category = await getCategory(client);
  const guild = category.guild;

  const existingTicket = store.getByUserId(user.id);

  if (existingTicket) {
    let channel = guild.channels.cache.get(existingTicket.channelId);
    if (!channel) channel = await guild.channels.fetch(existingTicket.channelId).catch(() => null);

    if (channel && channel.type === ChannelType.GuildText && channel.parentId === category.id) {
      const webhook = await resolveWebhook(channel, user, existingTicket);
      // Ensure header exists even if it was deleted while the ticket was open.
      await refreshHeader(client, existingTicket).catch(() => {});
      return { channel, webhook, created: false, ticket: existingTicket };
    }

    store.closeTicket(user.id, { closedBy: null, reason: 'Channel missing; reopened.' });
  }

  const channelsInCategory = await getChannelsInCategory(category);
  const existingChannel = findExistingChannel(channelsInCategory, user);

  if (existingChannel) {
    const ticket = store.createTicket({
      userId: user.id,
      channelId: existingChannel.id,
      webhookId: null,
      webhookToken: null,
      guildId: guild.id
    });

    const webhook = await resolveWebhook(existingChannel, user, ticket);

    // Orphaned channel recovered: ensure it has a proper header and mention.
    try {
      if (config.moderatorRoleId) {
        await existingChannel.send({
          content: `📬 New ticket opened · <@&${config.moderatorRoleId}>`,
          allowedMentions: { roles: [config.moderatorRoleId] }
        }).catch(() => {});
      }
      await refreshHeader(client, ticket);
    } catch {
      // Header recreation is best-effort; webhook still works.
    }

    return { channel: existingChannel, webhook, created: false, ticket };
  }

  const name = chooseChannelName(channelsInCategory, user);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `${ticketTopicPrefix(user.id)} | ${user.username}`,
    reason: `ModMail ticket for ${user.username} (${user.id})`
  });

  try {
    await channel.setParent(category.id, { lockPermissions: true });
  } catch (error) {
    logger.warn('Could not re-lock channel permissions to the category.', error);
  }

  try {
    const ticket = store.createTicket({
      userId: user.id,
      channelId: channel.id,
      webhookId: null,
      webhookToken: null,
      guildId: guild.id
    });

    const webhook = await resolveWebhook(channel, user, ticket);

    if (config.moderatorRoleId) {
      await channel.send({
        content: `📬 New ticket opened · <@&${config.moderatorRoleId}>`,
        allowedMentions: { roles: [config.moderatorRoleId] }
      }).catch(() => {});
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    const headerMessage = await channel.send({
      embeds: [embeds.headerEmbed(ticket, user, member)],
      components: [embeds.headerButtons(ticket)]
    });

    store.updateTicket(user.id, { headerMessageId: headerMessage.id });
    ticket.headerMessageId = headerMessage.id;

    logger.info(`Created ticket #${ticket.number} (#${channel.name}) for ${user.username}.`);

    return { channel, webhook, created: true, ticket };
  } catch (error) {
    notifyService.markBotSideDeletion(channel.id);
    await channel.delete('Failed to initialize ModMail ticket.').catch(() => {});
    throw error;
  }
}

async function ensureTicketChannel(client, user) {
  if (pendingTickets.has(user.id)) return pendingTickets.get(user.id);

  const promise = createOrResolveTicket(client, user).finally(() => pendingTickets.delete(user.id));
  pendingTickets.set(user.id, promise);
  return promise;
}

module.exports = { ensureTicketChannel, getCategory, refreshHeader };
