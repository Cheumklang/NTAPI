/**
 * The queue row's controls really are in front, and a drag really shows a ghost.
 *
 * Measured on the running renderer: reading order from the stylesheet or the
 * markup proves nothing about what a reader sees, so this compares the laid-out
 * positions of the controls against the position of the words.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-queue-controls.js
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

  const setup = await win.webContents.executeJavaScript(`(async () => {
    activeTabId = 'qc';
    const v = views.get('qc') || createView('qc');
    views.set('qc', v);
    v.queue = [
      { kind: 'prompt', queueId: 'q1', text: 'ข้อความแรกที่รออยู่ในคิว' },
      { kind: 'prompt', queueId: 'q2', text: 'ข้อความที่สอง' },
    ];
    renderQueue();
    const bar = document.getElementById('queueBar');
    bar.hidden = false;
    const row = bar.querySelector('.queue-item');
    return { rows: bar.querySelectorAll('.queue-item').length, hasRow: Boolean(row) };
  })()`);
  check('the queue paints its rows', setup.rows === 2, setup);

  // --- reading order on screen -------------------------------------------
  const order = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('#queueBar .queue-item');
    const r = row.getBoundingClientRect();
    const at = (sel) => {
      const n = row.querySelector(sel);
      if (!n) return null;
      const b = n.getBoundingClientRect();
      return { left: Math.round(b.left - r.left), width: Math.round(b.width) };
    };
    return { grip: at('.queue-grip'), edit: at('.queue-edit-btn'), remove: at('.queue-remove'), text: at('.queue-text') };
  })()`);

  check('the row has a drag handle', order.grip !== null, order);
  check('the row has an edit control', order.edit !== null, order);
  check('the row has a remove control', order.remove !== null, order);
  check('the pencil sits in front of the words',
    order.edit.left < order.text.left, { edit: order.edit.left, text: order.text.left });
  check('the × sits behind the pencil',
    order.remove.left > order.edit.left, { remove: order.remove.left, edit: order.edit.left });
  check('all three controls are in front of the words',
    order.grip.left < order.text.left && order.remove.left < order.text.left, order);
  // A short distance, not "somewhere before": the point was to stop crossing the row.
  check('the pencil is a short distance from the left edge',
    order.edit.left <= 40, { edit: order.edit.left });
  check('the pencil does not overlap the words',
    order.edit.left + order.edit.width <= order.text.left + 1,
    { editEnd: order.edit.left + order.edit.width, text: order.text.left });

  // --- the pencil is a glyph and is announced -----------------------------
  const glyph = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('#queueBar .queue-item');
    const e = row.querySelector('.queue-edit-btn');
    return { text: e.textContent, title: e.title, label: e.getAttribute('aria-label'),
      opacity: getComputedStyle(e).opacity,
      removeOpacity: getComputedStyle(row.querySelector('.queue-remove')).opacity };
  })()`);
  check('the edit control shows a pencil glyph', glyph.text.charCodeAt(0) === 0x270e, glyph);
  check('the word "edit" is not spelled out in the row', !/edit/i.test(glyph.text), glyph);
  check('the pencil has a tooltip', Boolean(glyph.title), glyph);
  check('the pencil has an accessible name', Boolean(glyph.label), glyph);
  check('the pencil is visible without hovering', Number(glyph.opacity) > 0.1, glyph);
  check('the × is visible without hovering', Number(glyph.removeOpacity) > 0.1, glyph);

  // --- the ghost while dragging ------------------------------------------
  const drag = await win.webContents.executeJavaScript(`(async () => {
    const row = document.querySelector('#queueBar .queue-item');
    const r = row.getBoundingClientRect();
    const grip = row.querySelector('.queue-grip');
    const startY = r.top + r.height / 2;
    grip.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: r.left + 4, clientY: startY,
    }));
    const onStart = {
      count: document.querySelectorAll('.queue-ghost').length,
      text: document.querySelector('.queue-ghost')?.textContent || null,
      transform: document.querySelector('.queue-ghost')?.style.transform || null,
      pointerEvents: document.querySelector('.queue-ghost')
        ? getComputedStyle(document.querySelector('.queue-ghost')).pointerEvents : null,
      hasButtons: document.querySelectorAll('.queue-ghost button').length,
      rowDragging: row.classList.contains('dragging'),
    };
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: startY + 90 }));
    const movedTransform = document.querySelector('.queue-ghost')?.style.transform || null;
    const row2 = document.querySelectorAll('#queueBar .queue-item')[1];
    const r2 = row2.getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: r2.top + r2.height / 2 }));
    await new Promise((res) => setTimeout(res, 120));
    return {
      onStart,
      movedTransform,
      afterCount: document.querySelectorAll('.queue-ghost').length,
      orderAfter: [...document.querySelectorAll('#queueBar .queue-text')].map((n) => n.textContent),
    };
  })()`);

  check('a drag shows one ghost', drag.onStart.count === 1, drag.onStart);
  check('the ghost carries the message text',
    drag.onStart.text === 'ข้อความแรกที่รออยู่ในคิว', drag.onStart);
  check('the ghost follows the pointer',
    Boolean(drag.onStart.transform) && drag.movedTransform !== drag.onStart.transform,
    { start: drag.onStart.transform, moved: drag.movedTransform });
  check('the ghost never becomes the pointer target',
    drag.onStart.pointerEvents === 'none', drag.onStart);
  check('the ghost has no buttons to mis-click',
    drag.onStart.hasButtons === 0, drag.onStart);
  check('the dragged row is marked while carried',
    drag.onStart.rowDragging === true, drag.onStart);
  check('the ghost is gone after the drop', drag.afterCount === 0, drag);
  check('the drop still reorders the queue',
    drag.orderAfter[0] === 'ข้อความที่สอง', drag.orderAfter);

  // A cancelled drag must not leave a ghost behind either.
  const cancelled = await win.webContents.executeJavaScript(`(async () => {
    const row = document.querySelector('#queueBar .queue-item');
    const r = row.getBoundingClientRect();
    row.querySelector('.queue-grip').dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, button: 0, clientX: r.left + 4, clientY: r.top + 4,
    }));
    const during = document.querySelectorAll('.queue-ghost').length;
    window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 80));
    return { during, after: document.querySelectorAll('.queue-ghost').length };
  })()`);
  check('a cancelled drag clears its ghost',
    cancelled.during === 1 && cancelled.after === 0, cancelled);

  // --- editing still works from the front -------------------------------
  const editing = await win.webContents.executeJavaScript(`(async () => {
    document.querySelector('#queueBar .queue-item .queue-edit-btn').click();
    await new Promise((res) => setTimeout(res, 60));
    const row = document.querySelector('#queueBar .queue-item');
    const field = row.querySelector('.queue-edit');
    return {
      editing: row.classList.contains('editing'),
      value: field ? field.value : null,
      focused: document.activeElement === field,
    };
  })()`);
  check('the pencil opens the editor in place', editing.editing === true, editing);
  check('the editor starts with the current text',
    editing.value === 'ข้อความที่สอง', editing);
  check('the editor takes focus', editing.focused === true, editing);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll queue control checks passed in the running renderer');
  app.exit(0);
});
