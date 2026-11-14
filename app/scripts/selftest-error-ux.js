/**
 * Offline regression guard for how failures behave in the chat view.
 *
 * A failed tool used to pop its card open and force the transcript to the
 * bottom. Users read that as the app taking over: the box "opens itself" and
 * the view jumps to it. This test pins the rule instead — a failure is marked
 * in place, and the transcript only follows when the reader is already at the
 * bottom.
 *
 * src/renderer/app.js needs a live DOM, so this check reads the source and
 * inspects the two functions that own that behaviour.
 *
 * Run: node scripts/selftest-error-ux.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

/** Pull `function name(...) { ... }` out of the source by brace matching. */
function bodyOf(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const applyToolResult = bodyOf('applyToolResult');
const appendErrorBanner = bodyOf('appendErrorBanner');

check('applyToolResult exists', Boolean(applyToolResult));
check('appendErrorBanner exists', Boolean(appendErrorBanner));

// 1. A failure must not expand its own card.
check(
  'a failed tool card stays collapsed',
  Boolean(applyToolResult) && !/classList\.remove\(\s*'collapsed'\s*\)/.test(applyToolResult),
  'applyToolResult must not remove the collapsed class'
);

// 2. A failure must not expand the whole tools group either.
check(
  'a failed tool does not open the tool group',
  Boolean(applyToolResult) && !/tools\.hidden\s*=\s*false/.test(applyToolResult),
  'applyToolResult must not set tools.hidden = false'
);

// 3. The failure still has to be visible: red card, "Failed" label, group summary.
check(
  'the failure is still marked on the card',
  Boolean(applyToolResult) && /classList\.toggle\(\s*'error'/.test(applyToolResult) && /toolFailed/.test(applyToolResult)
);
check(
  'the group summary is refreshed so the failure is countable',
  Boolean(applyToolResult) && /refreshToolsSummary\(/.test(applyToolResult)
);

// 4. The error banner must never force the transcript to the bottom.
check(
  'the error banner does not force a scroll',
  Boolean(appendErrorBanner) && !/scrollToBottom\(\s*true\s*\)/.test(appendErrorBanner),
  'appendErrorBanner must call scrollToBottom() without the force flag'
);
check(
  'the error banner still follows a reader who is at the bottom',
  Boolean(appendErrorBanner) && /scrollToBottom\(/.test(appendErrorBanner)
);

// 5. scrollToBottom keeps its "only when near the bottom" rule.
const scroll = bodyOf('scrollToBottom');
check(
  'scrollToBottom only moves when the reader is near the bottom',
  Boolean(scroll) && /nearBottom/.test(scroll) && /if\s*\(\s*force\s*\|\|\s*nearBottom\s*\)/.test(scroll)
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: failures stay marked, never in the reader\'s face');
