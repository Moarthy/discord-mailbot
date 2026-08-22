/**
 * Tiny prefix-command framework.
 *
 * The bot's main interface is slash commands, but a couple of owner-level
 * tools are nicer as plain text commands. Any message starting with the
 * prefix (`--`) is checked against the command table below; unknown
 * prefixes fall straight through to the normal ticket pipeline untouched.
 */
const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const logger = require('../utils/logger');
const embeds = require('../utils/embeds');

const PREFIX = '--';

const commands = {};

for (const file of fs.readdirSync(__dirname)) {
  if (!file.endsWith('.js') || file === 'index.js') continue;

  try {
    const command = require(path.join(__dirname, file));
    if (command?.name) {
      commands[command.name] = command;
    } else {
      logger.warn(`Prefix command file "${file}" does not export a "name"; skipping.`);
    }
  } catch (error) {
    logger.error(`Failed to load prefix command file "${file}".`, error);
  }
}

/**
 * Tries to handle a message as a prefix command.
 * @returns {Promise<boolean>} true if the message was consumed as a command.
 */
async function handle(client, message) {
  const rest = message.content.slice(PREFIX.length).trim();
  const match = rest.match(/^([^\s]+)/);
  if (!match) return false;

  const command = commands[match[1].toLowerCase()];
  if (!command) return false;

  if (command.ownerOnly && message.author.id !== config.dashboardOwnerId) {
    await message.reply({
      embeds: [embeds.errorEmbed(`This command is restricted to the bot owner.`)]
    }).catch(() => {});
    return true;
  }

  const args = rest.slice(match[1].length).trim().split(/\s+/).filter(Boolean);

  logger.info(`Prefix command "${PREFIX}${command.name}" used by ${message.author.tag} in ${message.guild?.name ?? 'DMs'}.`);

  await command.execute(client, message, args);
  return true;
}

module.exports = { PREFIX, commands, handle };
