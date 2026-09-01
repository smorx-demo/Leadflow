Auth.requireAuth();

const state = {
  user: Auth.getUser(),
  usersCache: null,
};

const STATUS_LABELS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', closed: 'Closed' };
const STATUS_COLORS = { new: '#3B82F6', contacted: '#D6960B', qualified: '#1FA971', closed: '#6B7280' };
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', other: 'Other' };

// ---------------- Utilities ----------------

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(d) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(d) {
  const then = new Date(d + 'Z');
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(d);
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

function statusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function toast(message, isError = false) {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function openModal(html) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay" id="modalOverlay"><div class="modal">${html}</div></div>`;
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

async function withButtonLoading(btn, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------- Shell: sidebar + routing ----------------

const NAV_ICONS = {
  dashboard: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/><rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2"/></svg>',
  leads: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12Z" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="2"/></svg>',
  followups: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  activity: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 12h4l2.5 7L14 5l2.5 7H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  analytics: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 16V10M12 16V7M17 16V4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
  users: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.5" stroke="currentColor" stroke-width="2"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" stroke="currentColor" stroke-width="2"/><path d="M16 4.5c1.7.3 3 1.9 3 3.7 0 1.8-1.3 3.3-3 3.7M20 20c0-2.9-1.9-5.3-4.5-6.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const ROUTES = [
  { hash: '#dashboard', label: 'Dashboard', icon: 'dashboard', adminOnly: false },
  { hash: '#leads', label: 'Leads', icon: 'leads', adminOnly: false },
  { hash: '#followups', label: 'Follow-ups', icon: 'followups', adminOnly: false },
  { hash: '#activity', label: 'Activity', icon: 'activity', adminOnly: false },
  { hash: '#analytics', label: 'Analytics', icon: 'analytics', adminOnly: false },
  { hash: '#users', label: 'Users', icon: 'users', adminOnly: true },
];

function renderSidebar() {
  const isAdmin = Auth.isAdmin();
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = ROUTES.filter(r => !r.adminOnly || isAdmin).map(r => `
    <button class="nav-item ${location.hash === r.hash || (!location.hash && r.hash === '#dashboard') ? 'active' : ''}" data-hash="${r.hash}">
      ${NAV_ICONS[r.icon]}<span>${r.label}</span>
    </button>
  `).join('');
  nav.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.hash;
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  document.getElementById('userChipName').textContent = state.user.name;
  document.getElementById('userChipRole').textContent = isAdmin ? 'Super Admin' : 'Individual User';
  document.getElementById('avatarInitial').textContent = initials(state.user.name);
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  Auth.clear();
  window.location.href = 'index.html';
});
document.getElementById('hamburgerBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

const views = {
  '#dashboard': Auth.isAdmin() ? () => renderAdminDashboard() : () => renderUserDashboard(),
  '#leads': renderLeadsView,
  '#followups': renderFollowupsView,
  '#activity': renderActivityView,
  '#analytics': renderAnalyticsView,
  '#users': renderUsersView,
};

async function router() {
  const hash = location.hash || '#dashboard';
  renderSidebar();
  const content = document.getElementById('content');
  content.innerHTML = '<div class="spinner"></div>';
  document.getElementById('topbarActions').innerHTML = '';

  const route = ROUTES.find(r => r.hash === hash);
  if (route && route.adminOnly && !Auth.isAdmin()) {
    window.location.hash = '#dashboard';
    return;
  }

  destroyCharts();
  const titles = { '#dashboard': 'Dashboard', '#leads': 'Leads', '#followups': 'Follow-ups', '#activity': 'Activity', '#analytics': 'Analytics', '#users': 'Users' };
  const subs = {
    '#dashboard': Auth.isAdmin() ? 'System-wide performance and KPIs' : 'Your pipeline at a glance',
    '#leads': 'Track and manage your leads',
    '#followups': 'Stay on top of every next action',
    '#activity': Auth.isAdmin() ? 'Everything happening across the team' : 'Your recent actions',
    '#analytics': 'Lead trends, conversion and location insights',
    '#users': 'Manage individual user accounts',
  };
  document.getElementById('pageTitle').textContent = titles[hash] || 'Dashboard';
  document.getElementById('pageSub').textContent = subs[hash] || '';

  try {
    const handler = hash === '#dashboard' ? (Auth.isAdmin() ? renderAdminDashboard : renderUserDashboard) : views[hash];
    if (handler) await handler();
    else await renderUserDashboard();
  } catch (e) {
    content.innerHTML = `<div class="card"><div class="card-body">${esc(e.message)}</div></div>`;
  }
}
window.addEventListener('hashchange', router);

// ---------------- Pipeline strip component ----------------

function pipelineStrip(counts) {
  // counts: {new, contacted, qualified, closed}
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order = ['new', 'contacted', 'qualified', 'closed'];
  const segs = order.map(key => {
    const pct = Math.max((counts[key] || 0) / total, counts[key] > 0 ? 0.06 : 0);
    return `<div class="pipeline-seg" style="flex-grow:${pct};background:${STATUS_COLORS[key]}" title="${STATUS_LABELS[key]}: ${counts[key] || 0}">
      ${counts[key] ? `${counts[key]}<small>${STATUS_LABELS[key]}</small>` : ''}
    </div>`;
  }).join('');
  const legend = order.map(key => `
    <div class="legend-item"><span class="legend-dot" style="background:${STATUS_COLORS[key]}"></span>${STATUS_LABELS[key]} — ${counts[key] || 0}</div>
  `).join('');
  return `<div class="pipeline-strip">${segs}</div><div class="pipeline-legend">${legend}</div>`;
}

function statusCountsFromArray(arr) {
  const out = { new: 0, contacted: 0, qualified: 0, closed: 0 };
  (arr || []).forEach(s => { out[s.status] = s.count; });
  return out;
}

// ---------------- Admin Dashboard ----------------

async function renderAdminDashboard() {
  const d = await Api.adminDashboard();
  const counts = statusCountsFromArray(d.leads_by_status);
  const content = document.getElementById('content');

  const maxDaily = Math.max(...d.daily_activity.map(p => p.count), 1);
  const sparkline = d.daily_activity.map(p => `
    <div title="${p.date}: ${p.count}" style="flex:1;display:flex;align-items:flex-end;">
      <div style="width:100%;background:var(--brand);opacity:.85;border-radius:3px 3px 0 0;height:${Math.max((p.count / maxDaily) * 60, 3)}px"></div>
    </div>
  `).join('');

  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Total leads</div><div class="kpi-value">${d.total_leads}</div><div class="kpi-sub">Across ${d.total_users} user${d.total_users === 1 ? '' : 's'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Overdue follow-ups</div><div class="kpi-value ${d.overdue_followups ? 'kpi-flag' : ''}">${d.overdue_followups}</div><div class="kpi-sub">Need attention now</div></div>
      <div class="kpi-card"><div class="kpi-label">Follow-up completion</div><div class="kpi-value">${d.followups_completed_rate}<small>%</small></div><div class="kpi-sub">Of all logged follow-ups</div></div>
      <div class="kpi-card"><div class="kpi-label">Qualified leads</div><div class="kpi-value">${counts.qualified}</div><div class="kpi-sub">${counts.closed} closed to date</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Pipeline by stage</h2></div>
      <div class="card-body">${pipelineStrip(counts)}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Activity — last 14 days</h2></div>
      <div class="card-body"><div style="display:flex;gap:4px;height:70px;align-items:flex-end;">${sparkline}</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Performance by user</h2></div>
      <div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Total</th><th>New</th><th>Contacted</th><th>Qualified</th><th>Closed</th><th>Overdue</th><th>Follow-ups (7d)</th></tr></thead>
        <tbody>
          ${d.user_breakdown.length === 0 ? `<tr><td colspan="8" class="empty-state">No individual users yet. Add one from the Users tab.</td></tr>` : d.user_breakdown.map(u => `
            <tr>
              <td class="cell-name">${esc(u.user_name)}</td>
              <td>${u.total_leads}</td>
              <td>${u.new}</td>
              <td>${u.contacted}</td>
              <td>${u.qualified}</td>
              <td>${u.closed}</td>
              <td>${u.overdue_followups ? `<span class="overdue-text">${u.overdue_followups}</span>` : '0'}</td>
              <td>${u.followups_this_week}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Recent activity — all users</h2></div>
      <div class="activity-list">${activityListHtml(d.recent_activity)}</div>
    </div>
  `;
}

// ---------------- User Dashboard ----------------

async function renderUserDashboard() {
  const d = await Api.myDashboard();
  const counts = statusCountsFromArray(d.leads_by_status);
  const content = document.getElementById('content');

  content.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">My leads</div><div class="kpi-value">${d.total_leads}</div><div class="kpi-sub">${counts.new} new this pipeline</div></div>
      <div class="kpi-card"><div class="kpi-label">Conversion rate</div><div class="kpi-value">${d.conversion_rate}<small>%</small></div><div class="kpi-sub">Leads closed</div></div>
      <div class="kpi-card"><div class="kpi-label">Pending follow-ups</div><div class="kpi-value">${d.pending_followups}</div><div class="kpi-sub">${d.overdue_followups ? `<span class="overdue-text">${d.overdue_followups} overdue</span>` : 'All on track'}</div></div>
      <div class="kpi-card"><div class="kpi-label">Activity this week</div><div class="kpi-value">${d.activity_this_week}</div><div class="kpi-sub">Actions logged</div></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>My pipeline</h2></div>
      <div class="card-body">${pipelineStrip(counts)}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Upcoming follow-ups</h2><button class="btn btn-secondary btn-sm" id="quickLogFollowup">+ Log follow-up</button></div>
      <div class="table-wrap">${followupsTableHtml(d.upcoming_followups, false)}</div>
    </div>

    <div class="card">
      <div class="card-head"><h2>My recent activity</h2></div>
      <div class="activity-list">${activityListHtml(d.recent_activity)}</div>
    </div>
  `;

  const quickBtn = document.getElementById('quickLogFollowup');
  if (quickBtn) quickBtn.addEventListener('click', () => openFollowupModal());
}

function activityListHtml(activities) {
  if (!activities || activities.length === 0) return `<div class="empty-state">No activity yet.</div>`;
  return activities.map(a => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div>
        <div class="activity-text">${esc(a.description)}</div>
        <div class="activity-time">${timeAgo(a.created_at)}</div>
      </div>
    </div>
  `).join('');
}

// ---------------- Chart lifecycle ----------------

const chartInstances = {};
function destroyCharts() {
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch (_) {} });
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);
}

// ---------------- Leads View ----------------

let leadsFilterState = { status: '', q: '', location: '', overdue_only: false, user_id: '' };

async function renderLeadsView() {
  const content = document.getElementById('content');
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="newLeadBtn">+ New lead</button>`;

  let usersOptions = '';
  if (Auth.isAdmin()) {
    if (!state.usersCache) state.usersCache = await Api.listUsers();
    usersOptions = `<option value="">All users</option>` + state.usersCache
      .filter(u => u.role === 'user')
      .map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }

  content.innerHTML = `
    <div class="card">
      <div class="filters-bar">
        <input type="text" id="leadSearch" placeholder="Search name, email, phone…" value="${esc(leadsFilterState.q)}">
        <select id="leadLocationFilter">
          <option value="">All locations</option>
        </select>
        <select id="leadStatusFilter">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="closed">Closed</option>
        </select>
        ${Auth.isAdmin() ? `<select id="leadUserFilter">${usersOptions}</select>` : ''}
        <div class="pill-toggle">
          <button id="overdueToggle" class="${leadsFilterState.overdue_only ? 'active' : ''}">Overdue only</button>
        </div>
      </div>
      <div class="table-wrap" id="leadsTableWrap"><div class="spinner"></div></div>
    </div>
  `;

  // Populate location dropdown from API (non-blocking)
  Api.getLeadLocations().then(locs => {
    const sel = document.getElementById('leadLocationFilter');
    if (!sel) return;
    locs.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc;
      if (loc === leadsFilterState.location) opt.selected = true;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  document.getElementById('leadStatusFilter').value = leadsFilterState.status;
  if (Auth.isAdmin()) document.getElementById('leadUserFilter').value = leadsFilterState.user_id;

  document.getElementById('newLeadBtn').addEventListener('click', () => openLeadModal());
  document.getElementById('leadStatusFilter').addEventListener('change', (e) => { leadsFilterState.status = e.target.value; loadLeadsTable(); });
  if (Auth.isAdmin()) document.getElementById('leadUserFilter').addEventListener('change', (e) => { leadsFilterState.user_id = e.target.value; loadLeadsTable(); });
  document.getElementById('overdueToggle').addEventListener('click', (e) => {
    leadsFilterState.overdue_only = !leadsFilterState.overdue_only;
    e.target.classList.toggle('active', leadsFilterState.overdue_only);
    loadLeadsTable();
  });
  let searchDebounce;
  document.getElementById('leadSearch').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    leadsFilterState.q = e.target.value;
    searchDebounce = setTimeout(loadLeadsTable, 300);
  });
  document.getElementById('leadLocationFilter').addEventListener('change', (e) => {
    leadsFilterState.location = e.target.value;
    loadLeadsTable();
  });

  await loadLeadsTable();
}

async function loadLeadsTable() {
  const wrap = document.getElementById('leadsTableWrap');
  wrap.innerHTML = '<div class="spinner"></div>';
  const leads = await Api.listLeads({
    status: leadsFilterState.status,
    q: leadsFilterState.q,
    location: leadsFilterState.location,
    overdue_only: leadsFilterState.overdue_only,
    user_id: leadsFilterState.user_id,
  });
  wrap.innerHTML = leadsTableHtml(leads);
  wrap.querySelectorAll('[data-open-lead]').forEach(el => {
    el.addEventListener('click', () => openLeadDetail(el.dataset.openLead));
  });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len).trimEnd() + '…' : str;
}

function leadsTableHtml(leads) {
  if (leads.length === 0) {
    return `<div class="empty-state">No leads match these filters yet.<br>Try clearing filters or add a new lead.</div>`;
  }
  return `
    <table class="responsive-cards">
      <thead><tr><th>Client</th><th>Contact</th><th>Location</th><th>Status / Notes</th>${Auth.isAdmin() ? '<th>Owner</th>' : ''}<th>Next action</th></tr></thead>
      <tbody>
        ${leads.map(l => {
          const pc = l.contacts && l.contacts.length > 0
            ? l.contacts[0]
            : { name: l.contact_person, designation: null, phone: l.contact_phone, email: l.contact_email };
          const extraContacts = l.contacts && l.contacts.length > 1 ? ` <span style="color:var(--ink-soft);font-size:11px">+${l.contacts.length - 1} more</span>` : '';
          return `
          <tr data-open-lead="${l.id}" style="cursor:pointer">
            <td data-label="Client" class="cell-name-cell">
              <div class="cell-name">${esc(l.client_name)}</div>
              ${pc.name ? `<div class="cell-sub">${esc(pc.name)}${pc.designation ? ` · ${esc(pc.designation)}` : ''}${extraContacts}</div>` : ''}
            </td>
            <td data-label="Contact">
              ${pc.phone ? `<div class="cell-name" style="font-size:13.5px">${esc(pc.phone)}</div>` : ''}
              ${pc.email ? `<div class="cell-sub">${esc(pc.email)}</div>` : ''}
              ${!pc.phone && !pc.email ? '—' : ''}
            </td>
            <td data-label="Location">
              ${l.address ? `<div style="font-size:13px;color:var(--ink)">${esc(truncate(l.address, 40))}</div>` : '<span class="cell-sub">—</span>'}
            </td>
            <td data-label="Status / Notes">
              ${statusBadge(l.status)}
              ${l.notes ? `<div class="cell-sub" style="margin-top:5px">${esc(truncate(l.notes, 55))}</div>` : ''}
            </td>
            ${Auth.isAdmin() ? `<td data-label="Owner">${esc(l.owner_name || '—')}</td>` : ''}
            <td data-label="Next action">${l.next_action_date ? `<span class="${isOverdue(l.next_action_date) ? 'overdue-text' : ''}">${fmtDate(l.next_action_date)}</span>` : '—'}</td>
          </tr>
        `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function openLeadDetail(leadId) {
  openModal(`
    <div class="modal-head"><h3>Loading…</h3><button class="modal-close" id="closeModalBtn">&times;</button></div>
    <div class="modal-body"><div class="spinner"></div></div>
  `);
  const modalEl = document.querySelector('.modal');
  modalEl.classList.add('modal-lg');
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);

  try {
    const [lead, followups, activities] = await Promise.all([
      Api.getLead(leadId),
      Api.getLeadFollowups(leadId),
      Api.getLeadActivities(leadId),
    ]);

    const fupHtml = followups.length === 0
      ? `<div class="empty-state" style="padding:12px 0 4px">No follow-ups yet.</div>`
      : followups.map(f => `
        <div class="fup-item">
          <div class="fup-dot ${f.completed ? 'fup-dot-done' : 'fup-dot-pending'}"></div>
          <div class="fup-main">
            <div class="fup-note">${esc(f.note)}</div>
            <div class="fup-meta">
              <span>Follow-up: ${fmtDate(f.follow_up_date)}</span>
              ${f.next_action_date ? `<span class="${!f.completed && isOverdue(f.next_action_date) ? 'overdue-text' : ''}">Next: ${fmtDate(f.next_action_date)}</span>` : ''}
              ${f.completed
                ? `<span class="badge badge-closed" style="font-size:11px;padding:2px 7px">Done</span>`
                : `<span class="badge badge-new" style="font-size:11px;padding:2px 7px">Pending</span>`}
            </div>
          </div>
          ${!f.completed ? `<button class="btn btn-secondary btn-sm" data-complete-fup="${f.id}">Mark done</button>` : ''}
        </div>
      `).join('');

    const actHtml = activities.length === 0
      ? `<div class="empty-state" style="padding:12px 0 4px">No activity yet.</div>`
      : activities.map(a => `
        <div class="activity-item">
          <div class="activity-dot"></div>
          <div>
            <div class="activity-text">${esc(a.description)}</div>
            <div class="activity-time">${timeAgo(a.created_at)}</div>
          </div>
        </div>
      `).join('');

    modalEl.innerHTML = `
      <div class="modal-head">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          ${statusBadge(lead.status)}
          <h3 style="margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(lead.client_name)}</h3>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" id="editLeadBtn">Edit</button>
          <button class="modal-close" id="closeModalBtn">&times;</button>
        </div>
      </div>

      <div class="detail-section">
        <div class="detail-section-head">Contact information</div>
        ${(() => {
          const contacts = lead.contacts && lead.contacts.length > 0
            ? lead.contacts
            : (lead.contact_person || lead.contact_phone || lead.contact_email)
              ? [{ name: lead.contact_person, designation: null, phone: lead.contact_phone, email: lead.contact_email }]
              : [];
          if (!contacts.length) return `<div class="info-value" style="color:var(--ink-soft);margin-bottom:14px">No contacts added.</div>`;
          return contacts.map((c, i) => {
            const notLast = i < contacts.length - 1;
            const sep = notLast ? 'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)' : 'margin-bottom:14px';
            const priority = c.priority || 'medium';
            return `<div style="${sep}">
                <div class="lead-info-grid">
                  <div><div class="info-label">Name</div><div class="info-value">${esc(c.name || '—')}</div></div>
                  <div><div class="info-label">Designation</div><div class="info-value">${esc(c.designation || '—')}</div></div>
                  <div><div class="info-label">Phone</div><div class="info-value">${esc(c.phone || '—')}</div></div>
                  <div><div class="info-label">Email</div><div class="info-value">${esc(c.email || '—')}</div></div>
                  <div><div class="info-label">Pitch priority</div><div class="info-value"><span class="badge badge-priority-${priority}">${PRIORITY_LABELS[priority] || priority}</span></div></div>
                </div>
                ${c.solution_notes ? `<div style="margin-top:10px"><div class="info-label">Advanced solution suggestions</div><div class="info-value" style="margin-top:4px;line-height:1.6;white-space:pre-wrap">${esc(c.solution_notes)}</div></div>` : ''}
              </div>`;
          }).join('');
        })()}
        <div class="lead-info-grid" style="margin-top:4px">
          <div><div class="info-label">Source</div><div class="info-value">${esc(lead.source || '—')}</div></div>
          ${Auth.isAdmin() ? `<div><div class="info-label">Owner</div><div class="info-value">${esc(lead.owner_name || '—')}</div></div>` : ''}
          <div><div class="info-label">Created</div><div class="info-value">${fmtDate(lead.created_at)}</div></div>
          <div><div class="info-label">Last updated</div><div class="info-value">${fmtDate(lead.updated_at)}</div></div>
        </div>
        ${lead.address ? `<div style="margin-top:14px"><div class="info-label">Address</div><div class="info-value" style="margin-top:4px;line-height:1.6">${esc(lead.address)}</div></div>` : ''}
        ${lead.notes ? `<div style="margin-top:14px"><div class="info-label">Notes / Reason</div><div class="info-value" style="margin-top:4px;line-height:1.6;white-space:pre-wrap">${esc(lead.notes)}</div></div>` : ''}
      </div>

      <div class="detail-section">
        <div class="detail-section-head">
          <span>Follow-ups (${followups.length})</span>
          <button class="btn btn-secondary btn-sm" id="addFollowupBtn">+ Follow-up</button>
        </div>
        <div id="fupList">${fupHtml}</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-head">Activity history</div>
        <div class="activity-list" style="max-height:260px;overflow-y:auto">${actHtml}</div>
      </div>
    `;

    document.getElementById('closeModalBtn').addEventListener('click', closeModal);

    document.getElementById('editLeadBtn').addEventListener('click', () => {
      closeModal();
      openLeadModal(leadId, () => {
        if (document.getElementById('leadsTableWrap')) loadLeadsTable();
        openLeadDetail(leadId);
      });
    });

    document.getElementById('addFollowupBtn').addEventListener('click', () => {
      closeModal();
      openFollowupModal(null, leadId, lead.client_name, () => {
        if (document.getElementById('leadsTableWrap')) loadLeadsTable();
        openLeadDetail(leadId);
      });
    });

    modalEl.querySelectorAll('[data-complete-fup]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await Api.updateFollowup(btn.dataset.completeFup, { completed: true });
          toast('Follow-up marked complete');
          if (document.getElementById('leadsTableWrap')) loadLeadsTable();
          openLeadDetail(leadId);
        } catch (ex) { toast(ex.message, true); }
      });
    });

  } catch (e) {
    modalEl.innerHTML = `
      <div class="modal-head"><h3>Error</h3><button class="modal-close" id="closeModalBtn">&times;</button></div>
      <div class="modal-body"><div class="form-error">${esc(e.message)}</div></div>
    `;
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  }
}

function buildContactBlock(contact = {}) {
  const div = document.createElement('div');
  div.className = 'contact-block';
  div.innerHTML = `
    <div class="contact-block-header">
      <span class="contact-block-num">Contact person</span>
      <button type="button" class="btn btn-ghost btn-sm contact-remove-btn" style="color:var(--danger);padding:3px 8px">× Remove</button>
    </div>
    <div class="field-row">
      <label class="field"><span>Name</span><input type="text" class="c_name" placeholder="Full name" value="${esc(contact.name || '')}"></label>
      <label class="field"><span>Designation</span><input type="text" class="c_designation" placeholder="e.g. Manager, CEO" value="${esc(contact.designation || '')}"></label>
    </div>
    <div class="field-row" style="margin-top:10px">
      <label class="field"><span>Phone</span><input type="tel" class="c_phone" placeholder="Contact number" value="${esc(contact.phone || '')}"></label>
      <label class="field"><span>Email</span><input type="email" class="c_email" placeholder="Email address" value="${esc(contact.email || '')}"></label>
    </div>
    <div class="field-row" style="margin-top:10px">
      <label class="field"><span>Pitch priority</span>
        <select class="c_priority">
          ${['high', 'medium', 'low', 'other'].map(p => `<option value="${p}" ${(contact.priority || 'medium') === p ? 'selected' : ''}>${PRIORITY_LABELS[p]}</option>`).join('')}
        </select>
      </label>
    </div>
    <label class="field" style="margin-top:10px"><span>Advanced solution suggestions</span><textarea class="c_solution_notes" rows="2" placeholder="What solution/pitch angle to use with this contact…">${esc(contact.solution_notes || '')}</textarea></label>
  `;
  div.querySelector('.contact-remove-btn').addEventListener('click', () => div.remove());
  return div;
}

async function openLeadModal(leadId = null, afterSave = null) {
  const isEdit = !!leadId;
  let lead = { client_name: '', contact_person: '', contact_phone: '', contact_email: '', address: '', source: '', status: 'new', notes: '' };
  if (isEdit) lead = await Api.getLead(leadId);

  openModal(`
    <div class="modal-head"><h3>${isEdit ? 'Edit lead' : 'New lead'}</h3><button class="modal-close" id="closeModalBtn">&times;</button></div>
    <div class="modal-body">
      <label class="field"><span>Company / Client name</span><input type="text" id="f_client_name" value="${esc(lead.client_name)}" required></label>
      <div class="contacts-section" style="margin-top:14px">
        <div class="contacts-section-label">Contact people</div>
        <div id="contactsList"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addContactBtn" style="margin-top:2px">+ Add contact</button>
      </div>
      <label class="field" style="margin-top:14px"><span>Address</span><input type="text" id="f_address" placeholder="Street, City, State…" value="${esc(lead.address || '')}"></label>
      <div class="field-row" style="margin-top:14px">
        <label class="field"><span>Source</span><input type="text" id="f_source" placeholder="Website, Referral…" value="${esc(lead.source || '')}"></label>
        <label class="field"><span>Status</span>
          <select id="f_status">
            ${['new', 'contacted', 'qualified', 'closed'].map(s => `<option value="${s}" ${lead.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="field"><span>Notes / Reason</span><textarea id="f_notes" rows="3" placeholder="Reason for current status, key points…">${esc(lead.notes || '')}</textarea></label>
      <div id="leadFormError" class="form-error" hidden></div>
    </div>
    <div class="modal-foot">
      ${isEdit ? `<button class="btn btn-danger" id="deleteLeadBtn" style="margin-right:auto">Delete</button>` : ''}
      ${isEdit ? `<button class="btn btn-secondary" id="addFollowupFromLead">+ Follow-up</button>` : ''}
      <button class="btn btn-ghost" id="cancelLeadBtn">Cancel</button>
      <button class="btn btn-primary" id="saveLeadBtn">${isEdit ? 'Save changes' : 'Create lead'}</button>
    </div>
  `);
  document.querySelector('.modal').classList.add('modal-lg');

  // Populate contacts list
  const contactsList = document.getElementById('contactsList');
  let initialContacts = [];
  if (isEdit && lead.contacts && lead.contacts.length > 0) {
    initialContacts = lead.contacts;
  } else if (isEdit && (lead.contact_person || lead.contact_phone || lead.contact_email)) {
    initialContacts = [{ name: lead.contact_person || '', designation: null, phone: lead.contact_phone || '', email: lead.contact_email || '' }];
  } else {
    initialContacts = [{}];
  }
  initialContacts.forEach(c => contactsList.appendChild(buildContactBlock(c)));
  document.getElementById('addContactBtn').addEventListener('click', () => contactsList.appendChild(buildContactBlock()));

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelLeadBtn').addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('deleteLeadBtn').addEventListener('click', async () => {
      if (!confirm(`Delete lead "${lead.client_name}"? This cannot be undone.`)) return;
      try {
        await Api.deleteLead(leadId);
        closeModal();
        toast('Lead deleted');
        loadLeadsTable();
      } catch (e) { toast(e.message, true); }
    });
    document.getElementById('addFollowupFromLead').addEventListener('click', () => {
      closeModal();
      openFollowupModal(null, leadId, lead.client_name, afterSave);
    });
  }

  document.getElementById('saveLeadBtn').addEventListener('click', async (e) => {
    const contacts = [];
    document.querySelectorAll('#contactsList .contact-block').forEach(block => {
      const name = block.querySelector('.c_name').value.trim();
      if (name) {
        contacts.push({
          name,
          designation: block.querySelector('.c_designation').value.trim() || null,
          phone: block.querySelector('.c_phone').value.trim() || null,
          email: block.querySelector('.c_email').value.trim() || null,
          priority: block.querySelector('.c_priority').value,
          solution_notes: block.querySelector('.c_solution_notes').value.trim() || null,
        });
      }
    });
    const payload = {
      client_name: document.getElementById('f_client_name').value.trim(),
      address: document.getElementById('f_address').value.trim() || null,
      source: document.getElementById('f_source').value.trim() || null,
      status: document.getElementById('f_status').value,
      notes: document.getElementById('f_notes').value.trim() || null,
      contacts,
    };
    const errEl = document.getElementById('leadFormError');
    if (!payload.client_name) {
      errEl.textContent = 'Client name is required.';
      errEl.hidden = false;
      return;
    }
    await withButtonLoading(e.target, async () => {
      try {
        if (isEdit) await Api.updateLead(leadId, payload);
        else await Api.createLead(payload);
        closeModal();
        toast(isEdit ? 'Lead updated' : 'Lead created');
        if (afterSave) { afterSave(); return; }
        if (location.hash === '#leads' || location.hash === '') loadLeadsTable();
        else router();
      } catch (ex) {
        errEl.textContent = ex.message;
        errEl.hidden = false;
      }
    });
  });
}

// ---------------- Follow-ups View ----------------

let followupsFilterState = { pending_only: true };

async function renderFollowupsView() {
  const content = document.getElementById('content');
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="newFollowupBtn">+ Log follow-up</button>`;

  content.innerHTML = `
    <div class="card">
      <div class="filters-bar">
        <div class="pill-toggle">
          <button id="pendingToggle" class="${followupsFilterState.pending_only ? 'active' : ''}">Pending</button>
          <button id="allToggle" class="${!followupsFilterState.pending_only ? 'active' : ''}">All</button>
        </div>
      </div>
      <div class="table-wrap" id="followupsTableWrap"><div class="spinner"></div></div>
    </div>
  `;

  document.getElementById('newFollowupBtn').addEventListener('click', () => openFollowupModal());
  document.getElementById('pendingToggle').addEventListener('click', () => { followupsFilterState.pending_only = true; renderFollowupsView(); });
  document.getElementById('allToggle').addEventListener('click', () => { followupsFilterState.pending_only = false; renderFollowupsView(); });

  await loadFollowupsTable();
}

async function loadFollowupsTable() {
  const wrap = document.getElementById('followupsTableWrap');
  const fups = await Api.listFollowups({ pending_only: followupsFilterState.pending_only });
  wrap.innerHTML = followupsTableHtml(fups, true);
  wrap.querySelectorAll('[data-complete]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await Api.updateFollowup(btn.dataset.complete, { completed: true });
        toast('Follow-up marked complete');
        loadFollowupsTable();
      } catch (ex) { toast(ex.message, true); }
    });
  });
}

