/* ============================================================
   Centrix Systems — MSP SLA Calculator
   app.js — All application logic
   ============================================================ */

'use strict';

/* ────────────────────────────────────────────────────────────
   DEFAULT SLA TIER CONFIGURATION
   Response / Resolution / Escalation times in hours
   ──────────────────────────────────────────────────────────── */
const DEFAULT_TIERS = [
  { id: 'p1', label: 'Critical',  response: 0.25,  resolution: 4,   escalation: 1,   complianceGoal: 99, color: '#DC2626' },
  { id: 'p2', label: 'High',      response: 1,     resolution: 8,   escalation: 4,   complianceGoal: 97, color: '#EA580C' },
  { id: 'p3', label: 'Medium',    response: 4,     resolution: 24,  escalation: 12,  complianceGoal: 95, color: '#CA8A04' },
  { id: 'p4', label: 'Low',       response: 8,     resolution: 72,  escalation: 48,  complianceGoal: 90, color: '#16A34A' },
];

/* ────────────────────────────────────────────────────────────
   BUSINESS HOURS DEFINITIONS
   ──────────────────────────────────────────────────────────── */
const COVERAGE = {
  '247':      { start: 0,  end: 24, days: [0,1,2,3,4,5,6] },   // all hours, all days
  'bh':       { start: 8,  end: 18, days: [1,2,3,4,5] },        // Mon–Fri 08:00–18:00
  'extended': { start: 7,  end: 20, days: [1,2,3,4,5,6] },      // Mon–Sat 07:00–20:00
};

/* ────────────────────────────────────────────────────────────
   STATE
   ──────────────────────────────────────────────────────────── */
let tiers = loadTiers();
let ticketLog = [];

/* ────────────────────────────────────────────────────────────
   STORAGE HELPERS
   ──────────────────────────────────────────────────────────── */
function loadTiers() {
  try {
    const stored = localStorage.getItem('centrix_tiers');
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return DEFAULT_TIERS.map(t => ({ ...t }));
}

function saveTiers() {
  try { localStorage.setItem('centrix_tiers', JSON.stringify(tiers)); } catch (_) {}
}

/* ────────────────────────────────────────────────────────────
   BUSINESS HOURS CALCULATOR
   Adds `hours` business-hours to a starting Date and returns
   the resulting Date.
   ──────────────────────────────────────────────────────────── */
function addBusinessHours(start, hours, coverageKey) {
  const cov = COVERAGE[coverageKey] || COVERAGE['bh'];
  const result = new Date(start);

  let remainingMins = Math.round(hours * 60);

  // Advance to the next business moment if currently outside hours
  result.setTime(snapToBusinessHours(result, cov).getTime());

  while (remainingMins > 0) {
    const day = result.getDay();
    if (!cov.days.includes(day)) {
      // Skip to start of next valid day
      result.setDate(result.getDate() + 1);
      result.setHours(cov.start, 0, 0, 0);
      continue;
    }

    const endOfDay = new Date(result);
    endOfDay.setHours(cov.end, 0, 0, 0);

    const minsUntilEOD = Math.max(0, (endOfDay - result) / 60000);

    if (remainingMins <= minsUntilEOD) {
      result.setTime(result.getTime() + remainingMins * 60000);
      remainingMins = 0;
    } else {
      remainingMins -= minsUntilEOD;
      // Move to next valid business day start
      result.setDate(result.getDate() + 1);
      result.setHours(cov.start, 0, 0, 0);
      // Skip non-working days
      while (!cov.days.includes(result.getDay())) {
        result.setDate(result.getDate() + 1);
      }
    }
  }
  return result;
}

function snapToBusinessHours(date, cov) {
  const d = new Date(date);
  // Find next valid day
  let safety = 0;
  while (!cov.days.includes(d.getDay()) && safety++ < 8) {
    d.setDate(d.getDate() + 1);
    d.setHours(cov.start, 0, 0, 0);
  }
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < cov.start) { d.setHours(cov.start, 0, 0, 0); }
  else if (h >= cov.end) {
    d.setDate(d.getDate() + 1);
    d.setHours(cov.start, 0, 0, 0);
    // Skip non-working days
    while (!cov.days.includes(d.getDay())) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d;
}

/* Elapsed business minutes between two dates */
function elapsedBusinessMinutes(from, to, coverageKey) {
  if (to <= from) return 0;
  const cov = COVERAGE[coverageKey] || COVERAGE['bh'];
  let cursor = new Date(from);
  cursor.setTime(snapToBusinessHours(cursor, cov).getTime());
  let mins = 0;
  const MAX_DAYS = 400;
  let d = 0;
  while (cursor < to && d++ < MAX_DAYS) {
    const day = cursor.getDay();
    if (!cov.days.includes(day)) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(cov.start, 0, 0, 0);
      continue;
    }
    const endOfDay = new Date(cursor);
    endOfDay.setHours(cov.end, 0, 0, 0);
    const segEnd = to < endOfDay ? to : endOfDay;
    mins += Math.max(0, (segEnd - cursor) / 60000);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(cov.start, 0, 0, 0);
    while (!cov.days.includes(cursor.getDay())) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return mins;
}

/* ────────────────────────────────────────────────────────────
   FORMATTING HELPERS
   ──────────────────────────────────────────────────────────── */
const FMT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function fmtDate(date) { return FMT_DATE.format(date); }

function fmtDuration(minutes) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const hrs  = h % 24;
  return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
}

