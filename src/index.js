require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const config = require('./config');
const logger = require('./utils/logger');
const store = require('./store/ticketStore');

const ready = require('./events/ready');
const messageCreate = require('./events/messageCreate');
const channelDelete = require('./events/channelDelete');
const interactionCreate = require('./events/interactionCreate');
const typingStart = require('./events/typingStart');
const guildMemberRemove = require('./events/guildMemberRemove');

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

let shuttingDown = false;

async function shutdown(code, error) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (error) logger.error('Shutting down due to a fatal error.', error);

  await client.destroy().catch(() => {});
  store.close();
  process.exit(code);
}

process.on('unhandledRejection', (error) => logger.error('Unhandled promise rejection:', error));
process.on('uncaughtException', (error) => shutdown(1, error));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

client.login(config.token).catch((error) => {
  logger.error('Failed to log in. Check your DISCORD_TOKEN.', error);
  process.exit(1);
});
