const { WebhookClient } = require('discord.js');

const logger = require('../utils/logger');
const { splitMessage } = require('../utils/text');

function webhookName(userId) {
  return `modmail-${userId}`;
}

async function getOrCreateWebhook(channel, user, ticket = null) {
  const name = webhookName(user.id);

  try {
    const webhooks = await channel.fetchWebhooks();

    if (ticket?.webhookId) {
      const storedWebhook = webhooks.get(ticket.webhookId);
      if (storedWebhook?.token) return storedWebhook;
    }

    const existing = webhooks.find((webhook) => webhook.name === name && webhook.token);
    if (existing) return existing;
  } catch (error) {
    logger.warn('Could not fetch existing webhooks; creating a new one.', error);
  }

  return channel.createWebhook({
    name,
    reason: `ModMail webhook for ${user.username} (${user.id})`
  });
}

function getSendableWebhook(webhook, ticket) {
  if (webhook?.token) return webhook;

  if (ticket?.webhookId && ticket?.webhookToken) {
    return new WebhookClient({ id: ticket.webhookId, token: ticket.webhookToken });
  }

  throw new Error('No valid webhook token available.');
}

async function sendUserMessageToTicket({ webhook, user, message, ticket = null }) {
  const sendable = getSendableWebhook(webhook, ticket);

  try {
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
    const attachmentUrls = message.attachments.map((attachment) => attachment.url);

    const textParts = [];
    if (message.content) textParts.push(message.content);
    if (attachmentUrls.length) textParts.push(attachmentUrls.join('\n'));

    const chunks = splitMessage(textParts.join('\n'), 1900);
    if (!chunks.length) chunks.push('[No content]');

    const basePayload = { username: user.username, avatarURL, allowedMentions: { parse: [] } };

    for (const chunk of chunks) {
      const payload = { ...basePayload, content: chunk };

      try {
        await sendable.send(payload);
      } catch (error) {
        logger.error('Webhook send failed.', error);
      }
    }
  } finally {
    if (sendable instanceof WebhookClient) sendable.destroy();
  }
}

module.exports = { getOrCreateWebhook, sendUserMessageToTicket };
