/**
 * app.js - IGNIS Dashboard UI Logic
 */

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  'on-duty':  { label: 'ON DUTY',   cls: 'pill-on-duty'  },
  'off-duty': { label: 'OFF DUTY',  cls: 'pill-off-duty' },
  'deployed': { label: 'DEPLOYED',  cls: 'pill-deployed' },
  'training': { label: 'TRAINING',  cls: 'pill-training' },
  'leave':    { label: 'ON LEAVE',  cls: 'pill-leave'    },
};

const SEV_CLS = { critical: 'sev-critical', high: 'sev-high', medium: 'sev-medium', low: 'sev-low' };

const INC_BADGE = {
  active:    { cls: 'badge-active',    label: 'ACTIVE'    },
  contained: { cls: 'badge-contained', label: 'CONTAINED' },
  resolved:  { cls: 'badge-resolved',  label: 'RESOLVED'  },
};

const UNIT_PILL = {
  available:   '<span class="status-pill pill-on-duty"><span class="pill-dot"></span>AVAILABLE</span>',
  deployed:    '<span class="status-pill pill-deployed"><span class="pill-dot"></span>DEPLOYED</span>',
  maintenance: '<span class="status-pill pill-leave"><span class="pill-dot"></span>MAINTENANCE</span>',
};

const DAYS        = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const SHIFT_LABEL = { day: 'DAY', night: 'NIGHT', off: 'OFF', training: 'TRAIN' };
const SHIFT_CLS   = { day: 'shift-day', night: 'shift-night', off: 'shift-off', training: 'shift-training' };
const SHIFT_CYCLE = ['day', 'night', 'training', 'off'];
const LICENCE_CATS = ['B', 'C', 'D'];

let currentSection = 'dashboard';
const _unsubs = [];

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  showLoadingOverlay(true);

  let user;
  try {
    user = await Auth.requireAuth();
  } catch {
    return;
  }

  setInner('user-greeting', user.name.split(' ')[0]);
  setInner('user-role', user.role === 'admin' ? 'Administrator' : 'Firefighter');

  if (Auth.isAdmin()) {
    document.querySelectorAll('[data-ff-only]').forEach(el => el.style.display = 'none');
  } else {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('[data-ff-only]').forEach(el => el.style.display = '');
  }

  _unsubs.push(DB.listenFirefighters(() => {
    if (currentSection === 'roster')    renderRoster(DB.firefighters);
    if (currentSection === 'dashboard') renderDashboard();
  }));

  _unsubs.push(DB.listenIncidents(() => {
    if (currentSection === 'incidents') renderIncidents(DB.incidents);
    if (currentSection === 'dashboard') renderDashboard();
    updateActiveIncidentBadge();
  }));

  _unsubs.push(DB.listenUnits(() => {
    if (currentSection === 'units')     renderUnits();
    if (currentSection === 'dashboard') renderDashboard();
  }));

  _unsubs.push(DB.listenSchedule(() => {
    if (currentSection === 'schedule')  renderSchedule();
  }));

  _unsubs.push(DB.listenCertTypes(() => {
    if (currentSection === 'roster')  renderRosterFilters();
    if (currentSection === 'profile') renderProfile();
  }));

  updateClock();
  setInterval(updateClock, 1000);
  showLoadingOverlay(false);
});

function showLoadingOverlay(show) {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-GB');
}

// ── Navigation ────────────────────────────────────────────────────────────────

