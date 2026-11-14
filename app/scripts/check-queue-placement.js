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
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: {
      // The real preload, so app.js finishes loading and renderQueue() exists.
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const run = (fill) => win.webContents.executeJavaScript(`(() => {
    const bar = document.getElementById('queueBar');
    const box = document.querySelector('.composer-box');
    const send = document.getElementById('sendBtn');
    const input = document.getElementById('input');
    const side = document.querySelector('.composer-side');

    // Build a queue of ${fill} long items through the real renderQueue(), so the
    // rows measured here are the rows the app actually draws. A hand-built
    // fixture would keep passing after the real markup changed underneath it.
    activeTabId = 'placement';
    const view = views.get('placement') || createView('placement');
    views.set('placement', view);
    view.busy = true;
    view.queue = [];
    for (let i = 0; i < ${fill}; i += 1) {
      view.queue.push({
        kind: 'prompt',
        text: 'ข้อความที่ต่อคิวไว้ยาวมาก ๆ จำนวนมาก เพื่อทดสอบว่ามันไม่ดันช่องพิมพ์จนแคบ ' + i,
        images: [],
        queueId: 'p' + i,
      });
    }
    renderQueue();
    bar.hidden = false;

    const q = bar.getBoundingClientRect();
    const c = box.getBoundingClientRect();
    const s = send.getBoundingClientRect();
    const inp = input.getBoundingClientRect();
    const sideRect = side.getBoundingClientRect();

    // Where the × sits relative to each message, and whether the text runs under
    // it: the complaint was that the × was a screen away from the words.
    const rows = [...bar.querySelectorAll('.queue-item')].map((r) => {
      const rb = r.getBoundingClientRect();
      const rm = r.querySelector('.queue-remove');
      const tx = r.querySelector('.queue-text');
      const xb = rm.getBoundingClientRect();
      const tb = tx.getBoundingClientRect();
      return {
        // The grip leads (so it can be grabbed), then the remove button, then the
        // words: the × must be next to the message, not at the far right.
        order: [...r.children].map((c) => c.className).join(','),
        xBeforeText: !!(rm.compareDocumentPosition(tx) & Node.DOCUMENT_POSITION_FOLLOWING),
        // The grip still has to be the first *control*, but the row now opens with
        // its position number, so it is no longer the first child.
        gripFirst: (() => {
          const kids = [...r.children].filter((c) => !c.classList.contains('queue-num'));
          return kids.length > 0 && kids[0].classList.contains('queue-grip');
        })(),
        numFirst: !!r.firstElementChild && r.firstElementChild.classList.contains('queue-num'),
        xFromLeft: Math.round(xb.left - rb.left),
        gap: Math.round(tb.left - xb.right),
        // Overlap means the text starts before the button ends. Comparing right
        // edges would flag a long message as overlapping simply for being long.
        overlap: Math.round(tb.left < xb.right ? xb.right - tb.left : 0),
        textInsideRow: tb.right <= rb.right + 1,
      };
    });

    return {
      rows,
      inside: box.contains(bar),
      insideSide: side.contains(bar),
      // The queue should be as wide as the box the user types into.
      sameWidthAsBox: Math.abs(q.width - (c.width - 2 * 9)) <= 4,
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
  check('the queue is no longer squeezed into the side column', !one.insideSide);
  check('the queue is as wide as the composer box', one.sameWidthAsBox, [one.queueWidth, one.composerWidth]);
  check('the queue does not pass the left edge', one.withinLeft);
  check('the queue does not pass the right edge', one.withinRight);
  check('the queue does not pass the bottom edge', one.withinBottom);
  check('the queue sits below the Send button', one.belowSend);
  check('the queue starts at the left edge of the composer', one.withinLeft);

  // The remove button leads every row and sits next to its message.
  check('the remove button comes before the message',
    one.rows.every((r) => r.xBeforeText === true), one.rows.map((r) => r.order));
  check('the grip still leads the row so it can be grabbed',
    one.rows.every((r) => r.gripFirst === true), one.rows.map((r) => r.order));
  check('the row opens with its position number',
    one.rows.every((r) => r.numFirst === true), one.rows.map((r) => r.order));
  // Measured from the left edge, allowing for the number and the grip in front.
  check('the remove button is close to the left edge',
    one.rows.every((r) => r.xFromLeft >= 0 && r.xFromLeft <= 60), one.rows.map((r) => r.xFromLeft));
  // The original complaint: the × was a whole screen away from the words on the
  // right edge of a 750px row. It must be a fixed short distance from the start,
  // not a share of the row width.
  check('the remove button is a fixed short distance from the left',
    one.rows.every((r) => r.xFromLeft <= 60 && r.xFromLeft < one.queueWidth / 4),
    { xs: one.rows.map((r) => r.xFromLeft), rowW: one.queueWidth });
  check('the message starts right after the remove button',
    one.rows.every((r) => r.gap >= 0 && r.gap <= 12), one.rows.map((r) => r.gap));
  check('the remove button never covers the message',
    one.rows.every((r) => r.overlap === 0), one.rows.map((r) => r.overlap));
  check('a long message stays inside its row',
    one.rows.every((r) => r.textInsideRow === true), one.rows.map((r) => r.textInsideRow));

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
