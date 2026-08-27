const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { formatRelative, formatFooterDate, toDate, durationHuman } = require('./time');
const { truncate } = require('./text');

// Discord's hard embed limits. Exceeding any of them makes EmbedBuilder throw
// at construction time, which previously took down whole interactions.
const Limits = {
  description: 4096,
  fieldValue: 1024,
  footer: 2048,
  authorName: 256,
  title: 256
};

const Colors = {
  brand: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  note: 0xfee75c,
  system: 0x99aab5,
  feedback: 0xe6b800
};

function ticketNumberLabel(number) {
  return `#${String(number).padStart(4, '0')}`;
}

function statusText(ticket) {
  const claimed = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed';
  return `Claimed by: ${claimed}\nAnonymous replies: ${ticket.anonymous ? 'ON' : 'OFF'}`;
}

function headerEmbed(ticket, user, member) {
  return new EmbedBuilder()
    .setColor(Colors.brand)
    .setAuthor({
      name: `${user.username} · ${ticketNumberLabel(ticket.number)}`,
      iconURL: user.displayAvatarURL({ size: 256 })
    })
    .setThumbnail(user.displayAvatarURL({ size: 512 }))
    .addFields(
      { name: 'User ID', value: `\`${user.id}\``, inline: true },
      { name: 'Account created', value: formatRelative(user.createdAt), inline: true },
      { name: 'Server member', value: member?.joinedAt ? formatRelative(member.joinedAt) : 'No', inline: true },
      { name: 'Opened', value: formatRelative(ticket.createdAt), inline: true },
      { name: 'Status', value: statusText(ticket) }
    )
    // Footers cannot render <t:...> markdown, so the relative "opened" time
    // lives in a field above and the footer carries only the ticket label.
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)} · opened ${formatFooterDate(ticket.createdAt)}` })
    // Pinned to the open time: the header is re-rendered on every claim and
    // anon toggle, so a bare setTimestamp() drifted to "now" each time.
    .setTimestamp(toDate(ticket.createdAt));
}

function headerButtons(ticket) {
  const unclaimed = !ticket.claimedBy;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel(ticket.claimedBy ? 'Unclaim' : 'Claim')
      .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('ticket:anon')
      .setLabel(`Anon: ${ticket.anonymous ? 'ON' : 'OFF'}`)
      .setStyle(ticket.anonymous ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(unclaimed),
    new ButtonBuilder()
      .setCustomId('ticket:transcript')
      .setLabel('Transcript')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel(unclaimed ? 'Claim to close' : 'Close')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(unclaimed)
  );
}

function claimWarningEmbed(ticket) {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setDescription(
      ticket.claimedBy
        ? `⚠️ This ticket is claimed by <@${ticket.claimedBy}>. Only the claimant can interact with the user.`
        : '⚠️ This ticket is unclaimed. Use `/claim` or the Claim button before interacting with the user.'
    )
    .setTimestamp();
}

function claimLockedEmbed(ticket) {
  return new EmbedBuilder()
    .setColor(Colors.danger)
    .setDescription(
      `⛔ This ticket is already claimed by <@${ticket.claimedBy}>. They must release it before you can claim it.`
    )
    .setTimestamp();
}

// No color on purpose: staff replies show without a stripe.
// In anonymous mode the author line (name + icon) is removed entirely.
function staffReplyEmbed({ senderName, iconURL, content, anonymous = false }) {
  const embed = new EmbedBuilder()
    .setDescription(truncate(content || '*Attachments only*', Limits.description));

  if (!anonymous) {
    embed.setAuthor({ name: truncate(`Staff · ${senderName}`, Limits.authorName), iconURL: iconURL ?? null });
  }

  return embed;
}

function noteEmbed(authorName, text, ticket) {
  return new EmbedBuilder()
    .setColor(Colors.note)
    .setAuthor({ name: truncate(`Internal note · ${authorName}`, Limits.authorName) })
    .setDescription(truncate(text, Limits.description))
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)} · never sent to the user` })
    .setTimestamp();
}

