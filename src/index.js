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

client.login(config.token).catch((error) => {
  logger.error('Failed to log in. Check your DISCORD_TOKEN.', error);
  process.exit(1);
});
