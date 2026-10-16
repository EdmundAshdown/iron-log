// ── Set schema ─────────────────────────────────────────────
//
// A logged "set" is a discriminated record: `type` selects which
// metric fields are meaningful. Everything else in the app reads
// through the helpers here, so a new metric type can be added in
// one place instead of touching every call site.
//
//   strength   { weight (lbs), reps }
//   timed      { duration (seconds) }
//   distance   { distance (metres) }
//   output     { output (generic work / rep / calorie count) }
//
// Every set also carries: exerciseId, date (YYYY-MM-DD), notes.
//
// Legacy records (v1) have no `type`; they are weight/reps sets and
// normalize to 'strength'.

export const SET_TYPES = ['strength', 'timed', 'distance', 'output'];

// Bump when the *backup file* shape changes. See migrateBackup().
export const BACKUP_VERSION = 2;

// Fill in defaults so every consumer can assume a uniform shape.
export function normalizeSet(set = {}) {
  const type = SET_TYPES.includes(set.type) ? set.type : 'strength';
  return { ...set, type, notes: set.notes ?? '' };
}

// Returns { ok: true } or { ok: false, error } for user-facing display.
export function validateSet(set = {}) {
  if (!Number.isFinite(set.exerciseId)) return { ok: false, error: 'Choose an exercise.' };
  if (!set.date) return { ok: false, error: 'Missing date.' };

  switch (normalizeSet(set).type) {
    case 'timed':
      if (!Number.isFinite(set.duration) || set.duration <= 0) return { ok: false, error: 'Enter a duration.' };
      break;
    case 'distance':
      if (!Number.isFinite(set.distance) || set.distance <= 0) return { ok: false, error: 'Enter a distance.' };
      break;
    case 'output':
      if (!Number.isFinite(set.output) || set.output <= 0) return { ok: false, error: 'Enter an output value.' };
      break;
    default:
      if (!Number.isFinite(set.weight) || set.weight < 0) return { ok: false, error: 'Enter a weight.' };
      if (!Number.isInteger(set.reps) || set.reps < 1) return { ok: false, error: 'Enter a rep count.' };
  }
  return { ok: true };
}

// Upgrade a parsed backup file to the current version, or throw with a
// message safe to show the user. Older files are migrated; newer files
// are rejected rather than silently misinterpreted.
export function migrateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error("This doesn't look like a valid Iron Log backup file.");
  }
  if (!Array.isArray(data.exercises) || !Array.isArray(data.sets)) {
    throw new Error("This doesn't look like a valid Iron Log backup file.");
  }

  const version = Number(data.version) || 1;
  if (version > BACKUP_VERSION) {
    throw new Error(`This backup was made with a newer version of Iron Log (v${version}). Update the app, then try again.`);
  }

  // v1 → v2: sets gained a `type` discriminator. Records without one
  // are weight/reps sets, so normalizeSet() defaults them to 'strength'.
  const sets = data.sets.map(normalizeSet);

  return { ...data, version: BACKUP_VERSION, sets };
}
