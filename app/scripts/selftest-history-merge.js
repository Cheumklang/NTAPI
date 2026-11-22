/**
 * A message you sent must never vanish from the transcript.
 *
 * The gap this guards:
 *   - submit() pushes the message into `view.messages` and renders it at once,
 *     so you see it immediately.
 *   - main sends the message to the agent with `session.prompt(...)`, and the
 *     SDK only writes it into `session.messages` a moment later (it runs input
 *     handlers and template expansion first).
 *   - `applyTabState()` replaces `view.messages` wholesale with whatever main
 *     reports. It is called by `agent:history`, which fires on compact, undo,
 *     key changes and model switches.
 *
 * So an `agent:history` arriving inside that gap replaces the transcript with a
 * list that does not contain the message you just sent: it disappears, and there
 * is no record of it anywhere in the UI.
 *
 * The fix keeps locally-sent, not-yet-persisted messages when the incoming
 * state is applied, and drops them once the session does contain them so they
 * are not shown twice.
 *
 * Run: node scripts/selftest-history-merge.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Body of a function by brace matching, so assert on code not comments. */
function body(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  // Skip the parameter list first: a default value such as `options = {}`
  // contains braces of its own, and counting those ends the body immediately.
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        i += 1;
        break;
      }
    }
  }
  for (; i < src.length; i += 1) if (src[i] === '{') break;
  if (i >= src.length) return '';
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

/** Run the merge helper as real code against fake views. */
function loadMerge() {
  const start = src.indexOf('function mergeIncomingMessages(');
  if (start === -1) return null;
  // Signature without the `function` keyword: "(view, incoming)".
  const sigEnd = src.indexOf(')', src.indexOf('(', start));
  const params = src.slice(src.indexOf('(', start), sigEnd + 1);
  const fnBody = body('mergeIncomingMessages');
  if (!fnBody) return null;
  // eslint-disable-next-line no-new-func
  return new Function(`return (function ${params} ${fnBody})`)();
}

const merge = loadMerge();

check('a merge helper exists', typeof merge === 'function');