function fmtDowntime(minutes) {
  if (minutes < 1)   return `${(minutes * 60).toFixed(1)} sec`;
  if (minutes < 60)  return `${minutes.toFixed(1)} min`;
  const h = minutes / 60;
  if (h < 24)        return `${h.toFixed(2)} hrs`;
  const d = h / 24;
  if (d < 30)        return `${d.toFixed(2)} days`;
  return `${(d / 30).toFixed(2)} months`;
}

/* ────────────────────────────────────────────────────────────
   TAB NAVIGATION
   ──────────────────────────────────────────────────────────── */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ────────────────────────────────────────────────────────────
   SET DEFAULT DATETIME (now) on the deadline form
   ──────────────────────────────────────────────────────────── */
(function setDefaultDateTime() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('ticketReceived').value = local;
})();

/* ────────────────────────────────────────────────────────────
   DEADLINE CALCULATOR
   ──────────────────────────────────────────────────────────── */
document.getElementById('calcDeadlineBtn').addEventListener('click', calculateDeadline);

function calculateDeadline() {
  const ticketId     = document.getElementById('ticketId').value.trim() || 'TKT-XXXX';
  const priorityId   = document.getElementById('ticketPriority').value;
  const receivedVal  = document.getElementById('ticketReceived').value;
  const coverageKey  = document.getElementById('coverageType').value;
  const respondedVal = document.getElementById('ticketResponded').value;
  const resolvedVal  = document.getElementById('ticketResolved').value;

  if (!receivedVal) {
    showResultError('deadlineResults', 'Please enter the date and time the ticket was received.');
    return;
  }

  const tier     = tiers.find(t => t.id === priorityId);
  const received = new Date(receivedVal);
  const responseDeadline   = addBusinessHours(received, tier.response,   coverageKey);
  const resolutionDeadline = addBusinessHours(received, tier.resolution,  coverageKey);
  const escalationDeadline = addBusinessHours(received, tier.escalation,  coverageKey);

  // Status assessment
  const responded = respondedVal ? new Date(respondedVal) : null;
  const resolved  = resolvedVal  ? new Date(resolvedVal)  : null;
  const now       = new Date();

  function getStatus(deadline, actual) {
    if (actual) return actual <= deadline ? 'met' : 'breach';
    return now > deadline ? 'breach' : 'pending';
  }

  const responseStatus   = getStatus(responseDeadline,   responded);
  const resolutionStatus = getStatus(resolutionDeadline, resolved);

  // Elapsed times
  let responseElapsed   = responded ? elapsedBusinessMinutes(received, responded,  coverageKey) : null;
  let resolutionElapsed = resolved  ? elapsedBusinessMinutes(received, resolved,   coverageKey) : null;

  // Build result HTML
  const container = document.getElementById('deadlineResults');
  container.innerHTML = `
    <h3 class="card-title">SLA Results</h3>
    <div class="result-ticket-id">${escHtml(ticketId)}</div>

    <div class="result-summary-row">
      <span class="key">Priority</span>
      <span class="val"><span class="prio-badge ${priorityId}">P${priorityId[1]} — ${tier.label}</span></span>
    </div>
    <div class="result-summary-row">
      <span class="key">Received</span>
      <span class="val">${fmtDate(received)}</span>
    </div>
    <div class="result-summary-row">
      <span class="key">Coverage</span>
      <span class="val">${coverageName(coverageKey)}</span>
    </div>

    <div style="height:12px"></div>

    ${resultBlock('Response', responseDeadline, tier.response, responseStatus, responseElapsed, responded)}
    ${resultBlock('Escalation', escalationDeadline, tier.escalation, getStatus(escalationDeadline, null), null, null)}
    ${resultBlock('Resolution', resolutionDeadline, tier.resolution, resolutionStatus, resolutionElapsed, resolved)}
  `;

  // Add to ticket log
  addToLog({
    id: ticketId,
    priority: priorityId,
    label: tier.label,
    received,
    resolutionDeadline,
    resolutionStatus,
    coverageKey,
  });
}

