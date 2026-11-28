/**
 * Chat smoothness guards (2026-11-28).
 *
 *  1. Streamed deltas are batched in main before crossing IPC, and any other
 *     event for the tab flushes them first, so order is preserved.
 *  2. A failed attempt is not reported at `message_end`: pi may retry it, and a
 *     red error line followed by the retried answer under it was the bug. The
 *     settle reports it, before `agent:settled`.
 *  3. The end of a turn refreshes data only for the tab on screen instead of
 *     rebuilding the whole transcript.
 *  4. No request-dumping probe is left in main.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
};

// 1. batching, with a real run of the functions lifted out of main.js
const grab = (name) => {
  const at = main.indexOf(`function ${name}(`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = main.indexOf('{', at); i < main.length; i += 1) {
    if (main[i] === '{') depth += 1;
    else if (main[i] === '}' && --depth === 0) return main.slice(at, i + 1);
  }
  return '';
};
const sent = [];
// eslint-disable-next-line no-new-func
const factory = new Function(
  'send',
  `const DELTA_FLUSH_MS = 10000; const TOOL_UPDATE_FLUSH_MS = 10000;
   const pendingDeltas = new Map(); const pendingToolUpdates = new Map();
   ${grab('sendTab')} ${grab('queueDelta')} ${grab('flushDeltas')}
   ${grab('queueToolUpdate')} ${grab('flushToolUpdates')}
   return { sendTab, pendingDeltas, pendingToolUpdates };`
);
const api = factory((channel, payload) => sent.push([channel, payload]));
api.sendTab('t1', 'agent:delta', { channel: 'text', delta: 'Hel' });
api.sendTab('t1', 'agent:delta', { channel: 'text', delta: 'lo' });
api.sendTab('t1', 'agent:delta', { channel: 'thinking', delta: 'hm' });
check('deltas wait instead of going out one by one', sent.length === 0);
api.sendTab('t1', 'agent:toolUpdate', { id: 'a', partial: 1 });
api.sendTab('t1', 'agent:toolUpdate', { id: 'a', partial: 2 });
api.sendTab('t1', 'agent:textEnd', { text: 'Hello' });
const channels = sent.map(([c]) => c);
check('another event flushes pending deltas first', channels[channels.length - 1] === 'agent:textEnd');
check('same-channel deltas are joined', sent.some(([c, p]) => c === 'agent:delta' && p.delta === 'Hello'));
check('channels keep their own order', sent.findIndex(([, p]) => p.delta === 'Hello') < sent.findIndex(([, p]) => p.delta === 'hm'));
check('only the newest tool progress is sent', sent.filter(([c]) => c === 'agent:toolUpdate').length === 1 &&
  sent.find(([c]) => c === 'agent:toolUpdate')[1].partial === 2);
for (const m of [api.pendingDeltas, api.pendingToolUpdates]) for (const e of m.values()) clearTimeout(e.timer);

// 2. errors wait for the settle
const msgEnd = main.slice(main.indexOf("case 'message_end'"), main.indexOf("case 'auto_retry_start'"));
check('message_end no longer reports the error straight away', !/reportTabError\(/.test(msgEnd));
const settle = main.slice(main.indexOf("case 'agent_settled'"), main.indexOf("case 'message_update'"));
check('the settle reports the failure before it says settled',
  settle.indexOf('announceIfUnreported(') > 0 && settle.indexOf('announceIfUnreported(') < settle.indexOf("'agent:settled'"));

// 3. no full repaint at the end of a turn for the tab on screen
check('applyTabState has a soft path', /options\.soft && state\.tabId === activeTabId/.test(app));
check('settle uses it', /applyTabState\(state, \{ soft: true \}\)/.test(app));

// 4. no probe
check('no fetch probe in main', !/__probe|ntapi-last-request/.test(main));

if (failed) {
  console.log(`\n${failed} smoothness check(s) failed.`);
  process.exit(1);
}
console.log('\nAll smoothness checks passed');
