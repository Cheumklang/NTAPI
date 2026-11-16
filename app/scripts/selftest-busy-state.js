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
  const at = renderer.indexOf('api.onSettled((p) => {');
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
  assert.ok(/if \(!tabState\.busy\)/.test(renderer), 'the answer is never acted on');
  // The queue is the half the user feels: it drains on the settle event, so a
  // missed settle must be settled here, not merely repainted.
  assert.ok(/settleStaleTurn\(view\)/.test(renderer), 'a stale flag releases nothing but the button');
  assert.ok(/drainQueue\(view\)/.test(renderer.slice(renderer.indexOf('function settleStaleTurn'))),
    'the blocked queue is left waiting');
});

check('main heals a busy flag on an idle session', () => {
  assert.ok(/session\.isIdle/.test(main), 'the session is never asked whether it is idle');
  assert.ok(/agent:settled', \{ aborted: false, healed: true \}/.test(main), 'a healed tab never settles');
});

check('the heal needs two readings before it acts', () => {
  assert.ok(/if \(streak < 2\) continue;/.test(main), 'a run that is just starting could be cut short');
});

check('a healed settle releases the queue without a second finish ping', () => {
  assert.ok(/if \(!hadQueue && !p\.healed\) notifyFinished\(view\);/.test(renderer),
    'the queue is not released, or the reader is pinged twice');
});

check('a settle clears the flag and the queue before it touches the DOM', () => {
  const at = renderer.indexOf('api.onSettled((p) => {');
  assert.notStrictEqual(at, -1, 'the settled handler is missing');
  const body = renderer.slice(at, renderer.indexOf('api.onNotice(', at));
  const flag = body.indexOf('view.busy = false');
  const drain = body.indexOf('drainQueue(view)');
  const clear = body.indexOf('clearViewActivity(view)');
  assert.ok(flag !== -1 && drain !== -1 && clear !== -1, 'the handler no longer does all three');
  assert.ok(flag < clear && drain < clear, 'a failed cleanup can still leave the window saying "working"');
  assert.ok(clear < body.indexOf('try {'), 'the activity reset sits inside the guarded block');
  assert.ok(/catch \{\s*\n\s*\/\/ The transcript moves/.test(body), 'the DOM part is unguarded');
});

check('a payload for another tab still repaints the composer', () => {
  const at = renderer.indexOf('api.onBusy((p) => {');
  assert.notStrictEqual(at, -1, 'the busy handler is missing');
  const body = renderer.slice(at, renderer.indexOf('api.onTurnStart(', at));
  const paint = body.indexOf('paintBusyFromViews();');
  const guarded = body.indexOf('if (payloadTabIsActive(view)) {');
  assert.notStrictEqual(paint, -1, 'the composer is never repainted');
  assert.ok(guarded !== -1 && paint < guarded, 'the repaint still hides behind the active-tab check');
});

check('a settle repaints the composer whatever tab it names', () => {
  const at = renderer.indexOf('api.onSettled((p) => {');
  const body = renderer.slice(at, renderer.indexOf('api.onNotice(', at));
  assert.ok(!/if \(payloadTabIsActive\(view\)\) paintBusyFromViews\(\)/.test(body),
    'the repaint is still conditional on the payload\'s tab');
  const paint = body.indexOf('paintBusyFromViews();');
  const drain = body.indexOf('drainQueue(view)');
  assert.ok(paint !== -1 && drain !== -1 && paint < drain, 'the button is repainted after the queue moves');
});

check('an error in a background tab still clears the button', () => {
  const at = renderer.indexOf('api.onError((p) => {');
  const body = renderer.slice(at, renderer.indexOf('/*\n * Reconcile the pill', at));
  const paint = body.indexOf('paintBusyFromViews();');
  const earlyReturn = body.indexOf('if (!payloadTabIsActive(view)) return;');
  assert.notStrictEqual(paint, -1, 'the composer is never repainted on error');
  assert.ok(earlyReturn === -1 || paint < earlyReturn, 'the repaint sits behind the early return');
});

check('the watchdog also fixes a button that was never repainted', () => {
  assert.ok(/function reconcileBusy\(\)/.test(renderer), 'the reconcile step is not a named function');
  assert.ok(/Boolean\(active\?\.busy\) !== !sendBtn\.hidden/.test(renderer),
    'the watchdog only acts while the flag says busy, so a missed settle is never repaired');
  assert.ok(/if \(!sendBtn\.hidden\) setBusy\(false\);/.test(renderer),
    'with no tab on screen the composer keeps saying "working"');
  assert.ok(/document\.addEventListener\('visibilitychange'/.test(renderer), 'coming back to the window repairs nothing');
  assert.ok(/window\.addEventListener\('focus', \(\) => reconcileBusy\(\)\)/.test(renderer),
    'focusing the window repairs nothing');
});

console.log(`\n${pass} checks passed`);
