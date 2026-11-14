/**
 * The queue row's controls lead the row, and a drag shows what it is carrying.
 *
 * Two complaints drove this. The edit control was out at the far right of a row
 * as wide as the composer, so changing a message meant crossing the whole line to
 * find it — the same hunt the × had before it moved. And dragging gave no feedback
 * beyond the row fading: you could see what left, not where it was going.
 *
 * Run: node scripts/selftest-queue-controls.js
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

// --- the order of the row ------------------------------------------------
const renderQueue = body(app, 'renderQueue');
check('the queue is rendered', renderQueue !== '');

// The elements are *declared* in any order — the label is built early so its text
// can be read — but appendChild calls are what decide the row, so those are what
// this checks. Left to right the row must read grip, pencil, ×, then the words.
const atGrip = renderQueue.indexOf('row.appendChild(grip)');
const atEdit = renderQueue.indexOf('row.appendChild(edit)');
const atRemove = renderQueue.indexOf('row.appendChild(rm)');
const atText = renderQueue.indexOf('row.appendChild(label)');
check('all four parts are appended', atGrip !== -1 && atEdit !== -1 && atRemove !== -1 && atText !== -1);
check('the handle comes first', atGrip < atEdit);
check('the pencil comes before the ×', atEdit < atRemove);
check('the controls all come before the words', atRemove < atText);
check('nothing is appended after the words', renderQueue.slice(atText).indexOf('row.appendChild(') === 0);

// --- the edit control is a pencil ---------------------------------------
// A pencil, written as an escape so the source stays ASCII.
check('the edit control is a glyph, not the word', /edit\.textContent = '\\u270e';/.test(renderQueue));
check('the pencil still has a tooltip', /edit\.title = t\('queueEdit'\)/.test(renderQueue));
// A glyph alone is silent to a screen reader; the label has to be there.
check('the pencil has an accessible name', /edit\.setAttribute\('aria-label', t\('queueEdit'\)\)/.test(renderQueue));
check('the word is no longer rendered into the button', !/edit\.textContent = t\('queueEdit'\)/.test(renderQueue));

// --- both controls are visible at rest ----------------------------------
//
// They lead the row, so hiding them until hover leaves gaps before every message
// and keeps the control the reader wants out of sight.
const restRule = (() => {
  const at = css.indexOf('.queue-item .queue-edit-btn,');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the leading controls have a resting style', restRule !== '');
check('they are visible at rest', /opacity:\s*\.\d+/.test(restRule));
check('the resting opacity is not zero', /opacity:\s*0?\.0*[1-9]/.test(restRule));

// --- the drag ghost -----------------------------------------------------
check('a ghost is created on drag', /function showDragGhost\(/.test(app));
check('the ghost is removed on drop', /function hideDragGhost\(/.test(app));
check('the ghost follows the pointer', /function moveDragGhost\(/.test(app));

const beginBlock = app.slice(app.indexOf('const begin = (e) =>'), app.indexOf('const begin = (e) =>') + 700);
check('starting a drag shows the ghost', /showDragGhost\(/.test(beginBlock));

const endDrag = body(app, 'endQueueDrag');
check('dropping removes the ghost', /hideDragGhost\(\)/.test(endDrag));

const pointerUp = app.slice(app.indexOf("window.addEventListener('pointerup'"), app.indexOf("window.addEventListener('pointerup'") + 500);
check('the ghost is hidden even if the drag is cancelled', /pointercancel/.test(pointerUp));

const moveListener = app.slice(app.indexOf("window.addEventListener('pointermove'"), app.indexOf("window.addEventListener('pointermove'") + 260);
check('a pointer move updates the ghost', /moveDragGhost\(e\.clientY\)/.test(moveListener));
check('it only runs during a drag', /if \(dragState\)/.test(moveListener));

// The ghost carries the text so the reader can see what is being moved.
const showGhost = body(app, 'showDragGhost');
check('the ghost shows the message text', /queue-text/.test(showGhost));
check('the ghost is built from text, not a clone of the row', !/cloneNode/.test(showGhost));
// A clone would bring the buttons, and a click on a ghost must never remove
// the message it is carrying.
check('the ghost contains no controls', !/createElement\('button'\)/.test(showGhost));
check('the ghost is hidden from screen readers', /aria-hidden/.test(showGhost));

const ghostRule = (() => {
  const at = css.indexOf('.queue-ghost {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the ghost has a style', ghostRule !== '');
check('the ghost does not eat the pointer', /pointer-events:\s*none/.test(ghostRule));
check('the ghost floats above the page', /position:\s*fixed/.test(ghostRule));
check('the ghost is translucent', /opacity:\s*\.\d+/.test(ghostRule));
check('a long message is truncated in the ghost', /text-overflow:\s*ellipsis/.test(ghostRule));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue control checks passed');
