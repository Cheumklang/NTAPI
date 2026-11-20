/**
 * `/skill` lists the skills installed on this machine.
 *
 * Typing `/` must stay the command palette — twelve commands buried under forty
 * skills is worse than either alone — so the roster lives behind `/skill`. What
 * is pinned here is that roster logic itself, run for real out of the renderer
 * source rather than grepped for, because the parts that break quietly are the
 * filtering and the text it inserts.
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
];
const sandbox = {
  skillsCache: skills,
  input: { value: '' },
  autoGrow() {},
  // The roster builder now names the folders it searched when the list is empty,
  // so the sandbox needs the two things that wording reaches for.
  t: (key) => key,
  activeView: () => null,
};
vm.createContext(sandbox);
vm.runInContext(`${snippet}\nthis.__matches = SKILL_SLASH_RE; this.__items = skillSlashItems;`, sandbox);

const matches = sandbox.__matches;
const items = sandbox.__items;

/* ---- the trigger ------------------------------------------------------- */

check('"/skill" switches the menu to the roster', matches.test('/skill'));
check('"/skill " is still the roster, ready to filter', matches.test('/skill '));
check('"/skill cav" carries the query', matches.exec('/skill cav')[1] === 'cav');
check('a bare "/" keeps the command palette', matches.test('/') === false);
check('"/skills" is not the trigger', matches.test('/skills') === false);
check('another command is not the trigger', matches.test('/compact') === false);

/* ---- the roster -------------------------------------------------------- */

check('an empty query lists every installed skill', items('').length === 3, items('').length);
check('the query filters by name',
  items('cav').map((i) => i.name).join() === '@caveman', items('cav').map((i) => i.name));
check('the query also matches the description',
  items('feature').map((i) => i.name).join() === '@test-driven-development',
  items('feature').map((i) => i.name));
check(
  'nothing matching leaves a note instead of a choice',
  items('zzz').length === 1 && items('zzz')[0].info === true && !items('zzz')[0].run,
);

/* ---- what choosing one puts in the box --------------------------------- */

const caveman = items('cav')[0];
caveman.run();
check('choosing inserts the shorthand people already type', sandbox.input.value === '@caveman ',
  sandbox.input.value);
check('the shorthand stays a whole word, or the send path will not resolve it',
  /^@[A-Za-z0-9._-]+ $/.test(sandbox.input.value));

/* ---- descriptions stay honest ------------------------------------------ */

check('the description is shown as the skill wrote it, not translated',
  items('cav')[0].th === skills[0].description &&
    items('cav')[0].en === skills[0].description,
  items('cav')[0]);

/* ---- the wiring that keeps it usable ---------------------------------- */

check('/skill is offered in the command palette',
  /name: '\/skill',/.test(SOURCE));
check('the list is warmed at boot so the first /skill is instant',
  /setTimeout\(\(\) => loadSkills\(\), 0\);/.test(SOURCE));
check('a skill installed later is picked up without a restart',
  /loadSkills\(\)\.then\(\(\) => \{/.test(SOURCE));
// Rebuilt on every keystroke, so comparing entries by identity would drop the
// highlight back to the first row each time the query grew.
check('the highlight survives the entries being rebuilt',
  /cmd\.name === items\[i\]\.name/.test(SOURCE));
check('selecting one closes the menu instead of sending it',
  /function runSlashCommand\(cmd\) \{[^}]*hideSlashMenu\(\);/.test(SOURCE));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll skill menu checks passed');
process.exit(failures ? 1 : 0);

/* ---- an empty roster says where it looked ----------------------------- */

sandbox.skillsCache = [];
const none = sandbox.__items('');
check(
  'an empty roster explains itself instead of closing silently',
  none.length === 1 && none[0].info === true && !none[0].run,
);
