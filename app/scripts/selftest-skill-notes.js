/**
 * The `skillNotes` value that `prefs:set` is allowed to write.
 *
 * The renderer is not trusted with prefs: this is the only gate between a
 * renderer message and `prefs.json`, so what it drops matters as much as what it
 * keeps. A skill's own files are never in play here — nothing in this module
 * writes anywhere but the settings file.
 *
 * Run from app/:   node scripts/selftest-skill-notes.js
 */
'use strict';

const { sanitizeSkillNotes, MAX_NOTE, MAX_ENTRIES } = require('../src/skill-notes');

let failures = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
}

const note = (value) => sanitizeSkillNotes({ caveman: { note: value } })?.caveman?.note;

/* ---- what is kept ------------------------------------------------------ */

check('a name, a star and a line survive',
  JSON.stringify(sanitizeSkillNotes({ caveman: { pinned: true, note: 'พูดสั้น ๆ' } })) ===
    JSON.stringify({ caveman: { pinned: true, note: 'พูดสั้น ๆ' } }));
check('a note in any language is kept as typed', note('ใช้แกะ apk เกมมือถือ') === 'ใช้แกะ apk เกมมือถือ');
check('surrounding whitespace is trimmed', note('  caveman  ') === 'caveman');
check('a note is capped', note('x'.repeat(MAX_NOTE + 40)).length === MAX_NOTE);

/* ---- what is dropped --------------------------------------------------- */

check('not an object is ignored entirely', sanitizeSkillNotes('nope') === undefined);
check('an array is not a map', sanitizeSkillNotes([{ note: 'x' }]) === undefined);
check('null is ignored', sanitizeSkillNotes(null) === undefined);
check('a non-boolean pin is dropped',
  sanitizeSkillNotes({ caveman: { pinned: 'yes' } })?.caveman === undefined,
  sanitizeSkillNotes({ caveman: { pinned: 'yes' } }));
check('a non-string note is dropped',
  sanitizeSkillNotes({ caveman: { note: 42 } })?.caveman === undefined);
check('an empty note is a deletion, not a key', note('   ') === undefined);
check('newlines become spaces rather than breaking the row',
  note('one\ntwo') === 'one two', note('one\ntwo'));
check('control characters never reach the file',
  note('a\u0000b\u001fc') === 'a b c', JSON.stringify(note('a\u0000b\u001fc')));
check('a name with a newline is refused',
  Object.keys(sanitizeSkillNotes({ 'bad\nname': { note: 'x' } })).length === 0,
  sanitizeSkillNotes({ 'bad\nname': { note: 'x' } }));
check('a bad name does not take a good one down with it',
  JSON.stringify(sanitizeSkillNotes({ 'bad\nname': { note: 'x' }, caveman: { note: 'ok' } })) ===
    JSON.stringify({ caveman: { note: 'ok' } }),
  sanitizeSkillNotes({ 'bad\nname': { note: 'x' }, caveman: { note: 'ok' } }));
check('an entry with nothing usable leaves no key',
  JSON.stringify(sanitizeSkillNotes({ caveman: {} })) === '{}',
  sanitizeSkillNotes({ caveman: {} }));
check('a huge map is capped',
  Object.keys(
    sanitizeSkillNotes(
      Object.fromEntries(Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => [`s${i}`, { pinned: true }])),
    ),
  ).length === MAX_ENTRIES);

/* ---- the map is a whole-map write ------------------------------------- */

check('the result is a fresh object, so the caller\'s map is not mutated', (() => {
  const input = { caveman: { note: 'x' } };
  const out = sanitizeSkillNotes(input);
  out.caveman.note = 'y';
  return input.caveman.note === 'x';
})());

check('an empty map is a real answer (forget everything), not a refusal',
  JSON.stringify(sanitizeSkillNotes({})) === '{}');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll skill note checks passed');
process.exit(failures ? 1 : 0);
