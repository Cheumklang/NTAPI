'use strict';

/**
 * How long a repaint of a real conversation takes.
 *
 * Both symptoms this is for are "the window feels stuck" for no visible reason: a
 * chat is slow to appear when the app starts, and slow again each time you come
 * back to its tab. `renderActiveTab()` rebuilds the whole transcript on every one
 * of those, and a long conversation is a megabyte of markdown through the
 * highlighter, so the number this prints is the number the user waits.
 *
 *   node_modules/electron/dist/electron.exe scripts/bench-transcript.js <messages.json>
 *
 * The JSON is an array of pi transcript messages — see scripts/probe-transcript-replay.js
 * for how to export one from a .jsonl session file. Nothing here asserts; it
 * reports. Use it before and after a change to see whether the change did anything.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

const file = process.argv[2];
if (!file) {
  console.error('usage: bench-transcript.js <messages.json>');
  app.exit(2);
}

const TRANSFORM = fs.readFileSync(path.join(__dirname, 'probe-transcript-replay.js'), 'utf8');
const RAW = fs.readFileSync(file, 'utf8');

// Reuse the shape the real renderer receives, so the benchmark measures the same
// work the app does rather than a synthetic string.
const fnStart = TRANSFORM.indexOf('const TRANSFORM = `');
const fnBody = TRANSFORM.slice(fnStart + 'const TRANSFORM = `'.length);
const TRANSFORM_SRC = fnBody.slice(0, fnBody.indexOf('`;'));

const PROBE = `(async () => {
  const messages = (${TRANSFORM_SRC})(${JSON.stringify(JSON.parse(RAW))});
  const view = {
    tabId: 'bench-tab',
    cwd: 'C:/NTAPI/NTAPI Chat',
    sessionId: 'bench',
    name: 'bench',
    model: null,
    messages,
  };

  const time = (fn) => {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  };

  // The history above the tail is filled in after the window is usable, so the
  // interesting numbers are both: how long until the reader sees the end of the
  // chat, and how long until the whole thing is there.
  const settle = (ms) =>
    new Promise((resolve) => {
      let last = -1;
      let stableAt = 0;
      const started = performance.now();
      const tick = () => {
        const count = document.querySelectorAll('#transcript .msg').length;
        if (count !== last) {
          last = count;
          stableAt = performance.now();
        }
        if (performance.now() - stableAt > 250 || performance.now() - started > ms) resolve(performance.now() - started);
        else setTimeout(tick, 25);
      };
      setTimeout(tick, 25);
    });

  const cold = time(() => applyTabState(view));
  const coldBubbles = document.querySelectorAll('#transcript .msg').length;
  const coldFull = Math.round(cold + (await settle(60000)));

  // The tab-switch case: the same conversation, rendered again after coming back.
  const warm = time(() => applyTabState({ ...view, messages: view.messages.slice() }));
  const warmBubbles = document.querySelectorAll('#transcript .msg').length;
  const warmFull = Math.round(warm + (await settle(60000)));

  return {
    messages: messages.length,
    bytes: JSON.stringify(messages).length,
    cold: Math.round(cold),
    coldBubbles,
    coldFull,
    warm: Math.round(warm),
    warmBubbles,
    warmFull,
    bubbles: document.querySelectorAll('#transcript .msg').length,
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
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 600));

    const res = await win.webContents.executeJavaScript(PROBE);
    console.log(JSON.stringify(res, null, 2));
    console.log(
      `${res.messages} messages, ${(res.bytes / 1024).toFixed(0)} KB
` +
        `  first open:    ${res.cold} ms for the end of the chat (${res.coldBubbles} bubbles), ` +
        `${res.coldFull} ms complete (${res.bubbles} bubbles)
` +
        `  returning:     ${res.warm} ms for the end of the chat (${res.warmBubbles} bubbles), ` +
        `${res.warmFull} ms complete`
    );

    win.destroy();
    app.exit(0);
  })
  .catch((err) => {
    console.error('bench aborted:', err && err.stack ? err.stack : err);
    app.exit(2);
  });

setTimeout(() => {
  console.error('bench timed out');
  app.exit(3);
}, 5 * 60 * 1000);
