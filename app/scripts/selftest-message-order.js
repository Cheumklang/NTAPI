/**
 * A pending message keeps the slot it was written in.
 *
 * The merge puts local messages that the session file does not have yet back into
 * the transcript on every repaint (a tab switch, a reload, a restored window).
 * It used to append them, which put the reader's question *under* the answer it
 * had already started — the session had the reply but not the prompt yet.
 *
 * The drawn result is measured in `scripts/check-message-order.js`; this keeps the
 * wiring from being undone on a machine with no window.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

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

function slice(from, to) {
  const at = renderer.indexOf(from);
  assert.notStrictEqual(at, -1, `${from} is missing`);
  const end = renderer.indexOf(to, at);
  return renderer.slice(at, end === -1 ? renderer.length : end);
}

check('a sent message remembers where it belongs', () => {
  const src = slice('async function sendQueued', 'function renderQueue');
  assert.ok(/pending: true,/.test(src), 'the pending copy carries no position');
  assert.ok(/pendingAt: view\.messages\.length/.test(src), 'the slot is not recorded at send time');
});

check('the merge puts it back in that slot instead of at the end', () => {
  const src = slice('function mergeIncomingMessages', '/*\n * Which conversation');
  assert.ok(/out\.splice\(/ .test(src), 'the pending copy is still appended');
  assert.ok(/m\.pendingAt/.test(src), 'the recorded slot is not used');
  assert.ok(/Math\.min\(wanted, out\.length\)/.test(src), 'a stale slot would push past the end');
  assert.ok(!/return next\.concat\(kept\)/.test(src), 'the old append is still there');
});

console.log(`\n${pass} checks passed`);
