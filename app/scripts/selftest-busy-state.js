'use strict';

/**
 * The "working" pill must be able to go away.
 *
 * The bug: with nothing running anywhere, the window still said กำลังทำงาน and the
 * Stop button did nothing at all. Two wirings caused it, and both are visible in
 * the sources:
 *
 *   1. `prompt:abort` awaited `session.abort()` *before* clearing the flag. On a
 *      session that is idle, or blocked waiting for an answer, that promise can
 *      take a very long time — so the window was never told the turn was over,
 *      and pressing Stop again did the same nothing.
 *   2. The pill was switched off only by the settled event of the tab that
 *      happened to be active at that moment. A turn finishing in another tab (or
 *      an event lost while switching tabs) left it on with nothing running.
 *
 * A window is not needed to prove the order of statements or the shape of the
 * repaint; the behaviour of the repaint itself is measured in
 * `scripts/check-busy-state.js`.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/** The body of one IPC handler, so statements can be compared inside it. */
function handlerBody(source, channel) {
  const at = source.indexOf(`ipcMain.handle('${channel}'`);
  assert.notStrictEqual(at, -1, `${channel} handler is missing`);
  const next = source.indexOf('ipcMain.handle(', at + 10);
  return source.slice(at, next === -1 ? source.length : next);
}

const abort = handlerBody(main, 'prompt:abort');

check('Stop clears the tab flag', () => {
  assert.ok(/tab\.busy = false;/.test(abort), 'the flag is never cleared');
});

check('Stop tells the window before asking the session to stop', () => {
  const told = abort.indexOf("sendTab(id, 'agent:busy', { busy: false })");
  const stop = abort.indexOf('tab.handle.session.abort()');
  assert.notStrictEqual(told, -1, 'the window is never told');
  assert.notStrictEqual(stop, -1, 'the session is never asked to stop');
  assert.ok(told < stop, 'the window is told only after the session answers');
});

check('the wait for the session is bounded', () => {
  assert.ok(/Promise\.race\(/.test(abort), 'the handler can hang on a session that never resolves');
  assert.ok(/setTimeout\(resolve, \d+\)/.test(abort), 'the wait has no deadline');
});

check('the pill is repainted from the tab state, not switched off blindly', () => {
  assert.ok(/function paintBusyFromViews\(/.test(renderer), 'there is no repaint helper');
  assert.ok(
    /paintBusyFromViews\(\) \{\s*\n\s*setBusy\(Boolean\(activeView\(\)\?\.busy\)\);/.test(renderer),
    'the helper does not read the active tab',
  );
});

check('a settle in another tab still clears the pill', () => {
  const at = renderer.indexOf('api.onSettled(');
  assert.notStrictEqual(at, -1, 'the settled handler is missing');
  const body = renderer.slice(at, renderer.indexOf('api.onNotice(', at));
  assert.ok(/paintBusyFromViews\(\)/.test(body), 'the pill is left on after a settle');
  assert.ok(!/setBusy\(false\)/.test(body), 'the pill is switched off without looking at the tab');
});

check('an error repaints the pill the same way', () => {
  const at = renderer.indexOf('api.onError(');
  const body = renderer.slice(at, renderer.indexOf('api.onFallback(', at));
  assert.ok(/paintBusyFromViews\(\)/.test(body), 'an error leaves the pill on');
});

check('a stuck pill is reconciled with the main process', () => {
  assert.ok(/api\.getTabState\(view\.tabId\)/.test(renderer), 'nothing asks main what is really running');
  assert.ok(/if \(state && !state\.busy\)/.test(renderer), 'the answer is never acted on');
});

console.log(`\n${pass} checks passed`);
