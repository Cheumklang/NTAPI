/**
 * Offline guard for the auto-compaction settings.
 *
 * Users saw "compacting conversation" often and asked why nobody can tune it.
 * The app had no answer: every session built its settings in memory from a fixed
 * object, so the SDK defaults (16,384 tokens held back for the reply, 20,000
 * recent tokens kept) applied to everyone and could not be changed anywhere.
 *
 * This test pins the wiring: prefs.json → session options → SettingsManager →
 * the switch in the Settings panel, the two token numbers, and the honest line
 * that says the numbers only reach the next tab.
 *
 * Run: node scripts/selftest-compaction.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

/* 1. The sanitizer is the only gate between a hand-edited prefs.json and the SDK. */
const sanitizer = bodyOf(bridge, 'sanitizeCompaction');
check('the bridge owns one sanitizer for compaction values', Boolean(sanitizer));
if (sanitizer) {
  const run = (input) => {
    const fn = vm.runInNewContext(`(${sanitizer.replace('function sanitizeCompaction', 'function ')})`);
    return JSON.parse(JSON.stringify(fn(input)));
  };
  check('nothing saved means nothing sent', run(null) === null && run(undefined) === null);
  check('a string is not a settings object', run('on') === null);
  check('the switch survives on its own', run({ enabled: false })?.['enabled'] === false);
  check('a negative count is refused', run({ reserveTokens: -5 }) === null);
  check('a fractional count is refused', run({ keepRecentTokens: 1.5 }) === null);
  check('an absurd count is refused', run({ keepRecentTokens: 9_000_000 }) === null);
  check('unknown keys never reach the SDK', run({ keepRecentTokens: 20000, junk: 1 })?.junk === undefined);
  const all = run({ enabled: true, reserveTokens: 8000, keepRecentTokens: 12000 });
  check(
    'all three keys survive together',
    all?.enabled === true && all?.reserveTokens === 8000 && all?.keepRecentTokens === 12000
  );
}

/* 2. A session must actually receive those values, and offer the live switch. */
check(
  'the session accepts compaction options',
  /compaction = null,/.test(bridge) && /const compactionSettings = sanitizeCompaction\(compaction\);/.test(bridge)
);
check(
  'the values reach the in-memory SettingsManager',
  /sdk\.SettingsManager\.inMemory\([\s\S]{0,600}?\.\.\.\(compactionSettings \? \{ compaction: compactionSettings \} : \{\}\)/.test(
    bridge
  )
);
check(
  'an open session can be switched without a restart',
  /setCompaction\(enabled\) \{\s*settingsManager\.setCompactionEnabled\(Boolean\(enabled\)\);/.test(bridge)
);
check(
  'the session reports what it would do and against which window',
  /compactionSettings\(\) \{[\s\S]{0,400}?getCompactionSettings\(session\.model\)[\s\S]{0,200}?contextWindow: Number\(session\.model\?\.contextWindow\) \|\| 0/.test(
    bridge
  )
);

/* 3. main keeps the prefs honest and applies the switch to every open tab. */
const readPrefs = bodyOf(main, 'readCompactionPrefs');
check('main reads compaction from prefs.json', Boolean(readPrefs));
check(
  'main drops the same garbage the bridge drops',
  Boolean(readPrefs) && /value >= 0 && value <= 4_000_000/.test(readPrefs)
);
check(
  'an untouched install keeps the SDK defaults',
  /const COMPACTION_DEFAULT = \{ reserveTokens: 16384, keepRecentTokens: 20000 \};/.test(main)
);
check('each tab is created with the saved values', /compaction: readCompactionPrefs\(\),/.test(main));
check('Settings can read and change them', /ipcMain\.handle\('settings:compaction'/.test(main));
check(
  'the switch reaches sessions that are already open',
  /for \(const \[, openTab\] of tabs\) \{\s*safeCall\(\(\) => openTab\.handle\.setCompaction\(next\.enabled\), null\);/.test(main)
);
check(
  'the panel is told where compaction would start',
  /effective: live\s*\? \{ enabled: live\.enabled, reserveTokens: live\.reserveTokens, keepRecentTokens: live\.keepRecentTokens \}/.test(
    main
  )
);
check('settings:get carries the stored values too', /compaction: \{\s*prefs: readCompactionPrefs\(\) \|\| \{\},/.test(main));

/* 4. The renderer must have the controls, and must not lie about when they apply. */
check(
  'the two calls are exposed to the window',
  /getCompaction: \(tabId\) => ipcRenderer\.invoke\('settings:compaction', \{ tabId \}\)/.test(preload) &&
    /setCompaction: \(patch, tabId\) => ipcRenderer\.invoke\('settings:compaction', \{ tabId, patch \}\)/.test(preload)
);
for (const id of ['setCompactEnabled', 'setCompactKeep', 'setCompactReserve', 'compactHint']) {
  check(`the panel has #${id}`, html.includes(`id="${id}"`));
}
check(
  'the panel is translated, not hardcoded English',
  ['compactTitle', 'compactEnabled', 'compactKeepLabel', 'compactReserveLabel', 'compactNewTabs'].every((key) =>
    html.includes(`data-i18n="${key}"`)
  )
);
check(
  'both languages carry every string',
  (() => {
    // The Thai table starts at the first Thai string; everything before it is EN.
    const splitAt = renderer.indexOf("errorBannerClose: 'กดเพื่อปิดข้อความนี้'");
    if (splitAt === -1) return false;
    const blocks = [renderer.slice(0, splitAt), renderer.slice(splitAt)];
    const keys = [
      'compactTitle',
      'compactEnabled',
      'compactKeepLabel',
      'compactReserveLabel',
      'compactHintOn',
      'compactHintOnPlain',
      'compactHintOff',
      'compactNewTabs',
    ];
    return blocks.every((block) => keys.every((key) => block.includes(`${key}:`)));
  })()
);
check(
  'the hint is computed from the window and the reserve',
  /const threshold = Math\.max\(0, window_ - reserveTokens\);/.test(renderer) &&
    /t\('compactHintOn', \{ threshold: threshold\.toLocaleString\(\), window: window_\.toLocaleString\(\) \}\)/.test(
      renderer
    )
);
check('a model without a window still gets a number', /t\('compactHintOnPlain', \{ threshold:/.test(renderer));
check(
  'a field being typed into is never rewritten under the user',
  /if \(keep && document\.activeElement !== keep\)/.test(renderer) &&
    /if \(reserve && document\.activeElement !== reserve\)/.test(renderer)
);
check(
  'the panel refreshes when it opens',
  /function renderSettings\(\) \{[\s\S]{0,200}?refreshCompaction\(\);/.test(renderer)
);
check(
  'the switch saves through the same IPC as the numbers',
  /el\('setCompactEnabled'\)\.addEventListener\('change'/.test(renderer) &&
    /\.setCompaction\(\{ enabled: e\.currentTarget\.checked \}/.test(renderer)
);
check(
  'Reset All Settings clears compaction too',
  /api\.setPrefs\(\{ folders: cleared, workspace: view\?\.cwd, compaction: \{\} \}\)/.test(renderer) &&
    /compaction settings/.test(html)
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: compaction is configurable, honest about when it applies, and defaults to pi\'s own values');
