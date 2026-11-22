/**
 * Where the app keeps its data, and the one-time move off the Windows-shaped
 * name on Linux and macOS.
 *
 * The bug this locks down: `C:\NTAPI` is a fine absolute path on Windows and a
 * *relative* one everywhere else, so a Linux install created a folder literally
 * named `C:\NTAPI` in whatever directory it was started from — on this project,
 * inside the source tree, where nobody looks and a backup never finds it.
 *
 * The functions are read out of main.js rather than copied, so this fails when
 * the real resolution drifts.
 *
 * Run from app/:   node scripts/selftest-data-root.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
}

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const start = src.indexOf('function rewriteLegacyPathsInPrefs(');
const end = src.indexOf('const DATA_ROOT = resolveDataRoot();');
const chunk = src.slice(start, end);
if (!chunk.includes('function resolveDataRoot(') || !chunk.includes('function platformDataRoot(')) {
  console.log('FAIL the data-root logic could not be read out of main.js');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'ntapi-data-root-'));

/**
 * The folder the old build left behind, or null where that name cannot exist.
 *
 * On Linux and macOS `C:\NTAPI` is a *relative* name and a folder can be made
 * with it. On Windows it is an absolute path, so no such folder can be created
 * at all — the cases that need one are skipped there instead of crashing.
 */
function legacyDir(parent) {
  if (process.platform === 'win32') return null;
  const dir = path.join(parent, 'C:\\NTAPI');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
const fakeHome = path.join(tmp, 'home');
const fakeUserData = path.join(tmp, 'userData');
fs.mkdirSync(fakeHome, { recursive: true });

const proc = { env: {}, platform: 'linux' };
const sandbox = {
  require,
  fs,
  path,
  os: require('node:os'),
  process: proc,
  app: { getPath: (key) => (key === 'home' ? fakeHome : fakeUserData) },
};
vm.createContext(sandbox);
vm.runInContext(`${chunk}\nthis.__root = resolveDataRoot; this.__platform = platformDataRoot; this.__move = moveDataRoot;`, sandbox);
const resolve = sandbox.__root;
const platformRoot = sandbox.__platform;

/** Each case gets its own working directory: the legacy folder is relative. */
function inDir(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  process.chdir(dir);
  return dir;
}

const savedCwd = process.cwd();

/* ------------------------------ the default ----------------------------- */

check('Windows keeps the folder people already know', platformRoot('win32') === 'C:\\NTAPI');

proc.env = { XDG_DATA_HOME: path.join(tmp, 'xdg') };
check(
  'Linux and macOS use the xdg data home',
  platformRoot('linux') === path.join(tmp, 'xdg', 'ntapi') && platformRoot() === path.join(tmp, 'xdg', 'ntapi'),
);

proc.env = {};
check(
  'without XDG_DATA_HOME the standard per-user folder is used',
  platformRoot() === path.join(fakeHome, '.local', 'share', 'ntapi'),
  platformRoot(),
);

/* ------------------------------ the move -------------------------------- */

// The old build wrote its settings into a folder named `C:\NTAPI` in whatever
// directory it started from, so that is where the sessions are now.
const first = inDir('case-move');
const legacy = legacyDir(first);
if (!legacy) {
  console.log('SKIP the legacy move: Windows cannot hold a folder named C:\\NTAPI');
} else {
  fs.mkdirSync(path.join(legacy, 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'sessions', 'tab-1.json'), '{"turns":[]}');
  fs.writeFileSync(
    path.join(legacy, 'prefs.json'),
    JSON.stringify({ lastSession: path.join('C:\\NTAPI', 'sessions', 'tab-1.json'), lang: 'th' }, null, 2),
  );
  proc.env = { XDG_DATA_HOME: path.join(first, 'xdg') };
  const moved = resolve();
  const target = path.join(first, 'xdg', 'ntapi');
  check('the xdg folder becomes the data root', moved === target, moved);
  check('the saved session moved with it', fs.existsSync(path.join(target, 'sessions', 'tab-1.json')));
  check('the old folder is gone, not duplicated', !fs.existsSync(legacy));
  const prefsAfter = fs.readFileSync(path.join(target, 'prefs.json'), 'utf8');
  check('prefs no longer points into the old folder', !prefsAfter.includes('C:\\\\NTAPI'), prefsAfter);
  check('prefs points at the folder the app now uses', prefsAfter.includes('sessions'), prefsAfter);

  // Second start: nothing to move, the same folder answers.
  check('the same folder is chosen on the next start', resolve() === target);
}

/* --------------------------- what must not move -------------------------- */

const second = inDir('case-existing');
const target2 = path.join(second, 'xdg', 'ntapi');
fs.mkdirSync(target2, { recursive: true });
fs.writeFileSync(path.join(target2, 'marker.txt'), 'keep me');
const legacy2 = legacyDir(second);
if (legacy2) fs.writeFileSync(path.join(legacy2, 'stale.json'), '{}');
proc.env = { XDG_DATA_HOME: path.join(second, 'xdg') };
resolve();
check('an existing data folder is never overwritten', fs.readFileSync(path.join(target2, 'marker.txt'), 'utf8') === 'keep me');

const third = inDir('case-explicit');
const explicit = path.join(third, 'chosen-by-user');
const legacy3 = legacyDir(third);
if (legacy3) fs.writeFileSync(path.join(legacy3, 'auth.json'), '{}');
proc.env = { NTAPI_DATA_DIR: explicit };
check('NTAPI_DATA_DIR wins over everything', resolve() === explicit);
if (legacy3) {
  check(
    'an explicit folder means no move happens behind the user',
    fs.existsSync(path.join(third, 'C:\\NTAPI', 'auth.json')),
  );
} else {
  console.log('SKIP the explicit-folder case: same reason, no C:\\NTAPI folder here');
}

process.chdir(savedCwd);

/* ------------------------------- the source ------------------------------ */

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
check(
  'the old Windows-only rename is still there for Windows',
  /moveDataRoot\(NEW_ROOT, LEGACY_ROOT\)/.test(source),
);
check(
  'the Linux-side move runs before any session reads a file',
  source.indexOf('moveDataRoot(preferred, NEW_ROOT)') < source.indexOf('const DATA_ROOT = resolveDataRoot()'),
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll data-root checks passed');
