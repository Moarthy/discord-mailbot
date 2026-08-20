function unix(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

function formatRelative(date) {
  return date ? `<t:${unix(date)}:R>` : '—';
}

function formatFull(date) {
  return date ? `<t:${unix(date)}:F>` : '—';
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

module.exports = { unix, formatRelative, formatFull, durationHuman };
