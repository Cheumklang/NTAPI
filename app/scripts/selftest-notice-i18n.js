/**
 * Nothing the app says to the user is allowed to be English-only.
 *
 * The yellow notice sits directly above the composer, under Thai the user is
 * reading. Three of them were hardcoded English sentences ("Could not delete:
 * …", "Deleted session from disk.") and two more arrived from the main process
 * as prose instead of a key, so no translation was possible at all.
 *
 * The rule this test enforces:
 *   - the renderer never passes a bare English string to showNotice();
 *     it passes a key through t() instead.
 *   - the main process never sends an `agent:notice` without a `key`.
 *
 * Run from app/:   node scripts/selftest-notice-i18n.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = path.join(__dirname, '..', 'src', 'renderer', 'app.js');
const MAIN = path.join(__dirname, '..', 'src', 'main.js');

let failures = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
}

/** The call's argument text, read until its parentheses balance. */
function argsOf(source, start) {
  let depth = 0;
  let text = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    text += ch;
    if (depth === 0) break;
  }
  return text;
}

/* ---- the renderer ------------------------------------------------------- */

const app = fs.readFileSync(APP, 'utf8');
const bare = [];
let calls = 0;

/** Does this literal read like a sentence rather than an identifier? */
function isSentence(literal) {
  return /\b[A-Za-z]{2,}\b[^`'"\n]*\s[^`'"\n]*\b[A-Za-z]{2,}\b/.test(literal);
}

/** String literals the expression builds, with every t() call removed first. */
function bareLiterals(arg) {
  const stripped = arg.replace(/t\('[^']*'[^)]*\)/g, 'T');
  const out = [];
  for (const m of stripped.matchAll(/(['"`])((?:(?!\1).){4,})\1/g)) {
    // A template's ${…} slots hold code, not wording.
    const inner = m[2].replace(/\$\{[^{}]*\}/g, ' ');
    if (isSentence(inner)) out.push(m[2].slice(0, 80));
  }
  return out;
}

for (let at = app.indexOf('showNotice('); at !== -1; at = app.indexOf('showNotice(', at + 1)) {
  // Skip the definition itself.
  if (app.slice(Math.max(0, at - 9), at) === 'function ') continue;
  const body = argsOf(app, at + 'showNotice'.length);
  const arg = body.slice(1, -1).trim();
  const line = app.slice(0, at).split('\n').length;
  calls += 1;
  if (!arg) continue;
  // `errorText()` passes a provider's own message, and a warning now arrives as
  // a key. Everything else has to be a key rendered through t().
  if (/^null$/.test(arg) || /^errorText\(/.test(arg)) continue;
  if (/warningKey/.test(arg)) continue;
  const literals = bareLiterals(arg);
  if (literals.length) bare.push({ line, arg: literals.join(' | ') });
}

check('no notice hands the renderer a hardcoded English sentence', bare.length === 0, bare);
check('the notice calls were actually found', calls > 50, calls);
check('the delete failure is worded per language',
  /t\('deleteFailed', \{ error: res\?\.error \|\| t\('unknownError'\) \}\)/.test(app));
check('the delete success is worded per language', /showNotice\(t\('deletedFromDisk'\)\)/.test(app));
check('the attachment path failure carries the file name as a parameter',
  /t\('attachPathFailed', \{ name: file\.name \}\)/.test(app));
check('the model switch failure is worded per language',
  /t\('modelSwitchFailed', \{ error: err\.message \|\| err \}\)/.test(app));
check('the clear warning is translated before it is shown',
  /t\(res\.warningKey, res\.warningParams \|\| null\)/.test(app));

/* ---- technical failures, in Thai --------------------------------------- */

const softStart = app.indexOf('const TECHNICAL_ERRORS');
const softEnd = app.indexOf('function showNotice(');
const softBox = { lang: 'th' };
vm.createContext(softBox);
vm.runInContext(`${app.slice(softStart, softEnd)}\nthis.soften = softenTechnical;`, softBox);

const soften = (text, language = 'th') => {
  softBox.lang = language;
  return softBox.soften(text);
};

check('a dropped connection reads as Thai',
  soften('fetch failed') === 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่', soften('fetch failed'));
check('Chromium\'s network codes are covered',
  soften('net::ERR_CONNECTION_RESET') === 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่');
check('a refused socket is covered',
  /เซิร์ฟเวอร์ไม่ได้/.test(soften('connect ECONNREFUSED 127.0.0.1:443')));
check('an expired key is named as one',
  String(soften('401 Unauthorized')).startsWith('คีย์ไม่ถูกต้องหรือหมดอายุ'));
check('a rate limit asks the reader to wait',
  /รอสักครู่/.test(soften('429 Too Many Requests')));
check('a provider outage is distinguished from a local failure',
  /เซิร์ฟเวอร์ผู้ให้บริการมีปัญหา/.test(soften('502 Bad Gateway')));
check('a timeout is not reported as a network failure',
  /หมดเวลา/.test(soften('ETIMEDOUT')) && !/อินเทอร์เน็ต/.test(soften('ETIMEDOUT')));
check('a full disk says so', soften('ENOSPC: no space left') === 'ดิสก์เต็ม: no space left');
check('the Thai wording is kept, only the code is replaced',
  soften('เชื่อมต่อไม่ได้: fetch failed') === 'เชื่อมต่อไม่ได้: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่',
  soften('เชื่อมต่อไม่ได้: fetch failed'));
check('a notice with no technical fragment is untouched',
  soften('ล้างแชทแล้ว — ลบข้อความและรูปที่แนบเรียบร้อย') === 'ล้างแชทแล้ว — ลบข้อความและรูปที่แนบเรียบร้อย');
check('English users keep the raw wording',
  soften('fetch failed', 'en') === 'fetch failed');
check('a model name is never rewritten',
  soften('model not found') === 'model not found');
check('the notice is painted after the rewrite', /noticeEl\.textContent = softenTechnical\(text\)/.test(app));

/* ---- the main process --------------------------------------------------- */

const main = fs.readFileSync(MAIN, 'utf8');
const unkeyed = [];
let notices = 0;

for (let at = main.indexOf("'agent:notice'"); at !== -1; at = main.indexOf("'agent:notice'", at + 1)) {
  const block = main.slice(at, at + 600);
  const end = block.indexOf('});');
  const body = end === -1 ? block : block.slice(0, end);
  notices += 1;
  if (!/\bkey:/.test(body)) {
    unkeyed.push({ line: main.slice(0, at).split('\n').length,
      text: (body.match(/text:\s*([^\n]{0,70})/) || [])[1] || '(no text)' });
  }
}

check('every notice the main process sends carries a key', unkeyed.length === 0, unkeyed);
check('the notice sends were actually found', notices >= 5, notices);
check('the reasoning-overflow notice is translated, not prose',
  /key: 'noticeReasoningOverflow'/.test(main));
check('the clear warning reports a key instead of a sentence',
  /warningKey = 'noticeClearUnlink'/.test(main) && /warningKey = 'noticeClearOutsideStore'/.test(main));
check('both clear results carry the key through',
  (main.match(/warningKey,\s+warningParams,/g) || []).length === 2);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll notice translation checks passed');
process.exit(failures ? 1 : 0);
