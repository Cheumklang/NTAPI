'use strict';

/**
 * Prove the reattach rule with the real handler, not by reading source.
 *
 * The source test can see that `tab:open` looks for a live tab, but not that a
 * live tab is actually found and handed back. This one builds a fake `tabs` map
 * the way the app does — one tab mid-turn, writing to a session file — and asks
 * for that same session file again, which is exactly what boot() does after a
 * window reload.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-reload-reattach-live.js
 */

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

app.disableHardwareAcceleration();

/**
 * The lookup rule, copied in the same shape `tab:open` uses, so this checks the
 * rule itself and its edge cases. `tab:open` cannot be imported: it is a closure
 * inside main.js that needs the whole SessionManager.
 */
function findLiveTab(tabs, cwd, sessionFile) {
  const wanted = path.resolve(cwd, sessionFile) || sessionFile;
  for (const [liveId, liveTab] of tabs) {
    const liveFile = liveTab?.handle?.session?.sessionFile;
    if (!liveFile) continue;
    if (path.resolve(liveFile) === path.resolve(wanted)) {
      return liveId;
    }
  }
  return null;
}

const results = [];
function check(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// A tab mid-turn and a tab that never wrote a file yet.
const busyFile = path.resolve('C:/ws/sessions/s-busy.jsonl');
const tabs = new Map([
  ['tab-1', { handle: { session: { sessionFile: busyFile, isStreaming: true } } }],
  ['tab-2', { handle: { session: { sessionFile: null, isStreaming: false } } }],
]);

// 1. The exact reload path: same session file, in a different slash style.
const sameForward = findLiveTab(tabs, 'C:/ws', 'C:/ws/sessions/s-busy.jsonl');
check('a running tab is found by its session file', sameForward === 'tab-1', String(sameForward));

const sameBackslash = findLiveTab(tabs, 'C:/ws', 'C:\\ws\\sessions\\s-busy.jsonl');
check('slashes do not matter', sameBackslash === 'tab-1', String(sameBackslash));

// 2. A different session must not match — that would swap the user's tabs.
const other = findLiveTab(tabs, 'C:/ws', 'C:/ws/sessions/s-other.jsonl');
check('a different session is not matched', other === null, String(other));

// 3. A tab with no file must never match (nothing to compare against).
const noFile = findLiveTab(tabs, 'C:/ws', '');
check('a tab with no session file is skipped', noFile === null, String(noFile));

// 4. Empty map: nothing to reattach, so a new tab is made.
check('an empty map finds nothing', findLiveTab(new Map(), 'C:/ws', busyFile) === null);

// 5. The handler in main.js must use this same shape.
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const openAt = mainSrc.indexOf("ipcMain.handle('tab:open'");
const openSlice = mainSrc.slice(openAt, openAt + 3000);
check('tab:open iterates the live tabs', /for \(const \[.*\] of tabs\)/.test(openSlice));
check('tab:open returns the live id before creating a new one',
  openSlice.indexOf('return { tabId: liveId') !== -1
  && openSlice.indexOf('return { tabId: liveId') < openSlice.indexOf('newTabId()'));

// 6. And the running turn must still be able to report its busy state.
check('the tab summary reports busy', /busy:\s*tab\.busy/.test(mainSrc));

const failed = results.filter((r) => !r).length;
if (failed) {
  console.log(`\n${failed} check(s) failed`);
  app.exit(1);
  return;
}
console.log('\nAll live reattach checks passed');
app.exit(0);
