function unix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function formatRelative(date) {
  return date ? `<t:${unix(date)}:R>` : '—';
}

function formatFull(date) {
  return date ? `<t:${unix(date)}:F>` : '—';
}

// Discord renders <t:...> markdown only in embed descriptions and field
// values — never in footers, titles or author names, where it shows up as
// raw text. Footers therefore need a pre-formatted absolute string.
const FOOTER_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hour12: false
});

function formatFooterDate(date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (!date || Number.isNaN(parsed.getTime())) return 'unknown';
  return `${FOOTER_DATE.format(parsed)} UTC`;
}

// setTimestamp() rejects ISO strings and throws on invalid input, so callers
// need a real Date (or null to omit the timestamp entirely).
function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function durationHuman(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

module.exports = { unix, formatRelative, formatFull, formatFooterDate, toDate, durationHuman };
