'use strict';

/**
 * The composer belongs to the chat it was typed in.
 *
 * Reproduces the report: attach a picture and leave a message in one chat, then
 * switch — the same picture and words turned up in the other chat. The draft
 * (text + staged pictures) used to live in module-wide variables shared by every
 * tab; it is now stashed per view as composerText/composerImages and restored on
 * switch. Closing or deleting a chat takes its composer with it.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-composer-drafts.js
 */

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

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

const state = (tabId, name) => ({
  tabId,
  cwd: 'C:\\w',
  sessionId: `s-${tabId}`,
  sessionFile: `C:\\d\\${tabId}.jsonl`,
  name,
  model: null,
  models: [],
  guest: false,
  busy: false,
  messages: [],
});

const WORKSPACE = 'C:\\w';
const PIC = { kind: 'image', name: 'a.png', dataUri: 'data:image/png;base64,AAAA' };
const FILE = { kind: 'file', name: 'notes.txt', path: 'C:\\w\\notes.txt' };

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', () => ({
    prefs: { termsAccepted: '2026-11-17', lang: 'th' },
    profile: {},
    lang: 'th',
    lastCwd: WORKSPACE,
    openTabs: [],
  }));
  ipcMain.handle('prefs:set', () => ({ ok: true }));
  ipcMain.handle('prefs:get', () => ({}));
  ipcMain.handle('tab:list', () => []);
  ipcMain.handle('session:list', () => []);
  // The same stubs the sidebar needs when a tab closes / deletes.
  ipcMain.handle('tab:close', () => ({ ok: true, activeTabId: 't2' }));
  ipcMain.handle('tab:state', (_e, tabId) => state(tabId, tabId));

  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 3) console.log('[renderer]', level, message.slice(0, 300));
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const r = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const blank = () => ({
      value: input.value,
      images: pendingImages.length,
      barHidden: attachBar.hidden,
    });

    // Chat A: type a message and stage one picture + one file, never send.
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    input.value = '\\u0e02\\u0e49\\u0e2d\\u0e04\\u0e27\\u0e32\\u0e21\\u0e02\\u0e2d\\u0e07\\u0e41\\u0e0a\\u0e17 A';
    pendingImages.push(${JSON.stringify(PIC)}, ${JSON.stringify(FILE)});
    renderAttachments();
    await wait(30);
    const a = blank();

    // Switch to chat B: nothing carries over.
    applyTabState(${JSON.stringify(state('t2', 'B'))});
    await wait(30);
    const b = blank();

    // Type something in B, then go back to A.
    input.value = '\\u0e02\\u0e49\\u0e2d\\u0e04\\u0e27\\u0e32\\u0e21\\u0e02\\u0e2d\\u0e07\\u0e41\\u0e0a\\u0e17 B';
    autoGrow();
    await wait(30);
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    const backA = blank();

    // And B still has its own words, not A's.
    applyTabState(${JSON.stringify(state('t2', 'B'))});
    await wait(30);
    const backB = blank();

    // Returning to B then leaving again drops B's draft only on the way back in A.
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);

    // Closing chat A (with its draft still staged) must not leak into the next
    // tab. closeTab is async — read the result only once it has landed.
    await closeTab(activeTabId);
    await wait(60);
    const closed = { tab: activeTabId, value: input.value, images: pendingImages.length };

    return { a, b, backA, backB, closed };
  })()`);
  console.log(JSON.stringify(r));

  const A = '\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e41\u0e0a\u0e17 A';
  const B = '\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e02\u0e2d\u0e07\u0e41\u0e0a\u0e17 B';

  check('chat A keeps its words and staged pictures', r.a.value === A && r.a.images === 2 && r.a.barHidden === false, r.a);
  check('switching to B starts empty', r.b.value === '' && r.b.images === 0 && r.b.barHidden === true, r.b);
  check('returning to A restores its own composer', r.backA.value === A && r.backA.images === 2 && r.backA.barHidden === false, r.backA);
  check('B kept its own words', r.backB.value === B && r.backB.images === 0, r.backB);
  check('closing A clears its composer once the close lands', r.closed.images === 0 && r.closed.tab === 't2', r.closed);
  check('the tab after a close does not inherit A\'s words', r.closed.value !== A, r.closed);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: each chat keeps its own composer');
  app.exit(failures ? 1 : 0);
}).catch((err) => {
  console.error('check aborted:', err && err.stack ? err.stack : err);
  app.exit(1);
});

setTimeout(() => {
  console.error('check timed out');
  app.exit(2);
}, 3 * 60 * 1000);