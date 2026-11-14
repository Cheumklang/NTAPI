/**
 * No copy button on a reply; the text is selected with the mouse instead.
 *
 * A copy control under every answer was clutter. Selecting the part you want is
 * both easier and more precise than copying the whole reply and deleting the
 * rest, so the per-reply action row is gone. Code blocks keep their own copy
 * button, because there the whole block is exactly what you want.
 *
 * The reply must also stay selectable: a `user-select: none` anywhere on a message
 * would make the replacement impossible.
 *
 * Run: node scripts/selftest-copy-button.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const md = fs.readFileSync(path.join(root, 'markdown.js'), 'utf8');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

// --- 1. the per-reply copy button is gone ------------------------------

check('no copy button is built for a reply', !/className = 'msg-copy'/.test(app));
check('no copy handler is attached to a reply', !/copyBtn\.addEventListener/.test(app));
check('the reply action row is not appended', !/className = 'msg-actions'/.test(app));
check('the action row CSS is gone', !/\.msg-actions\s*\{/.test(css));
check('the copy button CSS is gone', !/\.msg-copy\s*\{/.test(css));

// --- 2. replies are still built, with their body -----------------------

check('a reply still gets a body', /body\.className = 'body'/.test(app));
check('the body is still appended', /wrap\.appendChild\(body\)/.test(app));
check('the reply is still added to the transcript', /transcript\.appendChild\(wrap\)/.test(app));

// --- 3. text stays selectable ------------------------------------------

// user-select: none anywhere near .msg would defeat the whole point.
const selectNone = [...css.matchAll(/([^{}]*)\{([^}]*user-select:\s*none[^}]*)\}/g)];
const blocksOff = selectNone.filter((m) => /\.msg\b|\.body\b|\.transcript\b|#transcript/.test(m[1]));
check('no message block disables selection', blocksOff.length === 0,
  blocksOff.map((m) => m[1].trim()).slice(0, 3));

check('the transcript does not disable selection',
  !/\.transcript\s*\{[^}]*user-select:\s*none/.test(css));

// --- 4. code blocks keep their copy button -----------------------------

check('code blocks still have a copy button', /data-copy-block/.test(md));
check('the code copy handler is wired', /data-copy-block/.test(md) && /addEventListener\('click'/.test(md));
check('the code copy label still comes from the caller', /copiedLabel/.test(md));
check('app still passes the copied label for code', /copiedLabel: t\('copied'\)/.test(app));

// --- 5. no orphaned string remains in the way --------------------------

// copyReply may still be referenced by nothing, which is fine, but the reply
// path must not try to use it.
const replyFn = (() => {
  const start = app.indexOf('function renderUserMessage(');
  const end = app.indexOf('function holdMessage(');
  return start !== -1 && end > start ? app.slice(start, end) : '';
})();
check('the reply renderer no longer mentions copyReply', replyFn !== '' && !/copyReply/.test(replyFn));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll copy-button checks passed');
