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
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

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
const side = rules('.composer-side');

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

// --- placement: inside the composer, bottom-right, under the buttons -------
//
// It used to be a sibling of .composer-box, so it sat on its own row above the
// chat box and pushed the layout. It has to be *inside* the box to stay put.
const boxStart = html.indexOf('<div class="composer-box">');
const boxEnd = html.indexOf('</footer>');
check('the composer box exists', boxStart !== -1);
const boxSlice = boxStart === -1 ? '' : html.slice(boxStart, boxEnd === -1 ? undefined : boxEnd);
check('the queue lives inside the composer box', /id="queueBar"/.test(boxSlice));

// And it must come *after* the button row in source order, so it renders beneath
// Send (bottom-right of the box), which is where it was asked to go.
const queueAt = boxSlice.indexOf('id="queueBar"');
const actionsAt = boxSlice.indexOf('class="composer-actions"');
check('the queue is in the composer box', queueAt !== -1);
check('the queue renders below the buttons', queueAt !== -1 && actionsAt !== -1 && queueAt > actionsAt);

// The queue must not be the composer's sibling anymore.
check('the queue is no longer a sibling above the composer', !/<div id="queueBar"[^>]*><\/div>\s*<div id="attachments"/.test(html));

// The composer wraps, so the queue can take a full-width row of its own.
check('the composer wraps its rows', /\.composer-box\s*\{[^}]*flex-wrap:\s*wrap/.test(css));

// The queue is as wide as the box you type in, not a short strip on the right.
check('the queue spans the whole row', /flex:\s*1 0 100%/.test(bar));
check('the queue never exceeds the composer', /max-width:\s*100%/.test(bar));
check('the queue text takes the row so it truncates at the edge', /flex:\s*1 1 auto/.test(text));
check('the buttons keep their own row above it', /flex:\s*0 0 auto/.test(side));
check('the textarea keeps a usable width', /#input\s*\{[^}]*min-width:\s*0/.test(css));

// A full-width list does not need a leading dash.
check('no leading dash on the queued lines', !/\.queue-text::before/.test(css));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll queue chrome checks passed');
