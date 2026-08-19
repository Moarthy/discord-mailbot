const fs = require('node:fs');
const path = require('node:path');

const logger = require('../utils/logger');

const commands = {};

for (const file of fs.readdirSync(__dirname)) {
  if (!file.endsWith('.js') || file === 'index.js') continue;

  try {
    const command = require(path.join(__dirname, file));

    if (command?.data?.name) {
      commands[command.data.name] = command;
    } else {
      logger.warn(`Command file "${file}" does not export a valid "data" builder; skipping.`);
    }
  } catch (error) {
    logger.error(`Failed to load command file "${file}".`, error);
  }
}

module.exports = commands;
