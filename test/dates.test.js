import test from 'node:test';
import assert from 'node:assert/strict';
import { localDateStr, todayStr } from '../js/dates.js';

test('localDateStr formats a local calendar day, zero padded', () => {
  assert.equal(localDateStr(new Date(2026, 0, 5, 9, 0)), '2026-01-05');
  assert.equal(localDateStr(new Date(2026, 9, 15, 12, 0)), '2026-10-15');
});

test('localDateStr uses the local day, not the UTC day', () => {
  // 23:30 local is still "today" locally even where UTC has rolled over.
  assert.equal(localDateStr(new Date(2026, 9, 15, 23, 30)), '2026-10-15');
  // 00:30 local is already "today" locally even where UTC is still behind.
  assert.equal(localDateStr(new Date(2026, 9, 16, 0, 30)), '2026-10-16');
});

test('todayStr matches the local date fields', () => {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  assert.equal(todayStr(), `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
});
