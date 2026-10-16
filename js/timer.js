// ── Rest timer ─────────────────────────────────────────────
// A small countdown model, kept free of the DOM so it can be unit tested.
// The app drives it with an interval; every function returns a new state
// rather than mutating, and nothing here touches `Date`.

// `sequence` is optional context for a circuit run — which round this rest
// leads into, out of how many. It rides along through tick/extend/pause.
export function newTimer(durationSec, sequence = null) {
  const ms = Math.max(0, Math.round(durationSec * 1000));
  return { durationMs: ms, remainingMs: ms, running: ms > 0, done: ms === 0, sequence };
}

// The round a finished rest leads into, or null when the run is over (or
// this isn't a sequenced rest).
export function nextRound(timer) {
  const seq = timer.sequence;
  if (!seq || seq.round >= seq.total) return null;
  return seq.round + 1;
}

// Advance a running timer by the time since the last tick. Callers pass a
// real delta (not a fixed 1s) so a throttled background tab — where timers
// fire late or not at all — still lands on the correct remaining time.
export function tick(timer, deltaMs) {
  if (!timer.running) return timer;
  const remainingMs = Math.max(0, timer.remainingMs - Math.max(0, deltaMs));
  return { ...timer, remainingMs, running: remainingMs > 0, done: remainingMs === 0 };
}

export function extend(timer, sec) {
  return {
    ...timer,
    remainingMs: timer.remainingMs + Math.round(sec * 1000),
    running: true,
    done: false,
  };
}

export const pause = timer => (timer.running ? { ...timer, running: false } : timer);

export const resume = timer =>
  timer.done || timer.running ? timer : { ...timer, running: true };

// 0 → 1 over the countdown, for a progress bar.
export const progress = timer =>
  timer.durationMs === 0 ? 1 : 1 - timer.remainingMs / timer.durationMs;

// "1:30" / "0:45" — always m:ss. (Logged durations use the terser "45s"
// form, which reads better in a list.)
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
