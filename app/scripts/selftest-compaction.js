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

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: auto-compaction is off by default, has no switch, and /compact still works');
