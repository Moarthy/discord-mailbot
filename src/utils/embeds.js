const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { formatRelative, durationHuman } = require('./time');

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
      { name: 'Status', value: statusText(ticket) }
    )
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)} · opened ${formatRelative(ticket.createdAt)}` })
    .setTimestamp();
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
    .setDescription(content || '*Attachments only*');

  if (!anonymous) {
    embed.setAuthor({ name: `Staff · ${senderName}`, iconURL: iconURL ?? null });
  }

  return embed;
}

function noteEmbed(authorName, text, ticket) {
  return new EmbedBuilder()
    .setColor(Colors.note)
    .setAuthor({ name: `Internal note · ${authorName}` })
    .setDescription(text)
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)} · never sent to the user` })
    .setTimestamp();
}

function systemEmbed(text, color = Colors.system) {
  return new EmbedBuilder().setColor(color).setDescription(text).setTimestamp();
}

function errorEmbed(text) {
  return new EmbedBuilder().setColor(Colors.danger).setDescription(`⛔ ${text}`);
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
      { name: 'Closed by', value: closedByTag || 'Staff', inline: true },
      { name: 'Duration', value: duration, inline: true },
      { name: 'Reason', value: reason || '—' }
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
      `**${leaverName}** left the server, so your ticket is back in the queue.` +
      ' Your messages still reach staff — hang tight.'
    )
    .setFooter({ text: `Ticket ${ticketNumberLabel(ticket.number)}` })
    .setTimestamp();
}

function claimReleasedEmbed({ ticket, leaverName }) {
  return new EmbedBuilder()
    .setColor(Colors.warning)
    .setDescription(`**${leaverName}** left the server — claim released. Up for grabs: \`/claim\`.`)
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
    .addFields({ name: 'Reason', value: entry.reason || '—' })
    .setFooter({ text: 'If you believe this is a mistake, contact the server team elsewhere.' })
    .setTimestamp();
}

module.exports = {
  Colors,
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
