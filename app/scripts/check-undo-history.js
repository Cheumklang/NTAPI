'use strict';

/**
 * The undo button, measured in a real window.
 *
 * A session-level undo moves the session leaf (SDK repro proves the state that
 * main sends is already correct), so the only way the undone bubble can survive
 * is inside the renderer. This drives the real renderer + preload: it applies a
 * fake tab state, clicks #undoBtn, and replays the `agent:history` event main
 * would send after a successful undo.
 *
 * Two scenarios:
 *   A. clean undo — no pending copy on the renderer side. The bubble must go.
 *   B. undo while a pending copy of the same text survives (the "message may not
 *      have been claimed by the session's history events yet" case). The pending
 *      merge is the documented suspect for the bubble coming back.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-undo-history.js
 */

const path = require('node:path');
const os = require('node:os');
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

const CWD = os.tmpdir();
const tabId = 't-undo';
const MSGS = {
  grouped: [
    { kind: 'user', text: 'first question', images: [] },
    { kind: 'assistant', text: 'answer one' },
    { kind: 'user', text: 'second question', images: [] },
    { kind: 'assistant', text: 'answer two' },
  ],
  undone: [
    { kind: 'user', text: 'first question', images: [] },
    { kind: 'assistant', text: 'answer one' },
  ],
};
const state = (messages, extra = {}) => ({
  tabId,
  cwd: CWD,
  sessionId: 'sess-undo-test',
  sessionFile: path.join(CWD, '.ntapi', 'sessions', 'sess-undo-test.json'),
  name: 'undo test',
  model: null,
  models: [],
  guest: false,
  busy: false,
  messages,
  ...extra,
});

// The main-process side, mimicked: undo returns the restored text and then
// broadcasts the new session state exactly like afterHistoryChange does.
const pendingA = {};
let win = null;
const HISTORY_DELAY = 60;

async function main() {
  ipcMain.handle('app:boot', () => ({
    prefs: { termsAccepted: '2026-11-17', lang: 'th' },
    profile: {},
    lang: 'th',
    lastCwd: CWD,
    openTabs: [],
  }));
  ipcMain.handle('prefs:set', () => ({ ok: true }));
  ipcMain.handle('prefs:get', () => ({}));
  ipcMain.handle('tab:list', () => []);
  ipcMain.handle('session:undo', (_e, callerTabId) => {
    if (pendingA.reject) return { ok: false, reason: pendingA.reject };
    if (win && !win.isDestroyed()) {
      setTimeout(() => {
        win.webContents.send('agent:history', { tabId: callerTabId, state: state(MSGS.undone) });
      }, HISTORY_DELAY);
    }
    return { ok: true, text: 'second question', entryId: 'e-2' };
  });

  win = new BrowserWindow({
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
    if (level >= 2) console.log('[renderer]', level, message.slice(0, 300));
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  // Scenario A: a clean undo; the bubble has to disappear.
  {
    const a = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      applyTabState(${JSON.stringify(state(MSGS.grouped))});
      await wait(50);
      const beforeCount = document.querySelectorAll('.msg').length +
        document.querySelectorAll('[data-kind="user"], [data-kind="assistant"]').length;
      const shownBefore = document.body.textContent.includes('second question');
      document.getElementById('undoBtn').click();
      await wait(${HISTORY_DELAY + 120});
      return {
        shownBefore,
        input: document.getElementById('input').value,
        shownAfter: document.body.textContent.includes('second question'),
        secondCount: document.body.textContent.split('second question').length - 1,
      };
    })()`);
    console.log('scenario A:', JSON.stringify(a));
    check('A: the message was visible before the undo', a.shownBefore === true);
    check('A: undo restores the message into the input', a.input === 'second question', { input: a.input });
    check('A: the undone bubble leaves the transcript', a.shownAfter === false, { secondCount: a.secondCount });
  }

  // Scenario B: a pending copy of the same text is still floating on the
  // renderer side (the session never claimed it before the undo landed).
  {
    pendingA.reject = null;
    const b = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      applyTabState(${JSON.stringify(state(MSGS.grouped))});
      const view = activeView();
      view.messages.push({ kind: 'user', text: 'second question', images: [], pending: true, pendingAt: 2 });
      await wait(50);
      document.getElementById('undoBtn').click();
      await wait(${HISTORY_DELAY + 120});
      return {
        stillPending: view.messages.some((m) => m.pending && m.text === 'second question'),
        shownAfter: document.body.textContent.includes('second question'),
        secondCount: document.body.textContent.split('second question').length - 1,
        input: document.getElementById('input').value,
      };
    })()`);
    console.log('scenario B:', JSON.stringify(b));
    check('B: undo restores the message into the input', b.input === 'second question', { input: b.input });
    check('B: the undone bubble leaves the transcript even with a pending copy', b.shownAfter === false, b);
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll undo-history checks passed');
  app.exit(failures ? 1 : 0);
}

app.whenReady().then(main).catch((err) => {
  console.error('check aborted:', err && err.stack ? err.stack : err);
  app.exit(1);
});

setTimeout(() => {
  console.error('check timed out');
  app.exit(2);
}, 3 * 60 * 1000);