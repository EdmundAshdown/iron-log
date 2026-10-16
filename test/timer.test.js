import test from 'node:test';
import assert from 'node:assert/strict';
import { newTimer, tick, extend, pause, resume, progress, formatClock, nextRound } from '../js/timer.js';

test('newTimer starts full and running', () => {
  const t = newTimer(90);
  assert.equal(t.durationMs, 90000);
  assert.equal(t.remainingMs, 90000);
  assert.equal(t.running, true);
  assert.equal(t.done, false);
  assert.equal(t.sequence, null);
});

test('newTimer carries a circuit sequence through the countdown', () => {
  const t = newTimer(30, { round: 1, total: 3 });
  assert.deepEqual(t.sequence, { round: 1, total: 3 });
  assert.deepEqual(tick(t, 5000).sequence, { round: 1, total: 3 });
  assert.deepEqual(extend(t, 30).sequence, { round: 1, total: 3 });
  assert.deepEqual(pause(t).sequence, { round: 1, total: 3 });
});

test('nextRound walks the sequence and stops at the end', () => {
  assert.equal(nextRound(newTimer(30, { round: 1, total: 3 })), 2);
  assert.equal(nextRound(newTimer(30, { round: 2, total: 3 })), 3);
  assert.equal(nextRound(newTimer(30, { round: 3, total: 3 })), null);
  assert.equal(nextRound(newTimer(30)), null);
});

test('newTimer with no duration is immediately done', () => {
  const t = newTimer(0);
  assert.equal(t.running, false);
  assert.equal(t.done, true);
});

test('tick counts down and clamps at zero', () => {
  const t = tick(newTimer(30), 10000);
  assert.equal(t.remainingMs, 20000);
  assert.equal(t.done, false);
  // A late tick that overshoots must not go negative.
  const done = tick(t, 60000);
  assert.equal(done.remainingMs, 0);
  assert.equal(done.done, true);
  assert.equal(done.running, false);
});

test('tick is a no-op on a paused timer', () => {
  const paused = pause(newTimer(60));
  assert.equal(tick(paused, 5000), paused);
});

test('extend adds time and clears the done state', () => {
  const finished = tick(newTimer(10), 10000);
  const more = extend(finished, 30);
  assert.equal(more.remainingMs, 30000);
  assert.equal(more.running, true);
  assert.equal(more.done, false);
});

test('pause and resume only act when they make sense', () => {
  const running = newTimer(60);
  const paused = pause(running);
  assert.equal(paused.running, false);
  assert.equal(pause(paused), paused);          // already paused
  assert.equal(resume(paused).running, true);
  assert.equal(resume(running), running);       // already running
  assert.equal(resume(newTimer(0)).running, false);  // done stays done
});

test('progress runs from 0 to 1', () => {
  assert.equal(progress(newTimer(60)), 0);
  assert.equal(progress(tick(newTimer(60), 30000)), 0.5);
  assert.equal(progress(tick(newTimer(60), 60000)), 1);
});

test('formatClock is always m:ss', () => {
  assert.equal(formatClock(90000), '1:30');
  assert.equal(formatClock(45000), '0:45');
  assert.equal(formatClock(61000), '1:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(-5000), '0:00');
  assert.equal(formatClock(600000), '10:00');
});
