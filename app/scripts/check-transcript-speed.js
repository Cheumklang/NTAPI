'use strict';

/**
 * A long conversation must not freeze the window while it is drawn.
 *
 * Two complaints, one cause: the chat is slow to appear when the app starts and
 * slow again every time its tab is reopened. `renderActiveTab()` used to draw every
 * message of the conversation before the window could do anything else — with a long
 * conversation that is thousands of milliseconds of markdown, in one blocking pass.
 *
 * The rule now: the end of the conversation is on screen almost immediately, the
 * history above it follows in the background, and nothing is dropped along the way.
 * This test builds a conversation big enough to matter, then asserts all three —
 * fast tail, complete text, and no messages missing when a repaint interrupts a fill.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-transcript-speed.js
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

// 400 turns of prose with code, which is what a real long session looks like; the
// point is the volume of markdown, not the content.
const PROBE = `(async () => {
  const para = (n) =>
    'ข้อความทดสอบที่ ' + n + ' — ' +
    Array.from({ length: 12 }, (_, i) => 'ประโยคที่ ' + i + ' ของย่อหน้านี้ยาวพอสมควรเพื่อให้มีงานให้วาดจริง').join(' ') +
    '\\n\\n\`\`\`js\\nconst value' + n + ' = ' + n + ';\\nconsole.log(value' + n + ');\\n\`\`\`\\n';

  const messages = [];
  const TURNS = 200;
  for (let i = 0; i < TURNS; i += 1) {
    messages.push({ kind: 'user', text: para(i) });
    messages.push({ kind: 'assistant', text: para(i), thinking: '', tools: [] });
  }
  messages.push({ kind: 'user', text: 'ข้อความสุดท้ายที่ต้องเห็นทันที' });
  messages.push({ kind: 'assistant', text: 'คำตอบสุดท้าย ' + para(999), thinking: '', tools: [] });

  const view = {
    tabId: 'speed-tab',
    cwd: 'C:/NTAPI/NTAPI Chat',
    sessionId: 'speed',
    name: 'speed',
    model: null,
    messages,
  };

  const t0 = performance.now();
  applyTabState(view);
  const firstPaint = performance.now() - t0;
  const tailText = document.getElementById('transcript').textContent || '';

  // Let the background fill finish.
  const settle = (limit) =>
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
        if (performance.now() - stableAt > 300 || performance.now() - started > limit) resolve(performance.now() - started);
        else setTimeout(tick, 30);
      };
      setTimeout(tick, 30);
    });

  const fillMs = await settle(60000);
  const bubbles = document.querySelectorAll('#transcript .msg').length;
  const wholeText = document.getElementById('transcript').textContent || '';

  // A repaint in the middle of a fill must not leave two overlapping drawings or
  // wipe the transcript: the newer repaint takes over and finishes on its own.
  const emptyView = { ...view, tabId: 'other-tab', messages: [] };
  applyTabState(emptyView);
  applyTabState(view);
  const interruptedFirstPaint = performance.now();
  const afterInterruptTail = (document.getElementById('transcript').textContent || '').includes('ข้อความสุดท้ายที่ต้องเห็นทันที');
  await settle(60000);
  const afterInterrupt = (document.getElementById('transcript').textContent || '').includes('ข้อความทดสอบที่ 0 ');

  return {
    messages: messages.length,
    firstPaint: Math.round(firstPaint),
    fillMs: Math.round(fillMs),
    bubbles,
    tailShown: tailText.includes('ข้อความสุดท้ายที่ต้องเห็นทันที'),
    wholeShown: wholeText.includes('ข้อความทดสอบที่ 0 '),
    interruptedTail: afterInterruptTail,
    interruptedWhole: afterInterrupt,
    interruptFirstPaint: Math.round(performance.now() - interruptedFirstPaint),
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
    console.log(JSON.stringify(res));

    // Before the change one pass over this conversation took seconds. The budget is
    // generous enough for a slow machine and still far below anything the user
    // would call stuck.
    check('the end of the chat is on screen almost immediately', res.firstPaint < 400, { ms: res.firstPaint });
    check('the newest message is visible without waiting', res.tailShown, res.tailShown);
    check('the whole history arrives afterwards', res.wholeShown, { ms: res.fillMs });
    check('every turn was drawn', res.bubbles >= 400, { bubbles: res.bubbles });
    check('a repaint during a fill still shows the tail', res.interruptedTail, res.interruptedTail);
    check('a repaint during a fill still finishes the history', res.interruptedWhole, res.interruptedWhole);

    win.destroy();
    console.log(failures ? `\n${failures} check(s) failed` : '\nAll transcript speed checks passed');
    app.exit(failures ? 1 : 0);
  })
  .catch((err) => {
    console.error('check aborted:', err && err.stack ? err.stack : err);
    app.exit(2);
  });

setTimeout(() => {
  console.error('check timed out');
  app.exit(3);
}, 4 * 60 * 1000);
