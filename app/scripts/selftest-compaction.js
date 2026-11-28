/**
 * Offline guard for auto-compaction: it is off unless prefs.json turns it on,
 * and Settings carries no controls for it (2026-11-26).
 *
 * Users kept asking why a long chat suddenly lost its history: the pi SDK
 * summarized the conversation on its own once the context passed
 * `contextWindow - reserveTokens`. The app exposed the knob, but the default was
 * still "on", so it kept happening. The switch is now gone from Settings and the
 * default is off — `/compact` remains for anyone who wants it by hand.
 *
 * This test pins that decision on both ends: main sends `enabled: false` when
 * prefs.json says nothing, the bridge still hands the value to the SDK, and no
 * leftover control or IPC channel can turn it back on from the window.
 *
 * Run: node scripts/selftest-compaction.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const bridge = read('src/freepi-bridge.js');
const main = read('src/main.js');
const preload = read('src/preload.js');
const html = read('src/renderer/index.html');
const renderer = read('src/renderer/app.js');

/** Pull `function name(...) { ... }` out of a source file by brace matching. */
function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/* 1. The default, run for real against a stand-in prefs.json. */
const readPrefsBody = bodyOf(main, 'readCompactionPrefs');
check('main decides what every session is told', Boolean(readPrefsBody));
if (readPrefsBody) {
  // The body reads prefs.json through `readPrefs()`, so hand it one.
  const withPrefs = (prefs) =>
    new Function('readPrefs', `return (${readPrefsBody.replace('function readCompactionPrefs', 'function')});`)(() =>
      prefs
    )();
  const untouched = withPrefs({});
  check('an untouched install is off, not on', untouched.enabled === false, JSON.stringify(untouched));
  check('and carries no token numbers of its own', !('reserveTokens' in untouched) && !('keepRecentTokens' in untouched));
  check('a garbage marker is not a switch', withPrefs({ compaction: 'on' }).enabled === false);
  check('only a real boolean true switches it on', withPrefs({ compaction: { enabled: true } }).enabled === true);
  check('a truthy string does not', withPrefs({ compaction: { enabled: 'yes' } }).enabled === false);
  const kept = withPrefs({ compaction: { enabled: true, reserveTokens: 8000, keepRecentTokens: -5, junk: 1 } });
  check('valid token numbers survive', kept.reserveTokens === 8000 && kept.enabled === true);
  check('a negative count is refused', !('keepRecentTokens' in kept));
  check('unknown keys never travel', !('junk' in kept));
}

