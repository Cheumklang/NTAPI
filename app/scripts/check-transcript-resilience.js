'use strict';

/**
 * A repaint must never leave the chat short.
 *
 * The bug this exists for: the visible conversation stopped at a point while the
 * session still held everything after it — restarting the app brought the missing
 * part back. `renderActiveTab()` clears the transcript and redraws every message
 * from the top, so one entry the renderer cannot handle ends the loop there: the
 * DOM keeps the prefix, and because the same entry fails again on every repaint,
 * the chat stays short for the rest of the session.
 *
 * Real window, real renderer. One message is poisoned through the markdown
 * renderer (the single call every assistant bubble goes through), and the test
 * asks how many bubbles were drawn afterwards.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-transcript-resilience.js
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
  const poison = 'BOOM';
  const original = MD.renderInto;
  MD.renderInto = function (node, text, options) {
    if (String(text).includes(poison)) throw new Error('cannot render this entry');
    return original.call(MD, node, text, options);
  };

  const messages = [
    { kind: 'user', text: 'คำถามข้อที่หนึ่ง' },
    { kind: 'assistant', text: poison, thinking: '', tools: [] },
    { kind: 'user', text: 'คำถามข้อที่สอง' },
    { kind: 'assistant', text: 'คำตอบข้อที่สอง', thinking: '', tools: [] },
    { kind: 'tool', id: 'tool-1', name: 'bash', text: 'ok', isError: false },
    { kind: 'assistant', text: 'ปิดท้าย', thinking: '', tools: [] },
  ];

  let escaped = null;
  try {
    applyTabState({ tabId: 'probe-tab', cwd: 'C:/NTAPI/NTAPI Chat', sessionId: 'probe', name: 'probe', model: null, messages });
  } catch (err) {
    escaped = err && err.message ? err.message : String(err);
  }

  const bubbles = [...document.querySelectorAll('#transcript .msg')];
  const texts = bubbles.map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim());
  MD.renderInto = original;
  return {
    count: bubbles.length,
    kinds: bubbles.map((b) => b.className.replace('msg ', '')),
    whole: texts.join(' || '),
    escaped,
  };
})()`;

app.whenReady()
  .then(async () => {
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
    const uiLogs = [];
    win.webContents.on('console-message', (e) => {
      if (String(e.message || '').includes('[transcript]')) uiLogs.push(e.message);
    });
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 600));

    const res = await win.webContents.executeJavaScript(PROBE);
    console.log(JSON.stringify(res));

    check('the repaint does not throw out of applyTabState', res.escaped === null, res.escaped);
    // Four messages that each own a bubble: two questions and the answers below
    // them. Before the per-entry guard this was 2 — the transcript stopped at the
    // poisoned entry and everything after it was never drawn.
    check('every message after the poisoned one still draws', res.count >= 4, { bubbles: res.count });
    check('the last message of the chat is on screen', res.whole.includes('ปิดท้าย'), res.whole.slice(-80));
    check('the message after the gap is on screen', res.whole.includes('คำตอบข้อที่สอง'), 'missing tail');
    check('the gap is reported, not swallowed', uiLogs.length > 0, { reports: uiLogs.length });
    if (uiLogs.length) {
      check('the report names the entry that failed', uiLogs[0].includes('#1'), uiLogs[0].slice(0, 120));
    }

    win.destroy();
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll transcript resilience checks passed');
    app.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error('check aborted:', err && err.stack ? err.stack : err);
    app.exit(2);
  });

setTimeout(() => {
  console.error('check timed out');
  app.exit(3);
}, 2 * 60 * 1000);