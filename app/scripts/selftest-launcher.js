/**
 * "เปิดแล้วต้องไม่ขึ้นหน้าต่าง cmd" — the launcher the user asked for (2026-11-22).
 *
 * Double-clicking NTAPI.bat used to leave a console window on screen for as long
 * as the app ran. It now hands over to NTAPI.vbs, which starts the bat with
 * window style 0 (hidden). Two things can silently break that, and both are
 * invisible on the Linux side, so they are pinned here:
 *
 *   1. the hand-over is skipped or loops back on itself, and the console returns;
 *   2. the hidden run reaches a `pause`, which waits forever with nothing on
 *      screen — the worst failure of all, because it looks like a no-op.
 *
 * Run from app/:   node scripts/selftest-launcher.js
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.join(__dirname, '..', '..');
const batPath = path.join(repo, 'NTAPI.bat');
const vbsPath = path.join(repo, 'NTAPI.vbs');

const batRaw = fs.readFileSync(batPath, 'utf8');
const vbsRaw = fs.readFileSync(vbsPath, 'utf8');
const bat = batRaw.split(/\r?\n/);
const vbs = vbsRaw.split(/\r?\n/);

// 1) cmd is fragile with LF and with non-ASCII (codepage), so both files must be
//    pure ASCII with CRLF endings - the rule already set in .gitattributes.
for (const [name, raw] of [['NTAPI.bat', batRaw], ['NTAPI.vbs', vbsRaw]]) {
  assert.ok(!/[^\r]\n/.test(raw) && !/^\n/.test(raw), `${name} is CRLF throughout`);
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(raw), `${name} is ASCII only (no Thai in a .bat/.vbs)`);
}

const lineOf = (lines, pattern) => {
  const i = lines.findIndex((l) => pattern.test(l));
  assert.notStrictEqual(i, -1, `found: ${pattern}`);
  return i;
};

// 2) No argument = no console: the bat must hand over to the windowless
//    launcher and stop. The hand-over has to happen before it starts the app.
const handover = lineOf(bat, /^wscript \/\/nologo "%HERE%\\NTAPI\.vbs" %\*$/);
const goLabel = lineOf(bat, /^:go$/);
assert.ok(handover < goLabel, 'the bat hands over to NTAPI.vbs before :go');

// 3) ...but the hidden run, which is that same bat started again, must not hand
//    over again, or the two would bounce forever.
const hiddenGuard = lineOf(bat, /^if defined HIDDENNOW goto :go$/);
assert.ok(hiddenGuard < handover, 'a run already started hidden does not hand over again');
assert.ok(
  bat.some((l) => /^if defined WANT_CONSOLE goto :go$/.test(l)),
  'console/debug keep their own window'
);
assert.ok(bat.some((l) => /^if "%FIRE%"=="1" goto :go$/.test(l)), 'quiet also keeps its window for the moment');

// 4) Every mode the header promises is actually parsed, and the data-root
//    choices that existed before are still there (shared root sets the env the
//    app reads).
for (const arg of ['hidden', 'console', 'debug', 'quiet', 'local', 'shared', 'sync']) {
  assert.ok(
    bat.some((l) => new RegExp(`^if /i "%A%"=="${arg}"\\s+set "`).test(l)),
    `argument ${arg} is parsed`
  );
}
assert.ok(
  bat.some((l) => /^set "NTAPI_DATA_DIR=%SHARED_ROOT%"$/.test(l)),
  'the shared data root is still handed to the app'
);

// 5) The hidden run must never reach `pause`: an invisible pause is
//    indistinguishable from the app doing nothing. Errors go to a dialog.
const holdLabel = lineOf(bat, /^:hold$/);
assert.ok(
  bat.slice(holdLabel, holdLabel + 4).some((l) => /^if not defined WANT_CONSOLE goto :hold_hidden$/.test(l)),
  'pause is only reached when a console is actually on screen'
);
const holdHidden = lineOf(bat, /^:hold_hidden$/);
assert.ok(
  bat.slice(holdHidden).some((l) => /^call :say "%WHY%"$/.test(l)),
  'the hidden failure is reported in a dialog'
);
assert.ok(bat.some((l) => /^:say$/.test(l)), 'the dialog helper exists');

// 6) The launcher itself: window style 0 (hidden), not style 1, and it passes
//    the arguments through so a shortcut can still ask for `local`.
assert.ok(vbs.some((l) => /^sh\.Run cmd, 0, False$/.test(l)), 'the vbs runs the bat with window style 0 (hidden)');
assert.ok(vbs.some((l) => /" hidden" & args/.test(l)), 'the vbs passes its arguments through to the bat');
assert.ok(vbs.some((l) => /sh\.CurrentDirectory = here/.test(l)), 'the vbs starts in the repo folder');

// 7) No `goto :label` may point at a label that does not exist - cmd fails those
//    silently, which is how a "no console" change could take the app down.
const labels = new Set(bat.filter((l) => /^:[A-Za-z_]+$/.test(l)).map((l) => l.trim()));
for (const line of bat) {
  const m = /goto :([A-Za-z_]+)/.exec(line);
  if (!m || m[1] === 'eof') continue;
  assert.ok(labels.has(`:${m[1]}`), `goto target ${m[1]} exists`);
}

console.log('selftest-launcher: ok');
