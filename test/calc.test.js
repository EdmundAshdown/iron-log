import test from 'node:test';
import assert from 'node:assert/strict';
import { weightStep, toKg, toLbs, targetFromPct, calcPlates } from '../js/calc.js';

test('weightStep is unit aware', () => {
  assert.equal(weightStep('lbs', true), 2.5);
  assert.equal(weightStep('lbs', false), 10);
  assert.equal(weightStep('kg', true), 1);
  assert.equal(weightStep('kg', false), 5);
});

test('weightStep defaults to the coarse step when unspecified', () => {
  assert.equal(weightStep('lbs'), 10);
});

test('kg/lbs round-trip is stable to a tenth', () => {
  assert.equal(toLbs(100), 220.5);
  assert.equal(toKg(220.5), 100);
});

test('targetFromPct rounds to the nearest 2.5 lbs', () => {
  assert.equal(targetFromPct(225, 80), 180);
  assert.equal(targetFromPct(225, 83), 187.5);
});

test('calcPlates loads the closest achievable weight', () => {
  const plates = [{ weight: 45, count: 2 }, { weight: 25, count: 2 }, { weight: 2.5, count: 2 }];
  assert.equal(calcPlates(225, 45, plates).actual, 225);
  // 226 is not loadable in 2.5 lb increments from this inventory
  assert.equal(calcPlates(226, 45, plates).actual, 225);
});
