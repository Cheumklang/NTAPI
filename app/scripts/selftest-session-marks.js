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
const fs = require('node:fs');
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
 * `Z:\.local\share\ntapi`. A path key therefore had two spellings, and each side
 * fed the other's spelling to `path.resolve` — which does not treat a foreign
 * path as absolute — until the key grew into
 * `/home/nt/NT-ALL/NTAPI/app/z:\home\nt\...\ntapi\ntapi/2026-..jsonl`, a key
 * nothing looks up. That is what "my pins are gone after a restart" was.
 *
 * The key is now the session's own file name, lower-cased: the one spelling both
 * machines produce for the same chat.
 */

const SESSION_NAME = '2026-11-22T03-27-07-396Z_01a2014b-1482-7070-b11b-7d352d8a128e.jsonl';
const LINUX_PATH = `/home/nt/.local/share/ntapi/sessions/NTAPI/${SESSION_NAME}`;
const WINDOWS_PATH = `Z:\\.local\\share\\ntapi\\sessions\\NTAPI\\${SESSION_NAME}`;
// The key an older build actually left in the shared prefs.json.
const MANGLED =
  '/home/nt/NT-ALL/NTAPI/app/z:\\home\\nt\\nt-all\\ntapi\\app\\z:\\home\\nt\\nt-all\\ntapi\\app\\z:\\nt-all\\ntapi\\ntapi\\' +
  SESSION_NAME.toLowerCase();

check('the key is the session file name, not a path', () => {
  assert.strictEqual(marks.markKey(LINUX_PATH), SESSION_NAME.toLowerCase());
  assert.strictEqual(marks.markKey(LINUX_PATH).includes('/'), false);
});

check('the same chat reached from the other machine is the same key', () => {
  const key = marks.markKey(LINUX_PATH);
  assert.strictEqual(marks.markKey(WINDOWS_PATH), key);
  assert.strictEqual(marks.markKey(MANGLED), key);
  // Drive-letter case and slash style are the same file on Windows.
  assert.strictEqual(marks.markKey(WINDOWS_PATH.toLowerCase().replace(/\\\\/g, '/')), key);
});

check('a pin set on one machine is read on the other', () => {
  const store = marks.applyMark({}, LINUX_PATH, { pinned: true, color: 'blue' });
  assert.deepStrictEqual(marks.readMark(store, WINDOWS_PATH), { pinned: true, color: 'blue' });
  assert.deepStrictEqual(marks.readMark(store, MANGLED), { pinned: true, color: 'blue' });
});

check('a mark written by each machine lands on one entry', () => {
  let store = marks.applyMark({}, LINUX_PATH, { pinned: true });
  store = marks.applyMark(store, WINDOWS_PATH, { color: 'green' });
  assert.deepStrictEqual(Object.keys(store), [SESSION_NAME.toLowerCase()]);
  assert.deepStrictEqual(store[SESSION_NAME.toLowerCase()], { pinned: true, color: 'green' });
});

check('migration recovers a pin stored under an older spelling', () => {
  const old = {
    [LINUX_PATH]: { pinned: true, color: 'red' },
    [MANGLED]: { pinned: false, color: 'blue' },
    [`NTAPI/${SESSION_NAME}`]: { pinned: true },
    '/other/machine/x.jsonl': { color: 'pink' },
  };
  const next = marks.migrateMarks(old);
  assert.deepStrictEqual(Object.keys(next).sort(), [SESSION_NAME.toLowerCase(), 'x.jsonl'].sort());
  // Two spellings of one chat are merged, not duplicated or dropped.
  assert.deepStrictEqual(next[SESSION_NAME.toLowerCase()], { pinned: true, color: 'red' });
  assert.deepStrictEqual(next['x.jsonl'], { color: 'pink' });
});

check('migration drops entries whose key names no file', () => {
  assert.deepStrictEqual(marks.migrateMarks({ '': { pinned: true }, '/': { pinned: true } }), {});
});

check('prune keeps a chat whose file is still in the store', () => {
  const store = marks.applyMark({}, LINUX_PATH, { pinned: true });
  const alive = new Set([SESSION_NAME.toLowerCase()]);
  const pruned = marks.pruneMarks(store, (key) => alive.has(key));
  assert.deepStrictEqual(Object.keys(pruned), [SESSION_NAME.toLowerCase()]);
});

check('prune drops a chat whose file is gone', () => {
  const store = marks.applyMark({}, LINUX_PATH, { pinned: true });
  assert.deepStrictEqual(marks.pruneMarks(store, () => false), {});
});

/* ------------------------- wiring in the app -------------------------- */
/*
 * main.js cannot be required here (it pulls in electron), so the wiring is read
 * as text. A call to a name nothing defines does not throw until that line runs
 * — the prune name that was wrong only fired when a folder was listed, which
 * took the whole chat list down with a ReferenceError.
 */
check('main.js calls only prune names that exist', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const defined = new Set([...main.matchAll(/^function (prune\w+)/gm)].map((m) => m[1]));
  const mixed = main.match(/const \{([\s\S]*?)\} = require\('\.\/session-marks'\);/);
  for (const name of (mixed ? mixed[1] : '').split(',')) defined.add(name.trim().split(':')[0].trim());
  const called = [...new Set([...main.matchAll(/\b(prune\w+)\s*\(/g)].map((m) => m[1]))];
  assert.deepStrictEqual(called.filter((name) => !defined.has(name)), []);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: pins and colours map to the right chat and survive a restart');
