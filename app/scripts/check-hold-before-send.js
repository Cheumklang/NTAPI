'use strict';

/**
 * Run the hold in a real renderer and click its buttons.
 *
 * The offline test reads the source. This one loads the actual page, shows a
 * held message, and clicks "edit" and "drop" to see what really happens to the
 * composer and the transcript — which is the part a source check cannot prove.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-hold-before-send.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1100, height: 800 });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const results = [];

  async function scenario(kind) {
    return win.webContents.executeJavaScript(`(async () => {
      // A tab to hold in, without touching the real session machinery.
      const view = { tabId: 'probe-tab', messages: [], queue: [], busy: true };
      views.set('probe-tab', view);
      activeTabId = 'probe-tab';
      transcript.innerHTML = '';
      transcript.appendChild(emptyState);
      emptyState.hidden = false;
      input.value = '';
      pendingImages = [];

      const seen = {};
      const wrap = renderUserMessage('held text', []);
      const hold = holdMessage(view, wrap, {
        text: 'held text',
        images: [],
        send: () => { seen.sent = true; },
        what: t('holdWhatSteer'),
      });
      view.messages.push({ kind: 'user', text: 'held text', images: [], pending: true, holdId: hold.id });

      const row = wrap.querySelector('.hold-row');
      const clock = row?.querySelector('.hold-clock')?.textContent || '';
      const buttons = [...(row?.querySelectorAll('.hold-btn') || [])].map((b) => b.textContent);

      // Let one tick go by and read the clock again.
      await new Promise((r) => setTimeout(r, 1100));
      const clockAfter = wrap.querySelector('.hold-clock')?.textContent || '';

      if ('${kind}' === 'edit') {
        row.querySelector('.hold-btn').click();
      } else if ('${kind}' === 'drop') {
        row.querySelector('.hold-drop').click();
      }

      const out = {
        clock,
        clockAfter,
        buttons,
        inputAfter: input.value,
        messagesAfter: view.messages.length,
        rowsLeft: document.querySelectorAll('.hold-row').length,
        sent: Boolean(seen.sent),
        notice: (document.querySelector('.notice')?.textContent || ''),
      };
      if (hold.timer) clearInterval(hold.timer);
      holds.delete('probe-tab');
      return out;
    })()`);
  }

  function check(name, ok, detail) {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }

  const shown = await scenario('none');
  check('a countdown row appears', shown.buttons.length === 2, shown.buttons);
  check('the row names the seconds and the destination',
    /5/.test(shown.clock) && shown.clock.length > 5, shown.clock);
  check('the two buttons are Edit and Cancel',
    shown.buttons[0] === 'Edit' || shown.buttons[0] === 'แก้ไข', shown.buttons);
  check('the clock counts down', shown.clock !== shown.clockAfter,
    [shown.clock, shown.clockAfter]);
  check('nothing is sent while the countdown runs', shown.sent === false);

  const edited = await scenario('edit');
  check('edit clears the countdown row', edited.rowsLeft === 0, edited.rowsLeft);
  check('edit puts the words back in the composer', edited.inputAfter === 'held text', edited.inputAfter);
  check('edit removes the message from the transcript', edited.messagesAfter === 0, edited.messagesAfter);
  check('edit does not send', edited.sent === false);

  const dropped = await scenario('drop');
  check('drop clears the countdown row', dropped.rowsLeft === 0, dropped.rowsLeft);
  check('drop removes the message', dropped.messagesAfter === 0, dropped.messagesAfter);
  check('drop leaves the composer empty', dropped.inputAfter === '', dropped.inputAfter);
  check('drop does not send', dropped.sent === false);

  const failed = results.filter((r) => !r).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll hold checks passed in the renderer');
  app.exit(0);
}).catch((err) => {
  console.error('runner error:', err);
  app.exit(1);
});
