const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const logger = require('../utils/logger');
const store = require('../store/ticketStore');
const snapshot = require('./snapshot');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

let server = null;
let clientRef = null;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function authorized(req) {
  if (!config.dashboardToken) return true;
  const header = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const query = new URL(req.url, 'http://localhost').searchParams.get('token');
  return header === config.dashboardToken || query === config.dashboardToken;
}

function serveStatic(res, pathname) {
  let file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = path.join(PUBLIC_DIR, file);

  // Prevent path traversal outside the public directory.
  if (!full.startsWith(PUBLIC_DIR + path.sep) && full !== path.join(PUBLIC_DIR, 'index.html')) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(full, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'Not found' });
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

function handleOverview(req, res) {
  sendJson(res, 200, snapshot.buildOverview(clientRef, store));
}

function handleLogs(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const since = Number(url.searchParams.get('since') ?? 0);

  if (Number.isFinite(since) && since > 0) {
    return sendJson(res, 200, {
      latestSeq: logger.latestSeq(),
      entries: logger.getEntriesSince(since)
    });
  }

  sendJson(res, 200, {
    latestSeq: logger.latestSeq(),
    entries: logger.getRecentLogs(500),
    audit: logger.getRecentAudit(500)
  });
}

function handleTicket(req, res, pathname) {
  // /api/ticket/:number[/transcript]
  const parts = pathname.split('/').filter(Boolean); // ['api','ticket','<number>', ...]
  const number = Number(parts[2]);

  if (!Number.isInteger(number)) {
    return sendJson(res, 400, { error: 'Invalid ticket number' });
  }

  if (parts[3] === 'transcript') {
    const staff = new URL(req.url, 'http://localhost').searchParams.get('staff') === '1';
    const transcript = snapshot.readTranscript(number, { staff });
    if (!transcript) return sendJson(res, 404, { error: 'Transcript not found' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(transcript.html);
  }

  const detail = snapshot.ticketDetail(store, clientRef, number);
  if (!detail) return sendJson(res, 404, { error: 'Ticket not found' });
  return sendJson(res, 200, detail);
}

function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (!authorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized. Provide a valid token.' });
  }

  if (pathname === '/api/overview') return handleOverview(req, res);
  if (pathname === '/api/logs') return handleLogs(req, res);
  if (pathname.startsWith('/api/ticket/')) return handleTicket(req, res, pathname);

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { error: 'Unknown endpoint' });
  }

  return serveStatic(res, pathname);
}

function start(client) {
  clientRef = client;

  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest);

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${config.dashboardPort} is already in use. Set DASHBOARD_PORT to another port.`));
      } else {
        reject(error);
      }
    });

    server.listen(config.dashboardPort, config.dashboardHost, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : config.dashboardPort;
      const host = config.dashboardHost === '0.0.0.0' ? 'localhost' : config.dashboardHost;
      resolve({ port, host: config.dashboardHost, url: `http://${host}:${port}` });
    });
  });
}

function getServer() {
  return server;
}

module.exports = { start, getServer };
