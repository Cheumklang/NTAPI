/**
 * The popup's markup and its script must agree.
 *
 * The popup is a plain page, and its script runs top to bottom: if it reaches
 * for an element the markup does not define, the whole script dies on that
 * line. The buttons above it keep working, so the failure looks like "the new
 * button does nothing" — and because `refresh()` sits at the end of the file,
 * the status line stays frozen on "Checking..." and the popup looks as if it
 * had lost its connection when nothing is wrong.
 *
 * This test reads both files and checks that they line up.
 *
 * Run from app/:   node scripts/selftest-browser-popup.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const dir = path.join(__dirname, '..', 'browser-extension');
const html = fs.readFileSync(path.join(dir, 'popup.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'popup.js'), 'utf8');

/** Every id="..." in the markup. */
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
/** Every element the script asks the page for. */
const usedIds = [...js.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);

check('the markup defines ids', htmlIds.length > 0, htmlIds.join(','));
check('the script asks for elements', usedIds.length > 0, usedIds.join(','));

// The failure that shipped: `claimEl` was used but never declared, so the
// hand-over button could not be clicked at all.
for (const id of usedIds) {
  check(`the script's #${id} exists in the markup`, htmlIds.includes(id), `markup ids: ${htmlIds.join(',')}`);
}
for (const id of htmlIds) {
  if (id === 'status') continue; // textContent only, never bound
  check(`the markup's #${id} is wired up in the script`, usedIds.includes(id), `script ids: ${usedIds.join(',')}`);
}

// `const xEl = document.getElementById('x')` is the binding the script reads
// from; every reference to `xEl` must come after it.
for (const id of usedIds) {
  const bound = new RegExp(`const\\s+${id}El\\s*=\\s*document\\.getElementById\\(['"]${id}['"]\\)`);
  check(`#${id} is bound to a variable`, bound.test(js), `no binding for ${id}`);
}

// Nothing may use an `...El` variable that was never declared: that is exactly
// the bug, and it is invisible until the user clicks.
const declared = new Set([...js.matchAll(/const\s+(\w+El)\s*=/g)].map((m) => m[1]));
const referenced = new Set([...js.matchAll(/\b(\w+El)\b/g)].map((m) => m[1]));
for (const name of referenced) {
  check(`${name} is declared before it is used`, declared.has(name), `referenced but never declared: ${name}`);
}

// `refresh()` reports the connection state; if it never runs, the popup shows
// a stale "Checking..." and looks disconnected.
check('the status is refreshed on load', /refresh\(\);?\s*$/.test(js.trim()));

// The hand-over button is the point of the popup.
check('the popup offers a hand-over button', /id="claim"/.test(html));
check('the hand-over button has a click handler', /claimEl\.addEventListener\(['"]click['"]/.test(js));
check('a missing hand-over button degrades instead of throwing', /if\s*\(\s*claimEl\s*\)/.test(js));

// `claimEl` must never be read unguarded at the top level.
check('the hand-over handler is guarded', /if\s*\(\s*claimEl\s*\)\s*\{\s*\n\s*claimEl\.addEventListener/.test(js));

process.exit(failed ? 1 : 0);
