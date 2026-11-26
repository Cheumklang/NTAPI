/**
 * Three complaints from one session (2026-11-26), each with one cause:
 *
 *   1. The dot in front of a chat's name kept spinning after the turn had
 *      finished. `refreshSessionBusy()` painted the row of the *active* view
 *      only, so a settle that arrived for a background tab left that row busy
 *      for the rest of the process's life.
 *   2. A turn that was open when the app closed came back with no way to carry
 *      on: the pause/continue button lives in memory and went with the process,
 *      and nothing in the reopened chat offered to resume. A finished turn always
 *      ends with an assistant entry, so "last entry is the question" is the mark.
 *   3. Shift+Enter in a queued message could not start a new line: the editor was
 *      an `input`, which cannot hold one.
 *
 * These are source checks — the renderer has no DOM harness — so each one pins
 * the shape that makes the behaviour true.
 *
 * Run from app/:   node scripts/selftest-busy-and-resume.js
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

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');

/** The source of one function, braces matched. */
function body(src, name) {
  const found = new RegExp(`(?:async\\s+)?function ${name}\\(`).exec(src);
  if (!found) return '';
  const start = found.index;
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/* 1. The spinner follows every open chat, not just the one on screen. */
const refresh = body(app, 'refreshSessionBusy');
check('busy row: every open view is repainted', /for \(const view of views\.values\(\)\)/.test(refresh), refresh.slice(0, 200));
check('busy row: the active view is no longer the only source', !/const view = activeView\(\);/.test(refresh));
check('busy row: the dot is drawn for background tabs', /view\.tabId !== activeTabId/.test(refresh));
check('busy row: a settled view clears both the class and the dot', /classList\.toggle\('busy', busy\)/.test(refresh));

/* 2. An unfinished turn offers one press to carry on. */
const render = body(app, 'renderActiveTab');
check(
  'resume: a chat whose last entry is the question gets the continue line',
  /lastStored\.kind === 'user'/.test(render) && /onRetry: \(\) => retryTurn\(view\)/.test(render),
  render.slice(-400)
);
check('resume: it is not offered while a turn is running', /!view\.busy && lastStored/.test(render));
check(
  'resume: it is drawn on every repaint, so reopening the app shows it',
  (render.match(/appendErrorBanner\(t\('turnUnfinished'\)/g) || []).length === 1
);
check('resume: the wording exists in both languages', /turnUnfinished: 'The previous turn/.test(app) && /turnUnfinished: 'เทิร์นก่อนหน้า/.test(app));

/* 3. The queue editor is a textarea and only saves on a bare Enter. */
check(
  'queue edit: the field can hold a newline',
  /const field = document\.createElement\('textarea'\);/.test(app)
);
check(
  'queue edit: Shift+Enter is left to the browser',
  /if \(e\.key === 'Enter' && !e\.shiftKey\) \{/.test(app)
);
check('queue edit: the field grows with its text', /field\.style\.height = `\$\{Math\.min\(field\.scrollHeight, 96\)\}px`/.test(app));
check('queue edit: a tall message scrolls instead of stretching the row', /\.queue-edit \{[^}]*max-height: 96px;/.test(css));

if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll busy-row / resume / queue-edit checks passed.');