function followupsTableHtml(fups, showLeadLink) {
  if (!fups || fups.length === 0) {
    return `<div class="empty-state">Nothing here — you're all caught up.</div>`;
  }
  return `
    <table class="responsive-cards">
      <thead><tr><th>Lead</th><th>Note</th><th>Follow-up date</th><th>Next action</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${fups.map(f => `
          <tr>
            <td data-label="Lead" class="cell-name">${esc(f.lead_client_name || '—')}</td>
            <td data-label="Note" class="cell-sub">${esc(f.note)}</td>
            <td data-label="Follow-up date">${fmtDate(f.follow_up_date)}</td>
            <td data-label="Next action">${f.next_action_date ? `<span class="${!f.completed && isOverdue(f.next_action_date) ? 'overdue-text' : ''}">${fmtDate(f.next_action_date)}</span>` : '—'}</td>
            <td data-label="Status">${f.completed ? '<span class="badge badge-closed">Done</span>' : (isOverdue(f.next_action_date) ? '<span class="badge" style="background:var(--danger-bg);color:var(--danger)">Overdue</span>' : '<span class="badge badge-new">Pending</span>')}</td>
            <td data-label="">${!f.completed ? `<button class="btn btn-secondary btn-sm" data-complete="${f.id}">Mark done</button>` : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function openFollowupModal(followupId = null, presetLeadId = null, presetLeadName = null, afterSave = null) {
  let leadOptions = '';
  let leads = [];
  if (!presetLeadId) {
    leads = await Api.listLeads({});
    leadOptions = leads.map(l => `<option value="${l.id}">${esc(l.client_name)}</option>`).join('');
  }
  const today = new Date().toISOString().slice(0, 10);

  openModal(`
    <div class="modal-head"><h3>Log a follow-up</h3><button class="modal-close" id="closeModalBtn">&times;</button></div>
    <div class="modal-body">
      ${presetLeadId
        ? `<div class="field"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;">Lead</span><div class="cell-name">${esc(presetLeadName)}</div></div>`
        : `<label class="field"><span>Lead</span><select id="f_lead_id">${leadOptions || '<option value="">No leads yet</option>'}</select></label>`}
      <label class="field"><span>Note</span><textarea id="f_note" rows="3" placeholder="What happened / next step…"></textarea></label>
      <div class="field-row">
        <label class="field"><span>Follow-up date</span><input type="date" id="f_followup_date" value="${today}"></label>
        <label class="field"><span>Next action date</span><input type="date" id="f_next_action_date"></label>
      </div>
      <div id="followupFormError" class="form-error" hidden></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveFollowupBtn">Save follow-up</button>
    </div>
  `);

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  document.getElementById('saveFollowupBtn').addEventListener('click', async (e) => {
    const leadId = presetLeadId || document.getElementById('f_lead_id').value;
    const note = document.getElementById('f_note').value.trim();
    const errEl = document.getElementById('followupFormError');
    if (!leadId || !note) {
      errEl.textContent = 'Please select a lead and enter a note.';
      errEl.hidden = false;
      return;
    }
    const payload = {
      lead_id: leadId,
      note,
      follow_up_date: document.getElementById('f_followup_date').value,
      next_action_date: document.getElementById('f_next_action_date').value || null,
    };
    await withButtonLoading(e.target, async () => {
      try {
        await Api.createFollowup(payload);
        closeModal();
        toast('Follow-up logged');
        if (afterSave) { afterSave(); return; }
        router();
      } catch (ex) {
        errEl.textContent = ex.message;
        errEl.hidden = false;
      }
    });
  });
}

// ---------------- Activity View ----------------

async function renderActivityView() {
  const content = document.getElementById('content');
  const activities = await Api.listActivities({ limit: 100 });
  content.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>${Auth.isAdmin() ? 'Team activity log' : 'My activity log'}</h2></div>
      <div class="activity-list">${activityListHtml(activities)}</div>
    </div>
  `;
}

// ---------------- Users View (admin only) ----------------

async function renderUsersView() {
  const content = document.getElementById('content');
  document.getElementById('topbarActions').innerHTML = `<button class="btn btn-primary" id="newUserBtn">+ Add user</button>`;
  const users = await Api.listUsers();
  state.usersCache = users;

  content.innerHTML = `
    <div class="card">
      <div class="table-wrap">
        <table class="responsive-cards">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td data-label="Name" class="cell-name">${esc(u.name)}</td>
                <td data-label="Email">${esc(u.email)}</td>
                <td data-label="Role">${u.role === 'super_admin' ? 'Super Admin' : 'Individual User'}</td>
                <td data-label="Status">${u.is_active ? '<span class="badge badge-qualified">Active</span>' : '<span class="badge" style="background:var(--danger-bg);color:var(--danger)">Deactivated</span>'}</td>
                <td data-label="Joined">${fmtDate(u.created_at)}</td>
                <td data-label="">
                  <div class="row-actions">
                    <button class="btn btn-ghost btn-sm" data-edit-user="${u.id}">Edit</button>
                    ${u.id !== state.user.id ? `<button class="btn ${u.is_active ? 'btn-danger' : 'btn-secondary'} btn-sm" data-toggle-user="${u.id}" data-active="${u.is_active}">${u.is_active ? 'Deactivate' : 'Activate'}</button>` : ''}
                    ${u.id !== state.user.id ? `<button class="btn btn-danger btn-sm" data-delete-user="${u.id}" data-name="${esc(u.name)}">Delete</button>` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('newUserBtn').addEventListener('click', () => openUserModal());
  content.querySelectorAll('[data-edit-user]').forEach(btn => {
    btn.addEventListener('click', () => openUserModal(users.find(u => u.id === btn.dataset.editUser)));
  });
  content.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Permanently delete ${btn.dataset.name}? This cannot be undone.`)) return;
      try {
        await Api.deleteUser(btn.dataset.deleteUser);
        toast('User deleted');
        renderUsersView();
      } catch (ex) { toast(ex.message, true); }
    });
  });
  content.querySelectorAll('[data-toggle-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isActive = btn.dataset.active === 'true';
      const user = users.find(u => u.id === btn.dataset.toggleUser);
      if (!confirm(`${isActive ? 'Deactivate' : 'Activate'} ${user.name}?`)) return;
      try {
        await Api.updateUser(btn.dataset.toggleUser, { is_active: !isActive });
        toast(`User ${isActive ? 'deactivated' : 'activated'}`);
        renderUsersView();
      } catch (ex) { toast(ex.message, true); }
    });
  });
}

