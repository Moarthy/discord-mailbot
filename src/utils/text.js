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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

module.exports = { sanitizeChannelName, splitMessage, escapeHtml };
