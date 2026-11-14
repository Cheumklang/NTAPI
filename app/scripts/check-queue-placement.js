'use strict';

/**
 * Prove the queue really renders inside the composer box, under the buttons.
 *
 * The static test can only see source order. This one loads the real page and
 * measures pixels, because the bug was a layout bug: the queue sat outside the
 * box and pushed the chat up.
 *
 * Checks:
 *   1. #queueBar is a DOM descendant of .composer-box
 *   2. the queue's rect stays inside the composer's rect on every side
 *   3. the queue sits below the Send button (bottom-right, as asked)
 *   4. the queue never makes the composer wider than --read-width
 *   5. a very long queued message does not push the textarea down to nothing
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-queue-placement.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 800 });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const run = (fill) => win.webContents.executeJavaScript(`(() => {
    const bar = document.getElementById('queueBar');
    const box = document.querySelector('.composer-box');
    const send = document.getElementById('sendBtn');
    const input = document.getElementById('input');
    const side = document.querySelector('.composer-side');

    // Build a fake queue of ${fill} long items.
    bar.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'queue-head';
    head.textContent = 'ในคิว: ${fill}';
    bar.append(head);
    for (let i = 0; i < ${fill}; i += 1) {
      const row = document.createElement('div');
      row.className = 'queue-item';
      const t = document.createElement('span');
      t.className = 'queue-text';
      t.textContent = 'ข้อความที่ต่อคิวไว้ยาวมาก ๆ จำนวนมาก เพื่อทดสอบว่ามันไม่ดันช่องพิมพ์จนแคบ ' + i;
      const b = document.createElement('button');
      b.textContent = '×';
      row.append(t, b);
      bar.append(row);
    }
    bar.hidden = false;

    const q = bar.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    const s = send.getBoundingClientRect();
    const inp = input.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();

    return {
      inside: box.contains(bar),
      insideSide: side.contains(bar),
      // Allow 1px of subpixel slack.
      withinLeft: q.left >= c.left - 1,
      withinRight: q.right <= c.right + 1,
      withinBottom: q.bottom <= c.bottom + 1,
      belowSend: q.top >= s.top - 1,
      rightAligned: Math.abs(q.right - sideRect.right) <= 2,
      composerWidth: Math.round(c.width),
      queueWidth: Math.round(q.width),
      inputWidth: Math.round(inp.width),
      queueBottom: Math.round(q.bottom),
      boxBottom: Math.round(c.bottom),
    };
  })()`);

  const results = [];
  function check(name, ok) {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  }

  const one = await run(1);
  console.log('  geometry:', JSON.stringify(one));
  check('the queue is a descendant of the composer box', one.inside);
  check('the queue is inside the right-hand column', one.insideSide);
  check('the queue does not pass the left edge', one.withinLeft);
  check('the queue does not pass the right edge', one.withinRight);
  check('the queue does not pass the bottom edge', one.withinBottom);
  check('the queue sits below the Send button', one.belowSend);
  check('the queue is right-aligned in its column', one.rightAligned);

  const many = await run(6);
  console.log('  geometry (6 items):', JSON.stringify(many));
  check('six items stay inside the box', many.withinLeft && many.withinRight && many.withinBottom);
  check('six items still leave the textarea usable', many.inputWidth >= 120);
  check('six items do not widen the composer', many.composerWidth === one.composerWidth);

  // Narrow window: the queue must not squeeze the textarea to nothing.
  win.setSize(680, 800);
  await new Promise((r) => setTimeout(r, 250));
  const narrow = await run(6);
  console.log('  geometry (narrow):', JSON.stringify(narrow));
  check('narrow window keeps the textarea usable', narrow.inputWidth >= 100);
  check('narrow window keeps the queue inside the box',
    narrow.withinLeft && narrow.withinRight && narrow.withinBottom);

  const failed = results.filter((r) => !r).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll queue placement checks passed');
  app.exit(0);
}).catch((err) => {
  console.error('runner error:', err);
  app.exit(1);
});