function systemEmbed(text, color = Colors.system) {
  return new EmbedBuilder().setColor(color).setDescription(truncate(text, Limits.description)).setTimestamp();
}

function errorEmbed(text) {
  return new EmbedBuilder().setColor(Colors.danger).setDescription(truncate(`⛔ ${text}`, Limits.description));
}

function closeEmbed({ ticket, reason, closedByTag }) {
  const duration = ticket.closedAt
    ? durationHuman(new Date(ticket.closedAt) - new Date(ticket.createdAt))
    : durationHuman(Date.now() - new Date(ticket.createdAt));

  return new EmbedBuilder()
    .setColor(Colors.danger)
    .setTitle(`Ticket ${ticketNumberLabel(ticket.number)} closed`)
    .setDescription('Your transcript is attached below.')
    .addFields(
      { name: 'Closed by', value: truncate(closedByTag || 'Staff', Limits.fieldValue), inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Reason', value: truncate(reason || '—', Limits.fieldValue) }
    )
    .setTimestamp();
}

// Deliberately bare: the user needs to know the ticket is gone, that their
// transcript survived, and how to reach staff again — nothing more.
function ticketDeletedEmbed({ ticket }) {
  return new EmbedBuilder()
    .setColor(Colors.danger)
    .setTitle('Your ticket has been deleted')
    .setDescription(
      'The channel was removed before the ticket could be closed normally.\n' +
      'Your transcript is attached — DM me anytime to start a new one.'
    )
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)}` })
    .setTimestamp();
}

function claimantLeftEmbed({ ticket, leaverName }) {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setTitle('Handler update')
    .setDescription(
      truncate(
        `**${leaverName}** left the server, so your ticket is back in the queue.` +
        ' Your messages still reach staff — hang tight.',
        Limits.description
      )
    )
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)}` })
    .setTimestamp();
}

function claimReleasedEmbed({ ticket, leaverName }) {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setDescription(
      truncate(`**${leaverName}** left the server — claim released. Up for grabs: \`/claim\`.`, Limits.description)
    )
    .setTimestamp();
}

function feedbackButton(ticket) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`feedback:${ticket.number}`)
      .setLabel('Leave feedback')
      // Discord only supports Primary (blurple), Secondary (grey),
      // Success (green) and Danger (red) — no yellow exists.
      .setStyle(ButtonStyle.Secondary)
  );
}

function feedbackPromptEmbed(ticket) {
  return new EmbedBuilder()
    .setColor(Colors.feedback)
    .setDescription(`How was your support on ticket ${ticketNumberLabel(ticket.number)}? Leave a comment below if you like.`)
    .setTimestamp();
}

function feedbackThanksEmbed(ticket) {
  return new EmbedBuilder()
    .setColor(Colors.success)
    .setDescription('Thanks — your feedback has been recorded.')
    .setTimestamp();
}

function refusedEmbed(entry) {
  return new EmbedBuilder()
    .setColor(Colors.danger)
    .setTitle('Contact blocked')
    .setDescription('You are currently blocked from contacting staff.')
    .addFields({ name: 'Reason', value: truncate(entry.reason || '—', Limits.fieldValue) })
    .setFooter({ text: 'If you believe this is a mistake, contact the server team elsewhere.' })
    .setTimestamp();
}

module.exports = {
  Colors,
  Limits,
  ticketNumberLabel,
  headerEmbed,
  headerButtons,
  claimWarningEmbed,
  claimLockedEmbed,
  staffReplyEmbed,
  noteEmbed,
  systemEmbed,
  errorEmbed,
  closeEmbed,
  ticketDeletedEmbed,
  claimantLeftEmbed,
  claimReleasedEmbed,
  feedbackButton,
  feedbackPromptEmbed,
  feedbackThanksEmbed,
  refusedEmbed
};
