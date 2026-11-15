/**
 * A published release must say what changed in it.
 *
 * The public download page is generated entirely by `.github/workflows/release.yml`.
 * It has been wrong in both directions. First it carried no description at all: a
 * visitor from a Facebook post saw a file name and nothing else. Then it carried a
 * standing description of the program, identical on every release, which told a
 * returning user nothing about whether this download was worth taking — and it
 * opened with instructions to the maintainer ("edit this file only here"), which
 * every visitor read as the first line.
 *
 * The answer chosen is the smallest one that works: the body is the changelog and
 * nothing else, generated from the commits between the previous tag and this one.
 * This check runs offline and asserts exactly that, plus the restraint that goes
 * with it — housekeeping commits are filtered out, the version bump is not repeated,
 * and no file in the repo can drift back into a hand-written body.
 *
 * Run: node scripts/selftest-release-notes.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
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

check('the release workflow exists', fs.existsSync(workflowPath));
const workflow = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
check('it is not empty', workflow.trim().length > 0, { length: workflow.length });

// --- the body is generated ----------------------------------------------
check('the workflow publishes a body', /body_path:\s*dist\/release-body\.md/.test(workflow));
// `body_path` wins over `body`, but having both invites someone to edit the one
// that does nothing.
check('the workflow does not also set an inline body', !/^\s{8,}body:/m.test(workflow));
// The step that writes the file must run before the step that publishes it.
check('the body is built before it is published',
  workflow.indexOf('dist/release-body.md') < workflow.indexOf('- name: Publish release assets'));

// The body comes from the commits between the previous tag and this one.
check('it builds a what-changed section', /มีอะไรใหม่ใน/.test(workflow));
check('it walks the commits since the previous tag', /git describe --tags --abbrev=0/.test(workflow));
check('it needs the full history to do that', /fetch-depth:\s*0/.test(workflow));
// Housekeeping commits are noise on a download page; the version bump repeats
// the heading. `internal:` is the escape hatch for work behind the scenes -
// tooling, publishing, backend plumbing - which a user must never read about.
check('housekeeping commits are filtered out', /\^\(ci\|chore\|test\|docs\|style\|internal\)/.test(workflow));
check('the version-bump prefix is stripped from the line', /regex\]::Escape\(\$tag\)/.test(workflow));
// One line of orientation is allowed: which file to grab and which Windows.
check('it says which file to download', /NTAPI-Setup-\$\(\$tag -replace/.test(workflow));
check('it says which Windows is needed', /Windows 10\/11 \(64-bit\)/.test(workflow));

// --- nothing hand-written can come back ---------------------------------
//
// The failure mode was a standing description that drifted out of date and was
// identical on every release. Keeping it as a repo file is what allowed that, so
// the file is gone and the body is the only copy.
check('there is no hand-written release body left in the repo',
  !fs.existsSync(path.join(repo, 'RELEASE_NOTES.md')));
check('the workflow no longer reads a notes file', !/Get-Content RELEASE_NOTES\.md/.test(workflow));
// Wording aimed at the maintainer belongs in docs, not on the download page.
check('no instructions to the maintainer in the workflow body', !/ไฟล์นี้คือข้อความ/.test(workflow));

// --- the release still ships -------------------------------------------
check('it still publishes to the public repo', /repository:\s*Cheumklang\/NTAPI-releases/.test(workflow));
check('the installer is still attached', /dist\/NTAPI-Setup-\*\.exe/.test(workflow));
// electron-updater needs these two; losing them breaks every installed copy.
check('latest.yml is still attached', /dist\/latest\.yml/.test(workflow));
check('the blockmap is still attached', /dist\/\*\.blockmap/.test(workflow));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll release-note checks passed');
