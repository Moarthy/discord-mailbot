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

async function downloadAttachment(attachment) {
  try {
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName = (attachment.name || `attachment-${Date.now()}`).replace(/[^\w.\-]+/g, '_');

    return { attachment: buffer, name: safeName };
  } catch {
    return null;
  }
}

async function sendUserMessageToTicket({ webhook, user, message, ticket = null }) {
  const sendable = getSendableWebhook(webhook, ticket);

  try {
    const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
    const files = [];
    const failedUrls = [];
    const attachmentUrls = [];

    for (const attachment of message.attachments.values()) {
      attachmentUrls.push(attachment.url);

      if (attachment.size > 8_000_000) {
        failedUrls.push(attachment.url);
        continue;
      }

      const file = await downloadAttachment(attachment);
      if (file) files.push(file);
      else failedUrls.push(attachment.url);
    }

    const textParts = [];
    if (message.content) textParts.push(message.content);
    if (failedUrls.length) textParts.push(`Attachment links:\n${failedUrls.join('\n')}`);

    const chunks = splitMessage(textParts.join('\n'), 1900);
    if (!chunks.length && files.length === 0) chunks.push('[No content]');
    if (!chunks.length) chunks.push('');

    const basePayload = { username: user.username, avatarURL, allowedMentions: { parse: [] } };

    for (let index = 0; index < chunks.length; index += 1) {
      const payload = { ...basePayload, content: chunks[index] || undefined };
      if (index === 0 && files.length) payload.files = files;

      try {
        await sendable.send(payload);
      } catch (error) {
        logger.error('Webhook send failed; falling back to links.', error);

        const fallback = [chunks[index], attachmentUrls.length ? `Attachments:\n${attachmentUrls.join('\n')}` : null]
          .filter(Boolean)
          .join('\n');

        for (const chunk of splitMessage(fallback, 1900)) {
          await sendable.send({ ...basePayload, content: chunk }).catch(() => {});
        }
      }
    }
  } finally {
    if (sendable instanceof WebhookClient) sendable.destroy();
  }
}

module.exports = { getOrCreateWebhook, sendUserMessageToTicket, downloadAttachment };
