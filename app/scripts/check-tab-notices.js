'use strict';

/**
 * A notice belongs to the chat that raised it.
 *
 * Reproduces the report: run /compact (which shows “กำลังย่อบทสนทนา…” with no
 * timeout on a single shared notice bar), switch to another chat — the message
 * used to follow the person there. It is now parked per view: hidden when the
 * owning tab leaves the screen, restored (with remaining time) when it returns.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-tab-notices.js
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

const COMPACTING = '\u0e01\u0e33\u0e25\u0e31\u0e07\u0e22\u0e48\u0e2d\u0e1a\u0e1a\u0e17\u0e2a\u0e19\u0e17\u0e19\u0e32\u2026';

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

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', () => ({
    prefs: { termsAccepted: '2026-11-17', lang: 'th' },
    profile: {},
    lang: 'th',
    lastCwd: 'C:\\w',
    openTabs: [],
  }));
  ipcMain.handle('prefs:set', () => ({ ok: true }));
  ipcMain.handle('prefs:get', () => ({}));
  ipcMain.handle('tab:list', () => []);
  ipcMain.handle('session:list', () => []);

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
    if (level >= 3) console.log('[renderer]', level, String(message).slice(0, 300));
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const r = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const bar = () => ({ hidden: noticeEl.hidden, text: noticeEl.textContent });

    // Chat A: /compact starts, holding its notice with no timeout.
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    showNotice(${JSON.stringify(COMPACTING)}, 0, 't1');
    await wait(30);
    const atA = bar();

    // Switch to B: A's notice must not follow.
    applyTabState(${JSON.stringify(state('t2', 'B'))});
    await wait(30);
    const atB = bar();

    // Come back to A: its own notice is still there.
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    const backA = bar();

    // A timed notice ("ย่อประวัติแล้ว") parked while away, still within its window.
    showNotice('\u0e22\u0e48\u0e2d\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e41\u0e25\u0e49\u0e27', 3000, 't1');
    await wait(30);
    applyTabState(${JSON.stringify(state('t2', 'B'))});
    await wait(30);
    const timedAtB = bar();
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    const timedBack = bar();

    // A timed notice that expired while the tab was away must NOT come back.
    showNotice('\u0e2b\u0e21\u0e14\u0e2d\u0e32\u0e22\u0e38', 100, 't1');
    await wait(30);
    applyTabState(${JSON.stringify(state('t2', 'B'))});
    await wait(200);
    applyTabState(${JSON.stringify(state('t1', 'A'))});
    await wait(30);
    const expired = bar();

    return { atA, atB, backA, timedAtB, timedBack, expired };
  })()`);
  console.log(JSON.stringify(r));

  check('the notice shows in the chat that started it', !r.atA.hidden && r.atA.text.includes(COMPACTING), r.atA);
  check('switching away hides the other chat\'s notice', r.atB.hidden && r.atB.text === '', r.atB);
  check('coming back restores the sticky notice', !r.backA.hidden && r.backA.text.includes(COMPACTING), r.backA);
  check('a timed notice is hidden while its tab is away', r.timedAtB.hidden, r.timedAtB);
  check('a timed notice returns with time left', !r.timedBack.hidden && r.timedBack.text.includes('\u0e22\u0e48\u0e2d\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e41\u0e25\u0e49\u0e27'), r.timedBack);
  check('a notice that expired while away does not come back', r.expired.hidden && r.expired.text === '', r.expired);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: each chat shows only its own notice');
  app.exit(failures ? 1 : 0);
}).catch((err) => {
  console.error('check aborted:', err && err.stack ? err.stack : err);
  app.exit(1);
});

setTimeout(() => {
  console.error('check timed out');
  app.exit(2);
}, 3 * 60 * 1000);