// Calculates plates needed per side for a given target weight.
// Returns { actual, perSide, plates: [{ weight, count }] }
// "actual" is the closest achievable weight given available plates.
export function calcPlates(targetWeight, barWeight, availablePlates) {
  const sorted = [...availablePlates].sort((a, b) => b.weight - a.weight);
  let perSide = Math.max(0, (targetWeight - barWeight) / 2);
  let remaining = perSide;
  const used = [];

  for (const plate of sorted) {
    const maxUsable = Math.min(plate.count, Math.floor(remaining / plate.weight));
    if (maxUsable > 0) {
      used.push({ weight: plate.weight, count: maxUsable });
      remaining = Math.round((remaining - maxUsable * plate.weight) * 1000) / 1000;
    }
  }

  const loadedPerSide = perSide - remaining;
  const actual = Math.round((barWeight + loadedPerSide * 2) * 100) / 100;

  return { actual, perSide: loadedPerSide, plates: used };
}

// Given a PR and a percentage, returns the target weight rounded to
// nearest 2.5 lbs (standard plate increment).
export function targetFromPct(pr, pct) {
  return Math.round((pr * pct / 100) / 2.5) * 2.5;
}

// Convert lbs <-> kg
export const toKg = lbs => Math.round(lbs / 2.20462 * 10) / 10;
export const toLbs = kg => Math.round(kg * 2.20462 * 10) / 10;

export function displayWeight(lbs, unit) {
  if (unit === 'kg') return toKg(lbs) + ' kg';
  return lbs + ' lbs';
}

// Increment for the Log modal's weight steppers. A "coarse" step moves
// roughly one plate pair; a "fine" step moves the smallest plate.
// Defaults to the coarse step.
export function weightStep(unit, fine = false) {
  if (unit === 'kg') return fine ? 1 : 5;
  return fine ? 2.5 : 10;
}

// ── Session plate plan ─────────────────────────────────────
//
// Takes an ordered list of target weights (one per set) and returns
// a transition plan for the whole workout:
//
//   [
//     { setIndex: 0, target: 225, actual: 225, plates: [{weight,count}], add: [], remove: [] },
//     { setIndex: 1, target: 245, actual: 245, plates: [...],            add: [{w,n}], remove: [] },
//     { setIndex: 2, target: 185, actual: 185, plates: [...],            add: [], remove: [{w,n}] },
//     ...
//   ]
//
// "plates" is what's on the bar that set (per side).
// "add" / "remove" is the delta vs the previous set.
// The first set always has empty add/remove (it's the starting load).
//
// The algorithm also figures out the minimum plates to bring out
// by ensuring you never need more of any plate size than you own.
// If a set needs more plates than available it uses what it can
// and the actual weight reflects the shortfall.

export function buildSessionPlan(targetWeights, barWeight, availablePlates) {
  // Calculate per-set plate configs
  const configs = targetWeights.map(t => calcPlates(t, barWeight, availablePlates));

  const plan = configs.map((cfg, i) => {
    const prev = i === 0 ? [] : configs[i - 1].plates;
    const curr = cfg.plates;

    // Build maps: plateWeight -> count
    const prevMap = plateMap(prev);
    const currMap = plateMap(curr);

    const allWeights = new Set([...Object.keys(prevMap), ...Object.keys(currMap)].map(Number));
    const add = [];
    const remove = [];

    for (const w of [...allWeights].sort((a, b) => b - a)) {
      const before = prevMap[w] || 0;
      const after = currMap[w] || 0;
      if (after > before) add.push({ weight: w, count: after - before });
      if (before > after) remove.push({ weight: w, count: before - after });
    }

    return {
      setIndex: i,
      target: targetWeights[i],
      actual: cfg.actual,
      plates: cfg.plates,
      add,
      remove,
    };
  });

  return plan;
}

function plateMap(plates) {
  return Object.fromEntries(plates.map(p => [p.weight, p.count]));
}
