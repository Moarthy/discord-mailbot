const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const { formatFull } = require('../utils/time');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show detailed information about this ticket.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({ embeds: [embeds.errorEmbed('Staff only.')], flags: MessageFlags.Ephemeral });
    }

    const ticket = store.getByChannelId(interaction.channelId);
    if (!ticket) {
      return interaction.reply({ embeds: [embeds.errorEmbed('This channel is not a ticket.')], flags: MessageFlags.Ephemeral });
    }

    // users.fetch() may hit the network, so reserve the token up front.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await interaction.client.users.fetch(ticket.userId).catch(() => null);
    const count = (type) => ticket.log.filter((entry) => entry.type === type).length;

    const embed = new EmbedBuilder()
      .setColor(embeds.Colors.brand)
      .setTitle(`Ticket ${embeds.ticketNumberLabel(ticket.number)} · info`)
      .setThumbnail(user?.displayAvatarURL({ size: 512 }) ?? null)
      .addFields(
        { name: 'User', value: user ? `${user.tag} (\`${user.id}\`)` : `\`${ticket.userId}\``, inline: true },
        { name: 'Claimed by', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed', inline: true },
        { name: 'Anonymous', value: ticket.anonymous ? 'ON' : 'OFF', inline: true },
        { name: 'Opened', value: formatFull(ticket.createdAt), inline: true },
        { name: 'Messages', value: `👤 ${count('user')} · 🛡 ${count('staff') + count('anon')} · 📝 ${count('note')}`, inline: true },
        { name: 'Account created', value: user ? formatFull(user.createdAt) : '—', inline: true }
      )
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }
};
