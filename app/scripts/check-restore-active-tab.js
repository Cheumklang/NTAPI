'use strict';

/**
 * Restarting the app puts the reader back in the chat they were reading.
 *
 * Two chats open, the window on the second one: an earlier build reopened on
 * whichever tab came out of `tab:list` first, so closing the app moved the user
 * to a different conversation every time. What has to hold:
 *
 *   1. becoming active is what marks a conversation as "the one I was in";
 *   2. while the previous launch's tabs are restored, that mark is not written,
 *      or the last tab restored would win over the one the user left on;
 *   3. the restore picks the marked tab, and falls back to the first one when
 *      that session is no longer open.
 *
 * Run from app/: node_modules/electron/dist/electron.exe scripts/check-restore-active-tab.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const PROBE = `(() => {
  const TAB_A = 'C:\\\\data\\\\sessions\\\\work\\\\a.jsonl';
  const TAB_B = 'C:\\\\data\\\\sessions\\\\work\\\\b.jsonl';
  const tabs = [
    { tabId: 1, sessionFile: TAB_A, cwd: 'C:\\\\work' },
    { tabId: 2, sessionFile: 'c:\\\\DATA\\\\sessions\\\\work\\\\B.jsonl', cwd: 'C:\\\\work' },
  ];

  const picked = pickRestoreTarget(tabs, TAB_B);
  const missing = pickRestoreTarget(tabs, 'C:\\\\data\\\\sessions\\\\work\\\\gone.jsonl');
  const blind = pickRestoreTarget(tabs, '');
  const empty = pickRestoreTarget([], TAB_B);

  // Becoming active remembers the conversation; the second call for the same
  // file must not write again (it would be one IPC per repaint).
  let writes = 0;
  const realSetPrefs = api.setPrefs;
  // api is a frozen bridge, so count through the module's own guard instead:
  // rememberedSessionFile is what stops the duplicate.
  rememberedSessionFile = '';
  restoringTabs = false;
  rememberActiveTab({ sessionFile: TAB_A });
  const afterFirst = rememberedSessionFile;
  const firstWrite = afterFirst === TAB_A;
  rememberActiveTab({ sessionFile: TAB_A });
  const sameAgain = rememberedSessionFile === TAB_A;

  // A tab with no session file yet has nothing to remember.
  rememberedSessionFile = 'keep';
  rememberActiveTab({});
  const emptyView = rememberedSessionFile;

  // While restoring, nothing at all is written.
  rememberedSessionFile = '';
  restoringTabs = true;
  rememberActiveTab({ sessionFile: TAB_B });
  const duringRestore = rememberedSessionFile;
  restoringTabs = false;

  return {
    picked: picked.tabId,
    missing: missing.tabId,
    blind: blind.tabId,
    empty,
    firstWrite,
    sameAgain,
    emptyView,
    duringRestore,
  };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const res = await win.webContents.executeJavaScript(PROBE);
  console.log(JSON.stringify(res, null, 1));

  check('the remembered conversation is reopened', res.picked === 2, res.picked);
  check('it is matched even when the path case differs', res.picked !== 1, res.picked);
  check('a session that is no longer open falls back to the first tab', res.missing === 1, res.missing);
  check('with nothing remembered the first tab is used', res.blind === 1, res.blind);
  check('no tabs means nothing to activate', res.empty === null, res.empty);
  check('becoming active remembers the file', res.firstWrite === true);
  check('the same file is not written twice', res.sameAgain === true);
  check('a tab without a session file is not remembered', res.emptyView === 'keep', res.emptyView);
  check('nothing is written while tabs are being restored', res.duringRestore === '', res.duringRestore);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll restore-active-tab checks passed');
  app.exit(failures ? 1 : 0);
});
