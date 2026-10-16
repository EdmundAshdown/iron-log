import test from 'node:test';
import assert from 'node:assert/strict';
import { newGroupId, groupByCircuit } from '../js/circuits.js';

test('newGroupId returns distinct, non-empty ids', () => {
  const a = newGroupId();
  const b = newGroupId();
  assert.equal(typeof a, 'string');
  assert.ok(a.length > 0);
  assert.notEqual(a, b);
});

test('groupByCircuit leaves standalone sets as their own single-item blocks', () => {
  const blocks = groupByCircuit([
    { id: 1, exerciseId: 1, groupId: null },
    { id: 2, exerciseId: 2, groupId: null },
  ]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].groupId, null);
  assert.equal(blocks[0].rounds, 1);
  assert.equal(blocks[0].items.length, 1);
});

test('groupByCircuit groups sets sharing a groupId and counts rounds', () => {
  const sets = [
    { id: 1, exerciseId: 1, groupId: 'g1', round: 2 },
    { id: 2, exerciseId: 2, groupId: 'g1', round: 2 },
    { id: 3, exerciseId: 1, groupId: 'g1', round: 1 },
    { id: 4, exerciseId: 2, groupId: 'g1', round: 1 },
    { id: 5, exerciseId: 3, groupId: null },
  ];
  const blocks = groupByCircuit(sets);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].groupId, 'g1');
  assert.equal(blocks[0].rounds, 2);
  assert.deepEqual(blocks[0].items.map(s => s.id), [3, 4, 1, 2]);   // by round, then id
  assert.equal(blocks[1].groupId, null);
});

test('groupByCircuit preserves first-seen group order', () => {
  const blocks = groupByCircuit([
    { id: 1, exerciseId: 1, groupId: 'b' },
    { id: 2, exerciseId: 1, groupId: 'a' },
    { id: 3, exerciseId: 1, groupId: 'b' },
  ]);
  assert.deepEqual(blocks.map(b => b.groupId), ['b', 'a']);
});

test('groupByCircuit lifts the rest interval off the group', () => {
  const blocks = groupByCircuit([
    { id: 1, exerciseId: 1, groupId: 'g1', round: 1, restSec: 90 },
    { id: 2, exerciseId: 2, groupId: 'g1', round: 1, restSec: 90 },
    { id: 3, exerciseId: 1, groupId: 'g1', round: 2, restSec: 90 },
    { id: 4, exerciseId: 3, groupId: null },
  ]);
  assert.equal(blocks[0].restSec, 90);
  assert.equal(blocks[1].restSec, null);
});

test('groupByCircuit reports no rest when the group has none', () => {
  const blocks = groupByCircuit([{ id: 1, exerciseId: 1, groupId: 'g1', round: 1 }]);
  assert.equal(blocks[0].restSec, null);
});

test('groupByCircuit handles an empty list', () => {
  assert.deepEqual(groupByCircuit([]), []);
});
