/**
 * Diagnostic: a turn may look at a few images, not every rendered frame.
 *
 * Run from app/:   node scripts/selftest-image-review.js
 */
'use strict';

const { reviewAllowance } = require('../src/image-review');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

let state = null;
const results = [];
for (let i = 0; i < 5; i += 1) {
  const step = reviewAllowance(1, state, 4);
  results.push(step.allowed);
  state = step.state;
}
check('first four looks are allowed', results.slice(0, 4).every(Boolean), JSON.stringify(results));
check('the fifth is refused', results[4] === false);
check('refusal does not spend budget', state.used === 4);

const nextTurn = reviewAllowance(2, state, 4);
check('a new turn resets the budget', nextTurn.allowed === true && nextTurn.state.used === 1);

const zero = reviewAllowance(1, null, 0);
check('zero budget refuses at once', zero.allowed === false && zero.state.used === 0);

const first = reviewAllowance(3, null, 2);
check('first look starts the count', first.allowed === true && first.state.turn === 3 && first.state.used === 1);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: image review budget is per turn and bounded');
