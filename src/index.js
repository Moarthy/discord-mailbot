require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const config = require('./config');
const logger = require('./utils/logger');
const auditService = require('./services/auditService');

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

// ---------------------------------------------------------------------------
// Dashboard flag: `node src/index.js --dashboard` (aliases: --web, -d)
// Launches a local web dashboard alongside the bot.
// ---------------------------------------------------------------------------
const DASHBOARD_FLAGS = new Set(['--dashboard', '--web', '-d']);
const dashboardEnabled = process.argv.slice(2).some((arg) => DASHBOARD_FLAGS.has(arg));
const dashboard = dashboardEnabled ? require('./dashboard/server') : null;

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
  auditService.process.unhandledRejection({ error: error?.stack || String(error) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  auditService.process.uncaughtException({ error: error?.stack || String(error) });
});

function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down.`);
  auditService.bot.shutdown({ signal });
  client.destroy().catch(() => {});

  const server = dashboard?.getServer();
  if (server) {
    server.close(() => process.exit(0));
    // Fall back if the server does not close promptly (e.g. lingering sockets).
    setTimeout(() => process.exit(0), 3000).unref();
  } else {
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

if (dashboard) {
  dashboard
    .start(client)
    .then(({ port, host, url }) => {
      logger.info(`Dashboard listening on ${url} (bound to ${host}:${port}).`);
      auditService.dashboard.started({ port, host });
    })
    .catch((error) => {
      logger.error('Failed to start dashboard.', error);
    });
}

client.login(config.token).catch((error) => {
  logger.error('Failed to log in. Check your DISCORD_TOKEN.', error);
  auditService.bot.loginFailed({ error: error?.message || String(error) });

  // When the dashboard is running, keep it alive so the operator can still
  // inspect status/logs even while the bot is offline.
  if (!dashboard) process.exit(1);
});
