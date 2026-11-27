/**
 * When the allowance runs out (or the context overflows) mid-turn, what does the
 * conversation look like afterwards? The provider drops the turn, so main.js
 * writes it back as a note — and doing that wrong is what the person sees: text
 * twice, text gone, or an empty bubble.
 *
 * The checks below run the real `recoverInterruptedTurn` from src/main.js against
 * a fake session and ask only one question per case: which messages end up in the
 * session, and does the window have one bubble per thing the person wrote.
 *
 * Run from app/:   node scripts/selftest-token-out.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`ok   ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
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

const searchKey = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const messageTextOf = new Function(`return (${body(main, 'messageTextOf')});`)();
const recover = new Function(
  'searchKey',
  'messageTextOf',
  'RECOVERED_TURN_CUSTOM_TYPE',
  'sendTab',
  'setTimeout',
  `return (${body(main, 'recoverInterruptedTurn')});`
)(
  searchKey,
  messageTextOf,
  'ntapi.interrupted-turn',
  () => {},
  // A retry timer that fires at once, so a stuck stream is walkable in a test.
  (fn) => fn()
);

/** One lost turn: what the provider dropped goes back into this fake session. */
async function lostTurn({ prompts = ['ทำงานต่อ'], assistant = '', tools = [], messages = [] }) {
  const session = {
    messages,
    isStreaming: false,
    async sendCustomMessage(msg) {
      session.messages.push({
        role: 'custom',
        customType: msg.customType,
        content: msg.content,
        details: msg.details,
      });
      return msg;
    },
  };
  const tab = { turnDraft: { prompts, assistant, tools, done: false }, handle: { session } };
  await recover('tab', tab);
  return { session, tab, notes: session.messages.filter((m) => m.role === 'custom') };
}

(async () => {
  /* ------------------------------------------------- the plain case */

  const plain = await lostTurn({ prompts: ['เขียนฟังก์ชันให้หน่อย'], assistant: 'ได้ครับ นี่คือ' });
  check('a lost turn is written back once', plain.notes.length === 1);
  check('the words of the person are kept', /เขียนฟังก์ชันให้หน่อย/.test(plain.notes[0]?.content?.[0]?.text || ''));
  check('the half-written answer is kept', /ได้ครับ นี่คือ/.test(plain.notes[0]?.content?.[0]?.text || ''));
  check('the window draws one bubble for it', plain.notes[0]?.details?.userParts?.length === 1);

  /* ------------------------------- allowance spent before any answer */

  const noAnswer = await lostTurn({ prompts: ['อธิบายสั้น ๆ'], assistant: '' });
  check('punctuation-only or empty answer writes no answer', noAnswer.notes.length === 1);
  check('and the window shows no reply bubble', noAnswer.notes[0]?.details?.assistant === '');
  check('and no empty trailing block', !/\n\n$/.test(noAnswer.notes[0]?.content?.[0]?.text || ''));

  const thoughtOnly = await lostTurn({ prompts: ['คิดก่อน'], assistant: '   \n\t ' });
  check('whitespace is not an answer', thoughtOnly.notes[0]?.details?.assistant === '');

  /* --------------------------------------- the answer came back twice */

  const answerStored = await lostTurn({
    prompts: ['งานหนึ่ง'],
    assistant: 'ได้ครับ นี่คือ',
    messages: [{ role: 'assistant', content: [{ type: 'text', text: 'ได้ครับ นี่คือโค้ดที่ต้องการ' }] }],
  });
  check(
    'an answer the session already has is not pasted again',
    !/incomplete — cut off/.test(answerStored.notes[0]?.content?.[0]?.text || ''),
    answerStored.notes[0]?.content?.[0]?.text || '(no note)'
  );

  const askStored = await lostTurn({
    prompts: ['งานสอง'],
    assistant: '',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'งานสอง' }] }],
  });
  check(
    'a send the session already has is not repeated to the model',
    !/The user asked/.test(askStored.notes[0]?.content?.[0]?.text || '')
  );

  /* ------------------------- agreement is on the text, not a fragment */

  // A short answer is contained in almost any earlier reply, so "is this already
  // in the session?" must not be answered by a substring of a short tail.
  const shortAnswer = await lostTurn({
    prompts: ['ตอบสั้น ๆ'],
    assistant: 'ได้',
    messages: [
      { role: 'assistant', content: [{ type: 'text', text: 'ได้ครับ ผมจะทำให้เลย แล้วสรุปให้ฟังทีหลัง' }] },
    ],
  });
  check(
    'a one-word answer is not lost to an earlier reply that contains it',
    /incomplete — cut off/.test(shortAnswer.notes[0]?.content?.[0]?.text || ''),
    shortAnswer.notes[0]?.content?.[0]?.text || '(no note)'
  );

  const shortAsk = await lostTurn({
    prompts: ['ต่อ'],
    assistant: '',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'ต่อจากตรงนั้นเลย' }] }],
  });
  check(
    'a short send is not lost to an earlier send that contains it',
    /The user asked/.test(shortAsk.notes[0]?.content?.[0]?.text || ''),
    shortAsk.notes[0]?.content?.[0]?.text || '(no note)'
  );

  /* ------------------------------------- two allowance-outs in a row */

  const first = await lostTurn({ prompts: ['งานยาว'], assistant: 'เริ่มแล้ว' });
  // The second turn dies too; its draft is new but the session is the same.
  const second = {
    prompts: ['ทำต่อ'],
    assistant: 'ต่อแล้ว',
    tools: [],
    done: false,
  };
  const tab2 = { turnDraft: second, handle: { session: first.session } };
  await recover('tab', tab2);
  const notes2 = first.session.messages.filter((m) => m.role === 'custom');
  check('two cut turns are two notes, not one', notes2.length === 2);
  check(
    'and the second note still carries its own answer',
    /ต่อแล้ว/.test(notes2[1]?.content?.[0]?.text || '')
  );

  /* ------------------------------------------- a stream that never ends */

  const stuck = {
    prompts: ['งานที่ค้าง'],
    assistant: 'ค้างกลาง',
    tools: [],
    done: false,
  };
  const stuckSession = { messages: [], isStreaming: true, async sendCustomMessage() {} };
  let notices = 0;
  const recoverStuck = new Function(
    'searchKey',
    'messageTextOf',
    'RECOVERED_TURN_CUSTOM_TYPE',
    'sendTab',
    'setTimeout',
    `return (${body(main, 'recoverInterruptedTurn')});`
  )(searchKey, messageTextOf, 'ntapi.interrupted-turn', () => { notices += 1; }, (fn) => fn());
  await recoverStuck('tab', { turnDraft: stuck, handle: { session: stuckSession } });
  check(
    'a turn that never stops streaming is not lost in silence',
    stuckSession.messages.length > 0 || notices > 0,
    `messages=${stuckSession.messages.length} notices=${notices}`
  );

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: an interrupted turn comes back as the messages it was');
})();