function resultBlock(name, deadline, targetHrs, status, elapsed, actual) {
  const statusLabel = status === 'met' ? 'Met' : status === 'breach' ? 'Breached' : 'Pending';
  const elapsedStr  = elapsed !== null ? `Elapsed: ${fmtDuration(elapsed)}` : '';
  const actualStr   = actual  ? `Actual: ${fmtDate(actual)}` : '';
  return `
    <div class="result-block">
      <div class="result-block-header">
        <span class="label">${name}</span>
        <span class="status-pill ${status}"><span class="dot ${status}"></span>${statusLabel}</span>
      </div>
      <div class="result-block-body">
        <div class="result-deadline">Deadline: ${fmtDate(deadline)}</div>
        <div class="result-meta">Target: ${fmtDuration(targetHrs * 60)}
          ${actualStr ? ' &nbsp;·&nbsp; ' + actualStr : ''}
          ${elapsedStr ? ' &nbsp;·&nbsp; ' + elapsedStr : ''}
        </div>
      </div>
    </div>`;
}

function coverageName(key) {
  return { '247': '24/7 (All Hours)', 'bh': 'Business Hours (Mon–Fri)', 'extended': 'Extended (Mon–Sat)' }[key] || key;
}

function showResultError(containerId, msg) {
  document.getElementById(containerId).innerHTML = `
    <h3 class="card-title">Error</h3>
    <div class="uptime-result fail" style="margin:0">${escHtml(msg)}</div>`;
}

/* ────────────────────────────────────────────────────────────
   TICKET LOG
   ──────────────────────────────────────────────────────────── */
function addToLog(entry) {
  ticketLog.unshift(entry);
  renderLog();
}

function renderLog() {
  const el = document.getElementById('ticketLog');
  if (!ticketLog.length) {
    el.innerHTML = '<div class="empty-log">No tickets logged yet.</div>';
    return;
  }
  el.innerHTML = ticketLog.map(e => `
    <div class="log-item">
      <span class="log-id">${escHtml(e.id)}</span>
      <span class="log-info">
        <span class="prio-badge ${e.priority}">P${e.priority[1]} ${e.label}</span>
        &nbsp; Received ${fmtDate(e.received)}
      </span>
      <span class="log-deadline">Resolution by: ${fmtDate(e.resolutionDeadline)}</span>
      <span class="status-pill ${e.resolutionStatus}">
        <span class="dot ${e.resolutionStatus}"></span>
        ${e.resolutionStatus === 'met' ? 'Met' : e.resolutionStatus === 'breach' ? 'Breached' : 'Pending'}
      </span>
    </div>`).join('');
}

document.getElementById('clearLogBtn').addEventListener('click', () => {
  ticketLog = [];
  renderLog();
});

/* ────────────────────────────────────────────────────────────
   COMPLIANCE TRACKER
   ──────────────────────────────────────────────────────────── */

// Auto-calculate breached count from total − met
document.querySelectorAll('.sla-input-row:not(.header-row)').forEach(row => {
  const totalInput   = row.querySelector('.comp-total');
  const metInput     = row.querySelector('.comp-met');
  const breachDisplay = row.querySelector('.comp-breached');

  function update() {
    const total  = parseInt(totalInput.value) || 0;
    const met    = Math.min(parseInt(metInput.value) || 0, total);
    metInput.value = met;
    breachDisplay.textContent = Math.max(0, total - met);
  }
  totalInput.addEventListener('input', update);
  metInput.addEventListener('input', update);
});

document.getElementById('calcComplianceBtn').addEventListener('click', calculateCompliance);

