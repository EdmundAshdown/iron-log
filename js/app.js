import { openDB, seedIfEmpty, getExercises, getSets, addSet, deleteSet, getAllPRs, getPref, setPref, getEquipment } from './db.js';
import { calcPlates, targetFromPct, displayWeight, buildSessionPlan } from './calc.js';
import { burstFromEl } from './confetti.js';

// ── State ──────────────────────────────────────────────────
let state = {
  tab: 'log',
  unit: 'lbs',
  exercises: [],
  todaySets: [],
  equipment: { barWeight: 45, plates: [] },
  // planner
  plannerExId: null,
  plannerRM: 1,
  plannerSets: [50, 65, 75, 85, 85, 85],
  plannerChecked: [],
  // pr window
  prWindow: '365',
};

// ── Boot ───────────────────────────────────────────────────
async function boot() {
  await openDB();
  await seedIfEmpty();
  state.exercises = await getExercises();
  state.equipment = await getEquipment();
  state.unit = await getPref('unit', 'lbs');
  state.prWindow = await getPref('prWindow', '365');
  state.plannerChecked = state.plannerSets.map(() => false);
  if (state.exercises.length > 0) state.plannerExId = state.exercises[0].id;

  renderTab('log');
  setupNav();
}

// ── Navigation ─────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('fab').classList.toggle('hidden', tab !== 'log');
  renderTab(tab);
}

async function renderTab(tab) {
  const content = document.getElementById('content');
  const h1 = document.querySelector('#header h1');
  const tabTitles = { log: 'Iron Log', prs: 'Personal Records', planner: 'Session Planner', settings: 'Settings' };
  h1.textContent = tabTitles[tab];

  if (tab === 'log') await renderLog(content);
  else if (tab === 'prs') await renderPRs(content);
  else if (tab === 'planner') await renderPlanner(content);
  else if (tab === 'settings') await renderSettings(content);
}

// ── Helpers ────────────────────────────────────────────────
function dw(lbs) { return displayWeight(lbs, state.unit); }