function showSection(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');
  if (btn) btn.classList.add('active');
  currentSection = name;
  setInner('pageTitle', name.toUpperCase().replace(/-/g, ' '));
  const renderers = {
    dashboard:    renderDashboard,
    incidents:    () => renderIncidents(DB.incidents),
    'ff-incidents': renderFFIncidents,
    units:        renderUnits,
    roster:       () => { renderRosterFilters(); renderRoster(DB.firefighters); },
    schedule:     renderSchedule,
    profile:      renderProfile,
    hours:        loadHours,
  };
  if (renderers[name]) renderers[name]();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function renderDashboard() {
  const active    = DB.incidents.filter(i => i.status === 'active').length;
  const onDuty    = DB.firefighters.filter(f => ['on-duty', 'deployed'].includes(f.status)).length;
  const available = DB.units.filter(u => u.status === 'available').length;

  setInner('stat-incidents', active);
  setInner('stat-onduty',    onDuty);
  setInner('stat-units',     available);

  setInner('dashboard-incidents', DB.incidents.slice(0, 5).map(inc => `
    <div class="incident-item">
      <div class="incident-severity ${SEV_CLS[inc.severity]}"></div>
      <div class="incident-info">
        <div class="incident-title">${inc.type} - ${inc.location}</div>
        <div class="incident-meta">${inc.id} - ${inc.units.join(', ')} - ${inc.time}</div>
      </div>
      <span class="incident-badge ${INC_BADGE[inc.status].cls}">${INC_BADGE[inc.status].label}</span>
    </div>
  `).join('') || '<div style="padding:20px;color:var(--fog);font-size:13px;">No incidents logged.</div>');

  setInner('dashboard-units', DB.units.map(u => `
    <div class="unit-summary-row">
      <div>
        <div class="unit-row-name">${u.name}</div>
        <div class="unit-row-type">${u.type}</div>
      </div>
      ${UNIT_PILL[u.status]}
    </div>
  `).join('') || '<div style="padding:12px 0;color:var(--fog);font-size:13px;">No units.</div>');

  setInner('shift-on-duty',  DB.firefighters.filter(f => ['on-duty','deployed'].includes(f.status)).length);
  setInner('shift-training', DB.firefighters.filter(f => f.status === 'training').length);
  setInner('shift-leave',    DB.firefighters.filter(f => f.status === 'leave').length);
  setInner('shift-off',      DB.firefighters.filter(f => f.status === 'off-duty').length);
}

function updateActiveIncidentBadge() {
  const count = DB.incidents.filter(i => i.status === 'active').length;
  const badge = document.getElementById('alert-badge');
  if (badge) badge.textContent = '🔥 ' + count + ' ACTIVE INCIDENT' + (count !== 1 ? 'S' : '');
}

// ── Roster ────────────────────────────────────────────────────────────────────

// Render the filter bar above the roster table
function renderRosterFilters() {
  const units   = [...new Set(DB.firefighters.map(f => f.unit))].sort();
  const ranks   = [...new Set(DB.firefighters.map(f => f.rank))].sort();

  setInner('roster-filters', `
    <div class="filter-bar">
      <div class="search-box">
        <span class="search-icon">🔍</span>
        <input type="text" id="roster-search" placeholder="Search by name, rank, unit..." oninput="applyRosterFilters()" />
      </div>

      <select class="form-control filter-select" id="filter-status" onchange="applyRosterFilters()">
        <option value="">All Statuses</option>
        ${Object.entries(STATUS_META).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>

      <select class="form-control filter-select" id="filter-unit" onchange="applyRosterFilters()">
        <option value="">All Units</option>
        ${units.map(u => `<option value="${u}">${u}</option>`).join('')}
      </select>

      <select class="form-control filter-select" id="filter-rank" onchange="applyRosterFilters()">
        <option value="">All Ranks</option>
        ${ranks.map(r => `<option value="${r}">${r}</option>`).join('')}
      </select>

      <select class="form-control filter-select" id="filter-licence" onchange="applyRosterFilters()">
        <option value="">Any Licence</option>
        ${LICENCE_CATS.map(l => `<option value="${l}">Licence ${l}</option>`).join('')}
      </select>

      <select class="form-control filter-select" id="filter-cert" onchange="applyRosterFilters()">
        <option value="">Any Certification</option>
        ${DB.certTypes.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>

      <button class="btn btn-ghost btn-sm" onclick="clearRosterFilters()">Clear</button>
    </div>
  `);
}

function applyRosterFilters() {
  const q       = (document.getElementById('roster-search')?.value  || '').toLowerCase();
  const status  = document.getElementById('filter-status')?.value   || '';
  const unit    = document.getElementById('filter-unit')?.value     || '';
  const rank    = document.getElementById('filter-rank')?.value     || '';
  const licence = document.getElementById('filter-licence')?.value  || '';
  const cert    = document.getElementById('filter-cert')?.value     || '';

  const filtered = DB.firefighters.filter(ff => {
    const licences = ff.licences || [];
    const certs    = ff.certifications || [];

    const matchSearch  = !q       || (ff.first + ' ' + ff.last + ' ' + ff.rank + ' ' + ff.unit + ' ' + ff.phone + ' ' + ff.certs).toLowerCase().includes(q);
    const matchStatus  = !status  || ff.status === status;
    const matchUnit    = !unit    || ff.unit === unit;
    const matchRank    = !rank    || ff.rank === rank;
    const matchLicence = !licence || licences.includes(licence);
    const matchCert    = !cert    || certs.includes(cert);

    return matchSearch && matchStatus && matchUnit && matchRank && matchLicence && matchCert;
  });

  renderRoster(filtered);
}

function clearRosterFilters() {
  ['roster-search','filter-status','filter-unit','filter-rank','filter-licence','filter-cert'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderRoster(DB.firefighters);
}

function renderRoster(data) {
  const isAdmin = Auth.isAdmin();
  setInner('roster-tbody', data.length
    ? data.map(ff => {
        const licences = (ff.licences || []).map(l => `<span class="tag-pill">${l}</span>`).join('');
        const certs    = (ff.certifications || []).map(c => `<span class="tag-pill tag-cert">${c}</span>`).join('');
        return `
          <tr>
            <td class="mono muted">${ff.id}</td>
            <td class="ff-name">${ff.first} ${ff.last}</td>
            <td><span class="ff-rank">${ff.rank}</span></td>
            <td class="muted">${ff.unit}</td>
            <td>${licences || '<span class="muted small">-</span>'}</td>
            <td>${certs    || '<span class="muted small">-</span>'}</td>
            <td class="mono small muted">${ff.phone}</td>
            <td><span class="status-pill ${STATUS_META[ff.status]?.cls || 'pill-off-duty'}">
              <span class="pill-dot"></span>${STATUS_META[ff.status]?.label || ff.status}
            </span></td>
            <td>
              ${isAdmin ? `<div class="action-row">
                <button class="btn btn-ghost btn-sm" onclick="cycleFFStatus(${ff.id})">Status</button>
                <button class="btn btn-danger btn-sm" onclick="removeFF(${ff.id})">X</button>
              </div>` : '<span class="muted small">-</span>'}
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--fog);">No firefighters match your filters.</td></tr>');
}

async function cycleFFStatus(id) {
  const ff = DB.firefighters.find(f => f.id === id);
  if (!ff) return;
  const keys  = Object.keys(STATUS_META);
  const newSt = keys[(keys.indexOf(ff.status) + 1) % keys.length];
  try {
    await DB.updateFirefighter(id, { status: newSt });
    showToast(ff.first + ' ' + ff.last + ' - ' + STATUS_META[newSt].label);
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function removeFF(id) {
  if (!confirm('Remove this firefighter permanently?')) return;
  try {
    await DB.removeFirefighter(id);
    showToast('Firefighter removed', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function addFirefighter() {
  const first = val('ff-first');
  const last  = val('ff-last');
  if (!first || !last) { showToast('Please enter a full name'); return; }

  const btn = document.getElementById('btn-add-ff');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  const manualId = parseInt(val('ff-id'));
  const newId    = manualId || Math.max(0, ...DB.firefighters.map(f => f.id)) + 1;

  const ff = {
    id:             newId,
    first,          last,
    rank:           val('ff-rank'),
    unit:           val('ff-unit'),
    phone:          val('ff-phone') || '-',
    status:         val('ff-status'),
    certs:          '-',
    licences:       [],
    certifications: [],
  };

  try {
    await DB.addFirefighter(ff);
    const account = await DB.createUserAccount(ff);

    closeModal('new-ff');
    clearFields(['ff-first', 'ff-last', 'ff-phone', 'ff-id']);

    // Show credentials modal so admin can pass them on
    showCredentials(ff.first + ' ' + ff.last, account.email.replace('@ignis.local',''), account.password);

  } catch (e) {
    showToast('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add Firefighter'; }
  }
}

// Show a modal with the new firefighter's login credentials
function showCredentials(name, username, password) {
  setInner('cred-name',     name);
  setInner('cred-username', username);
  setInner('cred-password', password);
  openModal('credentials');
}

function copyCredentials() {
  const name     = document.getElementById('cred-name')?.textContent     || '';
  const username = document.getElementById('cred-username')?.textContent || '';
  const password = document.getElementById('cred-password')?.textContent || '';
  const text     = 'IGNIS Login Credentials\nName: ' + name + '\nUsername: ' + username + '\nPassword: ' + password;
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 'success'));
}

// ── Incidents ─────────────────────────────────────────────────────────────────

function renderIncidents(data) {
  const isAdmin = Auth.isAdmin();
  setInner('incidents-tbody', data.length
    ? data.map(inc => {
        const deployed = inc.deployedUnits || inc.units || [];
        const unitTags = deployed.map(u =>
          '<span class="tag-pill" style="background:rgba(255,61,31,.15);color:var(--fire);">' + u + '</span>'
        ).join('') || '<span class="muted small">None</span>';
        return `
          <tr>
            <td class="mono small muted">${inc.id}</td>
            <td class="bold">${inc.type}</td>
            <td>${inc.location}</td>
            <td><span class="sev-inline">
              <span class="sev-dot ${SEV_CLS[inc.severity]}"></span>
              <span class="small muted cap">${inc.severity}</span>
            </span></td>
            <td>${unitTags}</td>
            <td class="mono small muted">${inc.time}</td>
            <td><span class="incident-badge ${INC_BADGE[inc.status]?.cls}">${INC_BADGE[inc.status]?.label}</span></td>
            <td>
              <div class="action-row">
                <a class="btn btn-ghost btn-sm"
                  href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inc.location)}"
                  target="_blank">🗺️ Maps</a>
                ${isAdmin ? `
                  <button class="btn btn-primary btn-sm" onclick="openIncidentManager('${inc.id}')">Manage</button>
                  <button class="btn btn-danger btn-sm" onclick="removeIncident('${inc.id}')">X</button>
                ` : ''}
              </div>
            </td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--fog);">No incidents logged.</td></tr>');
}

function filterIncidents(q) {
  const lq = q.toLowerCase();
  renderIncidents(DB.incidents.filter(i =>
    (i.type + ' ' + i.location + ' ' + i.id).toLowerCase().includes(lq)
  ));
}

function filterIncidentStatus(status) {
  renderIncidents(status === 'all' ? DB.incidents : DB.incidents.filter(i => i.status === status));
}

async function cycleIncidentStatus(id) {
  const inc  = DB.incidents.find(i => i.id === id);
  if (!inc) return;
  const flow = ['active', 'contained', 'resolved'];
  const next = flow[(flow.indexOf(inc.status) + 1) % flow.length];
  try {
    await DB.updateIncident(id, { status: next });
    // Auto-delete chat when incident is resolved
    if (next === 'resolved') {
      await DB.deleteChat(id);
      showToast(id + ' resolved — chat deleted', 'success');
    } else {
      showToast(id + ' - ' + INC_BADGE[next].label);
    }
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function removeIncident(id) {
  if (!confirm('Remove this incident?')) return;
  try {
    await DB.removeIncident(id);
    showToast('Incident removed', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function addIncident() {
  const location = val('inc-location');
  if (!location) { showToast('Please enter a location'); return; }

  const selectedUnits = Array.from(document.querySelectorAll('#inc-units-checkboxes input:checked')).map(cb => cb.value);

  const inc = {
    type:          val('inc-type'),
    location,
    severity:      val('inc-severity'),
    deployedUnits: selectedUnits,
    units:         selectedUnits,  // keep for backwards compatibility
    time:          new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    status:        val('inc-status'),
  };

  try {
    const id = await DB.addIncident(inc);
    closeModal('new-incident');
    clearFields(['inc-location']);
    showToast('Incident ' + id + ' logged', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Incident Manager ──────────────────────────────────────────────────────────

function openIncidentManager(incidentId) {
  renderIncidentManager(incidentId);
  openModal('incident-manager');
}

function renderIncidentManager(incidentId) {
  const inc      = DB.incidents.find(i => i.id === incidentId);
  if (!inc) return;

  const deployed    = inc.deployedUnits || [];
  const allUnits    = DB.units;
  const available   = allUnits.filter(u => u.status === 'available');
  const log         = (inc.log || []).slice().reverse(); // newest first

  // Units currently at the incident
  const deployedHTML = deployed.length
    ? deployed.map(name => {
        const unit = allUnits.find(u => u.name === name) || { type: '' };
        return `
          <div class="inc-unit-row">
            <div>
              <div class="unit-row-name">${name}</div>
              <div class="unit-row-type">${unit.type}</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="color:var(--yellow);border-color:rgba(255,184,48,.3);"
              onclick="returnUnit('${incidentId}', '${name}')">
              Return to Base
            </button>
          </div>`;
      }).join('')
    : '<div class="muted small" style="padding:12px 0;">No units currently deployed.</div>';

  // Units available to dispatch
  const dispatchHTML = available.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        ${available.map(u => `
          <label class="dispatch-option">
            <input type="checkbox" value="${u.name}" id="dispatch-${u.name.replace(/\s/g,'-')}" />
            <span>${u.name}</span>
            <span class="unit-row-type">${u.type}</span>
          </label>`).join('')}
       </div>
       <button class="btn btn-primary btn-sm" onclick="dispatchSelected('${incidentId}')">
         Dispatch Selected Units
       </button>`
    : '<div class="muted small">No units available to dispatch.</div>';

  // Activity log
  const logHTML = log.length
    ? log.map(entry => `
        <div class="log-entry">
          <span class="log-time">${entry.time}</span>
          <span class="log-msg">${entry.msg}</span>
        </div>`).join('')
    : '<div class="muted small">No activity yet.</div>';

  setInner('inc-manager-title', inc.type + ' — ' + inc.location);
  setInner('inc-manager-id',    inc.id);

  setInner('inc-deployed-units',  deployedHTML);
  setInner('inc-dispatch-units',  dispatchHTML);
  setInner('inc-activity-log',    logHTML);

  // Status selector
  const statusEl = document.getElementById('inc-manager-status');
  if (statusEl) {
    statusEl.value = inc.status;
    statusEl.setAttribute('data-inc-id', incidentId);
  }

  // Wire up the Open Full Chat button
  const chatBtn = document.getElementById('open-chat-btn');
  if (chatBtn) {
    chatBtn.onclick = () => openChat(incidentId, inc.type + ' - ' + inc.location);
  }

  // Store current incident id on the modal for easy access
  const modal = document.getElementById('modal-incident-manager');
  if (modal) modal.setAttribute('data-incident-id', incidentId);
}

async function dispatchSelected(incidentId) {
  const checkboxes = document.querySelectorAll('#inc-dispatch-units input[type=checkbox]:checked');
  const names      = Array.from(checkboxes).map(cb => cb.value);

  if (!names.length) { showToast('Select at least one unit'); return; }

  try {
    await DB.dispatchUnitsToIncident(incidentId, names);
    showToast(names.join(', ') + ' dispatched', 'success');
    // Re-render with fresh data (listener will update DB.incidents)
    setTimeout(() => renderIncidentManager(incidentId), 500);
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function returnUnit(incidentId, unitName) {
  if (!confirm('Return ' + unitName + ' to base?')) return;
  try {
    await DB.returnUnitsFromIncident(incidentId, [unitName]);
    showToast(unitName + ' returned to base', 'success');
    setTimeout(() => renderIncidentManager(incidentId), 500);
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function updateIncidentStatus() {
  const el  = document.getElementById('inc-manager-status');
  const id  = el?.getAttribute('data-inc-id');
  const val = el?.value;
  if (!id || !val) return;
  try {
    await DB.updateIncident(id, { status: val });
    // Auto-delete chat when resolved
    if (val === 'resolved') {
      await DB.deleteChat(id);
      showToast('Incident resolved — chat deleted', 'success');
      closeModal('incident-manager');
    } else {
      showToast('Status updated', 'success');
    }
    renderIncidents(DB.incidents);
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Units ─────────────────────────────────────────────────────────────────────

function renderUnits() {
  const isAdmin = Auth.isAdmin();
  setInner('units-grid', DB.units.length
    ? DB.units.map(u => `
      <div class="unit-card">
        <div class="unit-card-top">
          <div>
            <div class="unit-number">${u.name.replace(/\D/g, '')}</div>
            <div class="unit-type">${u.name.split(' ')[0]} - ${u.type}</div>
          </div>
          ${UNIT_PILL[u.status]}
        </div>
        <div class="unit-members">Crew: <span>${u.crew}/${u.capacity}</span></div>
        ${isAdmin ? `<div class="unit-action-row">
          <button class="btn btn-ghost btn-sm" onclick="cycleUnitStatus('${u.name}')">Update</button>
          <button class="btn btn-danger btn-sm" onclick="removeUnit('${u.name}')">Remove</button>
        </div>` : ''}
      </div>`).join('')
    : '<p style="color:var(--fog);">No units found.</p>');
}

async function cycleUnitStatus(name) {
  const u    = DB.units.find(x => x.name === name);
  if (!u) return;
  const flow = ['available', 'deployed', 'maintenance'];
  const next = flow[(flow.indexOf(u.status) + 1) % flow.length];
  try {
    await DB.updateUnit(name, { status: next });
    showToast(name + ' - ' + next.toUpperCase());
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function removeUnit(name) {
  if (!confirm('Remove ' + name + '?')) return;
  try {
    await DB.removeUnit(name);
    showToast(name + ' removed', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function addUnit() {
  const name = val('unit-name');
  if (!name) { showToast('Please enter a unit name'); return; }
  try {
    await DB.addUnit({ name, type: val('unit-type'), capacity: parseInt(val('unit-capacity')) || 5, crew: 0, status: val('unit-status') });
    closeModal('new-unit');
    clearFields(['unit-name']);
    showToast(name + ' added', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

function renderSchedule() {
  const isAdmin = Auth.isAdmin();
  const names   = Object.keys(DB.schedule);
  if (!names.length) {
    setInner('schedule-grid', '<div style="padding:24px;color:var(--fog);">Schedule not loaded yet.</div>');
    return;
  }
  let html = '<div class="sch-header">PERSONNEL</div>';
  DAYS.forEach(d => { html += '<div class="sch-header">' + d + '</div>'; });
  names.forEach(name => {
    const shifts = DB.schedule[name] || [];
    html += '<div class="sch-name">' + name + '</div>';
    shifts.forEach((sh, i) => {
      html += '<div class="sch-cell ' + (isAdmin ? 'clickable' : '') + '" ' +
        (isAdmin ? 'onclick="toggleShift(\'' + name + '\',' + i + ')"' : '') + '>' +
        '<div class="sch-shift ' + (SHIFT_CLS[sh] || 'shift-off') + '">' + (SHIFT_LABEL[sh] || 'OFF') + '</div>' +
        '</div>';
    });
  });
  setInner('schedule-grid', html);
}

async function toggleShift(name, dayIdx) {
  const cur  = (DB.schedule[name] || [])[dayIdx] || 'off';
  const next = SHIFT_CYCLE[(SHIFT_CYCLE.indexOf(cur) + 1) % SHIFT_CYCLE.length];
  try {
    await DB.updateShift(name, dayIdx, next);
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Certifications Manager (Admin) ────────────────────────────────────────────

function openCertManager() {
  renderCertManager();
  openModal('cert-manager');
}

function renderCertManager() {
  const list = DB.certTypes;
  setInner('cert-list', list.length
    ? list.map((c, i) => `
        <div class="cert-item">
          <span>${c}</span>
          <button class="btn btn-danger btn-sm" onclick="removeCertType(${i})">Remove</button>
        </div>`).join('')
    : '<div class="muted small" style="padding:8px 0;">No certifications defined yet.</div>');
}

async function addCertType() {
  const name = val('new-cert-name');
  if (!name) { showToast('Enter a certification name'); return; }
  if (DB.certTypes.includes(name)) { showToast('Already exists'); return; }
  const updated = [...DB.certTypes, name];
  try {
    await DB.saveCertTypes(updated);
    clearFields(['new-cert-name']);
    renderCertManager();
    showToast(name + ' added', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

async function removeCertType(index) {
  const updated = DB.certTypes.filter((_, i) => i !== index);
  try {
    await DB.saveCertTypes(updated);
    renderCertManager();
    showToast('Certification removed', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── My Profile ────────────────────────────────────────────────────────────────

function renderProfile() {
  const user = Auth.currentUser();
  const ff   = DB.firefighters.find(f => f.id === user.ffId);

  if (!ff) {
    setInner('profile-content', '<p class="muted" style="padding:24px;">Loading profile...</p>');
    return;
  }

  const licences = ff.licences || [];
  const ffCerts  = ff.certifications || [];

  const licenceCheckboxes = LICENCE_CATS.map(l => `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px;">
      <input type="checkbox" id="lic-${l}" ${licences.includes(l) ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--fire);" />
      Category ${l}
    </label>`).join('');

  const certCheckboxes = DB.certTypes.length
    ? DB.certTypes.map(c => `
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:8px;">
          <input type="checkbox" id="cert-${c.replace(/\s+/g,'-')}" ${ffCerts.includes(c) ? 'checked' : ''}
            style="width:16px;height:16px;accent-color:var(--fire);" />
          ${c}
        </label>`).join('')
    : '<div class="muted small">No certifications defined by admin yet.</div>';

  setInner('profile-content', `
    <div class="profile-card">
      <div class="profile-header">
        <div class="profile-avatar">${ff.first[0]}${ff.last[0]}</div>
        <div class="profile-meta">
          <div class="profile-name">${ff.first} ${ff.last}</div>
          <div class="profile-rank">${ff.rank}</div>
          <span class="status-pill ${STATUS_META[ff.status]?.cls}">
            <span class="pill-dot"></span>${STATUS_META[ff.status]?.label}
          </span>
        </div>
      </div>

      <div class="profile-body">

        <div class="profile-section-title">MY INFORMATION</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">First Name</label>
            <input class="form-control" id="p-first" value="${ff.first}" />
          </div>
          <div class="form-group">
            <label class="form-label">Last Name</label>
            <input class="form-control" id="p-last" value="${ff.last}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <input class="form-control" id="p-phone" value="${ff.phone}" />
        </div>

        <div class="profile-section-title" style="margin-top:24px;">MY STATUS</div>
        <div class="form-group">
          <label class="form-label">Current Status</label>
          <select class="form-control" id="p-status">
            ${Object.entries(STATUS_META).map(([k, v]) =>
              '<option value="' + k + '" ' + (ff.status === k ? 'selected' : '') + '>' + v.label + '</option>'
            ).join('')}
          </select>
        </div>

        <div class="profile-section-title" style="margin-top:24px;">DRIVING LICENCE CATEGORIES</div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:8px;">
          ${licenceCheckboxes}
        </div>

        <div class="profile-section-title" style="margin-top:24px;">CERTIFICATIONS</div>
        <div style="columns:2;gap:16px;margin-bottom:8px;">
          ${certCheckboxes}
        </div>

        <div class="profile-section-title" style="margin-top:24px;">READ-ONLY</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input class="form-control" value="${ff.unit}" disabled />
          </div>
          <div class="form-group">
            <label class="form-label">Rank</label>
            <input class="form-control" value="${ff.rank}" disabled />
          </div>
        </div>

        <div style="margin-top:24px;display:flex;gap:10px;">
          <button class="btn btn-primary" onclick="saveProfile(${ff.id})">Save Changes</button>
          <button class="btn btn-ghost" onclick="renderProfile()">Cancel</button>
        </div>

        <div class="profile-section-title" style="margin-top:32px;">MY HOURS</div>
        <div id="profile-hours-display" style="margin-bottom:24px;">
          <div class="muted small">Loading hours...</div>
        </div>

        <div class="profile-section-title" style="margin-top:40px;">CHANGE PASSWORD</div>
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input class="form-control" type="password" id="p-current-pw" placeholder="Enter your current password" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">New Password</label>
            <input class="form-control" type="password" id="p-new-pw" placeholder="Min. 6 characters" />
          </div>
          <div class="form-group">
            <label class="form-label">Confirm New Password</label>
            <input class="form-control" type="password" id="p-confirm-pw" placeholder="Repeat new password" />
          </div>
        </div>
        <div id="pw-error" style="display:none;color:var(--fire);font-size:12px;font-family:var(--font-mono);margin-bottom:12px;padding:8px;background:rgba(255,61,31,.1);border-radius:4px;"></div>
        <button class="btn btn-ghost" id="btn-change-pw" onclick="changePassword()">Update Password</button>

      </div>
    </div>
  `);

  // Load this firefighter's hours from the sheet after profile renders
  loadProfileHours(ff.last);
}

async function saveProfile(id) {
  const licences       = LICENCE_CATS.filter(l => document.getElementById('lic-' + l)?.checked);
  const certifications = DB.certTypes.filter(c => document.getElementById('cert-' + c.replace(/\s+/g,'-'))?.checked);

  const fields = {
    first:          val('p-first'),
    last:           val('p-last'),
    phone:          val('p-phone'),
    status:         val('p-status'),
    licences,
    certifications,
  };

  Object.keys(fields).forEach(k => {
    if (fields[k] === '' || fields[k] === undefined) delete fields[k];
  });

  try {
    await DB.updateFirefighter(id, fields);
    if (fields.first) setInner('user-greeting', fields.first);
    showToast('Profile saved!', 'success');
  } catch (e) {
    showToast('Error: ' + e.message);
  }
}

// ── Change Password ───────────────────────────────────────────────────────────

async function changePassword() {
  const currentPw = val('p-current-pw');
  const newPw     = val('p-new-pw');
  const confirmPw = val('p-confirm-pw');
  const errEl     = document.getElementById('pw-error');
  const btn       = document.getElementById('btn-change-pw');

  errEl.style.display = 'none';

  if (!currentPw)          return showPwError('Please enter your current password.');
  if (!newPw)              return showPwError('Please enter a new password.');
  if (newPw.length < 6)   return showPwError('New password must be at least 6 characters.');
  if (newPw !== confirmPw) return showPwError('Passwords do not match.');
  if (newPw === currentPw) return showPwError('New password must be different from current.');

  btn.disabled = true;
  btn.textContent = 'Updating...';

  try {
    const firebaseUser = auth.currentUser;
    const userProfile  = Auth.currentUser();
    const credential   = firebase.auth.EmailAuthProvider.credential(userProfile.email, currentPw);

    await firebaseUser.reauthenticateWithCredential(credential);
    await firebaseUser.updatePassword(newPw);

    document.getElementById('p-current-pw').value = '';
    document.getElementById('p-new-pw').value      = '';
    document.getElementById('p-confirm-pw').value  = '';

    showToast('Password updated!', 'success');

  } catch (e) {
    if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
      showPwError('Current password is incorrect.');
    } else if (e.code === 'auth/too-many-requests') {
      showPwError('Too many attempts. Please wait and try again.');
    } else {
      showPwError('Error: ' + e.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Password';
  }
}

function showPwError(msg) {
  const errEl = document.getElementById('pw-error');
  if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
}

// ── Modals ────────────────────────────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById('modal-' + id);
  if (el) el.classList.add('open');

  // When opening new-incident, populate unit checkboxes from real DB.units
  if (id === 'new-incident') {
    const container = document.getElementById('inc-units-checkboxes');
    if (!container) return;
    const available = DB.units.filter(u => u.status === 'available');
    if (!available.length) {
      container.innerHTML = '<span class="muted small">No available units right now.</span>';
      return;
    }
    container.innerHTML = available.map(u =>
      '<label class="dispatch-option">' +
        '<input type="checkbox" value="' + u.name + '" id="new-inc-unit-' + u.name.replace(/\s/g,'-') + '" />' +
        '<span>' + u.name + '</span>' +
        '<span class="unit-row-type">' + u.type + '</span>' +
      '</label>'
    ).join('');
  }
}

function closeModal(id) {
  const el = document.getElementById('modal-' + id);
  if (el) el.classList.remove('open');
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast-' + type : '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function setInner(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function clearFields(ids) {
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// ── Hours from Google Sheets ──────────────────────────────────────────────────

const SHEET_ID   = '1fy0hCBg75V7a8FiNsyLC1DsSknt0lsqr';
const SHEET_NAME = 'ΠΑΡΟΥΣΙΟΛΟΓΙΟ';
const NAME_COL   = 2;   // Column C  (A=0, B=1, C=2)
const HOURS_COL  = 37;  // Column AL (A=0 ... Z=25, AA=26 ... AL=37)

async function loadHours() {
  const tbody = document.getElementById('hours-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--fog);">Loading...</td></tr>';

  try {
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
                '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(SHEET_NAME);

    const response = await fetch(url);
    const text     = await response.text();

    // Google wraps the response in a callback — strip it to get pure JSON
    const json = JSON.parse(text.replace(/^.*?\(/, '').replace(/\);?\s*$/, ''));
    const rows = json.table.rows;

    if (!rows || !rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--fog);">No data found in sheet.</td></tr>';
      return;
    }

    const tableRows = rows
      .map(row => {
        const cells    = row.c || [];
        const lastName = (cells[NAME_COL]?.v  || '').toString().trim().toUpperCase();
        const hours    =  cells[HOURS_COL]?.v ?? '-';

        if (!lastName) return null;

        // Match to IGNIS roster by last name (uppercase)
        const ff = DB.firefighters.find(f => f.last.toUpperCase() === lastName);

        const fullName = ff ? ff.first + ' ' + ff.last : '-';
        const hoursNum = parseFloat(hours);

        // Colour: red > 20h, yellow > 10h, green <= 10h
        let hoursStyle = 'color:var(--green);font-weight:600;';
        if (!isNaN(hoursNum)) {
          if      (hoursNum > 20) hoursStyle = 'color:var(--fire);font-weight:700;';
          else if (hoursNum > 10) hoursStyle = 'color:var(--yellow);font-weight:600;';
        }

        const statusPill = ff
          ? '<span class="status-pill ' + (STATUS_META[ff.status]?.cls || '') + '"><span class="pill-dot"></span>' + (STATUS_META[ff.status]?.label || ff.status) + '</span>'
          : '<span class="muted small">Not in roster</span>';

        return '<tr>' +
          '<td style="font-family:var(--font-mono);font-weight:600;color:var(--white);">' + lastName + '</td>' +
          '<td style="color:var(--light);font-size:13px;">' + fullName + '</td>' +
          '<td style="' + hoursStyle + '">' + (isNaN(hoursNum) ? hours : hoursNum) + '</td>' +
          '<td>' + statusPill + '</td>' +
          '</tr>';
      })
      .filter(Boolean)
      .join('');

    tbody.innerHTML = tableRows ||
      '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--fog);">No matching firefighters found.</td></tr>';

  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--fire);">Error: ' + e.message + '. Make sure the sheet is set to public (Viewer).</td></tr>';
    console.error('Hours fetch error:', e);
  }
}

// ── Load hours for a single firefighter (used in My Profile) ─────────────────

async function loadProfileHours(lastName) {
  const el = document.getElementById('profile-hours-display');
  if (!el) return;

  el.innerHTML = '<div class="muted small">Loading your hours...</div>';

  try {
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
                '/gviz/tq?tqx=out:json&sheet=' + encodeURIComponent(SHEET_NAME);

    const response = await fetch(url);
    const text     = await response.text();
    const json     = JSON.parse(text.substring(text.indexOf('(') + 1, text.lastIndexOf(')')));
    const rows     = json.table.rows;

    if (!rows || !rows.length) {
      el.innerHTML = '<div class="muted small">No data found in sheet.</div>';
      return;
    }

    // Find the row matching this firefighter's last name
    const match = rows.find(row => {
      const cells = row.c || [];
      const name  = (cells[NAME_COL]?.v || '').toString().trim().toUpperCase();
      return name === lastName.toUpperCase();
    });

    if (!match) {
      el.innerHTML = '<div class="muted small">No hours record found for your name in the sheet.</div>';
      return;
    }

    const hours    = match.c[HOURS_COL]?.v ?? '-';
    const hoursNum = parseFloat(hours);

    // Colour based on amount
    let color = 'var(--green)';
    if (!isNaN(hoursNum)) {
      if      (hoursNum > 20) color = 'var(--fire)';
      else if (hoursNum > 10) color = 'var(--yellow)';
    }

    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--ash);border:1px solid var(--soot);border-radius:8px;">' +
        '<div style="font-family:var(--font-display);font-size:52px;line-height:1;color:' + color + ';">' +
          (isNaN(hoursNum) ? hours : hoursNum) +
        '</div>' +
        '<div>' +
          '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--fog);text-transform:uppercase;margin-bottom:4px;">Hours Owed</div>' +
          '<div style="font-size:13px;color:var(--fog);">From ΠΑΡΟΥΣΙΟΛΟΓΙΟ sheet</div>' +
        '</div>' +
      '</div>';

  } catch (e) {
    el.innerHTML = '<div style="color:var(--fire);font-size:12px;">Could not load hours: ' + e.message + '</div>';
  }
}

// ── Firefighter Incidents View ────────────────────────────────────────────────
// Simple read-only list of active incidents with a Chat button for each

function renderFFIncidents() {
  const active = DB.incidents.filter(i => i.status === 'active' || i.status === 'contained');

  setInner('ff-incidents-list', active.length
    ? active.map(inc => {
        const deployed = (inc.deployedUnits || []).join(', ') || 'None';
        return `
          <div class="ff-incident-card">
            <div class="ff-inc-top">
              <div>
                <div class="ff-inc-type">${inc.type}</div>
                <div class="ff-inc-location">📍 ${inc.location}</div>
                <div class="ff-inc-units">Units: ${deployed}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
                <span class="incident-badge ${INC_BADGE[inc.status]?.cls}">${INC_BADGE[inc.status]?.label}</span>
                <span class="mono small muted">${inc.time}</span>
              </div>
            </div>
            <div class="ff-inc-actions">
              <a class="btn btn-ghost btn-sm"
                href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inc.location)}"
                target="_blank">🗺️ Maps</a>
              <button class="btn btn-primary btn-sm" onclick="openChat('${inc.id}', '${inc.type} - ${inc.location}')">
                💬 Chat
              </button>
            </div>
          </div>`;
      }).join('')
    : '<div style="padding:32px;text-align:center;color:var(--fog);">No active incidents right now.</div>'
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

let _chatUnsub = null;  // current chat listener unsubscribe handle

function openChat(incidentId, incidentTitle) {
  // Set the modal title
  setInner('chat-modal-title', incidentTitle);

  // Store incident ID on the send button
  const btn = document.getElementById('chat-send-btn');
  if (btn) btn.setAttribute('data-inc-id', incidentId);

  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    // Allow Enter key to send
    input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } };
  }

  // Clear previous messages
  setInner('chat-messages', '<div class="muted small" style="padding:16px;">Loading messages...</div>');

  // Stop any previous listener
  if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }

  // Start real-time listener for this incident's chat
  _chatUnsub = DB.listenChat(incidentId, messages => {
    if (!messages.length) {
      setInner('chat-messages', '<div class="muted small" style="padding:16px;text-align:center;">No messages yet. Be the first to send one.</div>');
      return;
    }

    const currentUser = Auth.currentUser();
    setInner('chat-messages', messages.map(msg => {
      const isMe = msg.sender === currentUser.name;
      return `
        <div class="chat-msg ${isMe ? 'chat-msg-me' : 'chat-msg-them'}">
          ${!isMe ? `<div class="chat-sender">${msg.sender}</div>` : ''}
          <div class="chat-bubble ${isMe ? 'bubble-me' : 'bubble-them'}">${msg.text}</div>
          <div class="chat-time">${msg.time}</div>
        </div>`;
    }).join(''));

    // Scroll to bottom
    const box = document.getElementById('chat-messages');
    if (box) box.scrollTop = box.scrollHeight;
  });

  openModal('chat');
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const btn   = document.getElementById('chat-send-btn');
  const text  = input?.value.trim();
  const incId = btn?.getAttribute('data-inc-id');

  if (!text || !incId) return;

  const user = Auth.currentUser();
  input.value = '';

  try {
    await DB.sendChatMessage(incId, user.name, text);
  } catch (e) {
    showToast('Could not send: ' + e.message);
    input.value = text; // restore text so user doesn't lose it
  }
}

function closeChat() {
  if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; }
  closeModal('chat');
}
