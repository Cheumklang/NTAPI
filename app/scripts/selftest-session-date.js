/**
 * Dates in the saved-chats list, in the reader's own calendar.
 *
 * The row printed `toLocaleString()`, so the same chat read "11/17/2026, 8:46:08 AM"
 * on an English Windows and "17/11/2026" on a Thai one — different order, and a
 * Gregorian year inside Thai text. The app writes its own dates instead:
 * day/month/year in both languages, with the Buddhist era (2569) for Thai.
 *
 * Run: node scripts/selftest-session-date.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Function body by name, brace matched. */
function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

/** The real formatter, with `lang` supplied the way the renderer supplies it. */
function loadFormatter(lang) {
  const fn = body(app, 'formatSessionDate');
  if (!fn) return null;
  // eslint-disable-next-line no-new-func
  return new Function('lang', `return (function (date) ${fn});`)(lang);
}

const th = loadFormatter('th');
const en = loadFormatter('en');

check('the formatter exists', typeof th === 'function' && typeof en === 'function');

if (typeof th === 'function') {
  // The user's own example: 17 November 2026 is 17/11/2569 in Thai.
  const day = new Date(2026, 10, 17, 8, 46);
  check('Thai shows day/month/Buddhist year', th(day).startsWith('17/11/2569'));
  check('English shows day/month/calendar year', en(day).startsWith('17/11/2026'));
  check('both keep the day first', th(day).indexOf('17/11') === 0 && en(day).indexOf('17/11') === 0);
  check('the clock follows in both', / 08\.46/.test(th(day)) && / 08\.46/.test(en(day)));
  check('Thai marks the time as Thai', /น\.$/.test(th(day)));

  const early = new Date(2026, 0, 5, 0, 7);
  check('single digits are padded', th(early).startsWith('05/01/2569') && en(early).startsWith('05/01/2026'));

  const newYear = new Date(2027, 0, 1, 23, 59);
  check('the year rollover converts too', th(newYear).startsWith('01/01/2570'));

  check('an invalid date draws nothing', th(new Date('nonsense')) === '' && en(new Date('nonsense')) === '');
  check('a missing date draws nothing', th(undefined) === '');
}

/* ---------- the list uses it, and nothing falls back to the Windows locale ---------- */

const listSection = app.slice(app.indexOf('async function renderSessions'), app.indexOf('async function renderSessions') + 7000);
check('the saved-chat row uses the formatter', /formatSessionDate\(new Date\(s\.created \|\| s\.modified\)\)/.test(listSection));
check('the row no longer prints the Windows locale string', !/s-meta">\$\{escapeHtml\(new Date/.test(listSection));
check('the session menu uses it too', /meta: formatSessionDate\(new Date\(session\.modified\)\)/.test(app));

console.log(failures === 0 ? '\nAll session-date checks passed.' : `\n${failures} session-date check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);