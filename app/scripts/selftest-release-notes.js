/**
 * A published release must describe itself.
 *
 * The public download page is generated entirely by `.github/workflows/release.yml`.
 * For several releases it carried no description at all, so a visitor arriving from
 * a Facebook post saw a file name and nothing about what the program is, what it
 * needs, or why Windows warns them. Nothing in the repo guaranteed a body, so
 * nothing caught it.
 *
 * This check runs offline: it asserts the workflow still points at a notes file,
 * that the file exists, and that it still says the things a first-time visitor
 * needs — in particular the SmartScreen warning, which is the question every
 * unsigned Windows installer gets asked.
 *
 * Run: node scripts/selftest-release-notes.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
const notesPath = path.join(repo, 'RELEASE_NOTES.md');
const workflowPath = path.join(repo, '.github', 'workflows', 'release.yml');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

// --- the notes file ------------------------------------------------------
check('the release notes file exists', fs.existsSync(notesPath));
const notes = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '';
check('it is not empty', notes.trim().length > 0, { length: notes.length });

// --- the workflow uses it ------------------------------------------------
check('the release workflow exists', fs.existsSync(workflowPath));
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';

check('the workflow publishes a body', /body_path:\s*RELEASE_NOTES\.md/.test(workflow));
// `body_path` wins over `body`, but having both invites someone to edit the one
// that does nothing.
check('the workflow does not also set an inline body', !/^\s{8,}body:/m.test(workflow.trimEnd()));
// The workflow runs from the repo root, so the path must be root-relative.
check('the path is root-relative, not app-relative', !/body_path:\s*app\//.test(workflow));

// The release still has to be the public one, or the notes land in the private repo.
check('it still publishes to the public repo', /repository:\s*Cheumklang\/NTAPI-releases/.test(workflow));
check('the installer is still attached', /dist\/NTAPI-Setup-\*\.exe/.test(workflow));
// electron-updater needs these two; losing them breaks every installed copy.
check('latest.yml is still attached', /dist\/latest\.yml/.test(workflow));
check('the blockmap is still attached', /dist\/\*\.blockmap/.test(workflow));

// --- what a first-time visitor must be told -----------------------------
//
// Each of these is a question the download page has to answer on its own,
// because the page is the first thing a new user sees.
const required = [
  ['says what the program is', /โควตาฟรี|ฟรีรายวัน/],
  ['says how to install it', /ติดตั้ง|ดาวน์โหลด/],
  ['says which Windows it needs', /Windows 10/],
  // The single most common follow-up question about an unsigned installer.
  ['explains the SmartScreen warning', /Windows protected your PC|SmartScreen/],
  ['tells them to press Run anyway', /Run anyway/],
  ['says it updates itself', /อัปเดต/],
  ['says how to report a problem', /Issues|ทักมา/],
  // The program leans on other people's APIs; saying so is honest and stops
  // users blaming the app when a provider changes its rules.
  ['mentions the third-party API terms', /เงื่อนไขของผู้ให้บริการ|กติกา/],
];
for (const [name, re] of required) check(name, re.test(notes));

// --- hygiene -------------------------------------------------------------
// A stray non-Thai character slipped in while this was written; a visitor would
// see it as a broken glyph.
check('the notes contain no stray CJK characters', !/[\u4e00-\u9fff]/.test(notes));
check('the notes are plain markdown, no html', !/<[a-z]+[ >]/i.test(notes));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll release-note checks passed');
