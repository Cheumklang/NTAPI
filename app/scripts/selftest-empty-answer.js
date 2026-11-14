/**
 * Recovery decision for an LLM7 turn that ended with `length` and no answer.
 *
 * Run from app/:   node scripts/selftest-empty-answer.js
 */
'use strict';

const { nextRecoveryMove } = require('../src/empty-answer');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const base = {
  provider: 'llm7',
  model: 'DeepSeek-V4-Flash-0731',
  plan: 'free',
  reasoning: true,
  attempts: 0,
  hasPrompt: true,
  fallbackId: 'gpt-oss:20b',
};

check('first empty answer retries the same model', nextRecoveryMove(base) === 'repeat');
check(
  'a second empty answer moves to a model that does not reason',
  nextRecoveryMove({ ...base, attempts: 1 }) === 'switch'
);
check(
  'no third attempt: the user gets the notice instead of a loop',
  nextRecoveryMove({ ...base, attempts: 2 }) === null
);
check(
  'a reasoning model with no better free row just retries once',
  nextRecoveryMove({ ...base, attempts: 1, fallbackId: null }) === null
);
check(
  'never switches to the model that already failed',
  nextRecoveryMove({ ...base, attempts: 1, fallbackId: 'DeepSeek-V4-Flash-0731' }) === null
);
check(
  'a non-reasoning model is not swapped for another model',
  nextRecoveryMove({ ...base, reasoning: false, attempts: 1 }) === null
);
check(
  'paid turns are never retried automatically',
  nextRecoveryMove({ ...base, plan: 'paid' }) === null
);
check(
  'other providers are untouched',
  nextRecoveryMove({ ...base, provider: 'free-pi' }) === null
);
check(
  'nothing is retried once the message is forgotten',
  nextRecoveryMove({ ...base, hasPrompt: false }) === null
);
check(
  'a trimmed free answer with no recovery left falls through to the notice',
  nextRecoveryMove({ ...base, attempts: 1, reasoning: false }) === null
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: an empty LLM7 answer is retried, then escaped from');
