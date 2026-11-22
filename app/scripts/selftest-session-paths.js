/**
 * Diagnostic: chat-history folder names must keep Thai (and other) combining
 * marks. The old sanitizer dropped them, which is why Settings showed
 * "เดสก-ท-อป-freepi" instead of "เดสก์ท็อป-freepi".
 *
 * Run from app/:   node scripts/selftest-session-paths.js
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { sessionDirName, legacySessionDirName } = require('../src/session-paths');

const cases = [
  ['C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi', 'เดสก์ท็อป-freepi'],
  ['C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\1', 'เดสก์ท็อป-1'],
  ['C:\\Users\\cheum\\Projects\\my-app', 'Projects-my-app'],
];

// A workspace has to land on the same folder from either machine: the Ubuntu
// home is shared into a Windows VM as a mapped drive, so /home/nt/NTAPI and
// Z:\NTAPI are one directory and must not split the history in two. This used
// to give "NTAPI" on Linux and "Z-NTAPI" on Windows, and the chat list looked
// empty because it was reading a folder nothing had written to.
cases.push(['/home/nt/NTAPI', 'NTAPI']);
cases.push(['Z:\\NTAPI', 'NTAPI']);
cases.push(['/home/nt/NT-ALL/NTAPI', 'NT-ALL-NTAPI']);
cases.push(['Z:\\NT-ALL\\NTAPI', 'NT-ALL-NTAPI']);

// The home folder itself keeps a readable name instead of collapsing to nothing.
cases.push([process.platform === 'win32' ? 'C:\\Users\\cheum' : '/home/cheum', 'cheum']);

let failed = 0;
for (const [input, expected] of cases) {
  const actual = sessionDirName(input);
  if (actual === expected) {
    console.log(`PASS ${path.basename(input)} -> ${actual}`);
  } else {
    failed += 1;
    console.error(`FAIL ${input}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

// The migration needs the old spelling to find folders created by older builds.
const legacy = legacySessionDirName('C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi');
if (legacy !== 'เดสก-ท-อป-freepi') {
  failed += 1;
  console.error(`FAIL legacy name: expected เดสก-ท-อป-freepi, got ${legacy}`);
} else {
  console.log(`PASS legacy name -> ${legacy}`);
}

assert.strictEqual(
  sessionDirName('C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi'),
  'เดสก์ท็อป-freepi',
  'Thai combining marks must survive'
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}

/*
 * One data folder, two machines. prefs.json is shared, so `lastCwd` may hold the
 * other side's spelling of the workspace (Z:\\NTAPI on the Ubuntu side). Every
 * handler that falls back to the remembered folder must ignore one this machine
 * cannot see, or the chat list comes up empty after a switch.
 */
const fs = require('node:fs');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const expect = (ok, what) => {
  if (ok) console.log(`PASS ${what}`);
  else {
    failed += 1;
    console.error(`FAIL ${what}`);
  }
};
expect(/function savedWorkspace\(\)[\s\S]{0,400}statSync\(saved\)\.isDirectory\(\)/.test(mainSrc), 'a remembered workspace is checked before use');
expect(!/readPrefs\(\)\.lastCwd \|\| process\.cwd\(\)/.test(mainSrc), 'no handler resolves a workspace it has not checked');
expect((mainSrc.match(/savedWorkspace\(\)/g) || []).length >= 5, 'every workspace fallback goes through the check');

/*
 * The SDK's own listing filters by an exact cwd string, which hides a history
 * written on another machine. The app has to read the folder and match by
 * history-folder name instead.
 */
expect(/SessionManager\.listAll\(dir\)/.test(mainSrc), 'the sidebar reads the whole history folder');
expect(/sameWorkspace\(i\.cwd, cwd\)/.test(mainSrc), 'a listed chat is matched by history folder, not by path spelling');
expect(!/SessionManager\.list\(path\.resolve\(cwd\), dir\)/.test(mainSrc), 'no exact-cwd listing is left behind');
expect(!/sdk\.SessionManager\.continueRecent/.test(mainSrc), 'resuming does not rely on an exact-cwd match');
expect(/function recentSessionFile\(cwd\)/.test(mainSrc), 'the newest chat is found by history folder');

/*
 * One data folder, many workspaces. A chat written while another folder was
 * open must still be reachable from the sidebar, and opening it must land in a
 * workspace path this machine can actually use (the other side of a VM spells
 * the same folder differently).
 */
expect(/function listOtherSessions\(cwd/.test(mainSrc), 'chats in other history folders are listed');
expect(/ipcMain\.handle\('session:listOther'/.test(mainSrc), 'the sidebar can ask for them');
expect(/function localWorkspaceFor\(dir/.test(mainSrc), 'a foreign chat gets a workspace this machine can open');
expect(/localWorkspaceFor\(fileDir, cwd\)/.test(mainSrc), 'opening a foreign chat remaps its folder');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
expect(/api\.listOtherSessions\(cwd\)/.test(appSrc), 'the sidebar renders the other folders');
expect((appSrc.match(/otherWorkspaces:/g) || []).length === 2, 'the group is named in both languages');

// The two spellings of one folder must be considered the same workspace, and
// two different projects must not collapse into one history.
const { sameWorkspace } = require('../src/session-paths');
for (const [left, right, expected] of [
  ['/home/nt/NTAPI', 'Z:\\NTAPI', true],
  ['/home/nt/NT-ALL/NTAPI', 'Z:\\NT-ALL\\NTAPI', true],
  ['/home/nt/NTAPI', 'Z:\\other', false],
  ['/home/nt/NTAPI', '', false],
]) {
  expect(sameWorkspace(left, right) === expected, `sameWorkspace ${left} vs ${right || '(none)'}`);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: chat-history folder names keep combining marks');