function openUserModal(user = null) {
  const isEdit = !!user;
  openModal(`
    <div class="modal-head"><h3>${isEdit ? 'Edit user' : 'Add individual user'}</h3><button class="modal-close" id="closeModalBtn">&times;</button></div>
    <div class="modal-body">
      <label class="field"><span>Full name</span><input type="text" id="f_name" value="${isEdit ? esc(user.name) : ''}"></label>
      <label class="field"><span>Email</span><input type="email" id="f_email" value="${isEdit ? esc(user.email) : ''}" ${isEdit ? 'disabled' : ''}></label>
      <label class="field"><span>${isEdit ? 'New password (leave blank to keep current)' : 'Password'}</span><input type="password" id="f_password" autocomplete="new-password" placeholder="${isEdit ? '••••••••' : 'Set a password'}"></label>
      <label class="field"><span>Role</span>
        <select id="f_role">
          <option value="user" ${isEdit && user.role === 'user' ? 'selected' : ''}>Individual User</option>
          <option value="super_admin" ${isEdit && user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
        </select>
      </label>
      <div id="userFormError" class="form-error" hidden></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="cancelBtn">Cancel</button>
      <button class="btn btn-primary" id="saveUserBtn">${isEdit ? 'Save changes' : 'Create user'}</button>
    </div>
  `);

  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);

  document.getElementById('saveUserBtn').addEventListener('click', async (e) => {
    const errEl = document.getElementById('userFormError');
    const name = document.getElementById('f_name').value.trim();
    const email = document.getElementById('f_email').value.trim();
    const password = document.getElementById('f_password').value;
    const role = document.getElementById('f_role').value;

    if (!name || (!isEdit && (!email || !password))) {
      errEl.textContent = 'Please fill in all required fields.';
      errEl.hidden = false;
      return;
    }

    await withButtonLoading(e.target, async () => {
      try {
        if (isEdit) {
          const payload = { name, role };
          if (password.trim()) payload.password = password;
          await Api.updateUser(user.id, payload);
        } else {
          await Api.createUser({ name, email, password, role });
        }
        closeModal();
        toast(isEdit ? 'User updated' : 'User created');
        renderUsersView();
      } catch (ex) {
        errEl.textContent = ex.message;
        errEl.hidden = false;
      }
    });
  });
}

