'use strict';

/**
 * The launcher is the first thing a user ever runs, so it gets a test.
 *
 * The bug this guards against: the old .bat ran `start /min cmd /c "npm start"`,
 * which made the app a child of that cmd window — closing the window killed the
 * app, and npm sat there as a process that could not shut down cleanly.
 *
 * Comment lines are stripped before matching: the offending commands are quoted
 * in the launcher's own explanation of why they are gone.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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

const root = path.join(__dirname, '..');
const rawBat = fs.readFileSync(path.join(root, 'NTAPI ADS.bat'), 'utf8');
const vbs = fs.readFileSync(path.join(root, 'NTAPI ADS.vbs'), 'utf8');

const bat = rawBat
  .split(/\r?\n/)
  .filter((line) => !/^\s*rem\b/i.test(line) && !/^\s*::/.test(line))
  .join('\n');

check('the launcher starts electron itself, not through npm', () => {
  assert.ok(/electron\.exe/.test(bat), 'no electron.exe in the launcher');
  assert.ok(!/npm\.cmd|npm start|\bnpm\b\s/i.test(bat) || /npm install/.test(bat), 'still going through npm to start');
  assert.ok(!/start[^\n]*npm/i.test(bat), 'npm is still being started');
});

check('the launcher detaches the app so the console can close', () => {
  assert.ok(/start\s+""/.test(bat), 'must use start "" to detach');
  assert.ok(!/\/wait/i.test(bat), 'must not wait for the app');
  assert.ok(!/\/min\s+cmd/i.test(bat), 'must not spawn a second cmd window');
  assert.ok(!/cmd\s+\/c/i.test(bat), 'must not wrap the app in cmd /c');
});

check('the launcher closes its own window when done', () => {
  assert.ok(/exit\s+\/b\s+0/.test(bat), 'should exit explicitly');
  // One `pause`, and only on the branch where the install failed — anywhere else
  // it would leave the console sitting there after the app is already running.
  const pauses = bat.match(/\bpause\b/g) || [];
  assert.strictEqual(pauses.length, 1, `pause used ${pauses.length} time(s)`);
  const pauseAt = bat.indexOf('pause');
  assert.ok(bat.indexOf('Install failed') < pauseAt, 'pause must sit after the failure message');
});

check('a first run with no dependencies says what to do instead of flashing', () => {
  assert.ok(/npm install/.test(bat), 'should offer to install');
  assert.ok(/if not exist/i.test(bat), 'should check for electron before launching');
});

check('the launcher is ASCII-only', () => {
  // cmd.exe reads a .bat byte by byte in the OEM codepage. A Thai byte happens to
  // equal a command separator in some of them, which splits a line into two
  // commands — the launcher died with "was unexpected at this time" until this
  // rule was followed. Thai instructions belong in README.md.
  const nonAscii = [...rawBat].filter((ch) => ch.charCodeAt(0) > 127);
  assert.strictEqual(nonAscii.length, 0, `${nonAscii.length} non-ASCII character(s) in the launcher`);
  const nonAsciiVbs = [...vbs].filter((ch) => ch.charCodeAt(0) > 127);
  assert.strictEqual(nonAsciiVbs.length, 0, `${nonAsciiVbs.length} non-ASCII character(s) in the shortcut`);
});

check('the silent shortcut hides the window and does not wait', () => {
  assert.ok(/shell\.Run/.test(vbs), 'no Run call');
  assert.ok(/,\s*0,\s*False\s*$/m.test(vbs), 'must run hidden (0) and not wait (False)');
});

console.log(`${pass} checks passed`);
