const { MessageFlags } = require('discord.js');

const commands = require('../commands');
const buttons = require('../interactions/buttons');
const modals = require('../interactions/modals');
const logger = require('../utils/logger');

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands[interaction.commandName];
        if (command) await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        await buttons.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit()) {
        await modals.execute(interaction);
      }
    } catch (error) {
      logger.error('Interaction failed.', error);

      const payload = {
        content: 'Something went wrong while handling that interaction.',
        flags: MessageFlags.Ephemeral
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  }
};
