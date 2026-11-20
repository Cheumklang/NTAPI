/**
 * Diagnostic: chat-history folder names must keep Thai (and other) combining
 * marks. The old sanitizer dropped them, which is why Settings showed
 * "เดสก-ท-อป-freepi" instead of "เดสก์ท็อป-freepi".
 *
 * Run from app/:   node scripts/selftest-session-paths.js
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const { sessionDirName, legacySessionDirName } = require('../src/session-paths');

const cases = [
  ['C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi', 'เดสก์ท็อป-freepi'],
  ['C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\1', 'เดสก์ท็อป-1'],
  ['C:\\Users\\cheum\\Projects\\my-app', 'Projects-my-app'],
];

// The names above are Windows spellings, but the sanitiser only looks at the
// tail two segments, so they land the same on any platform. A bare drive path
// does not: on win32 the user's name is dropped, on POSIX the same string is a
// single funny-looking segment and the fallback keeps two. Assert each
// platform's own answer instead of pretending one is portable.
if (process.platform === 'win32') {
  cases.push(['C:\\Users\\cheum', 'cheum']);
} else {
  cases.push(['/home/cheum', 'home-cheum']);
  cases.push(['/srv/app/cheum', 'cheum']);
}

let failed = 0;
for (const [input, expected] of cases) {
  const actual = sessionDirName(input);
  if (actual === expected) {
    console.log(`PASS ${path.basename(input)} -> ${actual}`);
  } else {
    failed += 1;
    console.error(`FAIL ${input}\n  expected: ${expected}\n  actual:   ${actual}`);
  }
}

// The migration needs the old spelling to find folders created by older builds.
const legacy = legacySessionDirName('C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi');
if (legacy !== 'เดสก-ท-อป-freepi') {
  failed += 1;
  console.error(`FAIL legacy name: expected เดสก-ท-อป-freepi, got ${legacy}`);
} else {
  console.log(`PASS legacy name -> ${legacy}`);
}

assert.strictEqual(
  sessionDirName('C:\\Users\\cheum\\OneDrive\\เดสก์ท็อป\\freepi'),
  'เดสก์ท็อป-freepi',
  'Thai combining marks must survive'
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: chat-history folder names keep combining marks');
