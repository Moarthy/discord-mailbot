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
      // 10062 means the interaction token expired (handler took over 3s) and
      // 40060 means it was already acknowledged. Neither can be answered, so
      // log them compactly instead of dumping a stack trace for a dead token.
      if (error?.code === 10062 || error?.code === 40060) {
        logger.warn(
          `Interaction expired before it could be answered (code ${error.code}): ` +
          `${interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId ?? 'unknown'}.`
        );
        return;
      }

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
