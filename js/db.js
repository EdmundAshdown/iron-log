const DB_NAME = 'iron-log';
const DB_VERSION = 1;

let db;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const d = e.target.result;

      if (!d.objectStoreNames.contains('exercises')) {
        const ex = d.createObjectStore('exercises', { keyPath: 'id', autoIncrement: true });
        ex.createIndex('name', 'name', { unique: true });
      }

      if (!d.objectStoreNames.contains('sets')) {
        const sets = d.createObjectStore('sets', { keyPath: 'id', autoIncrement: true });
        sets.createIndex('exerciseId', 'exerciseId');
        sets.createIndex('date', 'date');
        sets.createIndex('exerciseDate', ['exerciseId', 'date']);
      }

      if (!d.objectStoreNames.contains('equipment')) {
        d.createObjectStore('equipment', { keyPath: 'id' });
      }

      if (!d.objectStoreNames.contains('preferences')) {
        d.createObjectStore('preferences', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function all(store) {
  return new Promise((res, rej) => {
    const req = tx(store).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function get(store, key) {
  return new Promise((res, rej) => {
    const req = tx(store).get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function put(store, value) {
  return new Promise((res, rej) => {
    const req = tx(store, 'readwrite').put(value);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function del(store, key) {
  return new Promise((res, rej) => {
    const req = tx(store, 'readwrite').delete(key);
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

// ── Exercises ──────────────────────────────────────────────
export const getExercises = () => all('exercises');
export const addExercise = name => put('exercises', { name });
export const deleteExercise = id => del('exercises', id);

// ── Sets ───────────────────────────────────────────────────
export const getSets = () => all('sets');

export function addSet({ exerciseId, date, weight, reps, notes = '' }) {
  // weight always stored in lbs
  return put('sets', { exerciseId, date, weight, reps, notes });
}

export const deleteSet = id => del('sets', id);

export function getSetsForExercise(exerciseId) {
  return new Promise((res, rej) => {
    const req = tx('sets').index('exerciseId').getAll(exerciseId);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

// Returns the max weight logged for a given exercise + rep count,
// optionally filtered to a date window. Falls back to all-time if
// no result found within the window.
export async function getPR(exerciseId, reps, sinceDate = null) {
  const sets = await getSetsForExercise(exerciseId);
  const matching = sets.filter(s => s.reps === reps);

  if (sinceDate) {
    const windowed = matching.filter(s => s.date >= sinceDate);
    if (windowed.length > 0) {
      return Math.max(...windowed.map(s => s.weight));
    }
  }

  if (matching.length === 0) return null;
  return Math.max(...matching.map(s => s.weight));
}

// Returns PRs for all three rep tiers (1, 3, 5) for one exercise
export async function getAllPRs(exerciseId, sinceDate = null) {
  return {
    1: await getPR(exerciseId, 1, sinceDate),
    3: await getPR(exerciseId, 3, sinceDate),
    5: await getPR(exerciseId, 5, sinceDate),
  };
}

// ── Equipment ──────────────────────────────────────────────
export async function getEquipment() {
  const barRow = await get('equipment', 'barWeight');
  const platesRow = await get('equipment', 'plates');
  return {
    barWeight: barRow ? barRow.value : 45,
    plates: platesRow ? platesRow.value : [
      { weight: 45, count: 2 },
      { weight: 35, count: 2 },
      { weight: 25, count: 2 },
      { weight: 10, count: 4 },
      { weight: 5,  count: 4 },
      { weight: 2.5, count: 4 },
    ],
  };
}

export async function saveEquipment({ barWeight, plates }) {
  await put('equipment', { id: 'barWeight', value: barWeight });
  await put('equipment', { id: 'plates', value: plates });
}

// ── Preferences ────────────────────────────────────────────
export async function getPref(key, defaultVal = null) {
  const row = await get('preferences', key);
  return row ? row.value : defaultVal;
}

export function setPref(key, value) {
  return put('preferences', { key, value });
}

// ── Seed data (first run) ──────────────────────────────────
export async function seedIfEmpty() {
  const exercises = await getExercises();
  if (exercises.length > 0) return;
  const defaults = ['Back Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Romanian Deadlift', 'Barbell Row'];
  for (const name of defaults) await addExercise(name);
}
