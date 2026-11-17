/**
 * A queued message being edited must not eat the window.
 *
 * The queue editor draws the attachments of the message it is editing so they can
 * be removed or added. It created `.queue-edit-media`, `.queue-edit-chip`,
 * `.queue-edit-rm` and `.queue-attach` — and no stylesheet ever defined them, so a
 * photo kept its intrinsic size: a phone screenshot sat at full resolution over
 * the chat, the words it belonged to underneath it, and the three buttons that
 * would fix the mistake were somewhere off screen.
 *
 * This test pins the two things that failed: every class that editor creates has a
 * rule, and the picture inside a chip is constrained on both axes.
 *
 * Run: node scripts/selftest-queue-edit-media.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** The declaration block for a selector, or '' when the selector has no rule. */
function rule(selector) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return close === -1 ? '' : css.slice(open + 1, close);
}

/* ---------- every class the queue editor creates is styled ---------- */

const editorClasses = [
  'queue-item',
  'queue-line',
  'queue-num',
  'queue-grip',
  'queue-edit',
  'queue-edit-media',
  'queue-edit-chip',
  'queue-save',
  'queue-cancel',
  'queue-attach',
];

for (const name of editorClasses) {
  check(`.${name} has a rule`, new RegExp(`\\.${name}[\\s,{:]`).test(css));
}

check('the remove button is styled', /\.queue-item \.queue-edit-rm \{/.test(css));

/* ---------- the picture is constrained on both axes ---------- */

const chipImg = rule('.queue-edit-chip img');
check('the chip picture has a width rule', /width: 100%/.test(chipImg));
check('the chip picture has a height rule', /height: 100%/.test(chipImg));
check('it is capped on width too', /max-width: 100%/.test(chipImg));
check('and on height', /max-height: 100%/.test(chipImg));
check('it fills the chip instead of letterboxing it', /object-fit: cover/.test(chipImg));

const chip = rule('.queue-edit-chip');
check('the chip itself is a fixed square', /width: 46px/.test(chip) && /height: 46px/.test(chip));
check('the chip does not grow with the picture', /flex: 0 0 auto/.test(chip));

/* ---------- the buttons stay reachable ---------- */

const remove = rule('.queue-item .queue-edit-rm');
check('the remove button is not hidden at rest', /opacity: 1/.test(remove));
check('it sits on the chip corner', /position: absolute/.test(remove));
const attach = rule('.queue-item .queue-attach');
check('the add-picture button is visible at rest', /opacity: 1/.test(attach));

/* ---------- the strip wraps instead of widening the row ---------- */

const media = rule('.queue-edit-media');
check('the strip is a flex row', /display: flex/.test(media));
check('it wraps when there are several chips', /flex-wrap: wrap/.test(media));

/* ---------- and the editor still does its job ---------- */

check(
  'removing a picture re-renders the row',
  /item\.images\.splice\(i, 1\);\s*\n\s*renderQueue\(\);/.test(app)
);
check(
  'adding pictures appends to the same list',
  /item\.images = \[\.\.\.\(item\.images \|\| \[\]\), \.\.\.picked\];/.test(app)
);
check('a picture chip carries the picture', /thumb\.src = att\.dataUri;/.test(app));

console.log(
  failures === 0 ? '\nAll queue-edit media checks passed.' : `\n${failures} queue-edit media check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);