// ---------------- Analytics View ----------------

let analyticsState = { period: 'monthly', location: '', user_id: '' };

const PERIOD_LABELS = { daily: 'Daily', weekly: 'Weekly', '3m': '3 Months', '6m': '6 Months', monthly: 'Monthly', '12m': '12 Months' };

async function renderAnalyticsView() {
  const content = document.getElementById('content');
  document.getElementById('topbarActions').innerHTML = '';

  let locationOptions = '<option value="">All locations</option>';
  try {
    const locs = await Api.getLeadLocations();
    locationOptions += locs.map(l => `<option value="${esc(l)}" ${analyticsState.location === l ? 'selected' : ''}>${esc(l)}</option>`).join('');
  } catch (_) {}

  let usersOptions = '<option value="">All users</option>';
  if (Auth.isAdmin()) {
    if (!state.usersCache) state.usersCache = await Api.listUsers();
    usersOptions += state.usersCache.filter(u => u.role === 'user').map(u =>
      `<option value="${u.id}" ${analyticsState.user_id === u.id ? 'selected' : ''}>${esc(u.name)}</option>`
    ).join('');
  }

  content.innerHTML = `
    <div class="filters-bar" style="margin-bottom:16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);">
      <div class="pill-toggle" style="flex-wrap:wrap;">
        ${Object.entries(PERIOD_LABELS).map(([p, lbl]) =>
          `<button class="period-btn ${analyticsState.period === p ? 'active' : ''}" data-period="${p}">${lbl}</button>`
        ).join('')}
      </div>
      <select id="analyticsLocationFilter">${locationOptions}</select>
      ${Auth.isAdmin() ? `<select id="analyticsUserFilter">${usersOptions}</select>` : ''}
    </div>
    <div id="analyticsContent"><div class="spinner"></div></div>
  `;

  content.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      analyticsState.period = btn.dataset.period;
      loadAnalytics();
    });
  });
  document.getElementById('analyticsLocationFilter').addEventListener('change', (e) => {
    analyticsState.location = e.target.value;
    loadAnalytics();
  });
  if (Auth.isAdmin()) {
    document.getElementById('analyticsUserFilter').addEventListener('change', (e) => {
      analyticsState.user_id = e.target.value;
      loadAnalytics();
    });
  }

  await loadAnalytics();
}

