require('dotenv').config();

const { Client, REST, Routes } = require('discord.js');

const config = require('./config');
const commands = require('./commands');
const logger = require('./utils/logger');

const body = Object.values(commands).map((command) => command.data.toJSON());

const client = new Client({ intents: [] });

client.once('clientReady', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(config.token);
    const appId = client.application.id;

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
  } finally {
    await client.destroy();
  }
});

client.login(config.token);
