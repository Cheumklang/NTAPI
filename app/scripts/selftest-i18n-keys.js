/**
 * Every string the window asks for exists, in both languages.
 *
 * `t('key')` with no entry returns the key itself, so a missing string is not an
 * error at runtime — it is the literal word `queueAttach` printed on a button.
 * That is exactly how it reached a user: the queue editor's attach button asked
 * for three keys nobody had written. This scan is the cheap way to keep it from
 * happening again.
 *
 * Run: node scripts/selftest-i18n-keys.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/** The object literal that starts at `const NAME = {`, brace matched. */
function objectAt(source, name) {
  const at = source.indexOf(`const ${name} = {`);
  if (at === -1) return '';
  return braceBlock(source, source.indexOf('{', at));
}

/** Text of the object literal that opens at `open`, braces counted to the end. */
function braceBlock(source, open) {
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return '';
}

/** Keys of one block, read from `key: '...'` lines. */
function keysOf(block) {
  const out = new Set();
  for (const m of block.matchAll(/^\s{2,}([A-Za-z0-9_]+):\s*['"`]/gm)) out.add(m[1]);
  return out;
}

/**
 * Every key one language knows: the first dictionary object plus anything added
 * later with `Object.assign(STRINGS.<lang>, { ... })` — the palette, the plan
 * badges and the busy dialogs live in those later blocks.
 */
function keysFor(source, strings, lang) {
  const at = strings.indexOf(`${lang}: {`);
  const out = keysOf(at === -1 ? '' : braceBlock(strings, strings.indexOf('{', at)));
  const marker = new RegExp(`Object\\.assign\\(STRINGS\\.${lang},`, 'g');
  let m;
  while ((m = marker.exec(source))) {
    const open = source.indexOf('{', m.index);
    for (const key of keysOf(braceBlock(source, open))) out.add(key);
  }
  return out;
}

const strings = objectAt(app, 'STRINGS');
const en = keysFor(app, strings, 'en');
const th = keysFor(app, strings, 'th');

check('the English dictionary is found', en.size > 100, `found ${en.size} keys`);
check('the Thai dictionary is found', th.size > 100, `found ${th.size} keys`);

/** `t('key')` and `t(`key`)` — the literal spellings, not the computed ones. */
const used = new Set();
for (const m of app.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) used.add(m[1]);
for (const m of app.matchAll(/\bt\(\s*`([A-Za-z0-9_]+)`/g)) used.add(m[1]);
// Markup asks for strings through data-i18n* attributes; the loader fills them.
for (const m of html.matchAll(/data-i18n[a-z-]*="([A-Za-z0-9_]+)"/g)) used.add(m[1]);

check('the scan sees the strings the code asks for', used.size > 100, `found ${used.size} keys`);

const missingEn = [...used].filter((k) => !en.has(k)).sort();
const missingTh = [...used].filter((k) => !th.has(k)).sort();
check('every key has English text', missingEn.length === 0, missingEn.join(', '));
check('every key has Thai text', missingTh.length === 0, missingTh.join(', '));

// A key that exists in one language only is the same bug, half cured.
const onlyEn = [...en].filter((k) => !th.has(k)).sort();
const onlyTh = [...th].filter((k) => !en.has(k)).sort();
check('both languages carry the same keys', onlyEn.length === 0 && onlyTh.length === 0,
  `only in English: ${onlyEn.join(', ') || '-'}\nonly in Thai: ${onlyTh.join(', ') || '-'}`);

// The exact strings the queue editor asks for, so the fix cannot quietly regress.
for (const key of ['queueAttach', 'queueAttachTitle', 'queueRemoveImage']) {
  check(`${key} is defined in both languages`, en.has(key) && th.has(key));
}

console.log(failures === 0 ? '\nAll i18n key checks passed.' : `\n${failures} i18n key check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);