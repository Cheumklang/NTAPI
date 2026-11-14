/**
 * Editing a queued message, and dragging a queue row, in the running renderer.
 *
 * The offline test reads the source; this one presses the real buttons and drags
 * the real rows, then reads the queue array back. It covers the two things that
 * would actually burn a user:
 *   - editing keeps the item exactly where it was;
 *   - an item being edited is never sent, even if the turn ends mid-edit.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-queue-edit.js
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
    width: 1000,
    height: 780,
    // Shown because a hidden window cannot take focus, and focusing the edit
    // field is one of the things being checked.
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));

  const run = (expr) => win.webContents.executeJavaScript(expr);
  const frame = () => run('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');

  // Seed a queue of three plain messages on a tab that is not busy, so nothing
  // drains while the test is setting up.
  const seeded = await run(`(() => {
    activeTabId = 'qtab';
    const view = views.get('qtab') || createView('qtab');
    views.set('qtab', view);
    view.queue = [
      { kind: 'prompt', text: 'first', images: [], queueId: 'q1' },
      { kind: 'prompt', text: 'second', images: [], queueId: 'q2' },
      { kind: 'prompt', text: 'third', images: [], queueId: 'q3' },
    ];
    view.busy = true; // hold the queue so the drain does nothing
    renderQueue();
    return { rows: document.querySelectorAll('#queueBar .queue-item').length };
  })()`);
  check('three queued rows are shown', seeded.rows === 3, seeded);

  // --- 1. open the middle item for editing --------------------------------
  const opened = await run(`(() => {
    const row = document.querySelector('[data-queue-id="q2"]');
    if (!row) return { error: 'no row for q2' };
    const edit = row.querySelector('.queue-edit-btn');
    if (!edit) return { error: 'no edit button', html: row.innerHTML.slice(0, 200) };
    edit.click();
    const field = document.querySelector('[data-queue-id="q2"] .queue-edit');
    return {
      fieldValue: field ? field.value : null,
      focused: document.activeElement === field,
      order: [...document.querySelectorAll('#queueBar .queue-item')].map((r) => r.dataset.queueId),
      marked: Boolean(views.get('qtab').queue.find((q) => q.queueId === 'q2' && q.editing)),
    };
  })()`);
  check('the edit field appears with the current text', opened.fieldValue === 'second', opened);
  check('the field takes focus', opened.focused === true, opened);
  check('the item stays in the middle while editing',
    Array.isArray(opened.order) && opened.order.join(',') === 'q1,q2,q3', opened.order);
  check('the item is flagged as being edited', opened.marked === true, opened);

  // --- 2. typing and saving keeps it in place ------------------------------
  const saved = await run(`(() => {
    const field = document.querySelector('[data-queue-id="q2"] .queue-edit');
    field.value = 'second, corrected';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const row = document.querySelector('[data-queue-id="q2"]');
    row.querySelector('.queue-save').click();
    const q = views.get('qtab').queue;
    return {
      texts: q.map((x) => x.text),
      order: [...document.querySelectorAll('#queueBar .queue-item')].map((r) => r.dataset.queueId),
      stillEditing: q.some((x) => x.editing),
      fieldGone: document.querySelector('.queue-edit') === null,
    };
  })()`);
  check('the corrected text is stored', saved.texts.join('|') === 'first|second, corrected|third', saved.texts);
  check('the corrected item keeps its position', saved.order.join(',') === 'q1,q2,q3', saved.order);
  check('the edit closes', saved.stillEditing === false && saved.fieldGone === true, saved);

  // --- 3. an empty draft cannot be saved ----------------------------------
  const empty = await run(`(() => {
    const row = document.querySelector('[data-queue-id="q1"]');
    row.querySelector('.queue-edit-btn').click();
    const field = document.querySelector('[data-queue-id="q1"] .queue-edit');
    field.value = '   ';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const save = document.querySelector('[data-queue-id="q1"] .queue-save');
    const disabled = save.disabled;
    save.click();
    return {
      disabled,
      text: views.get('qtab').queue.find((q) => q.queueId === 'q1').text,
      stillOpen: Boolean(document.querySelector('[data-queue-id="q1"] .queue-edit')),
    };
  })()`);
  check('Save is disabled on an empty draft', empty.disabled === true, empty);
  check('an empty draft does not wipe the message', empty.text === 'first', empty);
  check('the edit stays open after a blocked save', empty.stillOpen === true, empty);

  // --- 4. Escape cancels without changing the text ------------------------
  const escaped = await run(`(() => {
    const field = document.querySelector('[data-queue-id="q1"] .queue-edit');
    field.value = 'throw this away';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return {
      text: views.get('qtab').queue.find((q) => q.queueId === 'q1').text,
      fieldGone: document.querySelector('[data-queue-id="q1"] .queue-edit') === null,
    };
  })()`);
  check('Escape keeps the original text', escaped.text === 'first', escaped);
  check('Escape closes the field', escaped.fieldGone === true, escaped);

  // --- 5. an item being edited is not sent --------------------------------
  const blockedDrain = await run(`(async () => {
    const view = views.get('qtab');
    view.queue = [
      { kind: 'prompt', text: 'do not send me', images: [], queueId: 'e1', editing: true, draft: 'half typed' },
      { kind: 'prompt', text: 'behind it', images: [], queueId: 'e2' },
    ];
    view.busy = false;
    // Pretend the turn ended: this is exactly when a drain runs.
    let sent = null;
    const realSend = window.sendQueued;
    window.__sentText = [];
    window.sendQueued = async (v, item) => { window.__sentText.push(item.text); v.busy = true; };
    await drainQueue(view);
    window.sendQueued = realSend;
    return {
      sent: window.__sentText,
      stillQueued: view.queue.map((q) => q.queueId),
    };
  })()`);
  check('the item being edited is not sent', blockedDrain.sent.length === 0, blockedDrain);
  check('it stays at the head of the queue', blockedDrain.stillQueued[0] === 'e1', blockedDrain);

  // --- 6. reordering moves the item and the queue agrees ------------------
  const reordered = await run(`(() => {
    const view = views.get('qtab');
    view.busy = true;
    view.queue = [
      { kind: 'prompt', text: 'one', images: [], queueId: 'r1' },
      { kind: 'prompt', text: 'two', images: [], queueId: 'r2' },
      { kind: 'prompt', text: 'three', images: [], queueId: 'r3' },
    ];
    renderQueue();
    // Move "three" to the top with the keyboard path, which shares the same move
    // helper as the drag.
    const ok = moveQueueItem('r3', -1) && moveQueueItem('r3', -1);
    return {
      ok,
      order: view.queue.map((q) => q.queueId),
      rows: [...document.querySelectorAll('#queueBar .queue-item')].map((r) => r.dataset.queueId),
    };
  })()`);
  check('a row can be moved up', reordered.ok === true, reordered);
  check('the queue array is reordered', reordered.order.join(',') === 'r3,r1,r2', reordered.order);
  check('the rows match the array', reordered.rows.join(',') === 'r3,r1,r2', reordered.rows);

  const bounds = await run(`(() => {
    const view = views.get('qtab');
    const atTop = moveQueueItem('r3', -1);
    const atBottom = moveQueueItem('r2', 1);
    return { atTop, atBottom, order: view.queue.map((q) => q.queueId) };
  })()`);
  check('moving past the top is refused', bounds.atTop === false, bounds);
  check('moving past the bottom is refused', bounds.atBottom === false, bounds);
  check('a refused move changes nothing', bounds.order.join(',') === 'r3,r1,r2', bounds.order);

  // --- 7. a real drag releases over another row ---------------------------
  const dragged = await run(`(() => {
    const view = views.get('qtab');
    view.queue = [
      { kind: 'prompt', text: 'a', images: [], queueId: 'd1' },
      { kind: 'prompt', text: 'b', images: [], queueId: 'd2' },
    ];
    renderQueue();
    const rowA = document.querySelector('[data-queue-id="d1"]');
    const grip = rowA.querySelector('.queue-grip');
    const rowB = document.querySelector('[data-queue-id="d2"]');
    const bRect = rowB.getBoundingClientRect();
    // Press the grip, then release past the middle of the second row.
    grip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: rowA.getBoundingClientRect().top }));
    const started = Boolean(dragState);
    endQueueDrag(bRect.top + bRect.height - 1);
    return {
      started,
      order: view.queue.map((q) => q.queueId),
      draggingClassLeft: document.querySelectorAll('.queue-item.dragging').length,
    };
  })()`);
  check('pressing the grip starts a drag', dragged.started === true, dragged);
  check('releasing over the next row moves it down', dragged.order.join(',') === 'd2,d1', dragged.order);
  check('the drag state is cleared', dragged.draggingClassLeft === 0, dragged);

  // --- 8. a row being edited refuses to be dragged ------------------------
  const noDragWhileEditing = await run(`(() => {
    const view = views.get('qtab');
    view.queue = [
      { kind: 'prompt', text: 'keep me', images: [], queueId: 'x1', editing: true, draft: 'keep me' },
    ];
    renderQueue();
    const row = document.querySelector('[data-queue-id="x1"]');
    row.querySelector('.queue-grip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 0 }));
    const started = Boolean(dragState);
    dragState = null;
    return { started };
  })()`);
  check('a row being edited cannot be dragged', noDragWhileEditing.started === false, noDragWhileEditing);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll queue edit and reorder checks passed in the running renderer');
  app.exit(0);
});
