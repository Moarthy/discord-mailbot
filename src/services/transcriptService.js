const fs = require('node:fs');
const path = require('node:path');

const config = require('../config');
const { escapeHtml } = require('../utils/text');
const { ticketNumberLabel } = require('../utils/embeds');
const logger = require('../utils/logger');

const STYLE = `
  body{background:#1e1f22;color:#dbdee1;font:14px/1.5 'Segoe UI',sans-serif;margin:0;padding:24px}
  h1{color:#f2f3f5} h2{color:#e6b800}
  .sub{color:#949ba4;margin-bottom:24px}
  .msg{background:#2b2d31;border-radius:8px;padding:10px 14px;margin-bottom:10px;border-left:4px solid #99aab5}
  .msg.user{border-left-color:#5865f2}
  .msg.staff{border-left-color:#57f287}
  .msg.anon{border-left-color:#57f287}
  .msg.note{border-left-color:#fee75c;background:#33301f}
  .msg.system{opacity:.75;font-style:italic}
  .msg.feedback{border-left-color:#e6b800;background:#2a2414}
  .meta{display:flex;gap:8px;align-items:center;margin-bottom:4px}
  .time{color:#949ba4;font-size:12px}
  .tag{background:#fee75c;color:#1e1f22;border-radius:4px;padding:0 6px;font-size:11px;font-weight:700}
  .tag.fb{background:#e6b800}
  .content{white-space:pre-wrap}
  .atts a{color:#00a8fc;display:block;font-size:12px}
`;

function entryToHtml(entry) {
  const type = entry.type || 'system';
  const name = escapeHtml(entry.authorName ?? 'System');
  const time = escapeHtml(entry.t ?? '');
  const content = escapeHtml(entry.content ?? '');

  const attachments = (entry.attachments ?? [])
    .map((url) => `<a href="${escapeHtml(url)}">${escapeHtml(url.split('/').pop() || 'attachment')}</a>`)
    .join('');

  const tag = type === 'note'
    ? '<span class="tag">internal</span>'
    : type === 'feedback'
    ? '<span class="tag fb">feedback</span>'
    : '';

  return [
    `<div class="msg ${type}">`,
    `<div class="meta"><strong>${name}</strong><span class="time">${time}</span>${tag}</div>`,
    content ? `<div class="content">${content}</div>` : '',
    attachments ? `<div class="atts">${attachments}</div>` : '',
    '</div>'
  ].join('');
}

function build(ticket, includeNotes = false) {
  const label = ticketNumberLabel(ticket.number);

  const entries = (ticket.log ?? []).filter((entry) => includeNotes || entry.type !== 'note');
  const body = entries.map(entryToHtml).join('\n');

  const feedbackBlock = ticket.feedback
    ? `<h2>User feedback</h2><p>${escapeHtml(ticket.feedback)}</p>`
    : '<h2>User feedback</h2><p><em>No feedback provided.</em></p>';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>ModMail transcript ${label}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>ModMail transcript — ${label}</h1>
<p class="sub">User ID: ${escapeHtml(ticket.userId)} · Opened: ${escapeHtml(ticket.createdAt)} · Closed: ${escapeHtml(ticket.closedAt ?? 'still open')}</p>
${body}
${feedbackBlock}
</body>
</html>`;
}

function toAttachment(ticket, includeNotes) {
  const label = String(ticket.number).padStart(4, '0');
  return {
    attachment: Buffer.from(build(ticket, includeNotes), 'utf8'),
    name: `ticket-${label}${includeNotes ? '-staff' : ''}.html`
  };
}

// Persists both transcript versions to disk when a ticket closes,
// so the JSON store only keeps lightweight metadata.
function writeArchives(ticket) {
  try {
    const dir = path.join(path.dirname(config.dataFile), 'transcripts');
    fs.mkdirSync(dir, { recursive: true });

    const label = String(ticket.number).padStart(4, '0');
    const staffName = `ticket-${label}-staff.html`;
    const userName = `ticket-${label}.html`;

    fs.writeFileSync(path.join(dir, staffName), build(ticket, true), 'utf8');
    fs.writeFileSync(path.join(dir, userName), build(ticket, false), 'utf8');

    return { staffTranscript: staffName, userTranscript: userName };
  } catch (error) {
    logger.error('Failed to write transcript archives.', error);
    return { staffTranscript: null, userTranscript: null };
  }
}

module.exports = { build, toAttachment, writeArchives };
