/**
 * Offline check for the bilingual failure catalogue — no Electron, no network.
 *
 * The rule this protects: the main process reports a *key*, the renderer picks
 * the wording for the language the user chose. A key with a missing Thai line
 * would leak English into a Thai UI, and a hint added without a key would do the
 * same, so both are checked here.
 *
 * Run: node scripts/selftest-error-messages.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { MESSAGES, LANGS, messageFor, messageKeys } = require('../src/error-messages');
const providerErrors = require('../src/provider-errors');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/* ----------------------------- catalogue shape ----------------------------- */

const keys = messageKeys();
check('the catalogue is not empty', keys.length > 40, `got ${keys.length}`);
check('both languages are declared', LANGS.join(',') === 'en,th');

const missing = [];
const blanks = [];
for (const key of keys) {
  const entry = MESSAGES[key] || {};
  for (const lang of LANGS) {
    if (!entry[lang]) missing.push(`${key}.${lang}`);
    else if (!String(entry[lang]).trim()) blanks.push(`${key}.${lang}`);
  }
}
check('every key has both languages', missing.length === 0, missing.slice(0, 6).join(', '));
check('no translation is blank', blanks.length === 0, blanks.slice(0, 6).join(', '));

// A placeholder present in one language but not the other shows "{n}" raw.
const placeholderDrift = [];
const placeholderRe = /\{(\w+)\}/g;
for (const key of keys) {
  const shapes = LANGS.map((lang) => {
    const found = String(MESSAGES[key][lang] || '').match(placeholderRe) || [];
    return [...new Set(found)].sort().join(',');
  });
  if (shapes[0] !== shapes[1]) placeholderDrift.push(`${key}: ${shapes.join(' vs ')}`);
}
check('placeholders match across languages', placeholderDrift.length === 0, placeholderDrift.slice(0, 6).join(', '));

// Thai text must actually be Thai. A copy-paste that stayed English is the most
// likely way a "translation" sneaks in.
const notThai = keys.filter((key) => !/[\u0E00-\u0E7F]/.test(String(MESSAGES[key].th || '')));
check('the Thai column contains Thai', notThai.length === 0, notThai.slice(0, 6).join(', '));

/* ------------------------------- lookup api ------------------------------- */

check('lookup returns English by default', messageFor('fp.daily_cap') === MESSAGES['fp.daily_cap'].en);
check('lookup switches language', messageFor('fp.daily_cap', 'th') === MESSAGES['fp.daily_cap'].th);
check(
  'lookup fills placeholders',
  messageFor('notice.keyRemoved', 'en', { label: 'Coarena', provider: 'free-pi', id: 'DeepSeek' }).includes('Coarena')
);
check(
  'lookup keeps unknown placeholders visible',
  messageFor('notice.retrying', 'en', { attempt: 1, max: 3 }).includes('1/3')
);
check('an unknown key returns itself', messageFor('nope.not.here') === 'nope.not.here');
check('a missing language falls back to English', messageFor('fp.daily_cap', 'de') === MESSAGES['fp.daily_cap'].en);

/* ------------------- every provider hint can be translated ------------------- */

const tables = [
  'ERROR_HINTS',
  'COARENA_HINTS',
  'ZRO_HINTS',
  'NVIDIA_HINTS',
  'TOKENHARBOR_HINTS',
  'LLM7_HINTS',
  'STALL_HINTS',
];

const keyless = [];
for (const table of tables) {
  for (const [code, text] of Object.entries(providerErrors[table] || {})) {
    if (!providerErrors.KEY_BY_TEXT.has(text)) keyless.push(`${table}.${code}`);
  }
}
check('every provider hint maps to a key', keyless.length === 0, keyless.slice(0, 8).join(', '));

const hourly = providerErrors.friendlyProviderError('429: {"code":"hourly_ceiling"}');
check('a real failure carries its key', hourly.key === 'fp.hourly_ceiling', hourly.key);
check('a real failure keeps its HTTP status', hourly.status === '429', hourly.status);
check('the English text is unchanged', /hourly request limit/i.test(hourly.text));

const network = providerErrors.friendlyProviderError('fetch failed', { provider: 'tokenharbor' });
check('a network failure is translatable', network.key === 'net.tokenharbor', network.key);

const stall = providerErrors.friendlyProviderError('This operation was aborted', { provider: 'nvidia' });
check('a stall is translatable', stall.key === 'stall.nvidia', stall.key);

/* --------------------------------- wiring --------------------------------- */

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

check(
  'the renderer loads the catalogue before app.js',
  html.indexOf('error-messages.js') !== -1 && html.indexOf('error-messages.js') < html.indexOf('src="app.js"')
);
check('the renderer consults the catalogue in t()', app.includes('FPErrorMessages.messageFor'));
check('main sends the key with a failure', /sendTab\(tabId, 'agent:error', \{ text, code, key:/.test(main));
check('the error banner translates the key', app.includes('p.key ? t(p.key) : p.text'));
check('notices translate through their key', app.includes('p.key ? t(p.key, p.params || null) : p.text'));

// Every notice key main sends must exist in the catalogue.
const noticeKeys = [...main.matchAll(/key:\s*'(notice\.[a-zA-Z]+)'/g)].map((m) => m[1]);
const unknownNoticeKeys = noticeKeys.filter((key) => !MESSAGES[key]);
check('every notice key exists', unknownNoticeKeys.length === 0, unknownNoticeKeys.join(', '));
check('notices actually carry keys', noticeKeys.length >= 5, `${noticeKeys.length} found`);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log(`\nPASS: ${keys.length} failure messages in EN + TH, keys wired end to end`);
