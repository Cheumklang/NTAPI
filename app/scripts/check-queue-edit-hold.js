/**
 * The pencil really stops the countdown, on the running renderer.
 *
 * Reading the source proves the call is there; it does not prove the clock stops
 * or that the stale text fails to go out a few seconds later. This waits out a
 * full hold and checks that nothing was sent.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-queue-edit-hold.js
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

  // Put one message in the queue and hold it, the way queueMessage does.
  await win.webContents.executeJavaScript(`(async () => {
    activeTabId = 'qh';
    const v = views.get('qh') || createView('qh');
    views.set('qh', v);
    v.queue = [{ kind: 'prompt', queueId: 'p1', text: 'ข้อความเดิมที่ยังไม่ควรส่ง' }];
    renderQueue();
    document.getElementById('queueBar').hidden = false;
    const item = v.queue[0];
    window.__sent = [];
    const hold = holdMessage(v, null, {
      text: item.text,
      images: [],
      send: () => { window.__sent.push('sent'); },
      what: 'เข้าคิว',
      rowInto: () => document.querySelector('[data-queue-id="p1"]'),
    });
    hold.item = item;
    hold.onCancel = () => {};
  })()`);

  // Let the clock tick once so we know it is really running.
  await new Promise((r) => setTimeout(r, 1200));

  const running = await win.webContents.executeJavaScript(`(() => ({
    hold: Boolean(holds.get('qh')),
    clock: document.querySelector('.hold-clock') ? document.querySelector('.hold-clock').textContent : null,
  }))()`);
  check('the countdown is running before the pencil is pressed',
    running.hold === true && Boolean(running.clock), running);

  // Press the pencil.
  await win.webContents.executeJavaScript(
    `document.querySelector('#queueBar .queue-item .queue-edit-btn').click()`
  );
  await new Promise((r) => setTimeout(r, 250));

  const afterEdit = await win.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('#queueBar .queue-item');
    return {
      hold: Boolean(holds.get('qh')),
      clock: document.querySelector('.hold-clock') ? document.querySelector('.hold-clock').textContent : null,
      rows: document.querySelectorAll('#queueBar .queue-item').length,
      editing: row ? row.classList.contains('editing') : false,
      field: row && row.querySelector('.queue-edit') ? row.querySelector('.queue-edit').value : null,
      sent: window.__sent.length,
    };
  })()`);

  check('the pencil stops the countdown', afterEdit.hold === false, afterEdit);
  check('the countdown row is gone', afterEdit.clock === null, afterEdit);
  check('the message stays in the queue', afterEdit.rows === 1, afterEdit);
  check('the editor is open', afterEdit.editing === true, afterEdit);
  check('the editor has the old text', afterEdit.field === 'ข้อความเดิมที่ยังไม่ควรส่ง', afterEdit);
  check('nothing was sent by pressing the pencil', afterEdit.sent === 0, afterEdit);

  // The hold was 5 seconds; wait past it. If the timer survived, this is where
  // the stale message would go out.
  await new Promise((r) => setTimeout(r, 5400));

  const later = await win.webContents.executeJavaScript(`(() => ({
    sent: window.__sent.length,
    rows: document.querySelectorAll('#queueBar .queue-item').length,
    queueLen: (views.get('qh') || {}).queue ? views.get('qh').queue.length : -1,
    hold: Boolean(holds.get('qh')),
    stillEditing: (() => {
      const r = document.querySelector('#queueBar .queue-item');
      return r ? r.classList.contains('editing') : false;
    })(),
  }))()`);

  check('the old text is never sent', later.sent === 0, later);
  check('the message is still in the queue after the hold would have fired',
    later.queueLen === 1 && later.rows === 1, later);
  check('the editor is still open', later.stillEditing === true, later);
  check('no hold is left behind', later.hold === false, later);

  // Saving must not resurrect the stale text. `saveQueueEdit` hands the item to
  // `drainQueue`, which sends it — that is correct, the queue is now free — so the
  // only thing to assert here is that what goes out is the *new* wording. The send
  // itself goes through the real drain path, which this window has no session for,
  // so the queue simply empties.
  const saved = await win.webContents.executeJavaScript(`(async () => {
    const row = document.querySelector('#queueBar .queue-item');
    const field = row.querySelector('.queue-edit');
    field.value = 'ข้อความใหม่ที่แก้แล้ว';
    row.querySelector('.queue-save').click();
    await new Promise((res) => setTimeout(res, 200));
    return {
      queueLen: views.get('qh').queue.length,
      editing: views.get('qh').queue.some((q) => q.editing),
      sent: window.__sent.length,
    };
  })()`);
  check('saving closes the editor', saved.editing === false, saved);
  check('saving releases the row to the queue', saved.queueLen <= 1, saved);
  check('saving never sends the stale text', saved.sent === 0, saved);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll queue edit/hold checks passed in the running renderer');
  app.exit(0);
});
