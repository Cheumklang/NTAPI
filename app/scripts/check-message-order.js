/**
 * Your own message stays above the work it started — even after a tab switch.
 *
 * The report: with a turn in flight, the reader's message was drawn above the
 * answer it caused. After switching to another chat and back, the repaint showed
 * the message *below* the answer. The session file is the authority on order, but
 * main has not written the prompt yet, so the repaint merged the local pending
 * copy back into the transcript by appending it to the end — below the reply that
 * was already streaming.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-message-order.js
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const u = (text) => ({ kind: 'user', text });
const a = (text) => ({ kind: 'assistant', text, thinking: '', tools: [] });

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));
  const run = (expr) => win.webContents.executeJavaScript(expr);

  const kinds = (messages) => messages.map((m) => m.text);

  // The scenario: earlier messages exist, the reader sends "my question" while a
  // turn keeps producing assistant work that the session file still lacks. It is
  // the reply that is missing "my question", not the work.
  const merged = await run(`(() => {
    const view = {
      tabId: 't',
      messages: [
        ${JSON.stringify(u('first question'))},
        ${JSON.stringify(a('first answer'))},
        // the reader sends a message into the running turn:
        Object.assign(${JSON.stringify(u('my question'))}, { pending: true, pendingAt: 2 }),
      ],
    };
    const incoming = [
      ${JSON.stringify(u('first question'))},
      ${JSON.stringify(a('first answer'))},
      ${JSON.stringify(a('work that the question started'))},
    ];
    return mergeIncomingMessages(view, incoming);
  })()`);
  const order = kinds(merged);
  check('the message is kept (the session has not flushed it yet)',
    merged.some((m) => m.pending === true), order);
  check('the message sits above the answer it started',
    order.indexOf('my question') < order.indexOf('work that the question started'), order);
  check('earlier history keeps its order', order[0] === 'first question' && order[1] === 'first answer', order);

  // Once the session does contain the prompt, the pending copy is dropped and the
  // order comes from the session itself — no duplicate under the answer.
  const hasIt = await run(`(() => {
    const view = {
      tabId: 't',
      messages: [
        ${JSON.stringify(u('first question'))},
        ${JSON.stringify(a('first answer'))},
        Object.assign(${JSON.stringify(u('my question'))}, { pending: true, pendingAt: 2 }),
      ],
    };
    const incoming = [
      ${JSON.stringify(u('first question'))},
      ${JSON.stringify(a('first answer'))},
      ${JSON.stringify(u('my question'))},
      ${JSON.stringify(a('work that the question started'))},
    ];
    return mergeIncomingMessages(view, incoming);
  })()`);
  const order2 = kinds(hasIt);
  check('a flushed message is not duplicated',
    hasIt.filter((m) => m.text === 'my question').length === 1, order2);
  check('a flushed message follows the session order',
    order2.indexOf('my question') < order2.indexOf('work that the question started'), order2);

  // A stale slot (messages trimmed since) must clamp instead of pushing past the end.
  const clamped = await run(`(() => {
    const view = {
      tabId: 't',
      messages: [
        ${JSON.stringify(u('last question'))},
        Object.assign(${JSON.stringify(u('orphan'))}, { pending: true, pendingAt: 9 }),
      ],
    };
    const incoming = [${JSON.stringify(u('last question'))}];
    const out = mergeIncomingMessages(view, incoming);
    return { length: out.length, last: out[out.length - 1].text };
  })()`);
  check('an out-of-range slot clamps to the end', clamped.length === 2 && clamped.last === 'orphan', clamped);

  // And the real path: a full repaint through applyTabState must draw the message
  // above the streaming answer, as the live view had it.
  const state = {
    tabId: 't',
    cwd: 'C:\\w',
    sessionId: 's',
    sessionFile: 'C:\\d\\s.jsonl',
    name: 'n',
    model: { provider: 'free-pi', id: 'm', name: 'M' },
    models: [],
    guest: false,
    busy: true,
    messages: [
      u('first question'),
      a('first answer'),
      a('work that the question started'),
      { kind: 'assistant', text: '', thinking: '', tools: [] },
    ],
  };
  await run(`(() => {
    const view = views.get('t') || createView('t');
    view.messages = [
      ${JSON.stringify(u('first question'))},
      ${JSON.stringify(a('first answer'))},
      Object.assign(${JSON.stringify(u('my question'))}, { pending: true, pendingAt: 2 }),
    ];
    views.set('t', view);
    activeTabId = 't';
    applyTabState(${JSON.stringify(state)});
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 150));
  const drawn = await run(`(() => {
    const texts = [...document.querySelectorAll('.msg')].map((w) => {
      const role = w.querySelector('.role');
      return { role: role ? role.textContent : '?', text: w.textContent.slice(0, 80) };
    });
    const userIdx = texts.findIndex((m) => m.text.includes('my question'));
    const workIdx = texts.findIndex((m) => m.text.includes('work that the question started'));
    return { userIdx, workIdx, texts: texts.map((m) => m.role + ':' + m.text.slice(0, 26)) };
  })()`);
  check('a full repaint draws the question above the answer',
    drawn.userIdx >= 0 && drawn.userIdx < drawn.workIdx, { ...drawn, userIdx: drawn.userIdx, workIdx: drawn.workIdx });

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: your message stays above its answer across repaints');
  app.exit(failures ? 1 : 0);
});