function calculateCompliance() {
  const rows = document.querySelectorAll('.sla-input-row:not(.header-row)');
  let grandTotal = 0, grandMet = 0;
  const data = [];

  rows.forEach((row, i) => {
    const tier   = tiers[i];
    const total  = parseInt(row.querySelector('.comp-total').value) || 0;
    const met    = Math.min(parseInt(row.querySelector('.comp-met').value) || 0, total);
    const breach = total - met;
    const pct    = total > 0 ? (met / total * 100) : null;
    grandTotal  += total;
    grandMet    += met;
    data.push({ tier, total, met, breach, pct });
  });

  const overallPct = grandTotal > 0 ? (grandMet / grandTotal * 100) : null;
  const startVal   = document.getElementById('periodStart').value;
  const endVal     = document.getElementById('periodEnd').value;
  const periodStr  = (startVal && endVal) ? `${startVal} – ${endVal}` : 'All time';

  const container = document.getElementById('complianceResults');
  container.innerHTML = `
    <h3 class="card-title">Compliance Report</h3>
    <div style="font-size:.78rem;color:var(--gray-500);margin-bottom:14px;">Period: ${escHtml(periodStr)}</div>
    <div class="overall-compliance">
      <div class="label">Overall SLA Compliance</div>
      <div class="pct">${overallPct !== null ? overallPct.toFixed(2) + '%' : 'N/A'}</div>
      <div class="sub">${grandMet} of ${grandTotal} tickets met SLA</div>
    </div>
    <div class="compliance-grid">
      ${data.map(d => complianceCard(d)).join('')}
    </div>
    <div class="result-summary-row">
      <span class="key">Total Tickets</span><span class="val">${grandTotal}</span>
    </div>
    <div class="result-summary-row">
      <span class="key">Met SLA</span><span class="val text-green">${grandMet}</span>
    </div>
    <div class="result-summary-row">
      <span class="key">Breached</span><span class="val text-red">${grandTotal - grandMet}</span>
    </div>
  `;
}

function complianceCard(d) {
  const { tier, total, met, breach, pct } = d;
  if (pct === null) {
    return `<div class="compliance-card">
      <div class="prio-badge ${tier.id}">${tier.id.toUpperCase()} ${tier.label}</div>
      <div class="compliance-pct" style="color:var(--gray-400)">N/A</div>
      <div class="compliance-label">No tickets in period</div>
    </div>`;
  }
  const above = pct >= tier.complianceGoal;
  return `<div class="compliance-card ${above ? 'above' : 'below'}">
    <div class="prio-badge ${tier.id}">${tier.id.toUpperCase()} ${tier.label}</div>
    <div class="compliance-pct">${pct.toFixed(1)}%</div>
    <div class="compliance-label">Target: ${tier.complianceGoal}% &nbsp;·&nbsp; ${met}/${total} met</div>
    ${breach > 0 ? `<div style="font-size:.75rem;margin-top:4px;color:var(--danger-color)">${breach} breach${breach !== 1 ? 'es' : ''}</div>` : ''}
  </div>`;
}

/* ────────────────────────────────────────────────────────────
   UPTIME CALCULATOR
   ──────────────────────────────────────────────────────────── */
const PERIOD_HOURS = { day: 24, week: 168, month: 720, quarter: 2184, year: 8760 };

document.getElementById('calcUptimeBtn').addEventListener('click', () => {
  const pct    = parseFloat(document.getElementById('uptimeTarget').value);
  const period = document.getElementById('uptimePeriod').value;
  const totalH = PERIOD_HOURS[period];
  const totalM = totalH * 60;
  const allowed = totalM * (1 - pct / 100);

  const el = document.getElementById('uptimeResult');
  el.className = 'uptime-result ok';
  el.innerHTML = `
    <div class="uptime-label">Allowed Downtime — ${pct}% SLA</div>
    <div class="uptime-big">${fmtDowntime(allowed)}</div>
    <div class="uptime-details">
      <div>Period: ${periodLabel(period)} (${totalH.toLocaleString()} hours)</div>
      <div>Total allowed downtime: ${fmtDowntime(allowed)} (${allowed.toFixed(2)} minutes)</div>
      <div>Required uptime: ${(totalM - allowed).toFixed(1)} minutes</div>
    </div>`;
  el.classList.remove('hidden');
});

document.getElementById('calcActualUptimeBtn').addEventListener('click', () => {
  const periodH    = parseFloat(document.getElementById('periodHours').value) || 720;
  const downtimeM  = parseFloat(document.getElementById('totalDowntime').value) || 0;
  const contracted = parseFloat(document.getElementById('contractedSla').value) || 99.9;
  const totalM     = periodH * 60;
  const uptimeM    = totalM - downtimeM;
  const actualPct  = (uptimeM / totalM) * 100;
  const isMet      = actualPct >= contracted;
  const allowedM   = totalM * (1 - contracted / 100);
  const overM      = Math.max(0, downtimeM - allowedM);

  const el = document.getElementById('actualUptimeResult');
  el.className = `uptime-result ${actualPct >= 99.9 ? 'ok' : actualPct >= 99 ? 'warn' : 'fail'}`;
  el.innerHTML = `
    <div class="uptime-label">Actual Uptime — ${isMet ? 'SLA Met' : 'SLA Breached'}</div>
    <div class="uptime-big">${actualPct.toFixed(4)}%</div>
    <div class="uptime-details">
      <div>Period: ${periodH.toLocaleString()} hours (${totalM.toLocaleString()} min)</div>
      <div>Total downtime: ${fmtDowntime(downtimeM)}</div>
      <div>Contracted SLA: ${contracted}% (allowed: ${fmtDowntime(allowedM)})</div>
      ${!isMet ? `<div>Over allowance: <strong>${fmtDowntime(overM)}</strong></div>` : '<div>SLA target achieved.</div>'}
    </div>`;
  el.classList.remove('hidden');
});

