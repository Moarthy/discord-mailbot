const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('ModMail, explained in 30 seconds.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(embeds.Colors.brand)
      .setTitle('📬 ModMail — your private line to the staff team')
      .setDescription(
        [
          '**1.** DM me anything — a private ticket opens automatically.',
          '**2.** A staff member claims it and replies right here in your DMs.',
          '**3.** When it is solved, the ticket closes and you can leave ⭐ feedback.',
          '',
          '🔒 Everything you send stays between you and the staff.',
          '🖼 Images travel as links — nothing is re-uploaded.',
          '',
          '🛡 **Staff:** `/claim` a ticket to reply, `/close` when done.'
        ].join('\n')
      )
      .setFooter({ text: 'No commands needed — just say hi.' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
};
