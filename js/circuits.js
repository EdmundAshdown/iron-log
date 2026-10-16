// ── Circuits ───────────────────────────────────────────────
// A circuit (or superset) is a group of sets logged together for N rounds.
// The sets carry a shared `groupId` and a 1-based `round`; sets without a
// groupId are standalone. There is no separate circuit entity — the group
// is implicit in the sets, which keeps backup/restore and migration simple.

export function newGroupId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Group sets (in display order) into blocks. Standalone sets each become
// their own single-item block so the caller can render one list. Blocks
// appear in the order each is first seen; a circuit's items are ordered by
// round, then id.
export function groupByCircuit(sets) {
  const blocks = [];
  const byGroup = new Map();

  for (const set of sets) {
    if (!set.groupId) {
      blocks.push({ groupId: null, rounds: 1, items: [set] });
      continue;
    }

    let block = byGroup.get(set.groupId);
    if (!block) {
      block = { groupId: set.groupId, rounds: 0, items: [] };
      byGroup.set(set.groupId, block);
      blocks.push(block);
    }
    block.items.push(set);
  }

  for (const block of blocks) {
    if (!block.groupId) continue;
    block.items.sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    block.rounds = new Set(block.items.map(s => s.round)).size;
  }

  return blocks;
}
