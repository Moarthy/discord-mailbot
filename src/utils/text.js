function sanitizeChannelName(input) {
  const normalized = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, 80) || 'user';
}

function splitMessage(text, maxLength = 2000) {
  const value = String(text || '').replace(/\r\n/g, '\n');
  if (!value) return [];
  if (value.length <= maxLength) return [value];

  const chunks = [];
  let current = '';

  for (const line of value.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    let remaining = line;
    while (remaining.length > maxLength) {
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    current = remaining;
  }

  if (current) chunks.push(current);
  return chunks;
}

// Clamps text to a hard character budget, leaving a visible ellipsis so
// truncation is never silent. Discord rejects the whole payload when any
// embed field exceeds its limit, so every user-supplied string that reaches
// an embed must pass through here.
function truncate(value, maxLength) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

module.exports = { sanitizeChannelName, splitMessage, truncate, escapeHtml };
