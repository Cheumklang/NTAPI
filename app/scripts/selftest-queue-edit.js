/**
 * A queued message can be edited where it stands, and the queue can be reordered.
 *
 * Two things are easy to get wrong and both are covered here:
 *   1. Editing must not move the item. Saving writes the text back into the same
 *      array slot, so the user does not have to re-order the queue after a typo.
 *   2. An item being edited must not be sent. The drain runs when a turn ends,
 *      which can easily happen mid-edit — shipping the old text would silently
 *      undo the fix.
 *
 * Run: node scripts/selftest-queue-edit.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

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
  const sig = src.indexOf('(', start);
  let pd = 0;
  let after = -1;
  for (let i = sig; i < src.length; i += 1) {
    if (src[i] === '(') pd += 1;
    else if (src[i] === ')') { pd -= 1; if (pd === 0) { after = i; break; } }
  }
  const open = src.indexOf('{', after);
  let d = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') { d -= 1; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}

// --- 1. editing in place ------------------------------------------------

const save = body(app, 'saveQueueEdit');
check('there is a save path for an edited item', save !== '');
check('saving writes into the existing slot', /view\.queue\[at\]\.text = draft/.test(save));
check('saving never pushes the item to the back', !/splice\(from, 1\)|\.push\(/.test(save));
check('saving clears the editing flag', /editing = false/.test(save));
check('saving refuses an empty draft', /if \(!draft\) return;/.test(save));

const cancel = body(app, 'cancelQueueEdit');
check('an edit can be cancelled', cancel !== '');
// Cancelling is "not this message" — the row leaves the queue (so a finished
// turn can never pick it up and send it) and the unsaved draft goes back to the
// composer, where the person decides: send, or drop.
check('cancelling removes the item from the queue', /\[removed\] = view\.queue\.splice\(at, 1\)/.test(cancel));
check('cancelling returns the draft to the composer', /input\.value = String\(removed\.draft/.test(cancel));
check('cancelling does not keep a stale editing flag behind', /editing = false/.test(cancel) === false);

// --- 2. an item being edited is never sent ------------------------------

const drain = body(app, 'drainQueue');
check('the drain checks for an item being edited', /\.editing/.test(drain));
check('an edited item blocks the drain instead of being sent',
  /if \(blocked\) \{[\s\S]{0,120}return;/.test(drain));
const drainGate = drain.indexOf('editing');
const drainShift = drain.indexOf('view.queue.shift()');
check('the check happens before the item is taken', drainGate !== -1 && drainShift !== -1 && drainGate < drainShift);

// --- 3. the row offers the controls -------------------------------------

check('a row shows an edit button for a message', /queue-edit-btn/.test(app));
check('a row shows a drag handle', /queue-grip/.test(app));
check('the handle is labelled for screen readers', /setAttribute\('aria-label', t\('queueReorder'\)\)/.test(app));
check('edit opens with the current text', /\.draft = v\.queue\[at\]\.text/.test(app));
check('Enter saves', /if \(e\.key === 'Enter'\)/.test(app));
check('Escape cancels', /if \(e\.key === 'Escape'\)/.test(app));
check('Save is disabled while the text is empty', /save\.disabled = !String\(item\.draft \?\? ''\)\.trim\(\)/.test(app));

// --- 4. reordering ------------------------------------------------------

const move = body(app, 'moveQueueItem');
check('a move helper exists', move !== '');
check('a move splices out and back in', /splice\(from, 1\)/.test(move) && /splice\(to, 0, item\)/.test(move));
check('a move is bounds checked', /to < 0 \|\| to >= view\.queue\.length/.test(move));

const drop = body(app, 'endQueueDrag');
check('a drag applies on release', drop !== '');
check('a drag resolves the item by id, not by index', /findIndex\(\(q\) => q\.queueId === id\)/.test(drop));

const index = body(app, 'queueDropIndex');
check('the drop position uses row midpoints', /clientY < r\.top \+ r\.height \/ 2/.test(index));
check('the dragged row is not counted as a target',
  /!r\.classList\.contains\('dragging'\)/.test(index));

check('the grip starts a drag', /handle\.addEventListener\('pointerdown'/.test(app));
check('the row itself also starts a drag', /enableQueueDrag\(row, row\)/.test(app));
check('a row being edited is not draggable',
  /row\.classList\.contains\('editing'\)/.test(app));
check('a drag ends outside the queue too', /window\.addEventListener\('pointerup'/.test(app));
check('alt+arrow moves a row from the keyboard', /e\.altKey/.test(app) && /ArrowUp/.test(app));

// --- 5. the drag never fights selection or buttons ----------------------

check('a click inside a button or field does not start a drag',
  /e\.target\.closest\('button, input'\)/.test(app));

// --- 6. styled, and quiet at rest ---------------------------------------

check('the grip is styled', /\.queue-grip\s*\{/.test(css));
check('the grip is faint until hovered', /\.queue-grip\s*\{[^}]*opacity:\s*0/.test(css));
check('the edit field is styled', /\.queue-edit\s*\{/.test(css));
check('a dragged row looks lifted', /\.queue-item\.dragging\s*\{/.test(css));
check('the editing row keeps its full width', /\.queue-item\.editing \.queue-line\s*\{/.test(css));
check('both new controls have a focus ring',
  /\.queue-grip:focus-visible/.test(css) && /\.queue-edit-btn:focus-visible/.test(css));

// --- 7. both languages --------------------------------------------------

check('the edit label exists in English', /queueEdit: 'Edit'/.test(app));
check('the edit label exists in Thai', /queueEdit: 'แก้ไข'/.test(app));
check('the save label exists in both', /queueSave: 'Save'/.test(app) && /queueSave: 'บันทึก'/.test(app));
check('the reorder hint exists in both', /queueReorder: 'Drag to reorder'/.test(app) && /queueReorder: 'ลากเพื่อสลับลำดับ'/.test(app));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue edit and reorder checks passed');
