const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Add an internal note (never sent to the user).')
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Note content.')
      .setMaxLength(1800)
      .setRequired(true))
    .setDMPermission(false),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({ embeds: [embeds.errorEmbed('Staff only.')], flags: MessageFlags.Ephemeral });
    }

    const ticket = store.getByChannelId(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ embeds: [embeds.errorEmbed('This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    if (ticket.claimedBy !== interaction.user.id) {
      return interaction.reply({ embeds: [embeds.claimWarningEmbed(ticket)], flags: MessageFlags.Ephemeral });
    }

    const text = interaction.options.getString('text');
    const authorName = interaction.member.displayName || interaction.user.username;

    store.addLog(ticket.userId, { type: 'note', authorName, content: text });

    // Acknowledge before posting the note embed; the channel send is a network
    // call that can outlive the 3s interaction token on slow connections.
    await interaction.reply({ embeds: [embeds.systemEmbed('📝 Note added.')], flags: MessageFlags.Ephemeral });
    await interaction.channel.send({ embeds: [embeds.noteEmbed(authorName, text, ticket)] }).catch(() => {});
    return undefined;
  }
};