function periodLabel(p) {
  return { day: 'Per Day', week: 'Per Week', month: 'Per Month (30d)', quarter: 'Per Quarter (91d)', year: 'Per Year (365d)' }[p];
}

/* ────────────────────────────────────────────────────────────
   UPTIME REFERENCE TABLE
   ──────────────────────────────────────────────────────────── */
(function buildUptimeTable() {
  const rows = [
    { pct: 90,     nines: '1-nine'  },
    { pct: 95,     nines: '—'       },
    { pct: 99,     nines: '2-nines' },
    { pct: 99.5,   nines: '—'       },
    { pct: 99.9,   nines: '3-nines' },
    { pct: 99.95,  nines: '—'       },
    { pct: 99.99,  nines: '4-nines' },
    { pct: 99.999, nines: '5-nines' },
  ];
  const periods = [
    { key: 'day',     h: 24    },
    { key: 'week',    h: 168   },
    { key: 'month',   h: 720   },
    { key: 'quarter', h: 2184  },
    { key: 'year',    h: 8760  },
  ];
  const tbody = document.querySelector('#uptimeRefTable tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.pct}%</strong></td>
      <td>${r.nines}</td>
      ${periods.map(p => {
        const mins = p.h * 60 * (1 - r.pct / 100);
        return `<td>${fmtDowntime(mins)}</td>`;
      }).join('')}
    </tr>`).join('');
})();

/* ────────────────────────────────────────────────────────────
   SLA TIERS CONFIGURATION TABLE
   ──────────────────────────────────────────────────────────── */
function renderTiersTable() {
  const tbody = document.getElementById('tiersTableBody');
  tbody.innerHTML = tiers.map((t, i) => `
    <tr data-idx="${i}">
      <td><span class="prio-badge ${t.id}">${t.id.toUpperCase()}</span></td>
      <td><input type="text"   class="tier-label"      value="${escHtml(t.label)}"        style="width:110px"/></td>
      <td><input type="number" class="tier-response"   value="${t.response}"   min="0.1" step="0.25" style="width:90px"/></td>
      <td><input type="number" class="tier-resolution" value="${t.resolution}" min="1"   step="1"    style="width:90px"/></td>
      <td><input type="number" class="tier-escalation" value="${t.escalation}" min="0.5" step="0.5"  style="width:90px"/></td>
      <td><input type="number" class="tier-goal"       value="${t.complianceGoal}" min="0" max="100" step="0.5" style="width:80px"/></td>
      <td><input type="color"  class="tier-color"      value="${t.color}"     /></td>
    </tr>`).join('');
}

renderTiersTable();

document.getElementById('saveTiersBtn').addEventListener('click', () => {
  document.querySelectorAll('#tiersTableBody tr').forEach((row, i) => {
    tiers[i].label          = row.querySelector('.tier-label').value.trim() || tiers[i].label;
    tiers[i].response       = parseFloat(row.querySelector('.tier-response').value)   || tiers[i].response;
    tiers[i].resolution     = parseFloat(row.querySelector('.tier-resolution').value) || tiers[i].resolution;
    tiers[i].escalation     = parseFloat(row.querySelector('.tier-escalation').value) || tiers[i].escalation;
    tiers[i].complianceGoal = parseFloat(row.querySelector('.tier-goal').value)       || tiers[i].complianceGoal;
    tiers[i].color          = row.querySelector('.tier-color').value;
  });
  saveTiers();
  const msg = document.getElementById('tiersSaveMsg');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
});

document.getElementById('resetTiersBtn').addEventListener('click', () => {
  if (confirm('Reset all SLA tiers to defaults?')) {
    tiers = DEFAULT_TIERS.map(t => ({ ...t }));
    saveTiers();
    renderTiersTable();
  }
});

/* ────────────────────────────────────────────────────────────
   UTILITY
   ──────────────────────────────────────────────────────────── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
