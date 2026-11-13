'use strict';

/**
 * Minimal line diff for showing "+8 -7" on edit/write tool cards and an inline
 * unified diff when the user expands one.
 *
 * Uses an LCS table, which is O(n*m) in memory. Real source files are small
 * enough, but we cap the table so a huge file cannot lock the main process.
 */

const MAX_CELLS = 4_000_000; // ~2000x2000 lines
const MAX_LINES = 4000;

function splitLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').split('\n');
}

/**
 * Compute a line diff between two strings.
 * Returns { added, removed, hunks } where hunks are unified-diff style blocks.
 */
function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);

  // Too large to diff precisely — report coarse counts only.
  if (a.length > MAX_LINES || b.length > MAX_LINES || a.length * b.length > MAX_CELLS) {
    return {
      added: Math.max(0, b.length - a.length),
      removed: Math.max(0, a.length - b.length),
      hunks: [],
      truncated: true,
    };
  }

  // LCS table.
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * w + j] =
        a[i] === b[j]
          ? table[(i + 1) * w + (j + 1)] + 1
          : Math.max(table[(i + 1) * w + j], table[i * w + (j + 1)]);
    }
  }

  // Walk the table producing operations: eq / del / ins.
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', text: a[i], aLine: i + 1, bLine: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * w + j] >= table[i * w + (j + 1)]) {
      ops.push({ type: 'del', text: a[i], aLine: i + 1 });
      i += 1;
    } else {
      ops.push({ type: 'ins', text: b[j], bLine: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: a[i], aLine: i + 1 });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'ins', text: b[j], bLine: j + 1 });
    j += 1;
  }

  const added = ops.filter((o) => o.type === 'ins').length;
  const removed = ops.filter((o) => o.type === 'del').length;

  return { added, removed, hunks: buildHunks(ops, 3), truncated: false };
}

/** Group ops into hunks with `context` unchanged lines around each change. */
function buildHunks(ops, context) {
  const changed = new Set();
  ops.forEach((o, idx) => {
    if (o.type !== 'eq') changed.add(idx);
  });
  if (!changed.size) return [];

  // Expand each change by `context` in both directions, then merge overlaps.
  const keep = new Set();
  for (const idx of changed) {
    for (let k = idx - context; k <= idx + context; k += 1) {
      if (k >= 0 && k < ops.length) keep.add(k);
    }
  }
  const indices = [...keep].sort((x, y) => x - y);

  const hunks = [];
  let current = null;
  let prev = -10;
  for (const idx of indices) {
    if (idx !== prev + 1) {
      current = { startIdx: idx, ops: [] };
      hunks.push(current);
    }
    current.ops.push(ops[idx]);
    prev = idx;
  }
  return hunks;
}

module.exports = { diffLines };
