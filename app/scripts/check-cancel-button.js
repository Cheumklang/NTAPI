/**
 * The Cancel button on a held message really cancels it.
 *
 * Presses the real buttons in the real renderer: a held message must disappear,
 * must never reach the session, and the words must not be silently thrown away.
 * "Edit" must put the text back in the composer; "Cancel" must drop it and say so.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-cancel-button.js
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
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));

  const frame = () => win.webContents.executeJavaScript(
    'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'
  );

  // --- 1. a held message shows the row with both buttons -----------------
  const setup = await win.webContents.executeJavaScript(`(() => {
    if (typeof holdMessage !== 'function') return { error: 'holdMessage missing' };
    const sent = [];
    window.__sent = sent;
    activeTabId = 'testtab';
    const view = views.get('testtab') || createView('testtab');
    views.set('testtab', view);
    view.messages.length = 0;
    const transcriptEl = document.getElementById('transcript');
    transcriptEl.textContent = '';
    const wrap = renderUserMessage('hello there');
    view.messages.push({ kind: 'user', text: 'hello there', pending: true, holdId: holdIdFor(view) });
    holdMessage(view, wrap, {
      text: 'hello there',
      images: [],
      what: 'queued',
      send: () => { sent.push('hello there'); },
      onCancel: (taken) => {
        const at = (view.messages || []).findIndex((m) => m.pending);
        if (at !== -1) view.messages.splice(at, 1);
        wrap.remove();
        if (taken) { input.value = 'hello there'; }
      },
    });
    const row = document.querySelector('.hold-row');
    return {
      row: Boolean(row),
      buttons: [...document.querySelectorAll('.hold-row .hold-btn')].map((b) => b.textContent),
      clock: document.querySelector('.hold-clock')?.textContent || '',
    };
  })()`);
  check('the countdown row appears', setup.row === true, setup);
  check('there are two ways out', Array.isArray(setup.buttons) && setup.buttons.length === 2, setup.buttons);
  check('the countdown is showing', /5|4/.test(setup.clock), setup.clock);

  // --- 2. Cancel drops it --------------------------------------------------
  const cancelled = await win.webContents.executeJavaScript(`(() => {
    const btns = [...document.querySelectorAll('.hold-row .hold-btn')];
    const drop = btns.find((b) => /Cancel|ยกเลิก/.test(b.textContent));
    if (!drop) return { error: 'no cancel button', labels: btns.map((b) => b.textContent) };
    drop.click();
    const view = views.get('testtab');
    return {
      rowGone: document.querySelector('.hold-row') === null,
      stillInView: (view.messages || []).filter((m) => m.pending).length,
      bubbleGone: !document.querySelector('#transcript .bubble')
        || document.querySelectorAll('#transcript .msg').length === 0,
      inputValue: input.value,
    };
  })()`);
  check('Cancel removes the countdown row', cancelled.rowGone === true, cancelled);
  check('Cancel removes the message from the session', cancelled.stillInView === 0, cancelled);
  check('Cancel does not put the text back', cancelled.inputValue === '', cancelled);

  // Nothing may be sent after cancelling, even once the countdown would have fired.
  await new Promise((r) => setTimeout(r, 6200));
  const afterWait = await win.webContents.executeJavaScript('window.__sent || []');
  check('a cancelled message is never sent', afterWait.length === 0, afterWait);

  // --- 3. Edit puts the words back ----------------------------------------
  const edited = await win.webContents.executeJavaScript(`(() => {
    input.value = '';
    const view = views.get('testtab');
    view.messages.length = 0;
    document.getElementById('transcript').textContent = '';
    const wrap = renderUserMessage('second try');
    view.messages.push({ kind: 'user', text: 'second try', pending: true, holdId: holdIdFor(view) });
    holdMessage(view, wrap, {
      text: 'second try',
      images: [],
      what: 'queued',
      send: () => { (window.__sent || []).push('second try'); },
      onCancel: (taken) => {
        const at = (view.messages || []).findIndex((m) => m.pending);
        if (at !== -1) view.messages.splice(at, 1);
        wrap.remove();
        if (taken) { input.value = 'second try'; }
      },
    });
    const btns = [...document.querySelectorAll('.hold-row .hold-btn')];
    const edit = btns.find((b) => /Edit|แก้ไข/.test(b.textContent));
    if (!edit) return { error: 'no edit button', labels: btns.map((b) => b.textContent) };
    edit.click();
    return {
      inputValue: input.value,
      stillInView: (view.messages || []).filter((m) => m.pending).length,
      rowGone: document.querySelector('.hold-row') === null,
    };
  })()`);
  check('Edit returns the text to the composer', edited.inputValue === 'second try', edited);
  check('Edit removes the message from the session', edited.stillInView === 0, edited);
  check('Edit removes the countdown row', edited.rowGone === true, edited);

  await new Promise((r) => setTimeout(r, 6200));
  const sentAfterEdit = await win.webContents.executeJavaScript('window.__sent || []');
  check('an edited-back message is not sent either', sentAfterEdit.length === 0, sentAfterEdit);

  // --- 4. a hold that runs out does send -----------------------------------
  const allowed = await win.webContents.executeJavaScript(`(() => {
    input.value = '';
    const view = views.get('testtab');
    view.messages.length = 0;
    document.getElementById('transcript').textContent = '';
    window.__sent = [];
    const wrap = renderUserMessage('let it go');
    view.messages.push({ kind: 'user', text: 'let it go', pending: true, holdId: holdIdFor(view) });
    holdMessage(view, wrap, {
      text: 'let it go',
      images: [],
      what: 'queued',
      send: () => { window.__sent.push('let it go'); },
      onCancel: () => {},
    });
    return { started: true };
  })()`);
  await new Promise((r) => setTimeout(r, 6200));
  const sentOnTime = await win.webContents.executeJavaScript('window.__sent || []');
  check('a hold that is left alone does send', sentOnTime.length === 1 && sentOnTime[0] === 'let it go',
    { started: allowed.started, sentOnTime });

  // --- 5. a second hold replaces the first, no double send -----------------
  const replaced = await win.webContents.executeJavaScript(`(() => {
    const view = views.get('testtab');
    view.messages.length = 0;
    document.getElementById('transcript').textContent = '';
    window.__sent = [];
    const mk = (txt) => {
      const wrap = renderUserMessage(txt);
      view.messages.push({ kind: 'user', text: txt, pending: true, holdId: holdIdFor(view) });
      holdMessage(view, wrap, {
        text: txt, images: [], what: 'queued',
        send: () => { window.__sent.push(txt); },
        onCancel: () => {},
      });
    };
    mk('first');
    mk('second');
    return { rows: document.querySelectorAll('.hold-row').length };
  })()`);
  check('a new hold replaces the old row', replaced.rows === 1, replaced);
  await new Promise((r) => setTimeout(r, 6200));
  const bothSent = await win.webContents.executeJavaScript('window.__sent || []');
  check('only the live hold is sent', bothSent.length === 1 && bothSent[0] === 'second', bothSent);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll cancel-button checks passed in the running renderer');
  app.exit(0);
});
