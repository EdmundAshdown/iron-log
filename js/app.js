import { openDB, seedIfEmpty, getExercises, getSets, addSet, deleteSet, getAllPRs, getPref, setPref, getEquipment, getLastSetForExercise, updateExerciseMetric } from './db.js';
import { calcPlates, targetFromPct, displayWeight, buildSessionPlan, toKg, toLbs, weightStep } from './calc.js';
import { burstFromEl } from './confetti.js';
import { exportBackup, importBackup } from './backup.js';
import { VERSION, BUILD_DATE } from './version.js';
import { localDateStr } from './dates.js';
import { METRIC_LABELS, SET_TYPES } from './schema.js';

// ── State ──────────────────────────────────────────────────
let state = {
  tab: 'log',
  unit: 'lbs',
  lastExerciseId: null,
  exercises: [],
  equipment: { barWeight: 45, plates: [] },
  prWindow: '365',
  plannerWorkout: [
    {
      exerciseId: null,
      rmType: 1,
      sets: [
        { mode: 'pct', value: 50,  reps: 5 },
        { mode: 'pct', value: 65,  reps: 5 },
        { mode: 'pct', value: 75,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
        { mode: 'pct', value: 85,  reps: 5 },
      ],
      checked: [],
    }
  ],
};

// ── Boot ───────────────────────────────────────────────────
async function boot() {
  await openDB();
  await seedIfEmpty();
  state.exercises = await getExercises();
  state.equipment = await getEquipment();
  state.unit = await getPref('unit', 'lbs');
  state.prWindow = await getPref('prWindow', '365');

  // Assign first lift to first planner block
  const lifts = strengthExercises();
  if (lifts.length > 0) {
    state.plannerWorkout[0].exerciseId = lifts[0].id;
    state.plannerWorkout[0].checked = state.plannerWorkout[0].sets.map(() => false);
  }

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
  const titles = { log: 'Iron Log', prs: 'Personal Records', planner: 'Session Planner', settings: 'Settings' };
  h1.textContent = titles[tab];
  if (tab === 'log') await renderLog(content);
  else if (tab === 'prs') await renderPRs(content);
  else if (tab === 'planner') await renderPlanner(content);
  else if (tab === 'settings') await renderSettings(content);
}

function dw(lbs) { return displayWeight(lbs, state.unit); }

function sinceDate() {
  if (!state.prWindow || state.prWindow === 'all') return null;
  const d = new Date();
  d.setDate(d.getDate() - parseInt(state.prWindow));
  return localDateStr(d);
}

function todayStr() { return localDateStr(); }

function fmtDate(isoStr) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Set display helpers ────────────────────────────────────
// A set's shape depends on its `type` (see js/schema.js), so rendering
// reads through these instead of assuming weight/reps.
function fmtDuration(sec) {
  const total = Math.round(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function fmtDistance(metres) {
  return metres >= 1000 ? `${Math.round(metres / 100) / 10} km` : `${Math.round(metres)} m`;
}

function setDetail(s) {
  switch (s.type) {
    case 'timed':    return fmtDuration(s.duration);
    case 'distance': return fmtDistance(s.distance);
    case 'output':   return `${s.output} output`;
    default:         return `${s.reps} rep${s.reps !== 1 ? 's' : ''}`;
  }
}

function setPrimary(s) {
  return s.type === 'strength' ? dw(s.weight) : '';
}

// ── Log Tab ────────────────────────────────────────────────
async function renderLog(el) {
  const allSets = await getSets();
  const today = todayStr();
  const todaySets = allSets.filter(s => s.date === today).reverse();

  let prCount = 0;
  for (const s of todaySets) {
    if (s.type !== 'strength') continue;   // only weight/reps sets set PRs
    const prs = await getAllPRs(s.exerciseId, sinceDate());
    if (s.weight != null && prs[s.reps] === s.weight) prCount++;
  }

  const exMap = Object.fromEntries(state.exercises.map(e => [e.id, e.name]));

  const setsHtml = todaySets.length === 0
    ? `<div class="empty"><div class="icon">🏋️</div><p>No sets logged today yet.</p></div>`
    : todaySets.map(s => `
        <div class="log-item" data-id="${s.id}">
          <div>
            <div class="log-name">${exMap[s.exerciseId] || '?'}</div>
            <div class="log-detail">${setDetail(s)} · ${fmtDate(s.date)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="log-weight">${setPrimary(s)}</div>
            <button class="btn btn-ghost" style="padding:4px;font-size:18px;color:var(--text-3)" onclick="deleteSetItem(${s.id})">✕</button>
          </div>
        </div>`).join('');

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${todaySets.length}</div><div class="stat-lbl">sets today</div></div>
      <div class="stat"><div class="stat-val">${new Set(todaySets.map(s => s.exerciseId)).size}</div><div class="stat-lbl">exercises</div></div>
      <div class="stat"><div class="stat-val accent">${prCount}</div><div class="stat-lbl">PRs today</div></div>
    </div>
    <div class="card">
      <div class="card-label">Today · ${new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</div>
      ${setsHtml}
    </div>`;

  document.getElementById('fab').onclick = openLogModal;
}

window.deleteSetItem = async function(id) {
  if (!confirm('Delete this set?')) return;
  await deleteSet(id);
  renderTab('log');
};

// ── Log modal ──────────────────────────────────────────────
// The modal renders inputs for the metric the selected exercise logs
// (see schema.js). Every field is a big stepper + free numeric input +
// quick picks, so it stays usable with gloves on. Weight keeps two
// stepper sizes because plate jumping is the common gym case.

function fieldValue(key) {
  const el = document.getElementById('f-' + key);
  if (!el) return null;
  const v = parseFloat(el.value);
  return Number.isFinite(v) ? v : null;
}

window.stepField = function(key, sign, step) {
  const el = document.getElementById('f-' + key);
  if (!el) return;
  const cur = fieldValue(key) ?? 0;
  el.value = Math.max(0, Math.round((cur + sign * step) * 100) / 100);
  refreshModalCalc();
};

window.setField = function(key, val) {
  const el = document.getElementById('f-' + key);
  if (!el) return;
  el.value = val;
  refreshModalCalc();
};

function chipsHtml(key, values) {
  return values.map(v =>
    `<button type="button" class="chip-btn" data-field="${key}" data-val="${v}" onclick="setField('${key}', ${v})">${v}</button>`
  ).join('');
}

function weightFieldHtml() {
  const fine = weightStep(state.unit, true);
  const coarse = weightStep(state.unit, false);
  return `
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-label">Weight</span>
        <span class="metric-unit">${state.unit}</span>
      </div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('weight', -1, ${coarse})" aria-label="Decrease weight">−${coarse}</button>
        <button type="button" class="step-btn" onclick="stepField('weight', -1, ${fine})" aria-label="Decrease weight slightly">−${fine}</button>
        <input type="number" id="f-weight" class="step-value" inputmode="decimal" min="0" placeholder="0" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('weight', 1, ${fine})" aria-label="Increase weight slightly">+${fine}</button>
        <button type="button" class="step-btn" onclick="stepField('weight', 1, ${coarse})" aria-label="Increase weight">+${coarse}</button>
      </div>
      <div class="plate-chips" id="modal-plates"></div>
    </div>`;
}

function repsFieldHtml() {
  return `
    <div class="metric-block">
      <div class="metric-head"><span class="metric-label">Reps</span></div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('reps', -1, 1)" aria-label="Decrease reps">−1</button>
        <input type="number" id="f-reps" class="step-value" inputmode="numeric" min="1" max="99" placeholder="5" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('reps', 1, 1)" aria-label="Increase reps">+1</button>
      </div>
      <div class="chips-row">${chipsHtml('reps', [1, 3, 5, 8, 10, 12, 15, 20])}</div>
    </div>`;
}

function singleFieldHtml({ key, label, unit, step, chips }) {
  return `
    <div class="metric-block">
      <div class="metric-head">
        <span class="metric-label">${label}</span>
        <span class="metric-unit">${unit}</span>
      </div>
      <div class="stepper">
        <button type="button" class="step-btn" onclick="stepField('${key}', -1, ${step})" aria-label="Decrease ${label}">−${step}</button>
        <input type="number" id="f-${key}" class="step-value" inputmode="numeric" min="0" oninput="refreshModalCalc()" />
        <button type="button" class="step-btn" onclick="stepField('${key}', 1, ${step})" aria-label="Increase ${label}">+${step}</button>
      </div>
      <div class="chips-row">${chipsHtml(key, chips)}</div>
      <div class="chip-note" id="hint-${key}"></div>
    </div>`;
}

// Add a metric by adding a case here plus SET_TYPES/METRIC_LABELS in schema.js.
function metricFieldsHtml(metric) {
  switch (metric) {
    case 'timed':
      return singleFieldHtml({ key: 'duration', label: 'Duration', unit: 'seconds', step: 15, chips: [30, 45, 60, 90, 120, 300] });
    case 'distance':
      return singleFieldHtml({ key: 'distance', label: 'Distance', unit: 'metres', step: 100, chips: [400, 1000, 2000, 5000, 10000] });
    case 'output':
      return singleFieldHtml({ key: 'output', label: 'Output', unit: 'count', step: 1, chips: [5, 10, 20, 30, 50] });
    default:
      return weightFieldHtml() + repsFieldHtml();
  }
}

// Live feedback: chip highlights, plate readout for weight, and a
// human-readable hint for duration/distance.
window.refreshModalCalc = function() {
  document.querySelectorAll('#modal-metrics .chip-btn').forEach(b => {
    const v = fieldValue(b.dataset.field);
    b.classList.toggle('active', v !== null && Number(b.dataset.val) === v);
  });

  const duration = fieldValue('duration');
  const durationHint = document.getElementById('hint-duration');
  if (durationHint) durationHint.textContent = duration ? fmtDuration(duration) : '';

  const distance = fieldValue('distance');
  const distanceHint = document.getElementById('hint-distance');
  if (distanceHint) distanceHint.textContent = distance ? fmtDistance(distance) : '';

  const platesEl = document.getElementById('modal-plates');
  if (!platesEl) return;

  const typed = fieldValue('weight');
  if (typed === null) { platesEl.innerHTML = ''; return; }

  const lbs = state.unit === 'kg' ? toLbs(typed) : typed;
  const { barWeight, plates } = state.equipment;

  if (lbs <= barWeight) {
    platesEl.innerHTML = '<span class="chip-note">Bar only</span>';
    return;
  }

  const { actual, plates: used } = calcPlates(lbs, barWeight, plates);
  const chips = used.length
    ? used.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
    : '<span class="chip">bar only</span>';

  // Compare in the unit the user typed, otherwise a kg -> lbs -> kg
  // round-trip (0.1 lb) reads as "not loadable".
  const actualShown = state.unit === 'kg' ? toKg(actual) : actual;
  const note = Math.abs(actualShown - typed) > 0.05
    ? `<div class="chip-note">Closest loadable: ${dw(actual)}</div>`
    : '';
  platesEl.innerHTML = chips + note;
};

function metricForExercise(exerciseId) {
  const exercise = state.exercises.find(e => e.id === exerciseId);
  return exercise?.metric || 'strength';
}

// The Planner is built on percentage-of-1RM, so it only offers lifts.
function strengthExercises() {
  return state.exercises.filter(e => e.metric === 'strength');
}

// Prefill "same as last time" for the selected exercise, in its own metric.
async function prefillFromLastSet(exerciseId, metric) {
  document.getElementById('modal-notes').value = '';
  for (const key of ['weight', 'reps', 'duration', 'distance', 'output']) {
    const el = document.getElementById('f-' + key);
    if (el) el.value = '';
  }

  const set = (key, value) => {
    const el = document.getElementById('f-' + key);
    if (el && value != null) el.value = value;
  };

  const last = exerciseId ? await getLastSetForExercise(exerciseId, metric) : null;

  if (last) {
    if (metric === 'strength') {
      set('weight', state.unit === 'kg' ? toKg(last.weight) : last.weight);
      set('reps', last.reps);
    } else if (metric === 'timed') set('duration', last.duration);
    else if (metric === 'distance') set('distance', last.distance);
    else set('output', last.output);
  } else if (metric === 'strength') {
    set('reps', 5);
  }
  refreshModalCalc();
}

function renderModalForExercise(exerciseId) {
  const metric = metricForExercise(exerciseId);
  document.getElementById('modal-title').textContent = `Log · ${METRIC_LABELS[metric]}`;
  document.getElementById('modal-metrics').innerHTML = metricFieldsHtml(metric);
  prefillFromLastSet(exerciseId, metric);
}

function openLogModal() {
  const sel = document.getElementById('modal-exercise');
  sel.innerHTML = state.exercises.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  if (state.lastExerciseId) sel.value = String(state.lastExerciseId);

  document.getElementById('log-modal').classList.add('open');
  renderModalForExercise(parseInt(sel.value, 10));
}

window.closeLogModal = function() {
  document.getElementById('log-modal').classList.remove('open');
};

window.onLogExerciseChange = function(val) {
  renderModalForExercise(parseInt(val, 10));
};

window.submitLog = async function() {
  const exId = parseInt(document.getElementById('modal-exercise').value, 10);
  if (!exId) { alert('Choose an exercise.'); return; }

  const metric = metricForExercise(exId);
  const notes = document.getElementById('modal-notes').value.trim();
  const payload = { exerciseId: exId, date: todayStr(), notes, type: metric };

  if (metric === 'strength') {
    const weight = fieldValue('weight');
    if (weight === null) { alert('Enter a weight.'); return; }
    payload.weight = Math.round((state.unit === 'kg' ? toLbs(weight) : weight) * 10) / 10;
    const reps = fieldValue('reps');
    payload.reps = reps === null ? undefined : Math.round(reps);
  } else if (metric === 'timed') {
    payload.duration = fieldValue('duration') ?? undefined;
  } else if (metric === 'distance') {
    payload.distance = fieldValue('distance') ?? undefined;
  } else {
    payload.output = fieldValue('output') ?? undefined;
  }

  try {
    await addSet(payload);   // addSet validates the shape for the set's metric
  } catch (err) {
    alert(err.message);
    return;
  }

  state.lastExerciseId = exId;
  closeLogModal();
  renderTab('log');
};

// ── PRs Tab ────────────────────────────────────────────────
async function renderPRs(el) {
  const since = sinceDate();
  const windowLabel = { '90': 'Last 3 months', '180': 'Last 6 months', '365': 'Last year', 'all': 'All time' }[state.prWindow] || 'Last year';
  // Only weight/reps lifts can hold weight PRs.
  const rows = await Promise.all(strengthExercises().map(async ex => ({ ex, prs: await getAllPRs(ex.id, since) })));
  const hasAny = rows.some(r => r.prs[1] || r.prs[3] || r.prs[5]);

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-label">PR window</div>
      <select onchange="setPRWindow(this.value)">
        <option value="90"  ${state.prWindow==='90' ?'selected':''}>Last 3 months</option>
        <option value="180" ${state.prWindow==='180'?'selected':''}>Last 6 months</option>
        <option value="365" ${state.prWindow==='365'?'selected':''}>Last year</option>
        <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
      </select>
    </div>
    <div class="card">
      <div class="card-label">${windowLabel}</div>
      ${hasAny ? rows.map(({ ex, prs }) => `
        <div class="pr-row">
          <div class="pr-name">${ex.name}</div>
          <div class="pr-cells">
            ${[1,3,5].map(r => `
              <div class="pr-cell">
                <div class="pr-cell-lbl">${r}RM</div>
                <div class="pr-cell-val${prs[r] ? '' : ' empty'}">${prs[r] ? dw(prs[r]) : '—'}</div>
              </div>`).join('')}
          </div>
        </div>`).join('')
      : '<div class="empty"><p>No sets logged yet. Start lifting to see your PRs here.</p></div>'}
    </div>`;
}

window.setPRWindow = async function(val) {
  state.prWindow = val;
  await setPref('prWindow', val);
  renderTab('prs');
};

// ── Session Planner ────────────────────────────────────────
async function renderPlanner(el) {
  const since = sinceDate();
  const { barWeight, plates } = state.equipment;

  // Build HTML for each movement block
  const blocksHtml = await Promise.all(state.plannerWorkout.map(async (block, bi) => {
    const exOptions = strengthExercises().map(e =>
      `<option value="${e.id}" ${e.id === block.exerciseId ? 'selected' : ''}>${e.name}</option>`
    ).join('');

    const prs = block.exerciseId ? await getAllPRs(block.exerciseId, since) : { 1: null, 3: null, 5: null };
    const pr = prs[block.rmType];

    // Compute targets per set
    const targets = block.sets.map(s => {
      if (s.mode === 'pct') return pr ? targetFromPct(pr, s.value) : null;
      return s.value || null;
    });

    const validTargets = targets.map(t => t || 0);
    const plan = buildSessionPlan(validTargets, barWeight, plates);

    // ── Set rows ───────────────────────────────────────────
    const setsHtml = block.sets.map((set, si) => {
      const isDone = block.checked[si];
      const target = targets[si];
      const weightDisplay = plan[si] && target ? dw(plan[si].actual) : '—';
      const isPct = set.mode === 'pct';

      const valueInput = isPct
        ? `<input class="pct-input" type="number" min="1" max="200" value="${set.value}"
             onchange="updateSetVal(${bi},${si},this.value)" />`
        : `<input class="pct-input" type="number" min="0" step="2.5" value="${set.value}"
             style="width:68px !important" onchange="updateSetVal(${bi},${si},this.value)" />`;

      const modePill = `
        <button onclick="toggleSetMode(${bi},${si})"
          style="background:none;border:1px solid var(--border-md);border-radius:5px;
                 padding:3px 5px;font-size:10px;color:${isPct ? 'var(--accent)' : 'var(--text-2)'};
                 cursor:pointer;white-space:nowrap;font-family:var(--font-body);flex-shrink:0;line-height:1">
          ${isPct ? '%' : 'lb'}
        </button>`;

      const repsInput = `
        <input type="number" min="1" max="99" value="${set.reps}"
          style="width:40px !important;padding:6px 4px !important;font-size:13px !important;text-align:center"
          onchange="updateSetReps(${bi},${si},this.value)" />
        <span style="font-size:11px;color:var(--text-3)">×</span>`;

      return `
        <div class="set-row${isDone ? ' done' : ''}" id="sr-${bi}-${si}">
          <div class="set-num">${si + 1}</div>
          <div class="pct-wrap" style="gap:4px">
            ${repsInput}
            ${valueInput}
            ${modePill}
          </div>
          <div class="set-spacer"></div>
          <div class="set-weight">${weightDisplay}</div>
          <div class="set-check${isDone ? ' checked' : ''}" id="sc-${bi}-${si}"
            onclick="toggleSetCheck(${bi},${si})" role="checkbox" aria-label="Mark set ${si+1} complete">
            ${isDone ? '✓' : ''}
          </div>
        </div>`;
    }).join('');

    // ── Plate transitions ──────────────────────────────────
    const incompletePlan = plan.filter((_, si) => !block.checked[si] && targets[si] && targets[si] > 0);
    const validPlan = plan.filter((_, si) => targets[si] && targets[si] > 0);
    const allDone = validPlan.length > 0 && incompletePlan.length === 0;

    let currentPlates = [];
    for (let si = plan.length - 1; si >= 0; si--) {
      if (block.checked[si]) { currentPlates = plan[si].plates; break; }
    }

    function plateMap(p) { return Object.fromEntries(p.map(x => [x.weight, x.count])); }
    function delta(from, to) {
      const fm = plateMap(from), tm = plateMap(to);
      const ws = new Set([...Object.keys(fm), ...Object.keys(tm)].map(Number));
      const add = [], remove = [];
      for (const w of [...ws].sort((a,b) => b-a)) {
        const bf = fm[w]||0, af = tm[w]||0;
        if (af > bf) add.push({weight:w, count:af-bf});
        if (bf > af) remove.push({weight:w, count:bf-af});
      }
      return { add, remove };
    }

    let platesHtml = '';
    if (allDone) {
      platesHtml = `<div style="text-align:center;padding:10px;font-size:14px;color:var(--accent)">🎉 Done!</div>`;
    } else if (incompletePlan.length > 0) {
      let prevPlates = currentPlates;
      platesHtml = incompletePlan.map((step, idx) => {
        const isNext = idx === 0;
        const setLabel = `Set ${step.setIndex + 1} · ${dw(step.actual)}`;
        let instructionHtml = '';

        if (idx === 0 && currentPlates.length === 0) {
          const chips = step.plates.length
            ? step.plates.map(p => `<span class="chip"><b>${p.count}×</b> ${p.weight} lb</span>`).join('')
            : '<span class="chip">bar only</span>';
          instructionHtml = `<div class="plate-chips">${chips}</div>`;
        } else {
          const { add, remove } = delta(prevPlates, step.plates);
          const addChips = add.map(p => `<span class="chip" style="border-color:var(--green)"><b style="color:var(--green)">+${p.count}×</b> ${p.weight} lb</span>`).join('');
          const remChips = remove.map(p => `<span class="chip" style="border-color:var(--red)"><b style="color:var(--red)">−${p.count}×</b> ${p.weight} lb</span>`).join('');
          instructionHtml = (!add.length && !remove.length)
            ? `<span class="chip-note">No change</span>`
            : `<div class="plate-chips">${addChips}${remChips}</div>`;
        }

        prevPlates = step.plates;
        const diff = Math.abs(step.actual - (targets[step.setIndex] || 0));
        const note = diff > 0.05 ? `<div class="chip-note">Actual: ${dw(step.actual)}</div>` : '';

        return `
          <div style="margin-bottom:10px${isNext ? '' : ';opacity:0.5'}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              ${isNext ? `<span style="font-size:9px;font-weight:700;font-family:var(--font-display);background:var(--accent);color:#111;padding:3px 8px;border-radius:4px;letter-spacing:0.08em;text-transform:uppercase">NEXT</span>` : ''}
              <div style="font-size:12px;color:var(--text-2)">${setLabel}</div>
            </div>
            ${instructionHtml}${note}
          </div>`;
      }).join('<div class="divider"></div>');
    }

    const prDisplay = pr
      ? `<div style="background:var(--accent-dim);border-radius:var(--radius);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
          <span style="font-size:11px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.08em">${block.rmType}RM PR</span>
          <span style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--accent)">${dw(pr)}</span>
        </div>`
      : `<div style="font-size:12px;color:var(--text-3);padding:6px 0">No PR logged yet for this lift.</div>`;

    const blockCount = state.plannerWorkout.length;

    return `
      <div class="card" id="block-${bi}" style="border:1px solid var(--border);margin-bottom:12px">

        <!-- Block header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:0.08em">
            Movement ${bi + 1}
          </div>
          ${blockCount > 1
            ? `<button onclick="removeBlock(${bi})"
                style="background:none;border:none;color:var(--text-3);font-size:18px;cursor:pointer;padding:2px 6px;line-height:1">✕</button>`
            : ''}
        </div>

        <!-- Exercise + RM selectors -->
        <div class="form-row" style="margin-bottom:8px">
          <label>Exercise</label>
          <select onchange="updateBlockEx(${bi},this.value)">${exOptions}</select>
        </div>
        <div class="form-row" style="margin-bottom:12px">
          <label>PR type</label>
          <select onchange="updateBlockRM(${bi},this.value)">
            <option value="1" ${block.rmType===1?'selected':''}>1RM${prs[1] ? ' · '+dw(prs[1]) : ''}</option>
            <option value="3" ${block.rmType===3?'selected':''}>3RM${prs[3] ? ' · '+dw(prs[3]) : ''}</option>
            <option value="5" ${block.rmType===5?'selected':''}>5RM${prs[5] ? ' · '+dw(prs[5]) : ''}</option>
          </select>
        </div>
        ${prDisplay}

        <!-- Set rows -->
        <div style="margin-top:14px">
          <div style="display:flex;padding:4px 0 6px;border-bottom:1px solid var(--border);margin-bottom:2px;font-size:10px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.06em;gap:4px">
            <div style="min-width:22px">#</div>
            <div style="flex:1">Reps · Load</div>
            <div style="min-width:72px;text-align:right">Target</div>
            <div style="width:32px"></div>
          </div>
          ${setsHtml}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="removeSet(${bi})">− Set</button>
            <button class="btn" style="flex:1;font-size:12px;padding:7px" onclick="addSet(${bi})">+ Set</button>
          </div>
        </div>

        <!-- Plate transitions -->
        ${platesHtml ? `
          <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
            <div class="card-label" style="margin-bottom:10px">Plates · ${barWeight} lb bar</div>
            ${platesHtml}
          </div>` : ''}
      </div>`;
  }));

  el.innerHTML = `
    ${blocksHtml.join('')}
    <button class="btn btn-full" style="margin-bottom:16px;padding:13px;font-size:14px" onclick="addBlock()">
      + Add Movement
    </button>`;
}

// ── Planner actions ────────────────────────────────────────
window.updateBlockEx = function(bi, val) {
  state.plannerWorkout[bi].exerciseId = parseInt(val);
  renderTab('planner');
};

window.updateBlockRM = function(bi, val) {
  state.plannerWorkout[bi].rmType = parseInt(val);
  renderTab('planner');
};

window.updateSetVal = function(bi, si, val) {
  const n = parseFloat(val);
  if (!isNaN(n) && n >= 0) { state.plannerWorkout[bi].sets[si].value = n; renderTab('planner'); }
};

window.updateSetReps = function(bi, si, val) {
  const n = parseInt(val);
  if (!isNaN(n) && n >= 1) { state.plannerWorkout[bi].sets[si].reps = n; renderTab('planner'); }
};

window.toggleSetMode = function(bi, si) {
  const set = state.plannerWorkout[bi].sets[si];
  set.mode = set.mode === 'pct' ? 'lbs' : 'pct';
  set.value = set.mode === 'pct' ? 75 : 0;
  renderTab('planner');
};

window.toggleSetCheck = function(bi, si) {
  const block = state.plannerWorkout[bi];
  const wasChecked = block.checked[si];
  block.checked[si] = !wasChecked;
  if (!wasChecked) {
    const el = document.getElementById(`sc-${bi}-${si}`);
    if (el) burstFromEl(el);
    showToast();
  }
  renderTab('planner');
};

window.addSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length >= 12) return;
  const last = block.sets[block.sets.length - 1];
  block.sets.push({ mode: last.mode, value: last.value, reps: last.reps });
  block.checked.push(false);
  renderTab('planner');
};

window.removeSet = function(bi) {
  const block = state.plannerWorkout[bi];
  if (block.sets.length <= 1) return;
  block.sets.pop();
  block.checked.pop();
  renderTab('planner');
};

window.addBlock = function() {
  state.plannerWorkout.push({
    exerciseId: strengthExercises()[0]?.id ?? null,
    rmType: 1,
    sets: [
      { mode: 'pct', value: 50, reps: 5 },
      { mode: 'pct', value: 75, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
      { mode: 'pct', value: 85, reps: 5 },
    ],
    checked: [false, false, false, false, false],
  });
  renderTab('planner');
  // Scroll to new block
  setTimeout(() => {
    const el = document.getElementById(`block-${state.plannerWorkout.length - 1}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
};

window.removeBlock = function(bi) {
  if (state.plannerWorkout.length <= 1) return;
  if (!confirm('Remove this movement?')) return;
  state.plannerWorkout.splice(bi, 1);
  renderTab('planner');
};

function showToast() {
  let toast = document.getElementById('nice-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nice-toast';
    toast.className = 'nice-toast';
    document.body.appendChild(toast);
  }
  const msgs = ['Nice work! 💪', 'Get some! 🔥', 'Beast mode.', "Let's go!", 'Crushed it!'];
  toast.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Settings ───────────────────────────────────────────────
async function renderSettings(el) {
  el.innerHTML = `
    <div class="card-label" style="margin-bottom:8px">Preferences</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Units</div><div class="setting-sub">Weight display throughout the app</div></div>
        <select style="width:80px" onchange="setUnit(this.value)">
          <option value="lbs" ${state.unit==='lbs'?'selected':''}>lbs</option>
          <option value="kg"  ${state.unit==='kg' ?'selected':''}>kg</option>
        </select>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Default PR window</div><div class="setting-sub">Used in PRs tab and planner</div></div>
        <select style="width:130px" onchange="setPRWindow(this.value)">
          <option value="90"  ${state.prWindow==='90' ?'selected':''}>3 months</option>
          <option value="180" ${state.prWindow==='180'?'selected':''}>6 months</option>
          <option value="365" ${state.prWindow==='365'?'selected':''}>1 year</option>
          <option value="all" ${state.prWindow==='all'?'selected':''}>All time</option>
        </select>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Equipment</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Bar weight</div><div class="setting-sub">Used in plate calculator</div></div>
        <input type="number" value="${state.equipment.barWeight}" style="width:70px;text-align:right" onchange="setBarWeight(this.value)" />
      </div>
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px">
        <div class="setting-label">Plates available (per side)</div>
        <div id="plate-editor"></div>
        <button class="btn btn-ghost" style="padding:4px 0" onclick="addPlateType()">+ Add plate size</button>
      </div>
    </div>

    <div class="card-label" style="margin-bottom:8px">Exercises</div>
    <div class="card">
      ${state.exercises.map(e => `
        <div class="setting-row">
          <div>
            <div class="setting-label">${e.name}</div>
            <div class="setting-sub">What it logs</div>
          </div>
          <select style="width:130px" onchange="setExerciseMetric(${e.id}, this.value)">
            ${SET_TYPES.map(m => `<option value="${m}" ${e.metric === m ? 'selected' : ''}>${METRIC_LABELS[m]}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" style="color:var(--text-3);font-size:18px" onclick="deleteEx(${e.id})">✕</button>
        </div>`).join('')}
      <button class="btn btn-ghost" style="padding:4px 0;margin-top:6px" onclick="openAddExercise()">+ Add exercise</button>
    </div>

    <div class="card-label" style="margin-bottom:8px">Data</div>
    <div class="card">
      <div class="setting-row">
        <div><div class="setting-label">Export backup</div><div class="setting-sub">Download all your data as JSON</div></div>
        <button class="btn" onclick="doExport()">Export</button>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Import backup</div><div class="setting-sub">Restore or merge from a JSON file</div></div>
        <button class="btn" onclick="doImport()">Import</button>
      </div>
    </div>

    <div style="text-align:center;padding:24px 0 8px;font-size:12px;color:var(--text-3)">
      Iron Log v${VERSION} · ${BUILD_DATE}
    </div>`;

  renderPlateEditor();
}

window.doExport = async function() {
  try { await exportBackup(); } catch(e) { alert('Export failed: ' + e.message); }
};

window.doImport = function() {
  importBackup(async () => {
    state.exercises = await getExercises();
    state.equipment = await getEquipment();
    renderTab('settings');
  });
};

function renderPlateEditor() {
  const el = document.getElementById('plate-editor');
  if (!el) return;
  el.innerHTML = state.equipment.plates.map((p, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="number" value="${p.weight}" style="width:70px;text-align:right" onchange="updatePlate(${i},'weight',this.value)" /> lb
      <span style="color:var(--text-2);font-size:13px">×</span>
      <input type="number" value="${p.count}" min="0" max="20" style="width:50px;text-align:center" onchange="updatePlate(${i},'count',this.value)" />
      <button class="btn btn-ghost" style="color:var(--text-3)" onclick="removePlate(${i})">✕</button>
    </div>`).join('');
}

window.setUnit = async function(val) { state.unit = val; await setPref('unit', val); };
window.setBarWeight = async function(val) {
  const n = parseFloat(val); if (isNaN(n)) return;
  state.equipment.barWeight = n;
  const { saveEquipment } = await import('./db.js');
  await saveEquipment(state.equipment);
};
window.updatePlate = async function(i, field, val) {
  const n = parseFloat(val); if (isNaN(n)) return;
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
window.setExerciseMetric = async function(id, metric) {
  await updateExerciseMetric(id, metric);
  state.exercises = await getExercises();
  renderTab('settings');
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

boot();
