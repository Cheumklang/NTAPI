/**
 * Offline check for src/session-export.js — search text and Markdown export.
 * Run: node scripts/selftest-session-export.js
 */
'use strict';

const { parseSession, toMarkdown, snippet } = require('../src/session-export');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const line = (obj) => JSON.stringify(obj);
const jsonl = (...rows) => rows.map(line).join('\n');

// A user turn with a plain string body, an assistant turn split into text parts.
const basic = jsonl(
  { type: 'message', message: { role: 'user', content: 'แก้บั๊กใน parser ให้หน่อย' } },
  {
    type: 'message',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'เจอแล้ว' },
        { type: 'toolCall', name: 'edit', arguments: { path: 'x.js' } },
      ],
    },
  }
);

const parsed = parseSession(basic);
check('a user turn is read', parsed[0]?.role === 'user', JSON.stringify(parsed[0]));
check('its Thai text survives', parsed[0]?.text === 'แก้บั๊กใน parser ให้หน่อย', parsed[0]?.text);
check('an assistant turn is read', parsed[1]?.role === 'assistant');
check('text parts are joined', parsed[1]?.text === 'เจอแล้ว', parsed[1]?.text);

const noisy = jsonl(
  { type: 'session_info', cwd: '/home/nt/x', model: 'm' },
  { type: 'message', message: { role: 'user', content: 'สวัสดี' } },
  'not json at all',
  { type: 'message', message: { role: 'assistant', content: [] } }
);
const quiet = parseSession(noisy);
check('bookkeeping lines are dropped', quiet.length === 1, JSON.stringify(quiet));
check('a broken line is skipped, not thrown', quiet[0]?.text === 'สวัสดี');

const tool = parseSession(
  jsonl({ type: 'message', message: { role: 'toolResult', content: [{ type: 'text', text: 'PASS 12' }] } })
);
check('a tool result is labelled as tool', tool[0]?.role === 'tool', JSON.stringify(tool[0]));
check('tool output text is kept', tool[0]?.text === 'PASS 12');

check('empty input yields no messages', parseSession('').length === 0);
check('null input yields no messages', parseSession(null).length === 0);

const md = toMarkdown({
  title: 'แก้ parser',
  created: '2026-11-24',
  messages: [
    { role: 'user', text: 'ช่วยแก้' },
    { role: 'assistant', text: 'เสร็จแล้ว' },
  ],
});
check('the export starts with the title', md.startsWith('# แก้ parser\n'), md.split('\n')[0]);
check('the export carries the date', md.includes('_2026-11-24_'));
check('both speakers are marked', md.includes('## You') && md.includes('## Assistant'));
check('the words are in the export', md.includes('ช่วยแก้') && md.includes('เสร็จแล้ว'));
check('a missing title falls back', toMarkdown({ messages: [] }).startsWith('# Chat'));

const long = 'a'.repeat(100) + 'NEEDLE' + 'b'.repeat(100);
const snip = snippet(long, 100, 6, 20);
check('the snippet starts with an ellipsis when cut', snip.startsWith('…'), snip);
check('the snippet keeps the match', snip.includes('NEEDLE'), snip);
check('the snippet ends with an ellipsis when cut', snip.endsWith('…'), snip);
check('a short line gets no ellipsis', snippet('hello there', 6, 5, 20) === 'hello there');
check('newlines collapse into one line', !snippet('a\n\n  b', 0, 1).includes('\n'));

if (failures) {
  console.log(`\nFAIL ${failures} check(s)`);
  process.exit(1);
}
console.log('\nok: session-export');
