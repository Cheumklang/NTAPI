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

const source = body(main, 'messagesForUi');
check('the UI builder is where it always was', source.length > 500);

// Everything the builder reaches for, stubbed to what the transcript needs.
const splitAttachmentNotes = (text) => ({ text, imagePaths: [] });
const splitSkillExpansion = (text) => ({ text, skill: '' });
// Same normalisation main.js uses to ask "is this text already in here?".
const searchKey = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const build = new Function(
  'splitAttachmentNotes',
  'splitSkillExpansion',
  'RECOVERED_TURN_CUSTOM_TYPE',
  'parseUnifiedDiff',
  'friendlyProviderError',
  'searchKey',
  `return (${source});`
)(
  splitAttachmentNotes,
  splitSkillExpansion,
  'ntapi.interrupted-turn',
  () => null,
  () => ({ text: '' }),
  searchKey
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

/* ------------------------------- the same sends, drawn twice (2026-11-21) */

// After a restore the transcript held both the messages the user really sent and
// the note that repeats them, so the window showed four bubbles where there had
// been two.
const duplicated = build([
  { role: 'user', content: [{ type: 'text', text: 'first' }], timestamp: 1 },
  { role: 'user', content: [{ type: 'text', text: 'second' }], timestamp: 2 },
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 3,
    details: { user: 'first\n\nsecond', userParts: ['first', 'second'], assistant: '' },
  },
]);
check(
  'a repaired copy is not pasted a second time',
  duplicated.filter((b) => b.kind === 'user').length === 2,
  JSON.stringify(duplicated.map((b) => b.text))
);
check('the words are still the words', duplicated[0].text === 'first' && duplicated[1].text === 'second');

// When the message really was lost, the note is the only copy and must be drawn.
const onlyNote = build([
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 4,
    details: { user: 'gone from the session', userParts: ['gone from the session'], assistant: '' },
  },
]);
check('a genuinely lost send is still shown once', onlyNote.length === 1 && onlyNote[0].text === 'gone from the session');

// A cut-off answer that is already in the transcript is not drawn again either.
const answerTwice = build([
  { role: 'assistant', content: [{ type: 'text', text: 'half an ans' }], timestamp: 5 },
  {
    role: 'custom',
    customType: 'ntapi.interrupted-turn',
    timestamp: 6,
    details: { user: '', userParts: [], assistant: 'half an ans' },
  },
]);
check('a cut-off answer already on screen is not repeated', answerTwice.length === 1 && answerTwice[0].kind === 'assistant');

/* ------------------------- the reasoning box mid-turn (2026-11-21) */

const rendererSrc = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');

// A history event during a turn redraws the transcript from state. The reasoning
// box used to be rebuilt collapsed, so an open one vanished for a frame and came
// back: two flickers a turn, visible in a screen recording.
check('opening the box is remembered', /let thinkingOpen = false;/.test(rendererSrc));
check(
  'a new bubble follows the remembered state',
  /thinking\.hidden = !thinkingOpen;/.test(rendererSrc)
);
check(
  'clicking the toggle records the choice',
  /toggle\.addEventListener\('click', \(\) => \{[\s\S]{0,400}?thinkingOpen = open;/.test(rendererSrc)
);
check(
  'a redraw keeps it open',
  /th\.hidden = !thinkingOpen;/.test(rendererSrc) && /toggle\.textContent = thinkingOpen \?/.test(rendererSrc)
);

/* --------------------------------------------- what main.js writes down */

check('the note is stored per prompt', /userParts: userLost \? draft\.prompts\.map/.test(main));
check('the model is told how many messages there were', /separate messages in that turn/.test(main));
check('the model still gets one block to read', /const userText = draft\.prompts\.join\('\\n\\n'\)\.trim\(\)/.test(main));
check('both prompts are kept, not just the last', /tab\.turnDraft\.prompts\.push\(promptText\)/.test(main));

/* --------------------------- one turn, many assistant messages (2026-11-27) */
// The draft used to glue every text block of the turn into one buffer. A turn
// that ends on a tool call (text, tool, text, tool) therefore matched no stored
// answer at all, and its reply was put back a second time as "recovered".
check(
  'each text block starts its own buffer, so the guard can recognise the answer',
  /if \(tab\.turnDraft\.segmentDone\) \{\s*tab\.turnDraft\.assistant = ''/.test(main),
);
check('a finished text block is what marks the boundary', /tab\.turnDraft\.segmentDone = true/.test(main));
check(
  'the answer that survives is still the one looked for',
  /const answerLost =[\s\S]{0,220}m\.role === 'assistant' && searchKey\(messageTextOf\(m\)\)\.includes\(partialKey\)/.test(main),
);

const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
check(
  'the window draws one bubble per user entry',
  /if \(m\.kind === 'user'\) \{\n\s*renderUserMessage\(/.test(renderer)
);

/* ------------------------ a turn that only thought (2026-11-26) */

// A model can spend its whole output ceiling on reasoning and write no answer at
// all. That reasoning used to be put back as the reply, so the next model read
// its own thoughts as something it had already said and carried the monologue on
// as a chat message.
const messageTextOf = new Function(`return (${body(main, 'messageTextOf')});`)();
const recoverKey = (text) =>
  String(text || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
const recover = new Function(
  'searchKey',
  'messageTextOf',
  'RECOVERED_TURN_CUSTOM_TYPE',
  'sendTab',
  'setTimeout',
  `return (${body(main, 'recoverInterruptedTurn')});`
)(recoverKey, messageTextOf, 'ntapi.interrupted-turn', () => {}, (fn) => fn());

/** Run one lost turn through the recovery, answering what it wrote into the session. */
async function recoveryTurn(draft) {
  const sent = [];
  const session = {
    messages: [],
    isStreaming: false,
    async sendCustomMessage(msg) {
      sent.push(msg);
    },
  };
  const tab = { turnDraft: { ...draft, done: false }, handle: { session } };
  await recover('tab', tab);
  return sent;
}

(async () => {
  const thoughtOnly = await recoveryTurn({
    prompts: ['keep going'],
    assistant: '',
    thinking: 'Continue: build render2.mjs with painted scene. Let me write.',
    tools: [],
  });
  const note = thoughtOnly[0]?.content?.[0]?.text || '';
  check('a turn that only thought still brings the question back', thoughtOnly.length === 1, note.slice(0, 120));
  check('the question is in the note', note.includes('keep going'), note.slice(0, 160));
  check('the reasoning is not handed on as the answer', !note.includes('render2.mjs'), note.slice(0, 200));
  check('and no answer bubble is drawn for it', (thoughtOnly[0]?.details?.assistant || '') === '');

  const withAnswer = await recoveryTurn({
    prompts: ['keep going'],
    assistant: 'half an ans',
    thinking: 'thinking out loud',
    tools: [],
  });
  check('a real half-written answer is still put back', (withAnswer[0]?.details?.assistant || '') === 'half an ans');

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: a turn that held two sends is put back as two messages');
})();
