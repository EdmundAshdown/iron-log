import { openDB, getExercises, getSets, getEquipment } from './db.js';
import { VERSION } from './version.js';

// ── Export ─────────────────────────────────────────────────
export async function exportBackup() {
  const [exercises, sets, equipment] = await Promise.all([
    getExercises(),
    getSets(),
    getEquipment(),
  ]);

  const backup = {
    version: 1,
    appVersion: VERSION,
    exportedAt: new Date().toISOString(),
    exercises,
    sets,
    equipment,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  const a = document.createElement('a');
  a.href = url;
  a.download = `iron-log-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ─────────────────────────────────────────────────
export function importBackup(onComplete) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert('Could not read that file — make sure it\'s a valid Iron Log backup.');
      return;
    }

    if (!data.version || !Array.isArray(data.exercises) || !Array.isArray(data.sets)) {
      alert('This doesn\'t look like a valid Iron Log backup file.');
      return;
    }

    const exCount = data.exercises.length;
    const setCount = data.sets.length;

    const choice = confirm(
      `Backup contains ${exCount} exercise${exCount !== 1 ? 's' : ''} and ${setCount} set${setCount !== 1 ? 's' : ''}.\n\n` +
      `OK = Replace all existing data with this backup\n` +
      `Cancel = Merge — add imported data alongside existing data`
    );

    // choice: true = replace, false = merge
    await applyBackup(data, choice ? 'replace' : 'merge');
    alert(`Backup ${choice ? 'restored' : 'merged'} successfully! 💪`);
    if (onComplete) onComplete();
  };
  input.click();
}

// ── Apply ──────────────────────────────────────────────────
async function applyBackup(data, mode) {
  const db = await openDB();

  if (mode === 'replace') {
    // Wipe existing data first
    await clearStore(db, 'exercises');
    await clearStore(db, 'sets');
    await clearStore(db, 'equipment');
  }

  if (mode === 'replace') {
    // Re-insert exercises with original IDs
    for (const ex of data.exercises) {
      await putRecord(db, 'exercises', ex);
    }
    // Re-insert sets with original IDs
    for (const s of data.sets) {
      await putRecord(db, 'sets', s);
    }
  } else {
    // Merge mode — remap exercise IDs to avoid collisions
    const existing = await getAllRecords(db, 'exercises');
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));

    // Map old exercise ID → new exercise ID
    const idMap = {};

    for (const ex of data.exercises) {
      if (existingNames.has(ex.name.toLowerCase())) {
        // Find the existing one and map to its ID
        const match = existing.find(e => e.name.toLowerCase() === ex.name.toLowerCase());
        idMap[ex.id] = match.id;
      } else {
        // Insert as new, get auto-incremented ID
        const newId = await addRecord(db, 'exercises', { name: ex.name });
        idMap[ex.id] = newId;
        existingNames.add(ex.name.toLowerCase());
      }
    }

    // Insert sets with remapped exerciseIds, dropping the old id so they get new ones
    for (const s of data.sets) {
      const { id, exerciseId, ...rest } = s;
      const mappedExId = idMap[exerciseId];
      if (mappedExId) {
        await addRecord(db, 'sets', { exerciseId: mappedExId, ...rest });
      }
    }
  }

  // Always restore equipment from backup
  if (data.equipment) {
    await putRecord(db, 'equipment', { id: 'barWeight', value: data.equipment.barWeight });
    await putRecord(db, 'equipment', { id: 'plates', value: data.equipment.plates });
  }
}

// ── IndexedDB helpers ──────────────────────────────────────
function clearStore(db, storeName) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
    req.onsuccess = () => res();
    req.onerror = e => rej(e.target.error);
  });
}

function putRecord(db, storeName, record) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(record);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function addRecord(db, storeName, record) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readwrite').objectStore(storeName).add(record);
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}

function getAllRecords(db, storeName) {
  return new Promise((res, rej) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = e => res(e.target.result);
    req.onerror = e => rej(e.target.error);
  });
}
