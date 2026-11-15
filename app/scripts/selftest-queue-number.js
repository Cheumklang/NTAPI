/**
 * Queue rows are numbered, and the drag ghost is a small tag.
 *
 * Two things the row was missing. Order was implied only by stacking, so with a
 * ghost lifted off the list — or two similar messages — there was no way to say
 * which was first. And the ghost was as wide as the composer, so while dragging
 * it covered the rows you were aiming at.
 *
 * Run: node scripts/selftest-queue-number.js
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

// --- numbering ----------------------------------------------------------
const renderQueue = body(app, 'renderQueue');
check('the queue is rendered', renderQueue !== '');
// The index has to be available to the loop, or there is no number to show.
check('the loop has the position', /items\.forEach\(\(item, index\)/.test(renderQueue));
check('a number element is built', /queue-num/.test(renderQueue));
check('it shows the position, one-based', /String\(index \+ 1\)/.test(renderQueue));
// It goes before everything else: an index read after the controls is a label
// for the controls, not for the message.
const atNum = renderQueue.indexOf('line.appendChild(num)');
const atGrip = renderQueue.indexOf('line.appendChild(grip)');
const atEdit = renderQueue.indexOf('line.appendChild(edit)');
check('the number is the first thing in the row',
  atNum !== -1 && atNum < atGrip && atNum < atEdit, { atNum, atGrip, atEdit });
check('the number is not announced as bare text', /setAttribute\('aria-label', t\('queuePosition'/.test(renderQueue));
check('the wording exists in both languages',
  (app.match(/queuePosition:/g) || []).length === 2,
  (app.match(/queuePosition:/g) || []).length);

const numRule = (() => {
  const at = css.indexOf('.queue-num {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the number has a style', numRule !== '');
check('single and double digits take the same width', /tabular-nums/.test(numRule));
check('the number cannot be selected with the text', /user-select:\s*none/.test(numRule));
check('the number does not grow the row', /flex:\s*0 0 auto/.test(numRule));

// --- the ghost is small -------------------------------------------------
const showGhost = body(app, 'showDragGhost');
check('the ghost is built', showGhost !== '');
// The old version pinned the ghost to the queue bar's width. That is what made
// it a full-width band.
check('the ghost is not sized from the queue bar', !/getBoundingClientRect\(\)\.width/.test(showGhost));
check('the ghost no longer measures the bar at all', !/el\('queueBar'\)/.test(showGhost));
check('the ghost label is shortened', /shortenGhost\(/.test(showGhost));

// Read by slice rather than by brace matching: the function contains a regex
// with a brace-free but bracket-heavy body, and file line endings vary.
const shorten = (() => {
  const at = app.indexOf('function shortenGhost');
  return at === -1 ? '' : app.slice(at, at + 700);
})();
check('there is a shortening helper', shorten !== '');
check('it collapses whitespace first', /replace\(\/\\s\+\/g, ' '\)/.test(shorten));
check('it has a length limit', /limit = \d+/.test(shorten));
check('it counts code points, not UTF-16 units', /\[\.\.\.flat\]/.test(shorten));
check('it marks the cut with an ellipsis', /\u2026/.test(shorten));
// A cut mid-combining-mark garbles Thai; counting code points then joining keeps
// each character whole.
check('it slices the code point array', /chars\.slice\(0, limit\)/.test(shorten));

const ghostRule = (() => {
  const at = css.indexOf('.queue-ghost {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the ghost has a style', ghostRule !== '');
check('the ghost is capped in width', /max-width:\s*\d+px/.test(ghostRule));
check('the cap is small', (() => {
  const m = ghostRule.match(/max-width:\s*(\d+)px/);
  return m ? Number(m[1]) <= 300 : false;
})());
check('the ghost is no longer full width', !/right:\s*0/.test(ghostRule));
check('the ghost stays a pill', /border-radius:\s*999px/.test(ghostRule));
check('a long label is truncated in the pill', /text-overflow:\s*ellipsis/.test(ghostRule));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue number and ghost-size checks passed');
