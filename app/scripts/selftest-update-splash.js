/**
 * When updating, the screen must never go empty.
 *
 * `update:install` quits the app so the installer can replace the .exe, then the
 * installer relaunches it. That is 20–60 s of nothing, which reads as a crash, so
 * a separate process draws a small "updating" window (`--ntapi-splash`).
 *
 * The sprint at the end is what this locks: the splash has to stay up until the
 * relaunched window has actually painted. It used to be closed at the very start
 * of startup — before `createWindow()` was even called — so between the splash
 * disappearing and the new window appearing there was a bare desktop, which is
 * exactly what "the window disappeared before NTAPI came back" meant.
 *
 * Rules:
 *   1. The main window reports when its first frame is painted.
 *   2. The splash is closed only after that, never before createWindow().
 *   3. The splash and the app agree on the data folder, or the pid file is
 *      written where the new build never looks and the splash is never closed.
 *   4. The splash process outlives the quit (detached, not tied to the app).
 *
 * Run: node scripts/selftest-update-splash.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(src, 'main.js'), 'utf8');
const splash = fs.readFileSync(path.join(src, 'update-splash.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Function body by name, brace matched, skipping a destructured parameter. */
function body(srcText, name) {
  const start = srcText.indexOf(`function ${name}(`);
  if (start === -1) return '';
  const sig = srcText.indexOf('(', start);
  let pdepth = 0;
  let afterParams = -1;
  for (let i = sig; i < srcText.length; i += 1) {
    if (srcText[i] === '(') pdepth += 1;
    else if (srcText[i] === ')') {
      pdepth -= 1;
      if (pdepth === 0) { afterParams = i; break; }
    }
  }
  if (afterParams === -1) return '';
  const open = srcText.indexOf('{', afterParams);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < srcText.length; i += 1) {
    if (srcText[i] === '{') depth += 1;
    else if (srcText[i] === '}') {
      depth -= 1;
      if (depth === 0) return srcText.slice(open, i + 1);
    }
  }
  return '';
}

// --- 1. the window announces when it is painted ---------------------------

const createWindow = body(main, 'createWindow');
check('createWindow exists', createWindow !== '');
check('createWindow records a paint signal', /winUiReady\s*=/.test(createWindow));
check('the signal waits for the page to load', /did-finish-load/.test(createWindow));
check('the signal is created after the page is loaded, not before',
  createWindow.indexOf('loadFile') < createWindow.indexOf('did-finish-load'));

// --- 2. the splash is closed after that, not before ----------------------

// The startup work is an async callback on whenReady(), not a named function.
const readyAt = main.indexOf('app.whenReady().then(async () => {');
let readyBody = '';
if (readyAt !== -1) {
  // Start at the arrow body: `then(async () => {`, so braces earlier in the
  // expression are not mistaken for the block.
  const arrow = main.indexOf('=>', readyAt);
  const open = main.indexOf('{', arrow === -1 ? readyAt : arrow);
  let depth = 0;
  for (let i = open; i < main.length; i += 1) {
    if (main[i] === '{') depth += 1;
    else if (main[i] === '}') {
      depth -= 1;
      if (depth === 0) { readyBody = main.slice(open, i + 1); break; }
    }
  }
}

check('the splash close is wired to the paint signal', /winUiReady\.then/.test(readyBody));
check('the window is created before the splash closes',
  readyBody.indexOf('createWindow()') < readyBody.indexOf('closeLeftoverSplash'));

// The exact regression: closing the splash on its own line above createWindow.
const badOrder = /closeLeftoverSplash\(\);\s*\n\s*createWindow\(\)/.test(readyBody);
check('the splash is never closed before the window is created', !badOrder);

// And the close is not merely deferred by a fixed timer, which would race.
check('the close is not a blind timeout', !/setTimeout\(\s*\(\)\s*=>\s*closeLeftoverSplash/.test(readyBody));

// --- 3. both processes agree on the data folder -------------------------

const openSplash = body(main, 'openUpdateSplash');
check('the splash is told where the data folder is', /NTAPI_DATA_DIR:\s*DATA_ROOT/.test(openSplash));
check('the splash reads that variable', /NTAPI_DATA_DIR/.test(splash));

// The pid file must be the same path on both sides.
check('main writes/reads the pid file under its own data folder',
  /function splashPidFile\(\)[\s\S]{0,120}DATA_ROOT/.test(main));
check('the splash writes the pid file under its own data folder',
  /function pidFile\(\)[\s\S]{0,80}dataRoot\(\)/.test(splash));

// --- 4. the splash outlives the app quitting ---------------------------

check('the splash is spawned detached', /detached:\s*true/.test(openSplash));
check('the parent does not wait on it', /child\.unref\(\)/.test(openSplash));
check('the splash is handled before the single-instance lock',
  main.indexOf("--ntapi-splash") < main.indexOf('requestSingleInstanceLock'));
check('the splash closes itself if the install never finishes',
  /SELF_CLOSE_MS/.test(splash) && /setTimeout/.test(splash));

// It must show something rather than staying invisible on a slow machine.
check('the splash shows itself when ready', /ready-to-show/.test(splash));
check('the splash stays above other windows', /alwaysOnTop/.test(splash));

// --- 5. nothing else closes the splash early ---------------------------

// Every call site must be the same guarded block after createWindow(): the
// definition plus the painted, failed and no-signal paths.
const closeAll = main.match(/closeLeftoverSplash\(\)/g) || [];
check('closeLeftoverSplash has no call site outside startup', closeAll.length === 4);
check('both the painted and the failed case close the splash',
  /\.then\(\(\) => closeLeftoverSplash\(\)\)/.test(readyBody)
  && /\.catch\(\(\) => closeLeftoverSplash\(\)\)/.test(readyBody));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll update splash checks passed');