if (typeof merge === 'function') {
  // 1. The exact bug: a message sent locally, then history arrives without it.
  const view = { messages: [{ kind: 'user', text: 'hello from me', pending: true }] };
  const incoming = [{ kind: 'assistant', text: 'older reply' }];
  const out = merge(view, incoming);
  check('a locally sent message survives history arriving', out.some((m) => m.text === 'hello from me'));
  check('the older history is kept too', out.some((m) => m.text === 'older reply'));
  check('the survivor keeps its order (history first)', out[0].text === 'older reply');

  // 2. Once the session has the message, it must not appear twice.
  const view2 = { messages: [{ kind: 'user', text: 'hello from me', pending: true }] };
  const incoming2 = [
    { kind: 'user', text: 'hello from me' },
    { kind: 'assistant', text: 'reply' },
  ];
  const out2 = merge(view2, incoming2);
  check('a message the session now has is not duplicated',
    out2.filter((m) => m.text === 'hello from me').length === 1);

  // 3. No pending messages: incoming is used as-is.
  const view3 = { messages: [] };
  const incoming3 = [{ kind: 'user', text: 'a' }, { kind: 'assistant', text: 'b' }];
  const out3 = merge(view3, incoming3);
  check('with nothing pending the incoming list is used', out3.length === 2);

  // 4. Several pending messages all survive.
  const view4 = { messages: [
    { kind: 'user', text: 'one', pending: true },
    { kind: 'user', text: 'two', pending: true },
  ] };
  const out4 = merge(view4, [{ kind: 'assistant', text: 'old' }]);
  check('several pending messages all survive',
    out4.filter((m) => m.text === 'one' || m.text === 'two').length === 2);

  // 5. Pending entries that are assistant placeholders must not be re-added:
  //    the incoming list already carries the streamed reply.
  const view5 = { messages: [{ kind: 'assistant', text: 'streaming…', pending: true }] };
  const out5 = merge(view5, [{ kind: 'assistant', text: 'streaming…' }]);
  check('a streamed reply is not duplicated',
    out5.filter((m) => m.text === 'streaming…').length === 1);

  // 5b. A message sent WITH an attachment. main rewrites the prompt before the
  //     session sees it — the image is written to disk and a
  //     "[Attached image saved to: ...]" note is appended — so an exact text
  //     match never lines up and the message was shown twice.
  const viewAtt = { messages: [{ kind: 'user', text: 'ดูรูปนี้ให้หน่อย', images: [{ dataUri: 'd' }], pending: true }] };
  const attachedText = [
    'ดูรูปนี้ให้หน่อย',
    '',
    '[Attached image saved to: C:/NTAPI/attachments/a.png]',
    'The image is saved on disk.',
  ].join('\n');
  const incomingAtt = [
    { kind: 'user', text: attachedText, images: [] },
    { kind: 'assistant', text: 'เห็นรูปแล้ว' },
  ];
  const outAtt = merge(viewAtt, incomingAtt);
  check('a message with an attachment is not duplicated',
    outAtt.filter((m) => String(m.text).startsWith('ดูรูปนี้ให้หน่อย')).length === 1);

  // 5c. A file attachment appends a note the same way.
  const viewFile = { messages: [{ kind: 'user', text: 'อ่านไฟล์นี้', images: [], pending: true }] };
  const fileText = [
    'อ่านไฟล์นี้',
    '',
    '[Attached file: C:/x/a.md]',
    'These files are on disk.',
  ].join('\n');
  const outFile = merge(viewFile, [
    { kind: 'user', text: fileText, images: [] },
  ]);
  check('a message with a file attachment is not duplicated',
    outFile.filter((m) => String(m.text).startsWith('อ่านไฟล์นี้')).length === 1);

  // 5d. A rewritten prompt (a /skill: command expanded) still matches.
  const viewSkill = { messages: [{ kind: 'user', text: '@caveman hello', images: [], pending: true }] };
  const outSkill = merge(viewSkill, [{ kind: 'user', text: '@caveman hello — expanded body follows', images: [] }]);
  check('an expanded command is not duplicated',
    outSkill.filter((m) => m.kind === 'user').length === 1);

  // 5e. Prefix matching must not over-match: a different question stays pending.
  const viewDiff = { messages: [{ kind: 'user', text: 'สวัสดี', images: [], pending: true }] };
  const outDiff = merge(viewDiff, [{ kind: 'user', text: 'สวัสดีครับ ผมชื่อ', images: [] }, { kind: 'assistant', text: 'ok' }]);
  check('a different question is not swallowed by a prefix',
    outDiff.filter((m) => m.kind === 'user').length === 2);

  // 6. Undo/compact legitimately removes messages: history wins for those.
  const view6 = { messages: [{ kind: 'user', text: 'old but real' }] };
  const out6 = merge(view6, []);
  check('history can still clear messages it does not have', out6.length === 0);

  // 7. An image-only message still survives.
  const view7 = { messages: [{ kind: 'user', text: '', images: [{ dataUri: 'data:x' }], pending: true }] };
  const out7 = merge(view7, []);
  check('an image-only message survives', out7.length === 1);

  // 8. The reported bug: the copy could not be matched to the session entry
  //    (main rewrote the words), so it was spliced in at the end — a second copy
  //    of the question, printed under the answer it had already caused. The slot
  //    it was written into is the evidence, whatever the text became.
  const view8 = {
    messages: [
      { kind: 'user', text: 'older question' },
      { kind: 'assistant', text: 'older answer' },
      { kind: 'user', text: '@/skill caveman ตรวจงานค้าง', pending: true, pendingAt: 2 },
    ],
  };
  const session8 = [
    { kind: 'user', text: 'older question' },
    { kind: 'assistant', text: 'older answer' },
    { kind: 'user', text: '/skill:caveman ตรวจงานค้าง' },
    { kind: 'assistant', text: 'ตอบแล้ว' },
  ];
  const out8 = merge(view8, session8);
  check('a rewritten prompt is not printed twice',
    out8.filter((m) => m.kind === 'user' && /ตรวจงานค้าง/.test(m.text)).length === 1);
  check('the answer is not pushed up by a duplicate', out8[out8.length - 1].text === 'ตอบแล้ว');

  // 8b. An image-only prompt gains a saved-path note in the session, so its text
  //     cannot match either — the slot still proves it was written.
  const view9 = {
    messages: [
      { kind: 'user', text: 'รูปแรก' },
      { kind: 'assistant', text: 'ได้ครับ' },
      { kind: 'user', text: '', images: [{ dataUri: 'd' }], pending: true, pendingAt: 2 },
    ],
  };
  const session9 = [
    { kind: 'user', text: 'รูปแรก' },
    { kind: 'assistant', text: 'ได้ครับ' },
    { kind: 'user', text: '\n\n[Attached image saved to: /tmp/a.png]' },
    { kind: 'assistant', text: 'เห็นรูปแล้ว' },
  ];
  const out9 = merge(view9, session9);
  check('an image-only prompt is not printed twice', out9.filter((m) => m.kind === 'user').length === 2);

  // 8c. A copy the session genuinely does not have still goes back to its slot,
  //     never to the end.
  const view10 = {
    messages: [
      { kind: 'user', text: 'คำถาม' },
      { kind: 'assistant', text: 'คำตอบ' },
      { kind: 'user', text: 'ยังไม่ถูกเขียน', pending: true, pendingAt: 2 },
    ],
  };
  const out10 = merge(view10, [
    { kind: 'user', text: 'คำถาม' },
    { kind: 'assistant', text: 'คำตอบ' },
  ]);
  check('an unwritten copy keeps its slot, not the tail', out10[2].text === 'ยังไม่ถูกเขียน');
}

