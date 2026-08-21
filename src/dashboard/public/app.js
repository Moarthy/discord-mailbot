/* ModMail dashboard client — vanilla JS, no build step. */
(() => {
  const REFRESH_MS = 5000;
  let state = null;
  let lastLogSeq = 0;
  let activeTab = 'overview';
  const token = new URLSearchParams(location.search).get('token');

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  function esc(value) {
    return String(value ?? '')
      .replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
  }

  function fmtBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function fmtPct(value) {
    return Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
  }

  function fmtDuration(ms) {
    if (ms == null) return '—';
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  function avatar(src, cls = 'avatar') {
    return src ? `<img class="${cls}" src="${esc(src)}" alt="">` : `<span class="${cls}"></span>`;
  }

  function ticketLabel(n) {
    return `#${String(n).padStart(4, '0')}`;
  }

  async function api(path) {
    const url = token ? `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : path;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 401) throw new Error('Unauthorized: provide a valid token (DASHBOARD_TOKEN).');
      throw new Error(`Request failed (${res.status})`);
    }
    return res.json();
  }

  function openModal(html) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById('modal');
    modal.innerHTML = `<button class="close" aria-label="Close">✕</button>${html}`;
    backdrop.hidden = false;
    backdrop.querySelector('.close').addEventListener('click', () => { backdrop.hidden = true; });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.hidden = true; });
  }

  // ---------------------------------------------------------------------------
  // rendering
  // ---------------------------------------------------------------------------

  function renderHeader() {
    const s = state.status;
    const pill = document.getElementById('status-pill');
    const text = document.getElementById('status-text');
    const version = document.getElementById('brand-version');

    version.textContent = `v${state.project.version} · node ${state.project.node}`;

    if (s.ready) {
      pill.className = 'pill online';
      text.textContent = `Online · ${s.user.tag}`;
    } else {
      pill.className = 'pill offline';
      text.textContent = 'Bot offline / connecting';
    }
    document.getElementById('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }

  function renderStats() {
    const c = state.counts;
    const ram = state.ram;
    const cards = [
      { cls: 'accent', value: c.openTickets, label: 'Open tickets', hint: `${c.archivedTickets} archived` },
      { cls: 'accent', value: c.totalTickets, label: 'Total tickets', hint: `${c.transcriptFiles} transcripts` },
      { cls: 'green', value: c.moderators, label: 'Moderators', hint: 'active staff' },
      { cls: 'yellow', value: c.activeClaims, label: 'Active claims', hint: 'tickets assigned' },
      { cls: '', value: c.users, label: 'Users', hint: 'unique authors' },
      { cls: 'red', value: c.blacklisted, label: 'Blacklisted', hint: 'blocked users' },
      { cls: '', value: fmtBytes(ram.process.rss), label: 'RAM (RSS)', hint: `heap ${fmtBytes(ram.process.heapUsed)}` },
      { cls: '', value: fmtPct(ram.system.usedPercent), label: 'System RAM', hint: `${fmtBytes(ram.system.used)} / ${fmtBytes(ram.system.total)}` }
    ];

    document.getElementById('stats').innerHTML = cards.map((card) => `
      <div class="stat ${card.cls}">
        <div class="value">${esc(card.value)}</div>
        <div class="label">${esc(card.label)}</div>
        <div class="hint">${esc(card.hint)}</div>
      </div>`).join('');
  }

  function renderOverview() {
    const s = state.status;
    const r = state.ram;
    const p = state.project;
    const load = r.loadAverage.map((v) => v.toFixed(2)).join(' / ');

    const heapPct = r.process.heapTotal ? (r.process.heapUsed / r.process.heapTotal) * 100 : 0;

    document.getElementById('panel-overview').innerHTML = `
      <div class="grid two">
        <div class="card">
          <h2>🤖 Bot status</h2>
          <dl class="kv">
            <dt>Ready</dt><dd>${s.ready ? '✅ Yes' : '❌ No'}</dd>
            <dt>Gateway status</dt><dd>${esc(s.wsStatus)}</dd>
            <dt>WebSocket ping</dt><dd>${s.pingMs != null ? `${s.pingMs} ms` : '—'}</dd>
            <dt>Bot user</dt><dd>${s.user ? `${esc(s.user.tag)} (${esc(s.user.id)})` : '—'}</dd>
            <dt>Guilds</dt><dd>${s.guildCount}</dd>
            <dt>Process uptime</dt><dd>${fmtDuration(r.processUptime * 1000)}</dd>
            <dt>System uptime</dt><dd>${fmtDuration(r.systemUptime * 1000)}</dd>
          </dl>
        </div>

        <div class="card">
          <h2>📦 Project status</h2>
          <dl class="kv">
            <dt>Package</dt><dd>${esc(p.name)}</dd>
            <dt>Version</dt><dd>${esc(p.version)}</dd>
            <dt>Description</dt><dd>${esc(p.description)}</dd>
            <dt>License</dt><dd>${esc(p.license)}</dd>
            <dt>Node.js</dt><dd>${esc(p.node)}</dd>
            <dt>PID</dt><dd>${p.pid}</dd>
            <dt>Started</dt><dd>${fmtDate(p.startedAt)}</dd>
            <dt>Data file</dt><dd><code>${esc(p.dataFile)}</code></dd>
            <dt>Log dir</dt><dd><code>${esc(p.logDir)}</code></dd>
          </dl>
        </div>

        <div class="card">
          <h2>🧠 Memory &amp; CPU</h2>
          <dl class="kv">
            <dt>RSS</dt><dd>${fmtBytes(r.process.rss)}</dd>
            <dt>Heap used / total</dt><dd>${fmtBytes(r.process.heapUsed)} / ${fmtBytes(r.process.heapTotal)}</dd>
            <dt>External</dt><dd>${fmtBytes(r.process.external)}</dd>
            <dt>Array buffers</dt><dd>${fmtBytes(r.process.arrayBuffers)}</dd>
            <dt>System RAM</dt><dd>${fmtBytes(r.system.used)} / ${fmtBytes(r.system.total)} (${fmtPct(r.system.usedPercent)})</dd>
            <dt>Load average</dt><dd>${load}</dd>
            <dt>CPUs</dt><dd>${r.cpuCount}</dd>
            <dt>Host / platform</dt><dd>${esc(r.hostname)} · ${esc(r.platform)} (${esc(r.arch)})</dd>
          </dl>
          <div class="bar ${heapPct > 85 ? 'red' : heapPct > 60 ? 'yellow' : 'green'}" style="margin-top:12px">
            <span style="width:${Math.min(heapPct, 100)}%"></span>
          </div>
          <div class="hint" style="margin-top:6px">Heap usage ${fmtPct(heapPct)}</div>
        </div>

        <div class="card">
          <h2>⚙️ Configuration</h2>
          <dl class="kv">
            <dt>Category ID</dt><dd><code>${esc(p.configuration.categoryId)}</code></dd>
            <dt>Guild ID</dt><dd><code>${esc(p.configuration.guildId ?? '—')}</code></dd>
            <dt>Moderator role</dt><dd>${p.configuration.moderatorRoleConfigured ? 'Configured' : 'Auto (permissions)'}</dd>
            <dt>Log channel</dt><dd>${p.configuration.logChannelConfigured ? 'Configured' : 'Not set'}</dd>
            <dt>Transcript channel</dt><dd>${p.configuration.transcriptChannelConfigured ? 'Configured' : 'Not set'}</dd>
            <dt>Dashboard port</dt><dd>${p.configuration.dashboardPort}</dd>
            <dt>Dashboard auth</dt><dd>${p.configuration.dashboardAuthEnabled ? 'Enabled' : 'Disabled'}</dd>
          </dl>
        </div>
      </div>`;
  }

  function renderTickets() {
    const panel = document.getElementById('panel-tickets');
    const tickets = state.tickets;
    const statusFilter = panel.dataset.status || 'all';
    const query = (panel.dataset.query || '').toLowerCase();

    const filtered = tickets.filter((t) => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'open' && t.status === 'open')
        || (statusFilter === 'closed' && t.status === 'closed')
        || (statusFilter === 'claimed' && t.claimedBy)
        || (statusFilter === 'unclaimed' && t.status === 'open' && !t.claimedBy);
      const hay = `${t.number} ${t.userName ?? ''} ${t.userId} ${t.claimedByName ?? ''} ${t.claimedBy ?? ''} ${t.reason ?? ''}`.toLowerCase();
      return matchesStatus && (!query || hay.includes(query));
    });

    panel.innerHTML = `
      <div class="filterbar">
        <input id="ticket-search" type="search" placeholder="Search tickets…" value="${esc(panel.dataset.query || '')}">
        <select id="ticket-status">
          <option value="all"${statusFilter === 'all' ? ' selected' : ''}>All</option>
          <option value="open"${statusFilter === 'open' ? ' selected' : ''}>Open</option>
          <option value="closed"${statusFilter === 'closed' ? ' selected' : ''}>Closed</option>
          <option value="claimed"${statusFilter === 'claimed' ? ' selected' : ''}>Claimed</option>
          <option value="unclaimed"${statusFilter === 'unclaimed' ? ' selected' : ''}>Unclaimed</option>
        </select>
        <span class="meta">${filtered.length} shown</span>
      </div>
      ${filtered.length ? `
      <table>
        <thead><tr>
          <th>Ticket</th><th>User</th><th>Status</th><th>Claimed by</th><th>Opened</th><th>Closed</th><th>Reason</th>
        </tr></thead>
        <tbody>
          ${filtered.map((t) => `
            <tr data-number="${t.number}">
              <td><strong>${ticketLabel(t.number)}</strong></td>
              <td>${esc(t.userName ?? t.userId)}</td>
              <td><span class="badge ${t.status}">${t.status}</span>${t.anonymous ? ' <span class="badge anon">anon</span>' : ''}</td>
              <td>${t.claimedByName ? esc(t.claimedByName) : '<span class="badge unclaimed">unclaimed</span>'}</td>
              <td>${fmtDate(t.createdAt)}</td>
              <td>${fmtDate(t.closedAt)}</td>
              <td>${esc(t.reason ?? '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty">No tickets match.</div>'}`;

    panel.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', () => openTicket(row.dataset.number));
    });

    const search = panel.querySelector('#ticket-search');
    const select = panel.querySelector('#ticket-status');
    search.addEventListener('input', (e) => { panel.dataset.query = e.target.value; renderTickets(); focusSearch(search, e.target.value); });
    select.addEventListener('change', (e) => { panel.dataset.status = e.target.value; renderTickets(); });
  }

  function focusSearch(input, value) {
    input.value = value;
    input.focus();
    input.setSelectionRange(value.length, value.length);
  }

  function renderModerators() {
    const panel = document.getElementById('panel-moderators');
    const mods = state.moderators;

    if (!mods.length) {
      panel.innerHTML = '<div class="card empty">No moderators detected (bot may be offline, or no members match the moderator role).</div>';
      return;
    }

    panel.innerHTML = `
      <table>
        <thead><tr>
          <th>Moderator</th><th>Roles</th><th>Active claims</th><th>Total closed</th><th>Joined</th>
        </tr></thead>
        <tbody>
          ${mods.map((m) => `
            <tr data-mod="${m.id}">
              <td><div class="person">${avatar(m.avatar)}<div><div class="name">${esc(m.displayName)}${m.bot ? ' 🤖' : ''}</div><div class="id">${esc(m.tag)}</div></div></div></td>
              <td>${m.roles.slice(0, 4).map((r) => `<span class="badge" style="border:1px solid ${esc(r.color)};color:${esc(r.color)}">${esc(r.name)}</span>`).join(' ')}${m.roles.length > 4 ? ' …' : ''}</td>
              <td>${m.activeClaims ? `<span class="badge claimed">${m.activeClaims}</span>` : '0'}</td>
              <td>${m.totalClosedTickets}</td>
              <td>${fmtDate(m.joinedAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    panel.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', () => {
        const m = mods.find((x) => x.id === row.dataset.mod);
        openModerator(m);
      });
    });
  }

  function openModerator(m) {
    openModal(`
      <h3><div class="person">${avatar(m.avatar)}<div><div class="name">${esc(m.displayName)}</div><div class="id">${esc(m.tag)} (${esc(m.id)})</div></div></div></h3>
      <dl class="kv">
        <dt>Username</dt><dd>${esc(m.username)}</dd>
        <dt>Bot</dt><dd>${m.bot ? 'Yes' : 'No'}</dd>
        <dt>Joined server</dt><dd>${fmtDate(m.joinedAt)}</dd>
        <dt>Active claims</dt><dd>${m.activeClaims}</dd>
        <dt>Tickets closed</dt><dd>${m.totalClosedTickets}</dd>
        <dt>Roles</dt><dd>${m.roles.map((r) => esc(r.name)).join(', ') || '—'}</dd>
      </dl>`);
  }

  function renderUsers() {
    const panel = document.getElementById('panel-users');
    const users = state.users;
    const query = (panel.dataset.query || '').toLowerCase();

    const filtered = users.filter((u) =>
      !query || `${u.tag ?? ''} ${u.username ?? ''} ${u.id}`.toLowerCase().includes(query));

    panel.innerHTML = `
      <div class="filterbar">
        <input id="user-search" type="search" placeholder="Search users…" value="${esc(panel.dataset.query || '')}">
        <span class="meta">${filtered.length} shown</span>
      </div>
      ${filtered.length ? `
      <table>
        <thead><tr><th>User</th><th>Open</th><th>Closed</th><th>Total</th><th>Blacklisted</th><th>Last activity</th></tr></thead>
        <tbody>
          ${filtered.map((u) => `
            <tr>
              <td><div class="person">${avatar(u.avatar)}<div><div class="name">${esc(u.username ?? u.tag ?? 'Unknown')}</div><div class="id">${esc(u.id)}</div></div></div></td>
              <td>${u.openTickets}</td>
              <td>${u.closedTickets}</td>
              <td>${u.totalTickets}</td>
              <td>${u.blacklisted ? '<span class="badge closed">blocked</span>' : '—'}</td>
              <td>${fmtDate(u.lastActivity)}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<div class="empty">No users found.</div>'}`;

    const search = panel.querySelector('#user-search');
    search.addEventListener('input', (e) => {
      panel.dataset.query = e.target.value;
      const v = e.target.value;
      renderUsers();
      const inp = panel.querySelector('#user-search');
      inp.value = v; inp.focus(); inp.setSelectionRange(v.length, v.length);
    });
  }

  function renderClaims() {
    const panel = document.getElementById('panel-claims');
    const claims = state.claims;

    if (!claims.length) {
      panel.innerHTML = '<div class="card empty">No tickets are currently claimed.</div>';
      return;
    }

    panel.innerHTML = `
      <table>
        <thead><tr><th>Ticket</th><th>Moderator</th><th>User</th><th>Anonymous</th><th>Opened</th></tr></thead>
        <tbody>
          ${claims.map((c) => `
            <tr data-number="${c.ticketNumber}">
              <td><strong>${ticketLabel(c.ticketNumber)}</strong></td>
              <td><div class="person">${avatar(modAvatar(c.moderatorId))}<div><div class="name">${esc(c.claimedByName ?? c.moderatorId)}</div><div class="id">${esc(c.moderatorId)}</div></div></div></td>
              <td>${esc(state.users.find((u) => u.id === c.userId)?.tag ?? c.userId)}</td>
              <td>${c.anonymous ? '<span class="badge anon">ON</span>' : 'OFF'}</td>
              <td>${fmtDate(c.createdAt)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    panel.querySelectorAll('tbody tr').forEach((row) => {
      row.addEventListener('click', () => openTicket(row.dataset.number));
    });
  }

  function modAvatar(id) {
    const m = state.moderators.find((x) => x.id === id);
    return m?.avatar ?? null;
  }

  async function openTicket(number) {
    try {
      const detail = await api(`/api/ticket/${number}`);
      const convo = detail.conversation.map(renderMessage).join('');

      openModal(`
        <h3>Ticket ${ticketLabel(detail.number)} <span class="badge ${detail.status}">${detail.status}</span>${detail.anonymous ? ' <span class="badge anon">anon</span>' : ''}</h3>
        <dl class="kv">
          <dt>User</dt><dd>${esc(detail.userName ?? detail.userId)}</dd>
          <dt>Claimed by</dt><dd>${detail.claimedByName ? esc(detail.claimedByName) : 'Unclaimed'}</dd>
          <dt>Opened</dt><dd>${fmtDate(detail.createdAt)}</dd>
          <dt>Closed</dt><dd>${fmtDate(detail.closedAt)}</dd>
          <dt>Duration</dt><dd>${fmtDuration(detail.durationMs)}</dd>
          <dt>Reason</dt><dd>${esc(detail.reason ?? '—')}</dd>
          <dt>Messages</dt><dd>${detail.messageCount}</dd>
          <dt>Feedback</dt><dd>${esc(detail.feedback ?? '—')}</dd>
        </dl>
        ${detail.status === 'closed' && detail.hasTranscript ? `
          <div style="margin:12px 0">
            <a href="/api/ticket/${detail.number}/transcript?staff=1${token ? `&token=${encodeURIComponent(token)}` : ''}" target="_blank" rel="noopener">Staff transcript</a> ·
            <a href="/api/ticket/${detail.number}/transcript${token ? `?token=${encodeURIComponent(token)}` : ''}" target="_blank" rel="noopener">User transcript</a>
          </div>` : ''}
        <h3>Conversation</h3>
        <div class="convo">${convo || '<div class="empty">No messages recorded.</div>'}</div>`);
    } catch (error) {
      openModal(`<h3>Error</h3><p>${esc(error.message)}</p>`);
    }
  }

  function renderMessage(entry) {
    const type = entry.type || 'system';
    const name = esc(entry.authorName ?? 'System');
    const time = esc(entry.t ?? '');
    const content = esc(entry.content ?? '');
    const atts = (entry.attachments ?? []).map((u) =>
      `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.split('/').pop() || 'attachment')}</a>`).join('');
    const tag = type === 'note' ? '<span class="tag">internal</span>'
      : type === 'feedback' ? '<span class="tag">feedback</span>' : '';

    return `
      <div class="msg ${type}">
        <div class="mhead"><span class="mname">${name}</span><span class="mtime">${time}</span>${tag}</div>
        ${content ? `<div class="content">${content}</div>` : ''}
        ${atts ? `<div class="atts">${atts}</div>` : ''}
      </div>`;
  }

  function renderLogs() {
    const panel = document.getElementById('panel-logs');
    const entries = state.logs.entries;
    const level = panel.dataset.level || 'all';
    const kind = panel.dataset.kind || 'all';
    const query = (panel.dataset.query || '').toLowerCase();

    const filtered = entries.filter((e) => {
      const eLevel = e.kind === 'audit' ? (e.severity || 'info') : e.level;
      const matchesLevel = level === 'all' || eLevel === level;
      const matchesKind = kind === 'all'
        || (kind === 'audit' && e.kind === 'audit')
        || (kind === 'general' && e.kind !== 'audit');
      const hay = `${e.message ?? ''} ${e.event ?? ''} ${JSON.stringify(e.data ?? '')}`.toLowerCase();
      return matchesLevel && matchesKind && (!query || hay.includes(query));
    });

    panel.innerHTML = `
      <div class="filterbar">
        <input id="log-search" type="search" placeholder="Search logs…" value="${esc(panel.dataset.query || '')}">
        <select id="log-kind">
          <option value="all"${kind === 'all' ? ' selected' : ''}>All streams</option>
          <option value="general"${kind === 'general' ? ' selected' : ''}>General</option>
          <option value="audit"${kind === 'audit' ? ' selected' : ''}>Audit (sensitive)</option>
        </select>
        <select id="log-level">
          <option value="all"${level === 'all' ? ' selected' : ''}>All levels</option>
          <option value="debug"${level === 'debug' ? ' selected' : ''}>Debug</option>
          <option value="info"${level === 'info' ? ' selected' : ''}>Info</option>
          <option value="warn"${level === 'warn' ? ' selected' : ''}>Warn</option>
          <option value="error"${level === 'error' ? ' selected' : ''}>Error</option>
          <option value="critical"${level === 'critical' ? ' selected' : ''}>Critical</option>
        </select>
        <span class="meta">${filtered.length} entries · files: ${esc(state.logs.files.general)}, ${esc(state.logs.files.audit)}</span>
      </div>
      <div class="logview">
        ${filtered.map(renderLogLine).join('') || '<div class="empty">No log entries.</div>'}
      </div>`;

    const search = panel.querySelector('#log-search');
    search.addEventListener('input', (e) => {
      panel.dataset.query = e.target.value; renderLogs();
      const inp = panel.querySelector('#log-search'); inp.focus();
      inp.setSelectionRange(e.target.value.length, e.target.value.length);
    });
    panel.querySelector('#log-kind').addEventListener('change', (e) => { panel.dataset.kind = e.target.value; renderLogs(); });
    panel.querySelector('#log-level').addEventListener('change', (e) => { panel.dataset.level = e.target.value; renderLogs(); });
  }

  function renderLogLine(e) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    if (e.kind === 'audit') {
      const level = e.severity || 'info';
      return `<div class="logline audit lv-${level}"><span class="ltime">${esc(time)}</span><span class="llevel">audit·${level}</span><span class="lmsg"><strong>${esc(e.event)}</strong> — ${esc(e.message)}</span></div>`;
    }
    const level = e.level;
    return `<div class="logline lv-${level}"><span class="ltime">${esc(time)}</span><span class="llevel">${level}</span><span class="lmsg">${esc(e.message)}${e.data ? ` ${esc(JSON.stringify(e.data))}` : ''}</span></div>`;
  }

  // ---------------------------------------------------------------------------
  // tab switching & refresh
  // ---------------------------------------------------------------------------

  function renderActive() {
    switch (activeTab) {
      case 'overview': renderOverview(); break;
      case 'tickets': renderTickets(); break;
      case 'moderators': renderModerators(); break;
      case 'users': renderUsers(); break;
      case 'claims': renderClaims(); break;
      case 'logs': renderLogs(); break;
    }
  }

  function renderAll() {
    renderHeader();
    renderStats();
    renderActive();
  }

  async function refresh() {
    try {
      state = await api('/api/overview');
      lastLogSeq = state.logs.latestSeq;
      renderAll();
    } catch (error) {
      document.getElementById('status-text').textContent = error.message;
      document.getElementById('status-pill').className = 'pill offline';
    }
  }

  async function refreshLogs() {
    try {
      const data = await api(`/api/logs?since=${lastLogSeq}`);
      lastLogSeq = data.latestSeq;
      if (activeTab === 'logs' && state && data.entries.length) {
        state.logs.entries = state.logs.entries.concat(data.entries).slice(-500);
        renderLogs();
      }
    } catch {
      /* transient */
    }
  }

  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${activeTab}`));
    renderActive();
  });

  refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(refreshLogs, 1500);
})();