async function loadAnalytics() {
  const wrap = document.getElementById('analyticsContent');
  if (!wrap) return;
  wrap.innerHTML = '<div class="spinner"></div>';
  destroyCharts();

  try {
    const d = await Api.analyticsDashboard({
      period: analyticsState.period,
      location: analyticsState.location || undefined,
      user_id: analyticsState.user_id || undefined,
    });

    const locTableRows = d.location_breakdown.map(loc => `
      <tr>
        <td class="cell-name">${esc(loc.location)}</td>
        <td>${loc.total}</td>
        <td><span class="badge badge-new">${loc.new}</span></td>
        <td><span class="badge badge-contacted">${loc.contacted}</span></td>
        <td><span class="badge badge-qualified">${loc.qualified}</span></td>
        <td><span class="badge badge-closed">${loc.closed}</span></td>
      </tr>
    `).join('');

    wrap.innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
        <div class="kpi-card"><div class="kpi-label">Total leads</div><div class="kpi-value">${d.summary.total_leads}</div><div class="kpi-sub">${d.summary.new_leads} new · ${d.summary.contacted} contacted</div></div>
        <div class="kpi-card"><div class="kpi-label">Qualified / Closed</div><div class="kpi-value">${d.summary.qualified}<small> / ${d.summary.closed}</small></div><div class="kpi-sub">Conversion: ${d.summary.conversion_rate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Overdue follow-ups</div><div class="kpi-value ${d.summary.overdue_followups ? 'kpi-flag' : ''}">${d.summary.overdue_followups}</div><div class="kpi-sub">Follow-up completion: ${d.summary.followup_completion_rate}%</div></div>
      </div>

      <div class="charts-grid">
        <div class="chart-card"><h3>Leads created over time</h3><div class="chart-wrap"><canvas id="chartLeadsTime"></canvas></div></div>
        <div class="chart-card"><h3>Status distribution</h3><div class="chart-wrap"><canvas id="chartStatus"></canvas></div></div>
        <div class="chart-card"><h3>Location breakdown (top 8)</h3><div class="chart-wrap"><canvas id="chartLocation"></canvas></div></div>
        <div class="chart-card"><h3>Follow-up activity over time</h3><div class="chart-wrap"><canvas id="chartFupActivity"></canvas></div></div>
      </div>

      <div class="card" style="margin-top:16px;">
        <div class="card-head"><h2>Upcoming follow-ups</h2></div>
        <div class="table-wrap">${followupsTableHtml(d.upcoming_followups, true)}</div>
      </div>

      ${d.location_breakdown.length > 0 ? `
      <div class="card" style="margin-top:16px;">
        <div class="card-head"><h2>Location detail</h2></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Location</th><th>Total</th><th>New</th><th>Contacted</th><th>Qualified</th><th>Closed</th></tr></thead>
          <tbody>${locTableRows}</tbody>
        </table></div>
      </div>` : ''}
    `;

    // Leads over time — bar chart
    chartInstances.leadsTime = new Chart(document.getElementById('chartLeadsTime'), {
      type: 'bar',
      data: {
        labels: d.leads_over_time.map(p => p.label),
        datasets: [{ label: 'Leads', data: d.leads_over_time.map(p => p.count), backgroundColor: '#4F5FE0', borderRadius: 4 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

    // Status — donut
    const statusLabels = d.status_distribution.map(s => STATUS_LABELS[s.status] || s.status);
    const statusColors = d.status_distribution.map(s => STATUS_COLORS[s.status] || '#ccc');
    chartInstances.status = new Chart(document.getElementById('chartStatus'), {
      type: 'doughnut',
      data: {
        labels: statusLabels,
        datasets: [{ data: d.status_distribution.map(s => s.count), backgroundColor: statusColors, borderWidth: 2, borderColor: '#fff' }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });

    // Location — horizontal stacked bar
    const top8 = d.location_breakdown.slice(0, 8);
    chartInstances.location = new Chart(document.getElementById('chartLocation'), {
      type: 'bar',
      data: {
        labels: top8.map(l => l.location.length > 22 ? l.location.slice(0, 22) + '…' : l.location),
        datasets: [
          { label: 'New', data: top8.map(l => l.new), backgroundColor: STATUS_COLORS.new, borderRadius: 3 },
          { label: 'Contacted', data: top8.map(l => l.contacted), backgroundColor: STATUS_COLORS.contacted, borderRadius: 3 },
          { label: 'Qualified', data: top8.map(l => l.qualified), backgroundColor: STATUS_COLORS.qualified, borderRadius: 3 },
          { label: 'Closed', data: top8.map(l => l.closed), backgroundColor: STATUS_COLORS.closed, borderRadius: 3 },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { beginAtZero: true, stacked: true, ticks: { precision: 0 } }, y: { stacked: true } },
      },
    });

    // Follow-up activity — line chart
    chartInstances.fupActivity = new Chart(document.getElementById('chartFupActivity'), {
      type: 'line',
      data: {
        labels: d.followup_activity.map(p => p.label),
        datasets: [{ label: 'Follow-ups', data: d.followup_activity.map(p => p.count), borderColor: '#1FA971', backgroundColor: 'rgba(31,169,113,0.1)', fill: true, tension: 0.3, pointRadius: 3 }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
    });

  } catch (e) {
    wrap.innerHTML = `<div class="card"><div class="card-body"><div class="form-error">${esc(e.message)}</div></div></div>`;
  }
}

// ---------------- Init ----------------

router();
