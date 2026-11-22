/**
 * Where the running turn starts in the drawn messages.
 *
 * Main sends this index with every tab state (`liveTurnStart`) so the renderer can
 * tell the running turn's bubble from the finished reply above it. Getting it wrong
 * is invisible until a repaint merges two turns into one bubble, so the rule is
 * measured here: right after the last user message, and only while a turn runs.
 *
 * Run from app/:   node scripts/selftest-live-turn-start.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail === undefined ? '' : `\n  ${JSON.stringify(detail)}`}`);
  }
}

// The function lives in main.js, which needs Electron to load. Pull it out by
// source and give it the two things it reads: the drawn messages and the tab.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const start = source.indexOf('function liveTurnStartIndex(');
check('main defines liveTurnStartIndex', start !== -1);
const end = source.indexOf('\nfunction ', start + 10);
const fn = source.slice(start, end === -1 ? source.length : end);
const liveTurnStartIndex = new Function(`${fn}\nreturn liveTurnStartIndex;`)();

const MESSAGES = [
  { kind: 'user', text: 'first' },
  { kind: 'assistant', text: 'answer', tools: [] },
  { kind: 'user', text: 'second' },
];

function tab({ streaming = false, busy = false } = {}) {
  return { busy, handle: { session: { isStreaming: streaming } } };
}

check('idle session asks for nothing', liveTurnStartIndex(MESSAGES, tab()) === null);
check('a streaming turn starts after the last user message', liveTurnStartIndex(MESSAGES, tab({ streaming: true })) === 3);
check(
  'a busy tab that has not streamed yet still counts as running',
  liveTurnStartIndex(MESSAGES, tab({ busy: true })) === 3
);
check(
  'a turn with no answer yet points at the end of the list',
  liveTurnStartIndex([{ kind: 'user', text: 'only' }], tab({ streaming: true })) === 1
);
check('a conversation with no user message starts at zero', liveTurnStartIndex([], tab({ streaming: true })) === 0);
check(
  'a session object that cannot answer does not throw',
  liveTurnStartIndex(MESSAGES, { busy: true, handle: {} }) === 3
);
check(
  'the last user message wins, not the first',
  liveTurnStartIndex([...MESSAGES, { kind: 'assistant', text: 'x', tools: [] }, { kind: 'user', text: 'third' }], tab({ streaming: true })) ===
    5
);

// The two sides of the wire: main sends the field, the renderer keeps it.
check('tabState sends the boundary', /liveTurnStart: liveTurnStartIndex\(messages, tab\)/.test(source));
const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
check('the renderer stores it', /liveTurnStart: Number\.isInteger\(state\.liveTurnStart\)/.test(renderer));
check('the repaint hands it to adoptLiveBubble', /adoptLiveBubble\(view, liveBubble, liveFrom !== null\)/.test(renderer));

if (failed) {
  console.error(`\n${failed} live-turn-start check(s) failed`);
  process.exit(1);
}
console.log('\nlive turn start: all checks passed');
