/**
 * Diagnostic: pins and colours on saved chats.
 *
 * The marks are keyed by session file path, so the interesting cases are all
 * about *identity* and *survival*: the same file reached by a different
 * spelling, a pin read back after a restart, a colour that no longer exists, and
 * marks whose chat was deleted.
 *
 * Run from app/:   node scripts/selftest-session-marks.js
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const marks = require('../src/session-marks');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err.message}`);
  }
}

const FILE_A = path.resolve('C:/NTAPI/data/sessions/ws/a.jsonl');
const FILE_B = path.resolve('C:/NTAPI/data/sessions/ws/b.jsonl');

check('a fresh chat is not pinned and has no colour', () => {
  assert.deepStrictEqual(marks.readMark({}, FILE_A), { pinned: false, color: null });
});

check('pin round-trips through the store', () => {
  const store = marks.applyMark({}, FILE_A, { pinned: true });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: true, color: null });
});

check('colour round-trips through the store', () => {
  const store = marks.applyMark({}, FILE_A, { color: 'green' });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: false, color: 'green' });
});

check('pin and colour are independent', () => {
  let store = marks.applyMark({}, FILE_A, { pinned: true });
  store = marks.applyMark(store, FILE_A, { color: 'red' });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: true, color: 'red' });
  // Unpinning must not wipe the colour.
  store = marks.applyMark(store, FILE_A, { pinned: false });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: false, color: 'red' });
});

check('clearing the colour leaves the pin alone', () => {
  let store = marks.applyMark({}, FILE_A, { pinned: true, color: 'blue' });
  store = marks.applyMark(store, FILE_A, { color: null });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: true, color: null });
});

check('a mark with nothing in it is not stored at all', () => {
  let store = marks.applyMark({}, FILE_A, { pinned: true, color: 'red' });
  store = marks.applyMark(store, FILE_A, { pinned: false, color: null });
  assert.deepStrictEqual(Object.keys(store), []);
});

check('an unknown colour is rejected, not stored raw', () => {
  const store = marks.applyMark({}, FILE_A, { color: 'chartreuse' });
  assert.deepStrictEqual(marks.readMark(store, FILE_A), { pinned: false, color: null });
  assert.deepStrictEqual(Object.keys(store), [], 'a bogus colour must not create an entry');
});

check('a colour typed in the wrong case is rejected too', () => {
  const store = marks.applyMark({}, FILE_A, { color: 'RED' });
  assert.strictEqual(marks.readMark(store, FILE_A).color, null);
});

check('applyMark never mutates the object it was given', () => {
  const before = marks.applyMark({}, FILE_A, { pinned: true });
  const snapshot = JSON.stringify(before);
  marks.applyMark(before, FILE_A, { color: 'pink' });
  assert.strictEqual(JSON.stringify(before), snapshot);
});

check('one chat\'s mark does not leak to another', () => {
  const store = marks.applyMark({}, FILE_A, { pinned: true, color: 'purple' });
  assert.deepStrictEqual(marks.readMark(store, FILE_B), { pinned: false, color: null });
});

check('a corrupt entry reads as unmapped instead of throwing', () => {
  const key = marks.markKey(FILE_A);
  assert.deepStrictEqual(marks.readMark({ [key]: 'nope' }, FILE_A), { pinned: false, color: null });
  assert.deepStrictEqual(marks.readMark({ [key]: { pinned: 'yes' } }, FILE_A), {
    pinned: false,
    color: null,
  });
});

check('a corrupt entry is cleaned up by the next write', () => {
  const key = marks.markKey(FILE_A);
  const store = marks.applyMark({ [key]: { pinned: true, color: 7, junk: 1 } }, FILE_A, {
    color: 'orange',
  });
  assert.deepStrictEqual(store[key], { pinned: true, color: 'orange' });
});

check('the same file spelled differently is the same mark', () => {
  // `path.resolve` collapses `.` and `..` on every platform, so this spelling is
  // portable while still proving the key is normalised rather than compared raw.
  const store = marks.applyMark({}, FILE_A, { pinned: true });
  const viaDots = path.resolve(path.dirname(FILE_A), 'sub', '..', 'a.jsonl');
  assert.strictEqual(viaDots, FILE_A, 'the fixture must resolve to the same file');
  assert.strictEqual(marks.readMark(store, viaDots).pinned, true);

  // Windows alone is case-insensitive and accepts both slash styles for one file.
  if (process.platform === 'win32') {
    assert.strictEqual(marks.readMark(store, FILE_A.toUpperCase()).pinned, true);
    assert.strictEqual(marks.readMark(store, FILE_A.replace(/\\/g, '/')).pinned, true);
  }
});

check('a missing path is ignored rather than crashing', () => {
  assert.strictEqual(marks.markKey(''), null);
  assert.strictEqual(marks.markKey(null), null);
  assert.deepStrictEqual(marks.readMark({}, ''), { pinned: false, color: null });
  assert.deepStrictEqual(marks.applyMark({}, '', { pinned: true }), {});
});

/* ------------------------------- sorting ------------------------------- */

