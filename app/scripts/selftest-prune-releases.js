/**
 * The prune job deletes things that cannot be brought back.
 *
 * Old installers stay on the public download page and keep being handed out:
 * every build before v0.5.0 came from before sponsor banners existed, so a user
 * who installs one never sees a placement no matter how many are published. A
 * one-off manual cleanup fixed that once; this workflow is how it stays fixed.
 *
 * Because the blast radius is "every release in the distribution repo", the
 * checks here are about restraint rather than capability: it must be manual, it
 * must be a dry run unless told otherwise, it must refuse a version it cannot
 * find, and it must never touch the version it was told to keep.
 *
 * Run: node scripts/selftest-prune-releases.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
const workflowPath = path.join(repo, '.github', 'workflows', 'prune-releases.yml');
const runnerPath = path.join(__dirname, 'run-unit-tests.js');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

check('the prune workflow exists', fs.existsSync(workflowPath));
const yml = fs.existsSync(workflowPath) ? fs.readFileSync(workflowPath, 'utf8') : '';
check('it is not empty', yml.trim().length > 0, { length: yml.length });

// --- when it runs --------------------------------------------------------
check('it only runs when a person asks', /^on:\s*\n\s+workflow_dispatch:/m.test(yml));
// A push trigger would delete releases as a side effect of shipping one.
check('it does not run on push', !/^ {2}push:/m.test(yml));
check('it does not run on a schedule', !/^ {2}schedule:/m.test(yml));

// --- what it protects ----------------------------------------------------
check('which version survives is an input, not a guess', /^\s+keep:/m.test(yml) && /inputs\.keep/.test(yml));
check('a dry run is the default', /dry_run:[\s\S]{0,160}?default:\s*true/.test(yml));
check('a dry run deletes nothing', /if \[ "\$DRY_RUN" = "true" \]; then[\s\S]{0,200}?would delete/.test(yml));
// The guard against a typo turning "delete everything" into a one-click accident.
check('it refuses a version that has no release', /no published release/.test(yml));
check('it rejects a malformed version before deleting', /is not a version like/.test(yml));
// String comparison would sort 0.10.0 below 0.9.0 and delete a newer release.
check('it compares versions numerically', /sort -V/.test(yml));
check('it never deletes the kept version', /\[ "\$ver" = "\$keep" \]/.test(yml));

// --- what it touches -----------------------------------------------------
// Assets live in the distribution repo; the source repo only holds tags.
check('it deletes from the distribution repo', /TARGET_REPO:\s*Cheumklang\/NTAPI-releases/.test(yml));
check('the token is the release token', /GH_TOKEN:\s*\$\{\{\s*secrets\.RELEASE_TOKEN\s*\}\}/.test(yml));
check('it deletes releases through the API', /gh api -X DELETE "repos\/\$TARGET_REPO\/releases\/\$id"/.test(yml));
// Tags are optional and off by default: the changelog compares against them.
check('tag deletion is opt-in', /delete_tags:[\s\S]{0,160}?default:\s*false/.test(yml));
check('tag deletion still leaves the kept tag', /refs\/tags\/\$tag/.test(yml) && !/--delete v\$keep/.test(yml));

// --- it is wired into the suite -----------------------------------------
const runner = fs.existsSync(runnerPath) ? fs.readFileSync(runnerPath, 'utf8') : '';
check('the suite runs this test', /selftest-prune-releases\.js/.test(runner));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll prune-release checks passed');
