const fs = require('node:fs');

// The keys the dashboard exposes for editing. Kept in a stable order so the
// form and the written file stay predictable.
const KEYS = [
  'DISCORD_TOKEN',
  'CATEGORY_ID',
  'GUILD_ID',
  'MODERATOR_ROLE_ID',
  'LOG_CHANNEL_ID',
  'TRANSCRIPT_CHANNEL_ID',
  'DATA_FILE',
  'WEB_HOST',
  'WEB_PORT'
];

function parseEnv(content) {
  const values = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip surrounding quotes, mirroring dotenv's behaviour.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }
  return values;
}

function read(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath, 'utf8'));
}

// Writes `updates` into the env file while preserving comments, blank lines
// and any keys the dashboard does not manage. Known keys that change value are
// updated in place; new keys are appended at the end.
function write(filePath, updates) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const handled = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

    const value = String(updates[key] ?? '');
    lines[i] = `${key}=${value}`;
    handled.add(key);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (handled.has(key)) continue;
    lines.push(`${key}=${value}`);
  }

  // Ensure a single trailing newline.
  let output = lines.join('\n').replace(/\n+$/, '');
  output += '\n';

  fs.writeFileSync(filePath, output, 'utf8');
}

module.exports = { KEYS, read, write };
