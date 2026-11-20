'use strict';

/**
 * The two gaps in an update, checked at the source level.
 *
 * What the user saw: the "updating" window disappeared before the app came back,
 * leaving the desktop showing. There are two separate holes and both are timing,
 * which is why they are pinned here rather than in a screenshot:
 *
 *   1. Before quitting, the old app has to know the splash is on screen. The splash
 *      is a second Electron process and takes a moment to start drawing.
 *   2. The new build must not close the splash until its own window has painted.
 *      Closing it on `did-finish-load` uncovered an empty window, because boot()
 *      is still fetching state at that point.
 *
 * Neither is observable offline, so the rules are asserted on the code that
 * implements them — and the pieces that make them work (the IPC names) are checked
 * on both ends.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const main = read('src/main.js');
const preload = read('src/preload.js');
const renderer = read('src/renderer/app.js');
const splash = read('src/update-splash.js');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const windowBlock = (() => {
  const at = main.indexOf('function createWindow()');
  assert.ok(at > 0, 'no createWindow()');
  return main.slice(at, at + 4000);
})();

const installBlock = (() => {
  // The install steps live in `startUpdateInstall()`: the button in Settings, the
  // required-update card and the question asked on close all quit through the
  // same path, so the timing rules have to hold there and not only in the IPC
  // handler that now just calls it.
  const at = main.indexOf('function startUpdateInstall()');
  assert.ok(at > 0, 'no startUpdateInstall()');
  return main.slice(at, at + 1600);
})();

check('the Settings button still goes through the shared install path', () => {
  const handlerAt = main.indexOf("ipcMain.handle('update:install'");
  assert.ok(handlerAt > 0, 'no update:install handler');
  assert.match(main.slice(handlerAt, handlerAt + 300), /startUpdateInstall\(\)/);
});

check('the window reports ready from the renderer, not from the document load', () => {
  assert.match(windowBlock, /uiReadyResolver = \(\) => finish\('ui ready'\)/);
  // did-finish-load may only arm the fallback timer. Resolving there is the bug.
  assert.match(windowBlock, /did-finish-load', \(\) => setTimeout\(\(\) => finish\('timeout'\)/);
  assert.doesNotMatch(windowBlock, /did-finish-load', \(\) => resolve\(\)/);
});

check('a renderer that never reports cannot pin the splash forever', () => {
  assert.match(main, /const UI_READY_TIMEOUT_MS = 15_000;/);
  assert.match(windowBlock, /finish\('timeout'\)/);
});

check('the ui:ready message is wired on both ends', () => {
  assert.match(preload, /uiReady: \(\) => ipcRenderer\.send\('ui:ready'\)/);
  assert.match(main, /ipcMain\.on\('ui:ready', \(\) => \{[\s\S]{0,200}?uiReadyResolver/);
});

check('the renderer signals after boot and after a painted frame', () => {
  assert.match(renderer, /function signalUiReady\(\)[\s\S]{0,400}?requestAnimationFrame\(\(\) => requestAnimationFrame\(done\)\)/);
  // boot() used to be fire-and-forget: a throw there left a blank window and a
  // splash that had already gone.
  assert.match(renderer, /boot\(\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*\.catch\(/);
  assert.match(renderer, /\.then\(signalUiReady\)/);
});

check('the splash is still started before the app quits', () => {
  assert.match(installBlock, /openUpdateSplash\(\);/);
  assert.match(installBlock, /setTimeout\(quitWhenCovered, 4500\)/);
  // Nothing may quit into an empty desktop: the splash has to exist first.
  assert.ok(
    installBlock.indexOf('openUpdateSplash()') < installBlock.indexOf('quitAndInstall(true, true)'),
    'the installer runs before the splash is shown'
  );
});

check('quitting waits for the splash to exist, but not forever', () => {
  assert.match(installBlock, /const covered = fs\.existsSync\(splashPidFile\(\)\)/);
  assert.match(installBlock, /const late = Date\.now\(\) - quitAt > 6000/);
  assert.match(installBlock, /if \(covered \|\| late\) \{[\s\S]{0,120}?quitAndInstall\(true, true\)/);
});

check('the splash still writes the pid the app waits for', () => {
  assert.match(splash, /fs\.writeFileSync\(pidFile\(\), String\(process\.pid\)\)/);
});

check('the splash still gives up on its own after six minutes', () => {
  assert.match(splash, /const SELF_CLOSE_MS = 6 \* 60 \* 1000;/);
  assert.match(splash, /setTimeout\(\(\) => app\.quit\(\), SELF_CLOSE_MS\)/);
});

check('the old leftover-splash kill is still in place', () => {
  assert.match(main, /winUiReady\.then\(\(\) => closeLeftoverSplash\(\)\)/);
});

console.log(`${pass} checks passed`);
