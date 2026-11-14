'use strict';

/**
 * Run the real merge helper inside a real renderer.
 *
 * The offline test extracts the helper and runs it in Node. This one loads the
 * actual page, so it checks the function in the environment it ships in — where
 * the file is loaded as a plain script into a window — and exercises the case
 * that started this: `agent:history` arriving while a message is still in flight.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-history-merge.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const out = await win.webContents.executeJavaScript(`(() => {
    const fn = typeof mergeIncomingMessages === 'function' ? mergeIncomingMessages : null;
    if (!fn) return { missing: true };

    const results = {};

    // The bug: message just sent, history arrives without it.
    const view = { messages: [{ kind: 'user', text: 'sent now', pending: true }] };
    results.survives = fn(view, [{ kind: 'assistant', text: 'older' }])
      .map((m) => m.text);

    // Once the session has it, no duplicate.
    const view2 = { messages: [{ kind: 'user', text: 'sent now', pending: true }] };
    results.deduped = fn(view2, [
      { kind: 'user', text: 'sent now' },
      { kind: 'assistant', text: 'reply' },
    ]).map((m) => m.text);

    // Nothing pending: history wins, so undo still works.
    results.replaced = fn({ messages: [] }, [{ kind: 'user', text: 'a' }]).map((m) => m.text);

    // Two identical questions: both the session copy and the pending copy stay.
    const view3 = { messages: [
      { kind: 'user', text: 'same', pending: true },
      { kind: 'user', text: 'same', pending: true },
    ] };
    results.twins = fn(view3, [{ kind: 'user', text: 'same' }])
      .filter((m) => m.text === 'same').length;

    // Image-only message survives.
    const view4 = { messages: [{ kind: 'user', text: '', images: [{ dataUri: 'd' }], pending: true }] };
    results.imageOnly = fn(view4, []).length;

    // A non-pending message is never resurrected.
    const view5 = { messages: [{ kind: 'user', text: 'real' }] };
    results.notResurrected = fn(view5, []).length;

    return results;
  })()`);

  const checks = [];
  function check(name, ok, detail) {
    checks.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }

  check('the helper exists in the shipped renderer', !out.missing);
  if (!out.missing) {
    check('a just-sent message survives history arriving', out.survives.includes('sent now'), out.survives);
    check('the older history is kept', out.survives.includes('older'), out.survives);
    check('a message the session has is not duplicated',
      out.deduped.filter((t) => t === 'sent now').length === 1, out.deduped);
    check('history still replaces when nothing is pending', out.replaced.length === 1, out.replaced);
    check('two identical pending messages merge correctly', out.twins === 2, out.twins);
    check('an image-only message survives', out.imageOnly === 1, out.imageOnly);
    check('a saved message is never resurrected', out.notResurrected === 0, out.notResurrected);
  }

  const failed = checks.filter((r) => !r).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll history merge checks passed in the renderer');
  app.exit(0);
}).catch((err) => {
  console.error('runner error:', err);
  app.exit(1);
});
