/**
 * Offline check for src/turn-abort.js — no network, no Electron.
 * Run: node scripts/selftest-turn-abort.js
 */
'use strict';

const { isAbortShaped, isUserAbort, USER_ABORT_WINDOW_MS } = require('../src/turn-abort');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const now = 1_700_000_000_000;

check('a plain abort is abort-shaped', isAbortShaped('The operation was aborted'));
check('cancel is abort-shaped', isAbortShaped('Request cancelled'));
check('interrupted is abort-shaped', isAbortShaped('Interrupted'));
check('a stall is not abort-shaped', !isAbortShaped('Token Harbor stopped responding'));
check('a 429 is not abort-shaped', !isAbortShaped('429: too many requests'));
check('empty text is not abort-shaped', !isAbortShaped('') && !isAbortShaped(null));
// The provider's own stall wording must never be swallowed.
check('the stall sentence is never mistaken for a stop', !isAbortShaped('stopped responding'));

const stopNow = { seq: 4, at: now - 1000 };
check(
  'an abort for the running prompt is the user\u2019s',
  isUserAbort({ raw: 'The operation was aborted', seq: 4, userAbort: stopNow, now }) === true
);
check(
  'no stop recorded means a real failure',
  isUserAbort({ raw: 'The operation was aborted', seq: 4, userAbort: null, now }) === false
);
check(
  'a stop for an earlier prompt does not cover this one',
  isUserAbort({ raw: 'The operation was aborted', seq: 5, userAbort: stopNow, now }) === false
);
check(
  'an old stop stops covering abort-shaped failures',
  isUserAbort({
    raw: 'The operation was aborted',
    seq: 4,
    userAbort: stopNow,
    now: stopNow.at + USER_ABORT_WINDOW_MS + 1,
  }) === false
);
check(
  'an old stop still covers one posted just inside the window',
  isUserAbort({
    raw: 'The operation was aborted',
    seq: 4,
    userAbort: stopNow,
    now: stopNow.at + USER_ABORT_WINDOW_MS - 1,
  }) === true
);
check(
  'a stall after a stop is still reported',
  isUserAbort({ raw: 'Token Harbor stopped responding', seq: 4, userAbort: stopNow, now }) === false
);
check(
  'a network failure after a stop is still reported',
  isUserAbort({ raw: 'fetch failed', seq: 4, userAbort: stopNow, now }) === false
);
check(
  'a stop with no prompt number still matches its own turn',
  isUserAbort({ raw: 'aborted', userAbort: { seq: 2, at: now }, now }) === true
);
check(
  'a malformed record is ignored',
  isUserAbort({ raw: 'aborted', seq: 1, userAbort: { seq: 1 }, now }) === false
);

console.log(failures ? `\n${failures} check(s) failed` : '\nall turn-abort checks passed');
process.exit(failures ? 1 : 0);