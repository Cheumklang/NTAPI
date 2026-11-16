'use strict';

/**
 * A message that has already gone out is still takeable for five seconds.
 *
 * Enter sends at once, so the only way to be forgiving is to let the message be
 * pulled back: Edit returns the words and images to the composer, Cancel drops
 * the message, and both stop the turn that the accidental Enter started. This
 * drives the real function, because the thing worth proving is what happens to
 * the transcript entry and to the composer, not that the call exists.
 *
 * Run from app/: node_modules/electron/dist/electron.exe scripts/check-undo-send.js
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

const PROBE = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  lang = 'th';
  applyLanguage();

  const make = (text) => {
    // Each case starts from an empty composer: edit and drop differ exactly
    // in whether the words come back.
    input.value = '';
    pendingImages = [];
    renderAttachments();
    const view = { tabId: 1, messages: [] };
    const wrap = renderUserMessage(text, []);
    const entry = { kind: 'user', text, images: [], pending: true };
    view.messages.push(entry);
    offerUndoSend(view, wrap, entry, { text, images: [] });
    return { view, wrap, entry };
  };

  // Edit
  const a = make('พิมพ์ผิด');
  await frame();
  const rowA = a.wrap.querySelector('.hold-row');
  const clockA = rowA && rowA.querySelector('.hold-clock').textContent;
  const buttonsA = rowA ? [...rowA.querySelectorAll('.hold-btn')].map((b) => b.textContent) : [];
  rowA.querySelectorAll('.hold-btn')[0].click();
  await new Promise((r) => setTimeout(r, 120));
  const edit = {
    clock: clockA,
    buttons: buttonsA,
    messages: a.wrap.isConnected ? a.view.messages.length : 0,
    removed: a.wrap.isConnected === false,
    composer: input.value,
  };

  // Cancel
  const b = make('ไม่เอาละ');
  await frame();
  b.wrap.querySelector('.hold-row').querySelectorAll('.hold-btn')[1].click();
  await new Promise((r) => setTimeout(r, 120));
  const drop = {
    messages: b.wrap.isConnected ? b.view.messages.length : 0,
    removed: b.wrap.isConnected === false,
    composer: input.value,
  };

  // Left alone, the row removes itself and the message stays.
  const c = make('ปล่อยไว้');
  await frame();
  const kept = { before: Boolean(c.wrap.querySelector('.hold-row')) };
  await new Promise((r) => setTimeout(r, 6200));
  kept.after = Boolean(c.wrap.querySelector('.hold-row'));
  kept.messages = c.view.messages.length;

  return { edit, drop, kept };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const res = await win.webContents.executeJavaScript(PROBE);
  console.log(JSON.stringify(res, null, 1));

  check('the row offers Edit and Cancel', res.edit.buttons.length === 2, res.edit.buttons);
  check('the row counts the five seconds down, in Thai', /วิ/.test(res.edit.clock || ''), res.edit.clock);
  check('Edit takes the message out of the transcript', res.edit.messages === 0 && res.edit.removed === true);
  check('Edit puts the words back in the composer', res.edit.composer === 'พิมพ์ผิด', res.edit.composer);
  check('Cancel takes the message out too', res.drop.messages === 0 && res.drop.removed === true);
  check('Cancel leaves the composer empty', res.drop.composer === '', res.drop.composer);
  check('the row is there when the message is sent', res.kept.before === true);
  check('the row goes away by itself', res.kept.after === false);
  check('a message left alone stays sent', res.kept.messages === 1, res.kept.messages);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll undo-send checks passed');
  app.exit(failures ? 1 : 0);
});
