require('dotenv').config();

const { REST, Routes } = require('discord.js');

const config = require('./config');
const commands = require('./commands');
const logger = require('./utils/logger');

function applicationIdFromToken(token) {
  const raw = Buffer.from(token.replace(/^Bot\s*/i, '').split('.')[0], 'base64').toString('utf8');
  return /^\d{15,21}$/.test(raw) ? raw : null;
}

async function main() {
  const appId = applicationIdFromToken(config.token);
  if (!appId) {
    logger.error('Could not derive the application ID from DISCORD_TOKEN; token looks malformed.');
    process.exitCode = 1;
    return;
  }

  const body = Object.values(commands).map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, config.guildId), { body });
      logger.info(`Deployed ${body.length} guild slash commands.`);
    } else {
      await rest.put(Routes.applicationCommands(appId), { body });
      logger.info(`Deployed ${body.length} global slash commands (may take up to 1h).`);
    }
  } catch (error) {
    logger.error('Failed to deploy commands.', error);
    process.exitCode = 1;
  }
}

main();
