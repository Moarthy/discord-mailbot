require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const config = require('./config');
const logger = require('./utils/logger');

const ready = require('./events/ready');
const messageCreate = require('./events/messageCreate');
const channelDelete = require('./events/channelDelete');
const interactionCreate = require('./events/interactionCreate');
const typingStart = require('./events/typingStart');
const guildMemberRemove = require('./events/guildMemberRemove');

const WEB_MODE = process.argv.slice(2).includes('--web');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => ready.execute(client));
client.on('messageCreate', (message) => messageCreate.execute(client, message));
client.on('channelDelete', (channel) => channelDelete.execute(client, channel));
client.on('interactionCreate', (interaction) => interactionCreate.execute(client, interaction));
client.on('typingStart', (typing) => typingStart.execute(client, typing));
client.on('guildMemberRemove', (member) => guildMemberRemove.execute(client, member));

process.on('unhandledRejection', (error) => logger.error('Unhandled promise rejection:', error));
process.on('uncaughtException', (error) => logger.error('Uncaught exception:', error));

if (WEB_MODE) {
  const { start } = require('./web/server');
  const { openBrowser } = require('./web/openBrowser');

  // Start the dashboard immediately so it can be used to configure the bot
  // for the first time — it must not depend on a successful login.
  const url = `http://${config.webHost === '0.0.0.0' ? 'localhost' : config.webHost}:${config.webPort}`;
  start(client);

  if (config.webOpenBrowser) {
    // Slight delay so the server is listening before the browser connects.
    setTimeout(() => openBrowser(url), 750);
  }

  if (config.token) {
    client.login(config.token).catch((error) => {
      logger.error('Failed to log in. Check your DISCORD_TOKEN.', error);
      logger.info('The web dashboard is still running so you can fix the configuration.');
    });
  } else {
    logger.warn('DISCORD_TOKEN is not set. Configure it via the web dashboard.');
  }
} else {
  client.login(config.token).catch((error) => {
    logger.error('Failed to log in. Check your DISCORD_TOKEN.', error);
    process.exit(1);
  });
}
