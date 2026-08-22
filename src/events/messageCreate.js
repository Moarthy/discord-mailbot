const { ChannelType } = require('discord.js');

const store = require('../store/ticketStore');
const logger = require('../utils/logger');
const ticketService = require('../services/ticketService');
const webhookService = require('../services/webhookService');
const embeds = require('../utils/embeds');
const prefixCommands = require('../prefixCommands');

const CLAIM_WARN_COOLDOWN_MS = 10_000;
const CLEANUP_DELAY_MS = 5_000;

const claimWarnCooldown = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(client, message) {
    try {
      if (message.author.bot || message.webhookId) return;

      // Prefix commands (`--dashboard`, …) are intercepted first, in both
      // DMs and guild channels. Unknown prefixes fall through untouched.
      if (message.content.startsWith(prefixCommands.PREFIX)) {
        const handled = await prefixCommands.handle(client, message);
        if (handled) return;
      }

      if (!message.guild) {
        if (message.channel.partial) {
          try {
            await message.channel.fetch();
          } catch {
            return;
          }
        }

        if (message.channel.type !== ChannelType.DM) return;
        await handleDirectMessage(client, message);
        return;
      }

      await handleGuildMessage(client, message);
    } catch (error) {
      logger.error('Error while handling message.', error);

      if (!message.guild) {
        await message.author.send('Sorry, something went wrong while processing your ModMail message.').catch(() => {});
      }
    }
  }
};

async function handleDirectMessage(client, message) {
  const user = message.author;

  const blocked = store.getBlacklist(user.id);
  if (blocked) {
    await user.send({ embeds: [embeds.refusedEmbed(blocked)] }).catch(() => {});
    return;
  }

  const { webhook, ticket } = await ticketService.ensureTicketChannel(client, user);

  await webhookService.sendUserMessageToTicket({ webhook, user, message, ticket });

  store.addLog(user.id, {
    type: 'user',
    authorName: user.username,
    content: message.content ?? '',
    attachments: message.attachments.map((attachment) => attachment.url)
  });
}

async function warnClaimRequired(message, ticket) {
  const now = Date.now();
  const last = claimWarnCooldown.get(message.channel.id) ?? 0;
  const shouldWarn = now - last >= CLAIM_WARN_COOLDOWN_MS;

  if (shouldWarn) claimWarnCooldown.set(message.channel.id, now);

  const warning = shouldWarn
    ? await message.reply({ embeds: [embeds.claimWarningEmbed(ticket)] }).catch(() => null)
    : null;

  // Auto-clean the warning AND the offending message after 5 seconds.
  setTimeout(() => {
    if (warning) warning.delete().catch(() => {});
    message.delete().catch(() => {});
  }, CLEANUP_DELAY_MS);
}

async function handleGuildMessage(client, message) {
  const ticket = store.getByChannelId(message.channel.id);
  if (!ticket) return;

  // Claim-first workflow: only the claimant may talk to the user.
  if (ticket.claimedBy !== message.author.id) {
    if (message.content || message.attachments.size) {
      await warnClaimRequired(message, ticket);
    }
    return;
  }

  const attachmentUrls = message.attachments.map((attachment) => attachment.url);
  if (!message.content && !attachmentUrls.length) return;

  const user = await client.users.fetch(ticket.userId).catch(() => null);

  if (user) {
    const anonymous = Boolean(ticket.anonymous);
    const senderName = anonymous ? 'Anonymous' : (message.member?.displayName || message.author.username);

    // Attachments: plain text with URLs, no embed, no download.
    if (attachmentUrls.length) {
      const lines = [];
      if (!anonymous) lines.push(`**Staff · ${senderName}**:`);
      if (message.content) lines.push(message.content);
      lines.push(...attachmentUrls);

      await user.send({ content: lines.join('\n') }).catch(() => {});
    } else {
      // Text-only: use the embed as before (author line stripped when anonymous).
      const iconURL = anonymous ? message.guild.iconURL() : message.author.displayAvatarURL({ size: 256 });

      await user.send({
        embeds: [embeds.staffReplyEmbed({ senderName, iconURL, content: message.content, anonymous })]
      }).catch(() => {});
    }
  }

  store.addLog(ticket.userId, {
    type: ticket.anonymous ? 'anon' : 'staff',
    authorName: message.member?.displayName || message.author.username,
    content: message.content ?? '',
    attachments: attachmentUrls
  });
}
