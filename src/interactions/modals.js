const { MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const logService = require('../services/logService');
const auditService = require('../services/auditService');
const closeService = require('../services/closeService');

module.exports = {
  async execute(interaction) {
    if (interaction.customId === 'close-modal') {
      const reason = interaction.fields.getTextInputValue('reason')?.trim() || '';
      await closeService.executeClose(interaction, reason);
      return;
    }

    if (interaction.customId.startsWith('feedback-modal:')) {
      const number = Number(interaction.customId.split(':')[1]);
      const text = interaction.fields.getTextInputValue('feedback-text')?.trim() || '';

      const record = store.getArchive(number);

      if (!record) {
        return interaction.reply({ content: 'Ticket record not found.', flags: MessageFlags.Ephemeral });
      }
      if (interaction.user.id !== record.userId) {
        return interaction.reply({ content: 'Only the ticket author can leave feedback.', flags: MessageFlags.Ephemeral });
      }
      if (record.feedback) {
        return interaction.reply({ content: 'You already left feedback on this ticket.', flags: MessageFlags.Ephemeral });
      }

      store.setFeedback(number, text);

      auditService.ticket.feedbackReceived(record, { id: interaction.user.id, tag: interaction.user.tag });

      await logService.send(
        interaction.client,
        embeds.systemEmbed(
          `⭐ New feedback on ticket ${embeds.ticketNumberLabel(number)}:\n> ${text.slice(0, 500)}`,
          embeds.Colors.feedback
        )
      );

      return interaction.update({
        embeds: [embeds.feedbackThanksEmbed(record)],
        components: []
      });
    }

    return null;
  }
};
