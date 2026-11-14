/**
 * The numbers show the right order, and the ghost stays small.
 *
 * Measured on the running renderer: the source can show a `queue-num` element
 * exists, but not that it reads 1, 2, 3 in the right rows, or that the ghost is
 * smaller than the queue instead of spanning it.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-queue-number.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
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

const LONG = 'ข้อความยาวมากๆ ที่ผู้ใช้พิมพ์มาทั้งหมดเพื่อทดสอบการตัดข้อความของ ghost ว่ายาวเกินไปหรือไม่';

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  // --- numbering ---------------------------------------------------------
  const nums = await win.webContents.executeJavaScript(`(async () => {
    activeTabId = 'qn';
    const v = views.get('qn') || createView('qn');
    views.set('qn', v);
    v.queue = [
      { kind: 'prompt', queueId: 'a', text: 'ข้อความสั้น' },
      { kind: 'prompt', queueId: 'b', text: ${JSON.stringify(LONG)} },
      { kind: 'prompt', queueId: 'c', text: 'อันที่สาม' },
    ];
    renderQueue();
    const bar = document.getElementById('queueBar');
    bar.hidden = false;
    const rows = [...bar.querySelectorAll('.queue-item')];
    return {
      labels: rows.map((r) => r.querySelector('.queue-num') ? r.querySelector('.queue-num').textContent : null),
      aria: rows.map((r) => {
        const n = r.querySelector('.queue-num');
        return n ? n.getAttribute('aria-label') : null;
      }),
      // Left-to-right: the index must come before the handle, the controls and the words.
      offsets: rows.map((r) => {
        const base = r.getBoundingClientRect().left;
        const at = (sel) => {
          const n = r.querySelector(sel);
          return n ? Math.round(n.getBoundingClientRect().left - base) : null;
        };
        return { num: at('.queue-num'), grip: at('.queue-grip'), edit: at('.queue-edit-btn'), text: at('.queue-text') };
      }),
      barWidth: Math.round(bar.getBoundingClientRect().width),
    };
  })()`);

  check('every row is numbered', nums.labels.every((l) => l !== null), nums.labels);
  check('the numbers count from one', nums.labels.join(',') === '1,2,3', nums.labels);
  check('the number is announced with its position',
    nums.aria.every((a) => a && a.includes('1') || a && a.includes('2') || a && a.includes('3')), nums.aria);
  check('the number leads the row',
    nums.offsets.every((o) => o.num !== null && o.grip !== null && o.num <= o.grip), nums.offsets);
  check('the number comes before the words',
    nums.offsets.every((o) => o.num < o.text), nums.offsets);

  // --- numbering follows a reorder ---------------------------------------
  const reordered = await win.webContents.executeJavaScript(`(async () => {
    moveQueueItem('c', -1);
    await new Promise((r) => setTimeout(r, 80));
    const rows = [...document.querySelectorAll('#queueBar .queue-item')];
    return {
      labels: rows.map((r) => r.querySelector('.queue-num').textContent),
      texts: rows.map((r) => r.querySelector('.queue-text').textContent),
    };
  })()`);
  check('renumbering follows the new order',
    reordered.labels.join(',') === '1,2,3', reordered);
  check('the message that moved is now second',
    reordered.texts[1] === 'อันที่สาม', reordered.texts);

  // --- the ghost is small ------------------------------------------------
  const ghost = await win.webContents.executeJavaScript(`(() => {
    // Pick the long row by its text, not by position: the reorder above moved it.
    const rows = [...document.querySelectorAll('#queueBar .queue-item')];
    const row = rows.find((r) => (r.querySelector('.queue-text') || {}).textContent === ${JSON.stringify(LONG)});
    const r = row.getBoundingClientRect();
    row.querySelector('.queue-grip').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: r.left + 4, clientY: r.top + 8,
    }));
    const g = document.querySelector('.queue-ghost');
    if (!g) return { missing: true };
    const gb = g.getBoundingClientRect();
    const bar = document.getElementById('queueBar').getBoundingClientRect();
    const text = g.textContent;
    const result = {
      width: Math.round(gb.width),
      height: Math.round(gb.height),
      barWidth: Math.round(bar.width),
      text,
      chars: [...text].length,
      endsWithEllipsis: text.endsWith('\u2026'),
      // A full-width band covered the list; a pill leaves it visible.
      narrowerThanBar: gb.width < bar.width * 0.6,
      pointerEvents: getComputedStyle(g).pointerEvents,
    };
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: r.top + 8 }));
    return result;
  })()`);

  check('the ghost still appears', ghost.missing !== true, ghost);
  check('the ghost is a small pill, not a band', ghost.narrowerThanBar === true,
    { ghost: ghost.width, bar: ghost.barWidth });
  check('the ghost is far narrower than the queue', ghost.width <= 300, { width: ghost.width });
  check('the ghost is a single short line', ghost.height <= 30, { height: ghost.height });
  check('a long message is cut', ghost.chars <= 40, { chars: ghost.chars });
  check('the cut is marked with an ellipsis', ghost.endsWithEllipsis === true, ghost.text);
  check('the ghost does not show the whole message', ghost.text !== LONG, ghost.text);
  check('the ghost still never eats the pointer', ghost.pointerEvents === 'none', ghost);

  // Thai must not be cut mid-character: no stray combining mark should open the
  // string, which is what a UTF-16 slice can produce.
  const first = ghost.text ? ghost.text.codePointAt(0) : null;
  check('the label starts on a real character, not a dangling mark',
    first !== null && !(first >= 0x0e31 && first <= 0x0e4e), { first });
  check('no replacement character crept in', !ghost.text.includes('\ufffd'), ghost.text);

  // --- a short message keeps its whole label -----------------------------
  const shortGhost = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelectorAll('#queueBar .queue-item')[0];
    const r = row.getBoundingClientRect();
    row.querySelector('.queue-grip').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: r.left + 4, clientY: r.top + 8,
    }));
    const g = document.querySelector('.queue-ghost');
    const text = g ? g.textContent : null;
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: r.top + 8 }));
    return { text };
  })()`);
  check('a short message is shown whole', shortGhost.text === 'ข้อความสั้น', shortGhost);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll queue number and ghost-size checks passed in the running renderer');
  app.exit(0);
});
