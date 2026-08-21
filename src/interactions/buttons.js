const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const ticketService = require('../services/ticketService');
const claimService = require('../services/claimService');
const transcriptService = require('../services/transcriptService');
const { isModerator } = require('../utils/permissions');

const EPHEMERAL = { flags: MessageFlags.Ephemeral };

function buildFeedbackModal(number) {
  return new ModalBuilder()
    .setCustomId(`feedback-modal:${number}`)
    .setTitle('Leave feedback')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback-text')
          .setLabel('Your feedback')
          .setPlaceholder('Tell us about your experience...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(1000)
      )
    );
}

function buildCloseModal() {
  return new ModalBuilder()
    .setCustomId('close-modal')
    .setTitle('Close ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (shown to the user)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

module.exports = {
  async execute(interaction) {
    if (interaction.customId.startsWith('feedback:')) {
      const number = Number(interaction.customId.split(':')[1]);
      const record = store.getArchive(number);

      if (!record) return interaction.reply({ content: 'Ticket record not found.', ...EPHEMERAL });
      if (interaction.user.id !== record.userId) {
        return interaction.reply({ content: 'Only the ticket author can leave feedback.', ...EPHEMERAL });
      }
      if (record.feedback) {
        return interaction.reply({ content: 'You already left feedback on this ticket. Thank you!', ...EPHEMERAL });
      }

      return interaction.showModal(buildFeedbackModal(number));
    }

    if (!interaction.customId.startsWith('ticket:')) return;

    if (!isModerator(interaction.member)) {
      return interaction.reply({ content: 'Staff only.', ...EPHEMERAL });
    }

    const ticket = store.getByChannelId(interaction.channelId);
    if (!ticket) return interaction.reply({ content: 'This channel is not a ticket.', ...EPHEMERAL });

    const action = interaction.customId.split(':')[1];

    if (action === 'claim') {
      return claimService.executeClaim(interaction);
    }

    if (action === 'anon') {
      if (ticket.claimedBy !== interaction.user.id) {
        return interaction.reply({ embeds: [embeds.claimWarningEmbed(ticket)], ...EPHEMERAL });
      }

      const newAnonymous = !ticket.anonymous;
      store.setAnonymous(ticket.userId, newAnonymous);
      await ticketService.refreshHeader(interaction.client, ticket);
      return interaction.reply({
        embeds: [embeds.systemEmbed(newAnonymous ? '🕶 Anonymous replies are now ON.' : '🕶 Anonymous replies are now OFF.')],
        ...EPHEMERAL
      });
    }

    if (action === 'transcript') {
      return interaction.reply({ files: [transcriptService.toAttachment(ticket, true)], ...EPHEMERAL });
    }

    if (action === 'close') {
      if (ticket.claimedBy !== interaction.user.id) {
        return interaction.reply({ embeds: [embeds.claimWarningEmbed(ticket)], ...EPHEMERAL });
      }

      return interaction.showModal(buildCloseModal());
    }

    return null;
  }
};
