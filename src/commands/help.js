const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('ModMail, explained in 30 seconds.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(embeds.Colors.brand)
      .setTitle('**📬 ModMail** — your private line to the staff team')
      .setDescription(
        [
          '**1.** DM me anything — a private ticket opens automatically.',
          '**2.** A staff member claims it and replies right here in your DMs.',
          '',
          '🔒 Everything you send stays between you and the staff.',
        ].join('\n')
      )
    return interaction.reply({ embeds: [embed] });
  }
};