check('pinned chats come first and keep newest-first order among themselves', () => {
  const day = (n) => new Date(2026, 0, n).toISOString();
  const sessions = [
    { id: 'new', path: FILE_B, created: day(10) },
    { id: 'pinned-old', path: FILE_A, created: day(2) },
  ];
  const store = marks.applyMark({}, FILE_A, { pinned: true });
  assert.deepStrictEqual(
    marks.sortByMark(store, sessions).map((s) => s.id),
    ['pinned-old', 'new']
  );
});

check('with no pins the order the caller gave is kept', () => {
  const sessions = [
    { id: 'b', path: FILE_B, created: new Date(2026, 0, 1).toISOString() },
    { id: 'a', path: FILE_A, created: new Date(2026, 0, 2).toISOString() },
  ];
  assert.deepStrictEqual(marks.sortByMark({}, sessions).map((s) => s.id), ['b', 'a']);
});

check('a colour alone never moves a row', () => {
  const sessions = [
    { id: 'first', path: FILE_A, created: new Date(2026, 0, 1).toISOString() },
    { id: 'second', path: FILE_B, created: new Date(2026, 0, 9).toISOString() },
  ];
  const store = marks.applyMark({}, FILE_B, { color: 'green' });
  assert.deepStrictEqual(marks.sortByMark(store, sessions).map((s) => s.id), ['first', 'second']);
});

check('two pinned chats keep their relative order', () => {
  const store = marks.applyMark(marks.applyMark({}, FILE_A, { pinned: true }), FILE_B, {
    pinned: true,
  });
  const sessions = [
    { id: 'older', path: FILE_A, created: new Date(2026, 0, 1).toISOString() },
    { id: 'newer', path: FILE_B, created: new Date(2026, 0, 9).toISOString() },
  ];
  assert.deepStrictEqual(marks.sortByMark(store, sessions).map((s) => s.id), ['older', 'newer']);
});

check('sorting an empty or odd list is safe', () => {
  assert.deepStrictEqual(marks.sortByMark({}, null), []);
  assert.deepStrictEqual(marks.sortByMark({}, []), []);
});

/* ------------------------------- pruning ------------------------------- */

check('prune keeps live chats and drops deleted ones', () => {
  let store = marks.applyMark({}, FILE_A, { pinned: true });
  store = marks.applyMark(store, FILE_B, { color: 'blue' });
  const pruned = marks.pruneMarks(store, (file) => file === marks.markKey(FILE_A));
  assert.deepStrictEqual(Object.keys(pruned), [marks.markKey(FILE_A)]);
});

check('prune survives a throwing existence check', () => {
  const store = marks.applyMark({}, FILE_A, { pinned: true });
  const pruned = marks.pruneMarks(store, () => {
    throw new Error('drive gone');
  });
  assert.deepStrictEqual(Object.keys(pruned), []);
});

