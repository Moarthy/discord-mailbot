const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const config = require('../config');
const logger = require('../utils/logger');
const actions = require('./actions');

const DASHBOARD_PATH = path.join(__dirname, 'public', 'index.html');

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendFile(res, filePath, contentType) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`
  });
  res.end(fs.readFileSync(filePath));
}

function sendBuffer(res, { buffer, name, contentType }) {
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${name}"`
  });
  res.end(buffer);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

// Wraps an action so exceptions become consistent JSON error responses.
async function run(res, fn) {
  try {
    const result = await fn();
    sendJson(res, 200, { ok: true, data: result });
  } catch (error) {
    logger.warn('Web action failed:', error.message);
    sendJson(res, 400, { ok: false, error: error.message });
  }
}

function createServer({ client }) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const route = `${req.method} ${url.pathname}`;

      // Dashboard UI.
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(fs.readFileSync(DASHBOARD_PATH));
        return;
      }

      // --- Status / config -------------------------------------------------
      if (route === 'GET /api/status') {
        return run(res, () => actions.getStatus(client));
      }
      if (route === 'GET /api/config') {
        return run(res, () => actions.getConfigView());
      }
      if (route === 'POST /api/config') {
        const body = await readBody(req);
        return run(res, () => actions.saveConfig(body.values ?? body));
      }
      if (route === 'POST /api/deploy') {
        return run(res, () => actions.deployCommands(client));
      }
      if (route === 'POST /api/restart') {
        return run(res, () => actions.restart());
      }

      // --- Read-only listings ----------------------------------------------
      if (route === 'GET /api/operators') {
        return run(res, () => actions.listOperators(client));
      }
      if (route === 'GET /api/tickets') {
        return run(res, () => actions.listTickets(client));
      }
      if (route === 'GET /api/archive') {
        return run(res, () => actions.listArchive());
      }
      if (route === 'GET /api/blacklist') {
        return run(res, () => actions.listBlacklist());
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/tickets/')) {
        const userId = decodeURIComponent(url.pathname.slice('/api/tickets/'.length));
        return run(res, () => actions.getTicketDetail(client, userId));
      }

      // --- Ticket actions --------------------------------------------------
      if (route === 'POST /api/claim') {
        const body = await readBody(req);
        return run(res, () => actions.claim(client, body));
      }
      if (route === 'POST /api/anon') {
        const body = await readBody(req);
        return run(res, () => actions.toggleAnonymous(client, body));
      }
      if (route === 'POST /api/note') {
        const body = await readBody(req);
        return run(res, () => actions.addNote(client, body));
      }
      if (route === 'POST /api/reply') {
        const body = await readBody(req);
        return run(res, () => actions.reply(client, body));
      }
      if (route === 'POST /api/close') {
        const body = await readBody(req);
        return run(res, () => actions.close(client, body));
      }

      if (route === 'GET /api/transcript') {
        try {
          const includeNotes = url.searchParams.get('notes') === '1';
          const { buffer, name, contentType } = actions.transcriptAttachment(url.searchParams.get('userId'), includeNotes);
          sendBuffer(res, { buffer, name, contentType });
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error.message });
        }
        return;
      }
      if (route === 'GET /api/archive-transcript') {
        try {
          const includeNotes = url.searchParams.get('notes') === '1';
          const { buffer, name, contentType } = actions.archiveTranscript(url.searchParams.get('number'), includeNotes);
          sendBuffer(res, { buffer, name, contentType });
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error.message });
        }
        return;
      }

      // --- Blacklist actions ----------------------------------------------
      if (route === 'POST /api/blacklist/add') {
        const body = await readBody(req);
        return run(res, () => actions.blacklistAdd(client, body));
      }
      if (route === 'POST /api/blacklist/remove') {
        const body = await readBody(req);
        return run(res, () => actions.blacklistRemove(client, body));
      }

      sendJson(res, 404, { ok: false, error: 'Not found.' });
    } catch (error) {
      const isBadRequest = error.message === 'Invalid JSON body.' || error.message === 'Request body too large.';
      if (isBadRequest) {
        sendJson(res, 400, { ok: false, error: error.message });
      } else {
        logger.error('Web server error:', error);
        sendJson(res, 500, { ok: false, error: 'Internal server error.' });
      }
    }
  });

  return server;
}

function start(client) {
  const server = createServer({ client });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${config.webPort} is already in use. Set WEB_PORT to a different value.`);
    } else {
      logger.error('Web server failed to start.', error);
    }
    process.exit(1);
  });

  server.listen(config.webPort, config.webHost, () => {
    const url = `http://${config.webHost === '0.0.0.0' ? 'localhost' : config.webHost}:${config.webPort}`;
    logger.info(`Web dashboard available at ${url}`);
  });

  return server;
}

module.exports = { start };
