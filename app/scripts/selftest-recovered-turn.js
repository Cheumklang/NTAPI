/**
 * Putting an interrupted turn back — as the messages it actually was.
 *
 * The user sent the same text twice, both landed in one running turn, the turn
 * was lost, and the window showed the two sends glued into a single bubble
 * separated by a blank line (2026-11-21). Joining them is right for the model and
 * wrong for the reader: two sends are two messages.
 *
 * Run from app/:   node scripts/selftest-recovered-turn.js
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
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

/** The source of one top-level function, braces matched. */
function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
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

const source = body(main, 'messagesForUi');
check('the UI builder is where it always was', source.length > 500);

// Everything the builder reaches for, stubbed to what the transcript needs.
const splitAttachmentNotes = (text) => ({ text, imagePaths: [] });
const build = new Function(
  'splitAttachmentNotes',
  'RECOVERED_TURN_CUSTOM_TYPE',
  'parseUnifiedDiff',
  'friendlyProviderError',
  `return (${source});`
)(
  splitAttachmentNotes,
  'ntapi.interrupted-turn',
  () => null,
  () => ({ text: '' })
);

/* ------------------------------------------------- two sends, one turn */

const two = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 111,
    details: { user: 'first\n\nsecond', userParts: ['first', 'second'], assistant: '' },
  },
]);

check('two sends come back as two messages', two.length === 2, JSON.stringify(two));
check('in the order they were sent', two[0]?.text === 'first' && two[1]?.text === 'second');
check('both are user bubbles', two.every((m) => m.kind === 'user'));
check('neither carries the other inside it', !/second/.test(two[0]?.text || ''));

/* ---------------------------------------------- one send, and old sessions */

const one = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 1,
    details: { user: 'just me', userParts: ['just me'], assistant: '' },
  },
]);
check('one send is still one bubble', one.length === 1 && one[0].text === 'just me');

const old = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 1,
    details: { user: 'from an older build', assistant: '' },
  },
]);
check('a session written before userParts existed still draws', old.length === 1 && old[0].text === 'from an older build');

const junk = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 1,
    details: { user: 'kept', userParts: ['kept', '   ', 42, null], assistant: '' },
  },
]);
check('only real strings become bubbles', junk.length === 1 && junk[0].text === 'kept');

/* ------------------------------------------------- the cut-off answer */

const both = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 5,
    details: {
      user: 'ask one\n\nask two',
      userParts: ['ask one', 'ask two'],
      assistant: 'half an ans',
    },
  },
]);
check('the restored answer follows the requests', both.length === 3 && both[2].kind === 'assistant');
check('and is marked as cut off', both[2]?.recovered === true);
check('the requests stay separate even then', both[0].text === 'ask one' && both[1].text === 'ask two');

/* --------------------------------------------- what main.js writes down */

check('the note is stored per prompt', /userParts: userLost \? draft\.prompts\.map/.test(main));
check('the model is told how many messages there were', /separate messages in that turn/.test(main));
check('the model still gets one block to read', /const userText = draft\.prompts\.join\('\\n\\n'\)\.trim\(\)/.test(main));
check('both prompts are kept, not just the last', /tab\.turnDraft\.prompts\.push\(promptText\)/.test(main));

const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
check(
  'the window draws one bubble per user entry',
  /if \(m\.kind === 'user'\) \{\n\s*renderUserMessage\(/.test(renderer)
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: a turn that held two sends is put back as two messages');