// --- wiring: submit must mark what it sends, applyTabState must merge ------

const applyBody = body('applyTabState');
check('applyTabState uses the merge helper', /mergeIncomingMessages\(/.test(applyBody));
check('applyTabState no longer assigns messages directly',
  !/messages:\s*state\.messages\s*\|\|/.test(applyBody));

const submitBody = body('submit');
check('submit marks the message it sends', /pending:\s*true/.test(submitBody));

// The steer path pushes a message too, and it has the same gap.
check('the steer path marks its message', (submitBody.match(/pending:\s*true/g) || []).length >= 2);

// A copy that cannot be matched by text is dropped through the slot it recorded,
// so every path that pushes a pending message has to record one.
check('the send path remembers its slot', /pendingAt:\s*view\.messages\.length/.test(submitBody));

// A queued message is sent from its own function, which pushes too.
const queuedBody = body('sendQueued');
check('sending a queued message marks it', /pending:\s*true/.test(queuedBody));

// applyTabState runs on history: it must not drop the live stream either.
check('applyTabState still resets the live stream', /liveAssistant:\s*null/.test(applyBody));

// --- the running turn is kept across a repaint -----------------------------

/** Load any top-level function in the renderer, for a behavioural check. */
function loadFn(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const sigEnd = src.indexOf(')', src.indexOf('(', start));
  const params = src.slice(src.indexOf('(', start), sigEnd + 1);
  const fnBody = body(name);
  if (!fnBody) return null;
  // eslint-disable-next-line no-new-func
  return new Function(`return (function ${params} ${fnBody})`)();
}

const liveTurn = loadFn('mergeLiveTurn');
if (liveTurn) {
  const hist = [
    { kind: 'user', text: 'q1' },
    { kind: 'assistant', text: 'partial', thinking: '', tools: [] },
    { kind: 'tool', id: 't1', name: 'bash', text: 'out' },
  ];
  const live = [
    { kind: 'assistant', text: 'partial answer from the stream', thinking: '', tools: [] },
    { kind: 'assistant', text: '', thinking: '', tools: [{ id: 't2', name: 'read', args: {} }] },
  ];
  const merged = liveTurn(hist, live);
  check(
    'the running turn keeps what the session has not written',
    merged.some((m) => m.text === 'partial answer from the stream')
  );
  check(
    'the running turn stays below the question it answers',
    merged.findIndex((m) => m.kind === 'user') <
      merged.findIndex((m) => m.text === 'partial answer from the stream')
  );
  check(
    'a tool step of the running turn is kept',
    merged.some((m) => (m.tools || []).some((t) => t.id === 't2'))
  );
  check(
    'the step the session already has is not drawn twice',
    merged.filter((m) => m.kind === 'assistant').length === 2
  );
  check(
    'history before the question is untouched',
    liveTurn(
      [
        { kind: 'user', text: 'older' },
        { kind: 'assistant', text: 'old answer' },
      ],
      [{ kind: 'assistant', text: 'new' }]
    )[1].text === 'old answer'
  );
  check('an empty live buffer leaves history alone', liveTurn(hist, []).length === 3);
} else {
  check('mergeLiveTurn exists', false);
}

check(
  'history for another chat does not switch the screen',
  /applyTabState\(p\.state, \{ show: p\.state\.tabId === activeTabId \}\)/.test(src)
);
check('the transcript draws the running turn', /mergeLiveTurn\(/.test(src));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll history merge checks passed');
