/**
 * Diagnostic: which streaming behaviour a prompt gets.
 *
 * pi rejects a prompt while streaming unless the caller says how to queue it.
 * Idle prompts must not carry the option at all.
 *
 * Run from app/:   node scripts/selftest-prompt-mode.js
 */
'use strict';

const { promptOptionsFor } = require('../src/prompt-mode');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

check('idle ignores the mode', promptOptionsFor(false, 'steer') === undefined);
check('idle ignores follow-up', promptOptionsFor(false, 'followUp') === undefined);
check('steer while streaming', promptOptionsFor(true, 'steer')?.streamingBehavior === 'steer');
check('follow-up while streaming', promptOptionsFor(true, 'followUp')?.streamingBehavior === 'followUp');
check('missing mode defaults to steer', promptOptionsFor(true, undefined)?.streamingBehavior === 'steer');
check('unknown mode defaults to steer', promptOptionsFor(true, 'nonsense')?.streamingBehavior === 'steer');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: prompts carry the right streaming behaviour');
