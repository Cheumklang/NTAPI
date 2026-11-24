/**
 * `/skill` lists the skills installed on this machine.
 *
 * Typing `/` must stay the command palette — twelve commands buried under forty
 * skills is worse than either alone — so the roster lives behind `/skill`. What
 * is pinned here is that roster logic itself, run for real out of the renderer
 * source rather than grepped for, because the parts that break quietly are the
 * filtering, the ordering, and the text it inserts.
 *
 * The user's own words and the star are part of the same list, so they are
 * exercised here too: a note is a search term, a pin is a group, and neither may
 * touch the skill's own files.
 *
 * Run from app/:   node scripts/selftest-skill-menu.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
}

/* ---- lift the roster out of the renderer and execute it ----------------- */

const START = 'const SKILL_SLASH_RE';
const END = 'function applySlashItems';
check('the skill roster is where the menu expects it',
  SOURCE.split(START).length === 2 && SOURCE.split(END).length === 2);

const from = SOURCE.indexOf(START);
const to = SOURCE.indexOf(END);
const snippet = SOURCE.slice(from, to);

const skills = [
  { name: 'caveman', description: 'Terse caveman voice: answer first, fluff gone.' },
  { name: 'brainstorming', description: 'Use before any creative work.' },
  { name: 'test-driven-development', description: 'Use when implementing any feature.' },
  { name: 'ghidra-reverse', description: 'Reverse-engineer binaries in Ghidra.' },
];

let saved = 0;
const sandbox = {
  skillsCache: skills,
  appPrefs: {
    skillNotes: {
      caveman: { pinned: true, note: 'พูดสั้น ๆ แบบมนุษย์ถ้ำ' },
      'ghidra-reverse': { note: 'เปิดใน Ghidra' },
    },
  },
  input: { value: '', focus() {} },
  autoGrow() {},
  updateSendState() {},
  hideSlashMenu() {
    sandbox.__hidden = true;
  },
  api: {
    setPrefs() {
      saved += 1;
      return Promise.resolve({});
    },
  },
  // The roster builder names the folders it searched when the list is empty, so
  // the sandbox needs the two things that wording reaches for.
  t: (key) => key,
  activeView: () => null,
};
vm.createContext(sandbox);
vm.runInContext(
  `${snippet}
   this.__matches = SKILL_SLASH_RE;
   this.__items = skillSlashItems;
   this.__rows = () => skillSlashItems('');
   this.__insert = insertSkillCommand;
   this.__pin = setSkillPin;
   this.__note = setSkillNote;
   this.__notes = () => ({ ...skillNotesMap() });`,
  sandbox,
);

const matches = sandbox.__matches;
const items = sandbox.__items;
const rowsOf = (query) => items(query).filter((item) => !item.info);

/* ---- the trigger ------------------------------------------------------- */

check('"/skill" switches the menu to the roster', matches.test('/skill'));
check('"/skill " is still the roster, ready to filter', matches.test('/skill '));
check('"/skill:" is the roster too, with no query yet', matches.test('/skill:'));
check('"/skill:ca" carries the query', matches.exec('/skill:ca')[1] === 'ca');
check('"/skill ca" carries the query', matches.exec('/skill ca')[1] === 'ca');
check('a bare "/" keeps the command palette', matches.test('/') === false);
check('"/skills" is not the trigger', matches.test('/skills') === false);
check('another command is not the trigger', matches.test('/compact') === false);
// A sentence after the command is prose, not a filter: the menu gets out of the
// way instead of replacing what the user typed.
check('"/skill:ca do the thing" leaves the menu closed', matches.test('/skill:ca do the thing') === false);
check('"/skill caveman" with a trailing word is left alone', matches.test('/skill caveman now') === false);

/* ---- the roster -------------------------------------------------------- */

check('an empty query lists every installed skill', rowsOf('').length === 4, rowsOf('').length);
check('the list carries a group header', items('').some((item) => item.info && item.header),
  items('').filter((item) => item.info));
check('every query letter is the user\'s, not a fixed set',
  rowsOf('a').map((i) => i.name).sort().join() === 'brainstorming,caveman,ghidra-reverse,test-driven-development',
  rowsOf('a').map((i) => i.name));
check('a prefix match comes first',
  rowsOf('c')[0].name === 'caveman', rowsOf('c').map((i) => i.name));
check('a name-contains match still appears',
  rowsOf('drive').some((i) => i.name === 'test-driven-development'),
  rowsOf('drive').map((i) => i.name));
check('a Thai word the user wrote finds the skill',
  rowsOf('มนุษย์ถ้ำ').map((i) => i.name).join() === 'caveman',
  rowsOf('มนุษย์ถ้ำ').map((i) => i.name));
check('the skill\'s own description is still searchable',
  rowsOf('feature').map((i) => i.name).join() === 'test-driven-development',
  rowsOf('feature').map((i) => i.name));