function sinceDate() {
  if (!state.prWindow || state.prWindow === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(state.prWindow));
  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(isoStr) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Log Tab ────────────────────────────────────────────────
async function renderLog(el) {
  const allSets = await getSets();
  const today = todayStr();
  const todaySets = allSets.filter(s => s.date === today).reverse();

  // Count PRs set today
  let prCount = 0;
  for (const s of todaySets) {
    const prs = await getAllPRs(s.exerciseId, sinceDate());
    if (prs[s.reps] === s.weight) prCount++;
  }

  const exMap = Object.fromEntries(state.exercises.map(e => [e.id, e.name]));

  const setsHtml = todaySets.length === 0
    ? `<div class="empty"><div class="icon">🏋️</div><p>No sets logged today yet.</p></div>`
    : todaySets.map(s => {
        const prs = {};
        return `
        <div class="log-item" data-id="${s.id}">
          <div>
            <div class="log-name">${exMap[s.exerciseId] || '?'}</div>
            <div class="log-detail">${s.reps} rep${s.reps !== 1 ? 's' : ''} · ${fmtDate(s.date)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="log-weight">${dw(s.weight)}</div>
            <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteSetItem(${s.id})">✕</button>
          </div>
        </div>`;
      }).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${todaySets.length}</div><div class="stat-lbl">sets today</div></div>
      <div class="stat"><div class="stat-val">${new Set(todaySets.map(s => s.exerciseId)).size}</div><div class="stat-lbl">exercises</div></div>
      <div class="stat"><div class="stat-val accent">${prCount}</div><div class="stat-lbl">PRs today</div></div>
    </div>
    <div class="card">
      <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
      ${setsHtml}
    </div>
  `;

  document.getElementById('fab').onclick = openLogModal;
}

window.deleteSetItem = async function(id) {
  if (!confirm('Delete this set?')) return;
  await deleteSet(id);
  renderTab('log');
};

// ── Log modal (bottom sheet) ───────────────────────────────
function openLogModal() {
  const overlay = document.getElementById('log-modal');
  const exSel = document.getElementById('modal-exercise');
  exSel.innerHTML = state.exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  overlay.classList.add('open');
}

window.closeLogModal = function() {
  document.getElementById('log-modal').classList.remove('open');
};

window.submitLog = async function() {
  const exId = parseInt(document.getElementById('modal-exercise').value);
  const reps = parseInt(document.getElementById('modal-reps').value);
  const weightRaw = parseFloat(document.getElementById('modal-weight').value);
  const notes = document.getElementById('modal-notes').value.trim();

  if (!exId || isNaN(reps) || isNaN(weightRaw)) return;

  const weightLbs = state.unit === 'kg' ? weightRaw * 2.20462 : weightRaw;

  await addSet({ exerciseId: exId, date: todayStr(), weight: Math.round(weightLbs * 10) / 10, reps, notes });
  closeLogModal();
  renderTab('log');
};

// ── PRs Tab ────────────────────────────────────────────────
async function renderPRs(el) {
  const since = sinceDate();
  const windowLabel = {
    '90': 'Last 3 months', '180': 'Last 6 months',
    '365': 'Last year', 'all': 'All time'
  }[state.prWindow] || 'Last year';

  const rows = await Promise.all(state.exercises.map(async ex => {
    const prs = await getAllPRs(ex.id, since);
    return { ex, prs };
  }));

  const hasAny = rows.some(r => r.prs[1] || r.prs[3] || r.prs[5]);

  const rowsHtml = rows.map(({ ex, prs }) => `
    <div class="pr-row">
      <div class="pr-name">${ex.name}</div>
      <div class="pr-cells">
        ${[1,3,5].map(r => `
          <div class="pr-cell">
            <div class="pr-cell-lbl">${r}RM</div>
            <div class="pr-cell-val${prs[r] ? '' : ' empty'}">${prs[r] ? dw(prs[r]) : '—'}</div>
          </div>`).join('')}
      </div>
    </div>`).join('');

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">PR window</div>
      <select onchange="setPRWindow(this.value)">
        <option value="90" ${state.prWindow==='90'?'selected':''}>Last 3 months</option>
        <option value="180" ${state.prWindow==='180'?'selected':''}>Last 6 months</option>
        <option value="365" ${state.prWindow==='365'?'selected':''}>Last year</option>
        <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
      </select>
    </div>
    <div class="card">
      <div class="card-label">${windowLabel}</div>
      ${hasAny ? rowsHtml : '<div class="empty"><p>No sets logged yet. Start lifting to see your PRs here.</p></div>'}
    </div>
  `;
}

window.setPRWindow = async function(val) {
  state.prWindow = val;
  await setPref('prWindow', val);
  renderTab('prs');
};

// ── Session Planner Tab ────────────────────────────────────
async function renderPlanner(el) {
  const exOptions = state.exercises.map(e =>
    `<option value="${e.id}" ${e.id === state.plannerExId ? 'selected' : ''}>${e.name}</option>`
  ).join('');

  const since = sinceDate();
  const prs = state.plannerExId ? await getAllPRs(state.plannerExId, since) : { 1: null, 3: null, 5: null };
  const pr = prs[state.plannerRM];
  const { barWeight, plates } = state.equipment;

  // Build target weights for all sets
  const targets = pr ? state.plannerSets.map(pct => targetFromPct(pr, pct)) : [];

  // Build session transition plan
  const plan = pr ? buildSessionPlan(targets, barWeight, plates) : [];

  const setsHtml = state.plannerSets.map((pct, i) => {
    const isDone = state.plannerChecked[i];
    const weightDisplay = plan[i] ? dw(plan[i].actual) : '—';
    return `
      <div class="set-row${isDone ? ' done' : ''}" id="set-row-${i}">
        <div class="set-num">${i + 1}</div>
        <div class="pct-wrap">
          <input class="pct-input" type="number" min="1" max="200" value="${pct}"
            onchange="updateSetPct(${i}, this.value)" />
          <span class="pct-suffix">%</span>
        </div>
        <div class="set-spacer"></div>
        <div class="set-weight" id="sw-${i}">${weightDisplay}</div>
        <div class="set-check${isDone ? ' checked' : ''}" id="sc-${i}"
          onclick="toggleSetCheck(${i})" role="checkbox" aria-checked="${isDone}" aria-label="Mark set ${i+1} complete">
          ${isDone ? '✓' : ''}
        </div>
      </div>`;
  }).join('');

  // Plate transitions card — only show incomplete sets
  // Re-derive transitions relative to what's actually on the bar right now.
  // "What's on the bar" = the plate config of the last COMPLETED set,
  // or nothing (empty bar) if no sets are done yet.
  const incompletePlan = plan.filter((_, i) => !state.plannerChecked[i]);
  const allDone = plan.length > 0 && incompletePlan.length === 0;

  // Find the plate config currently on the bar (last completed set's config)
  let currentPlates = [];
  for (let i = plan.length - 1; i >= 0; i--) {
    if (state.plannerChecked[i]) { currentPlates = plan[i].plates; break; }
  }

  function plateMap(plates) {
    return Object.fromEntries(plates.map(p => [p.weight, p.count]));
  }

  function delta(fromPlates, toPlates) {
    const fromMap = plateMap(fromPlates);
    const toMap = plateMap(toPlates);
    const allW = new Set([...Object.keys(fromMap), ...Object.keys(toMap)].map(Number));
    const add = [], remove = [];
    for (const w of [...allW].sort((a, b) => b - a)) {
      const before = fromMap[w] || 0;
      const after = toMap[w] || 0;
      if (after > before) add.push({ weight: w, count: after - before });
      if (before > after) remove.push({ weight: w, count: before - after });
    }
    return { add, remove };
  }

  let platesHtml = '';
  if (allDone) {
    platesHtml = `<div style="text-align:center;padding:16px;font-size:15px;color:var(--teal)">🎉 Session complete!</div>`;
  } else {
    let prevPlates = currentPlates;
    platesHtml = incompletePlan.map((step, idx) => {
      const setLabel = `Set ${step.setIndex + 1} · ${dw(step.actual)}`;
      const isNext = idx === 0;

      let instructionHtml = '';
      if (idx === 0 && currentPlates.length === 0) {
        // Nothing on bar yet — show full starting load
        const chips = step.plates.length
          ? step.plates.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
          : '<span class="chip">bar only</span>';
        instructionHtml = `<div class="plate-chips">${chips}</div>`;
      } else {
        // Show delta from what's currently on (or was on for prior incomplete set)
        const { add, remove } = delta(prevPlates, step.plates);
        const addChips = add.map(p =>
          `<span class="chip" style="border-color:#1D9E75"><b style="color:#1D9E75">+${p.count}×</b> ${p.weight} lb</span>`
        ).join('');
        const removeChips = remove.map(p =>
          `<span class="chip" style="border-color:#E24B4A"><b style="color:#E24B4A">−${p.count}×</b> ${p.weight} lb</span>`
        ).join('');
        const noChange = !add.length && !remove.length;
        instructionHtml = noChange
          ? `<span class="chip-note">No change from previous set</span>`
          : `<div class="plate-chips">${addChips}${removeChips}</div>`;
      }

      prevPlates = step.plates;

      const diff = Math.abs(step.actual - step.target);
      const note = diff > 0.05 ? `<div class="chip-note">Actual: ${dw(step.actual)}</div>` : '';

      return `
        <div style="margin-bottom:12px${isNext ? '' : ';opacity:0.6'}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            ${isNext ? `<span style="font-size:9px;font-weight:700;font-family:var(--font-display);background:var(--accent);color:#111;padding:3px 8px;border-radius:4px;letter-spacing:0.08em;text-transform:uppercase">NEXT</span>` : ''}
            <div style="font-size:12px;color:var(--text-2)">${setLabel}</div>
          </div>
          ${instructionHtml}
          ${note}
        </div>`;
    }).join('<div class="divider"></div>');
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-label">Lift</div>
      <div class="form-row" style="margin-bottom:10px">
        <label>Exercise</label>
        <select onchange="updatePlannerEx(this.value)">${exOptions}</select>
      </div>
      <div class="form-row" style="margin-bottom:12px">
        <label>PR type</label>
        <select onchange="updatePlannerRM(this.value)">
          <option value="1" ${state.plannerRM===1?'selected':''}>1RM${prs[1] ? ' · ' + dw(prs[1]) : ''}</option>
          <option value="3" ${state.plannerRM===3?'selected':''}>3RM${prs[3] ? ' · ' + dw(prs[3]) : ''}</option>
          <option value="5" ${state.plannerRM===5?'selected':''}>5RM${prs[5] ? ' · ' + dw(prs[5]) : ''}</option>
        </select>
      </div>
      ${pr
        ? `<div style="background:var(--accent-dim);border-radius:var(--radius);padding:12px 14px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em">Current PR</span>
            <span style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--accent);letter-spacing:0.03em">${dw(pr)}</span>
          </div>`
        : `<div style="font-size:13px;color:var(--text-3);text-align:center;padding:8px">No PR logged yet — log a set first.</div>`
      }
    </div>

    <div class="card">
      <div class="section-head">
        <div class="card-label" style="margin:0">Sets</div>
        <div style="display:flex;gap:6px">
          <button class="btn" style="padding:5px 12px;font-size:13px" onclick="removePlannerSet()">− Remove</button>
          <button class="btn" style="padding:5px 12px;font-size:13px" onclick="addPlannerSet()">+ Add</button>
        </div>
      </div>
      <div style="display:flex;padding:4px 0 6px;border-bottom:0.5px solid var(--border);margin-bottom:2px;font-size:11px;color:var(--text-3)">
        <div style="min-width:26px">#</div>
        <div style="width:80px">% of max</div>
        <div style="flex:1"></div>
        <div style="min-width:80px;text-align:right">target</div>
        <div style="width:36px"></div>
      </div>
      ${setsHtml}
    </div>

    ${pr ? `
      <div class="card">
        <div class="card-label">Plates per side · ${barWeight} lb bar</div>
        ${platesHtml}
      </div>` : ''}
  `;
}

window.updatePlannerEx = function(id) {
  state.plannerExId = parseInt(id);
  renderTab('planner');
};

window.updatePlannerRM = function(rm) {
  state.plannerRM = parseInt(rm);
  renderTab('planner');
};

window.updateSetPct = function(i, val) {
  const n = parseInt(val);
  if (!isNaN(n) && n >= 1 && n <= 200) {
    state.plannerSets[i] = n;
    renderTab('planner');
  }
};

window.addPlannerSet = function() {
  if (state.plannerSets.length >= 10) return;
  state.plannerSets.push(state.plannerSets[state.plannerSets.length - 1] || 70);
  state.plannerChecked.push(false);
  renderTab('planner');
};

window.removePlannerSet = function() {
  if (state.plannerSets.length <= 1) return;
  state.plannerSets.pop();
  state.plannerChecked.pop();
  renderTab('planner');
};

window.toggleSetCheck = function(i) {
  const wasChecked = state.plannerChecked[i];
  state.plannerChecked[i] = !wasChecked;

  if (!wasChecked) {
    // Fire confetti from the checkbox before re-render wipes the element
    const checkEl = document.getElementById(`sc-${i}`);
    if (checkEl) burstFromEl(checkEl);
    showToast();
  }

  // Re-render planner so the plates card updates live
  renderTab('planner');
};

function showToast() {
  let toast = document.getElementById('nice-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nice-toast';
    toast.className = 'nice-toast';
    const msgs = ['Nice work! 💪', 'Get some! 🔥', 'Beast mode.', "Let's go!", 'Crushed it!'];
    toast.textContent = msgs[Math.floor(Math.random() * msgs.length)];
    document.body.appendChild(toast);
  }
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Settings Tab ───────────────────────────────────────────
async function renderSettings(el) {
  el.innerHTML = `
    <div class="card-label" style="margin-bottom:8px">Preferences</div>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Units</div>
          <div class="setting-sub">Weight display throughout the app</div>
        </div>
        <select style="width:80px" onchange="setUnit(this.value)">
          <option value="lbs" ${state.unit==='lbs'?'selected':''}>lbs</option>
          <option value="kg" ${state.unit==='kg'?'selected':''}>kg</option>
        </select>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">Default PR window</div>
          <div class="setting-sub">Used in PRs tab and session planner</div>
        </div>
        <select style="width:130px" onchange="setPRWindow(this.value)">
          <option value="90" ${state.prWindow==='90'?'selected':''}>3 months</option>
          <option value="180" ${state.prWindow==='180'?'selected':''}>6 months</option>
          <option value="365" ${state.prWindow==='365'?'selected':''}>1 year</option>
          <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
        </select>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Equipment</div>
    <div class="card">
      <div class="setting-row">
        <div>
          <div class="setting-label">Bar weight</div>
          <div class="setting-sub">Used in plate calculator</div>
        </div>
        <input type="number" value="${state.equipment.barWeight}" style="width:70px;text-align:right"
          onchange="setBarWeight(this.value)" />
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="setting-label">Plates available (per side)</div>
        <div id="plate-editor"></div>
        <button class="btn btn-ghost" style="padding:4px 0" onclick="addPlateType()">+ Add plate size</button>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Exercises</div>
    <div class="card" id="ex-editor">
      ${state.exercises.map(e => `
        <div class="setting-row">
          <div class="setting-label">${e.name}</div>
          <button class="btn btn-ghost" style="color:var(--text-3);font-size:18px" onclick="deleteEx(${e.id})">✕</button>
        </div>`).join('')}
      <button class="btn btn-ghost" style="padding:4px 0;margin-top:6px" onclick="openAddExercise()">+ Add exercise</button>
    </div>
  `;

  renderPlateEditor();
}

function renderPlateEditor() {
  const el = document.getElementById('plate-editor');
  if (!el) return;
  el.innerHTML = state.equipment.plates.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="number" value="${p.weight}" style="width:70px;text-align:right"
        onchange="updatePlate(${i},'weight',this.value)" /> lb
      <span style="color:var(--text-2);font-size:13px">×</span>
      <input type="number" value="${p.count}" min="0" max="20" style="width:50px;text-align:center"
        onchange="updatePlate(${i},'count',this.value)" />
      <button class="btn btn-ghost" style="color:var(--text-3)" onclick="removePlate(${i})">✕</button>
    </div>`).join('');
}

window.setUnit = async function(val) {
  state.unit = val;
  await setPref('unit', val);
};

window.setBarWeight = async function(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return;
  state.equipment.barWeight = n;
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
};

window.updatePlate = async function(i, field, val) {
  const n = parseFloat(val);
  if (isNaN(n)) return;
  state.equipment.plates[i][field] = n;
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
};

window.removePlate = async function(i) {
  state.equipment.plates.splice(i, 1);
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};

window.addPlateType = async function() {
  state.equipment.plates.push({ weight: 2.5, count: 2 });
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
  renderPlateEditor();
};

window.deleteEx = async function(id) {
  if (!confirm('Delete this exercise? Your logged sets will remain.')) return;
  const { deleteExercise } = await import('./db.js');
  await deleteExercise(id);
  state.exercises = await getExercises();
  renderTab('settings');
};

window.openAddExercise = function() {
  const name = prompt('Exercise name:');
  if (!name?.trim()) return;
  (async () => {
    await import('./db.js').then(m => m.addExercise(name.trim()));
    state.exercises = await getExercises();
    renderTab('settings');
  })();
};

// ── Start ──────────────────────────────────────────────────
boot();