/* 2. The value still has to reach the SDK, or "off" would be a wish. */
check('every tab is created with that answer', /compaction: readCompactionPrefs\(\),/.test(main));
check(
  'the session accepts compaction options',
  /compaction = null,/.test(bridge) && /const compactionSettings = sanitizeCompaction\(compaction\);/.test(bridge)
);
check(
  'the value reaches the in-memory SettingsManager',
  /sdk\.SettingsManager\.inMemory\([\s\S]{0,600}?\.\.\.\(compactionSettings \? \{ compaction: compactionSettings \} : \{\}\)/.test(
    bridge
  )
);

/* 3. Nothing in the window can turn it back on. */
check('there is no Settings channel for it', !main.includes('settings:compaction'));
check(
  'the window cannot call it',
  !preload.includes('getCompaction') && !preload.includes('setCompaction') && !preload.includes('settings:compaction')
);
check(
  'the session exposes no live switch either',
  !/setCompaction\(enabled\)/.test(bridge) && !/compactionSettings\(\)/.test(bridge)
);
check('Settings:get no longer reports it', !/compaction: \{\s*prefs: readCompactionPrefs/.test(main));

/* 4. The controls are gone, with their strings. */
for (const id of ['setCompactEnabled', 'setCompactKeep', 'setCompactReserve', 'compactHint']) {
  check(`the panel has no #${id}`, !html.includes(`id="${id}"`));
}
for (const key of ['compactTitle', 'compactEnabled', 'compactKeepLabel', 'compactReserveLabel', 'compactNewTabs']) {
  check(`no leftover ${key}`, !html.includes(`data-i18n="${key}"`) && !renderer.includes(`${key}:`));
}
check(
  'no paint or save code is left behind',
  !renderer.includes('paintCompaction') && !renderer.includes('compactionData') && !renderer.includes('refreshCompaction')
);

/* 5. Compacting by hand is untouched — that is the way anybody gets one now. */
check('the /compact command is still there', /name: '\/compact'/.test(renderer));
check('the window can still ask for one', /compact: \(tabId, instructions\) => ipcRenderer.invoke\('session:compact'/.test(preload));

/* 6. The answer room: with compaction off, nothing else makes room, so a nearly
 *    full context left a reasoning model a handful of output tokens and the turn
 *    ended with no answer at all (the stuck chat of 2026-11-27). */
const roomBody = bodyOf(main, 'answerRoomTokens');
const ensureBody = bodyOf(main, 'ensureAnswerRoom');
const safetyFromSource = /const CONTEXT_SAFETY_TOKENS = (\d+);/.exec(main);
const minFromSource = /const MIN_ANSWER_ROOM_TOKENS = (\d+);/.exec(main);

check('the answer room is measured at all', Boolean(roomBody) && Boolean(ensureBody));
check('both budgets are named, so a reader sees whose numbers they are', Boolean(safetyFromSource) && Boolean(minFromSource));

if (roomBody && safetyFromSource) {
  const CONTEXT_SAFETY_TOKENS = Number(safetyFromSource[1]);
  const roomFor = new Function(
    'CONTEXT_SAFETY_TOKENS',
    `return (${roomBody.replace('function answerRoomTokens', 'function')});`
  )(CONTEXT_SAFETY_TOKENS);
  const tabWith = (usage) => ({ handle: { session: { getContextUsage: () => usage } } });

  check(
    'a full context has almost no room left',
    roomFor(tabWith({ tokens: 195740, contextWindow: 200000 })) === 200000 - 195740 - CONTEXT_SAFETY_TOKENS
  );
  check(
    'the stuck chat therefore had 164 tokens to answer in',
    roomFor(tabWith({ tokens: 195740, contextWindow: 200000 })) === 164
  );
  check('an empty context has the whole window', roomFor(tabWith({ tokens: 0, contextWindow: 200000 })) === 200000 - CONTEXT_SAFETY_TOKENS);
  check(
    'right after a compaction pi says "unknown", and that is not a reason to compact again',
    roomFor(tabWith({ tokens: null, contextWindow: 200000 })) === null
  );
  check('no model means no guess', roomFor(tabWith(undefined)) === null);
  check('a session without the accessor does not throw', roomFor({ handle: { session: {} } }) === null);
  check('a throwing accessor does not throw', roomFor({ handle: { session: { getContextUsage: () => { throw new Error('x'); } } } }) === null);
  check('a window of zero is refused', roomFor(tabWith({ tokens: 10, contextWindow: 0 })) === null);
}

if (ensureBody && minFromSource) {
  const MIN_ANSWER_ROOM_TOKENS = Number(minFromSource[1]);
  check('the floor leaves a thinking pass room to answer', MIN_ANSWER_ROOM_TOKENS >= 1024);
  const makeEnsure = (room, opts = {}) => {
    const notices = [];
    let compactions = 0;
    const fn = new Function(
      'answerRoomTokens',
      'sendTab',
      'MIN_ANSWER_ROOM_TOKENS',
      `return (${ensureBody.replace('function ensureAnswerRoom', 'async function')});`
    )(
      () => room,
      (_id, _channel, payload) => notices.push(payload),
      MIN_ANSWER_ROOM_TOKENS
    );
    const tab = {
      handle: {
        session: opts.noCompact ? {} : { compact: async () => { compactions += 1; if (opts.compactFails) throw new Error('nope'); } },
      },
    };
    return { tab, notices, compactions: () => compactions, run: () => fn('t1', tab) };
  };

  (async () => {
    const plenty = makeEnsure(32768);
    check('room to spare sends the turn as it is', (await plenty.run()) === false && plenty.compactions() === 0 && plenty.notices.length === 0);

    const tight = makeEnsure(MIN_ANSWER_ROOM_TOKENS - 1);
    check('no room compacts first', (await tight.run()) === true && tight.compactions() === 1);
    check('and says why, by key so it is translated', tight.notices.length === 1 && tight.notices[0].key === 'noticeCompactingForRoom');

    const exactly = makeEnsure(MIN_ANSWER_ROOM_TOKENS);
    check('the floor itself is enough, no compaction', (await exactly.run()) === false && exactly.compactions() === 0);

    const unknown = makeEnsure(null);
    check('an unknown room is left alone', (await unknown.run()) === false && unknown.compactions() === 0);

    const unsupported = makeEnsure(10, { noCompact: true });
    check('a session that cannot compact still sends', (await unsupported.run()) === false);

    const failing = makeEnsure(10, { compactFails: true });
    check('a failed compaction still lets the message through', (await failing.run()) === false);

    /* Both ways a turn starts have to ask first, or the guard only half exists. */
    check('sending a prompt checks the room', /if \(\!tab\.handle\.session\.isStreaming\) await ensureAnswerRoom\(/.test(main));
    check('a steer never compacts the run it joins', /isStreaming\) await ensureAnswerRoom/.test(main));
    check('pressing Retry checks the room too', /await ensureAnswerRoom\(id, tab\);/.test(main));
    check('both languages can say it', /noticeCompactingForRoom:\s*\n\s*'/.test(renderer) && (renderer.match(/noticeCompactingForRoom:/g) || []).length === 2);

    if (failures) {
      console.log(`\n${failures} failure(s)`);
      process.exit(1);
    }
    console.log('\nPASS: auto-compaction is off by default, has no switch, /compact still works, and a full context compacts before it sends');
  })();
  return;
}

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: auto-compaction is off by default, has no switch, and /compact still works');
