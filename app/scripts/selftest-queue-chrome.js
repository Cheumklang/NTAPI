/**
 * The queue above the composer is a footnote, not a panel.
 *
 * It used to draw a bordered, filled bar, and then a bordered purple pill for
 * every item inside it, each with a permanent × at 14px. Four queued messages
 * made a stack taller than the composer itself — the complaint that started
 * this.
 *
 * The rules that keep it small, checked here so they cannot creep back:
 *   1. no frame or fill on the bar itself
 *   2. no pill (frame/fill/radius) on the items
 *   3. item text is quieter and smaller than the composer's text
 *   4. the × is hidden until the row is hovered or focused
 *
 * Run: node scripts/selftest-queue-chrome.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Every declaration block for one selector, concatenated. */
function rules(selector) {
  const out = [];
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Comments sit between the previous block and this selector, so allow any
  // run of non-brace characters rather than just whitespace.
  const re = new RegExp(`(?:^|[}])\\s*[^{}]*?${esc}\\s*\\{([^}]*)\\}`, 'g');
  let m;
  while ((m = re.exec(css))) out.push(m[1]);
  return out.join('\n');
}

const bar = rules('.queue-bar');
const item = rules('.queue-item');
const text = rules('.queue-text');
const btn = rules('.queue-item button');

check('the bar is styled at all', bar.trim() !== '');
check('the item is styled at all', item.trim() !== '');

// 1. The bar itself draws nothing.
check('the bar draws no frame', !/(^|[^-])border\s*:/.test(bar) && !/border-radius/.test(bar));
check('the bar draws no fill', !/(^|[^-])background\s*:/.test(bar));
check('the bar draws no padding box', !/(^|[^-])padding\s*:/.test(bar));

// 2. The item is not a pill.
check('the item draws no frame', !/(^|[^-])border\s*:/.test(item) && !/border-radius/.test(item));
check('the item draws no fill', !/(^|[^-])background\s*:/.test(item));
check('the item keeps no purple accent', !/124,\s*92,\s*255/.test(item));

// Line height stays tight: an 11-12px line, not a 28px row.
check('the item adds no vertical padding', !/padding:\s*[1-9]/.test(item));

// 3. Text is quieter than the message text it sits above.
check('the item text is small', /font-size:\s*1[12](\.5)?px/.test(text));
check('the item text is muted', /color:\s*var\(--muted\)/.test(text));
check('the item text is one line', /white-space:\s*nowrap/.test(text));
check('long items truncate instead of wrapping', /text-overflow:\s*ellipsis/.test(text));

// 4. The × is not permanent chrome.
check('the remove button hides at rest', /opacity:\s*0/.test(btn));
check('the remove button appears on hover', /\.queue-item:hover button[\s\S]*?opacity:\s*1/.test(css));
// Hidden controls must not be reachable only by mouse.
check('the remove button appears on keyboard focus', /\.queue-item button:focus-visible[^{]*\{[^}]*opacity:\s*1/.test(css));
check('the remove button lost its filled hover', !/button:hover\s*\{[^}]*background/.test(css.slice(css.indexOf('.queue-item button'))));

// The count line must be short enough not to wrap in a narrow sidebar.
check('the count line is brief in English', /queuedMany: 'Queued: \{n\}'/.test(app));
check('the count line is brief in Thai', /queuedMany: 'ในคิว: \{n\}'/.test(app));
check('the long explanatory wording is gone', !/sends when the current turn finishes/.test(app));

// The bar must still be reachable and still group with the composer.
check('the bar is aligned to the reading width', /max-width:\s*var\(--read-width\)/.test(bar));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue chrome checks passed');