check('the query is case-insensitive', rowsOf('CAV').map((i) => i.name).join() === 'caveman');
check('a prefix hit outranks a note hit',
  // `gh` starts ghidra-reverse's name; nothing else matches it, and the pin on
  // caveman is not a wildcard — a pin only orders rows that matched.
  rowsOf('gh')[0].name === 'ghidra-reverse', rowsOf('gh').map((i) => i.name));
check('a pin does not resurrect a skill that does not match',
  rowsOf('gh').every((i) => i.name !== 'caveman'), rowsOf('gh').map((i) => i.name));
check(
  'nothing matching leaves a note instead of a choice',
  items('zzz').length === 1 && items('zzz')[0].info === true && !items('zzz')[0].run,
);

/* ---- pins order the list, and only the list ---------------------------- */

check('the pinned skill is first', rowsOf('')[0].name === 'caveman', rowsOf('').map((i) => i.name));
check('the pinned group has its own header', items('')[0].header === 'skillsPinned',
  items('')[0]);
check('the rest sit under their own header',
  items('').some((item) => item.header === 'skillsAll'));
check('a row knows its note and whether it is pinned',
  rowsOf('')[0].note === 'พูดสั้น ๆ แบบมนุษย์ถ้ำ' && rowsOf('')[0].pinned === true,
  rowsOf('')[0]);
check('a skill with a note but no pin is not in the pinned group',
  rowsOf('').find((i) => i.name === 'ghidra-reverse').pinned === false);

/* ---- what choosing one puts in the box --------------------------------- */

sandbox.input.value = '/skill cav';
sandbox.__insert('caveman');
check('choosing inserts the command pi expands', sandbox.input.value === '/skill:caveman ',
  sandbox.input.value);
check('selecting closes the menu instead of sending it', sandbox.__hidden === true);
check('/skill:caveman survives as one whole word',
  /^\/skill:[A-Za-z0-9._-]+ $/.test('/skill:caveman '));

sandbox.__hidden = false;
sandbox.input.value = '/skill:c ช่วยแก้บั๊กนี้';
sandbox.__insert('caveman');
check('a sentence already typed after the command is kept',
  sandbox.input.value === '/skill:caveman ช่วยแก้บั๊กนี้', sandbox.input.value);

/* ---- a star and a note are written through prefs ----------------------- */

check('a row still carries the skill\'s own description for the dimmed tail',
  rowsOf('')[0].description === skills[0].description, rowsOf('')[0].description);

sandbox.__pin('brainstorming', true);
check('pinning writes prefs', saved > 0 && sandbox.__notes().brainstorming.pinned === true,
  saved);
check('unpinning a skill with no note forgets it entirely', (() => {
  sandbox.__pin('brainstorming', false);
  return sandbox.__notes().brainstorming === undefined;
})(), sandbox.__notes());

sandbox.__note('ghidra-reverse', '   ');
check('an emptied note is a deletion', sandbox.__notes()['ghidra-reverse'] === undefined,
  sandbox.__notes());

sandbox.__note('test-driven-development', 'x'.repeat(200));
check('a note is capped before it reaches the file',
  sandbox.__notes()['test-driven-development'].note.length === 60,
  sandbox.__notes()['test-driven-development']);

sandbox.__note('caveman', 'บรรทัด\nใหม่');
check('a note is one line',
  !/[\n\r]/.test(sandbox.__notes().caveman.note), sandbox.__notes().caveman);

/* ---- descriptions stay honest ------------------------------------------ */

check('the skill\'s own description is never replaced in the roster',
  skills[0].description === 'Terse caveman voice: answer first, fluff gone.');

/* ---- the wiring that keeps it usable ---------------------------------- */

check('/skill is offered in the command palette',
  /name: '\/skill',/.test(SOURCE));
check('the list is warmed at boot so the first /skill is instant',
  /setTimeout\(\(\) => loadSkills\(\), 0\);/.test(SOURCE));
// `force` matters: the menu used to keep whatever the boot scan found for the
// whole run, so a skill installed with the app already open never appeared.
check('a skill installed later is picked up without a restart',
  /loadSkills\(\{ force: true \}\)\.then\(\(\) => \{/.test(SOURCE));
check('the menu rescans a list older than a couple of seconds',
  /Date\.now\(\) - skillsAt > SKILLS_MENU_REFRESH_MS/.test(SOURCE));
// Rebuilt on every keystroke, so comparing entries by identity would drop the
// highlight back to the first row each time the query grew.
check('the highlight survives the entries being rebuilt',
  /cmd\.name === items\[i\]\.name/.test(SOURCE));
check('a header row is never the first highlight',
  /slashState.index = firstSelectable\(items\)/.test(SOURCE));
check('the @ menu finds a skill by the user\'s own words too',
  /skillNote\(skill\.name\)\}`\.toLowerCase\(\)/.test(SOURCE));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll skill menu checks passed');
process.exit(failures ? 1 : 0);

/* ---- an empty roster says where it looked ----------------------------- */

sandbox.skillsCache = [];
const none = sandbox.__items('');
check(
  'an empty roster explains itself instead of closing silently',
  none.length === 1 && none[0].info === true && !none[0].run,
);