check('prune of garbage input returns an object', () => {
  assert.deepStrictEqual(marks.pruneMarks(null, () => true), {});
  assert.deepStrictEqual(marks.pruneMarks({ a: 1, b: null }, () => true), {});
});

/* -------------------------------- palette ------------------------------ */

check('every palette colour survives a round-trip', () => {
  for (const { key } of marks.COLORS) {
    const store = marks.applyMark({}, FILE_A, { color: key });
    assert.strictEqual(marks.readMark(store, FILE_A).color, key, `colour ${key}`);
  }
});

check('palette keys are unique and lowercase', () => {
  assert.strictEqual(new Set(marks.COLOR_KEYS).size, marks.COLORS.length);
  for (const key of marks.COLOR_KEYS) assert.strictEqual(key, key.toLowerCase());
});

/* --------------------------- two machines, one store ----------------
 * The data folder is shared with a Windows VM, which reaches the same tree as
 * `Z:\.local\share\ntapi`. Absolute keys differed between the two spellings, so
 * a pin set on one side was unreadable — and pruned — on the other. Inside the
 * store the key is now the file's path relative to it, which both agree on.
 */

const ROOT = path.resolve('C:/NTAPI/data/sessions');

check('a key inside the store is relative to it', () => {
  assert.strictEqual(marks.markKey(FILE_A, ROOT), 'ws/a.jsonl');
});

check('the relative key does not depend on how the path was spelled', () => {
  const other = path.join(ROOT, 'ws', '.', 'a.jsonl');
  assert.strictEqual(marks.markKey(other, ROOT), marks.markKey(FILE_A, ROOT));
  // The Windows spelling of the same folder, as a path on this machine.
  const slashed = `${ROOT}${path.sep}ws${path.sep}a.jsonl`;
  assert.strictEqual(marks.markKey(slashed, ROOT), marks.markKey(FILE_A, ROOT));
});

check('a mark written with the root reads back with the root', () => {
  const store = marks.applyMark({}, FILE_A, { pinned: true, color: 'green' }, ROOT);
  assert.deepStrictEqual(marks.readMark(store, FILE_A, ROOT), { pinned: true, color: 'green' });
  assert.deepStrictEqual(Object.keys(store), ['ws/a.jsonl']);
});

check('a path outside the store keeps its absolute key', () => {
  const outside = path.resolve('C:/elsewhere/x.jsonl');
  assert.strictEqual(marks.markKey(outside, ROOT), marks.markKey(outside));
});

check('markPath turns a stored key back into the file on this machine', () => {
  assert.strictEqual(marks.markPath('ws/a.jsonl', ROOT), FILE_A);
  assert.strictEqual(marks.markPath(FILE_A, ROOT), path.resolve(FILE_A));
  assert.strictEqual(marks.markPath('', ROOT), null);
});

check('migration rewrites the old absolute keys once', () => {
  const old = {};
  old[marks.markKey(FILE_A)] = { pinned: true, color: 'red' };
  old[marks.markKey(FILE_B)] = { pinned: false, color: 'blue' };
  const next = marks.migrateMarks(old, ROOT);
  assert.deepStrictEqual(Object.keys(next).sort(), ['ws/a.jsonl', 'ws/b.jsonl']);
  assert.deepStrictEqual(next['ws/a.jsonl'], { pinned: true, color: 'red' });
});

check('a key this machine cannot resolve is not treated as a deleted chat', () => {
  // What main.js does: an unresolvable key passes the existence check untouched.
  const store = { 'ws/a.jsonl': { pinned: true }, '/other/machine/x.jsonl': { color: 'red' } };
  const pruned = marks.pruneMarks(store, (key) => {
    const file = marks.markPath(key, ROOT);
    // Same policy as main.js: a relative key is judged by its file, an absolute
    // one belongs to another machine and is never deleted.
    if (file && !path.isAbsolute(key)) return file === FILE_A;
    return true;
  });
  assert.deepStrictEqual(Object.keys(pruned).sort(), ['/other/machine/x.jsonl', 'ws/a.jsonl']);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: pins and colours map to the right chat and survive a restart');
