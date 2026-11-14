/**
 * Opening the editor must stop the countdown on that message.
 *
 * A queued message is held for a few seconds before it goes out, and the row it
 * is held in carries the editor. Pressing the pencil used to leave the clock
 * running, so it fired while the user was still typing: the *old* text was sent
 * and the row being edited vanished with it. Pressing the "edit" button in the
 * countdown row worked, because that path detaches the hold — the pencil simply
 * never did.
 *
 * Run: node scripts/selftest-queue-edit-hold.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

// --- the helper exists ---------------------------------------------------
check('there is a way to stop one message\'s countdown', /function cancelHoldFor\(/.test(src));

const helper = body(src, 'cancelHoldFor');
check('it matches on the queue id', /record\.item\?\.queueId !== queueId/.test(helper));
check('it stops the timer', /clearInterval\(record\.timer\)/.test(helper));
check('it forgets the hold', /holds\.delete\(/.test(helper));
check('it removes the countdown row', /record\.row\.remove\(\)/.test(helper));
// The message must stay: the pencil edits in place, it does not take the words
// back to the composer.
check('it does not take the words back to the composer', !/input\.value =/.test(helper));
check('it does not remove the queued item', !/queue\.splice|queue\.shift/.test(helper));

// --- the pencil calls it, before it opens the editor --------------------
const editClick = (() => {
  const at = src.indexOf("edit.className = 'queue-edit-btn'");
  if (at === -1) return '';
  const end = src.indexOf('});', src.indexOf("edit.addEventListener('click'", at));
  return src.slice(at, end);
})();
check('the pencil handler exists', editClick !== '');
check('the pencil stops the countdown', /cancelHoldFor\(item\.queueId\)/.test(editClick));
check('it stops it before opening the editor',
  editClick.indexOf('cancelHoldFor(') < editClick.indexOf('.editing = true'), editClick.length);
check('the pencil still opens the editor', /\.editing = true/.test(editClick));
check('the pencil still seeds the draft', /\.draft = /.test(editClick));

// --- the countdown row's own "edit" button is unchanged -----------------
// It takes the words back to the composer, which is a different intent, so it
// must keep using giveBack rather than cancelHoldFor.
const holdEdit = (() => {
  const at = src.indexOf("edit.className = 'hold-btn'");
  if (at === -1) return '';
  return src.slice(at, at + 400);
})();
check('the countdown row still has its own edit button', /hold-btn/.test(holdEdit));
check('that button still gives the words back', /giveBack\(true\)/.test(src));

// --- the hold record knows which item it belongs to ---------------------
// cancelHoldFor cannot match anything without this.
check('a hold records the item it belongs to', /hold\.item = item/.test(src));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue edit/hold checks passed');
