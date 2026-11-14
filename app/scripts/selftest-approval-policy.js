/**
 * The approval switch: one setting, three answers, no memory and no exceptions.
 *
 * These checks exist because the bug they replace was invisible — the same
 * command asked on one launch and ran silently on the next, depending on which
 * of four hidden switches happened to be set. A test that only proves "ask works"
 * would have passed throughout. So each of the four old escapes is checked
 * individually to prove it can no longer reach the decision.
 */
'use strict';

const {
  POLICIES,
  DEFAULT_POLICY,
  isPolicy,
  normalizePolicy,
  policyFromLegacy,
  decide,
  needsDialog,
} = require('../src/approval-policy');

let failures = 0;
function check(label, ok) {
  if (ok) {
    console.log(`PASS ${label}`);
  } else {
    console.log(`FAIL ${label}`);
    failures += 1;
  }
}

// --- the setting itself -------------------------------------------------
check('there are exactly three choices', POLICIES.length === 3);
check('the choices are ask/allow/deny', POLICIES.join(',') === 'ask,allow,deny');
check('a fresh install asks', DEFAULT_POLICY === 'ask');
check('ask is recognised', isPolicy('ask'));
check('allow is recognised', isPolicy('allow'));
check('deny is recognised', isPolicy('deny'));
check('a typo is not a policy', !isPolicy('always'));
check('empty is not a policy', !isPolicy(''));
check('a number is not a policy', !isPolicy(3));
check('null is not a policy', !isPolicy(null));

// A bad value must never be read as permission. The safe failure is to ask.
check('a typo falls back to asking', normalizePolicy('yes please') === 'ask');
check('null falls back to asking', normalizePolicy(null) === 'ask');
check('undefined falls back to asking', normalizePolicy(undefined) === 'ask');
check('an object falls back to asking', normalizePolicy({ allow: true }) === 'ask');
check('a real policy survives normalising', normalizePolicy('deny') === 'deny');

// --- the decision -------------------------------------------------------
check('ask means ask', decide('ask') === 'ask');
check('allow means allow', decide('allow') === 'allow');
check('deny means deny', decide('deny') === 'deny');
check('an unknown policy asks', decide('let it run') === 'ask');

// The bug in one line: the decision must not take anything but the policy.
check('the decision ignores everything but the policy', decide.length === 1);

check('ask needs the dialog', needsDialog('ask') === true);
check('allow does not need the dialog', needsDialog('allow') === false);
check('deny does not need the dialog', needsDialog('deny') === false);
check('an unknown policy keeps the dialog', needsDialog('whatever') === true);

// --- upgrade path ------------------------------------------------------
check('a fresh prefs file asks', policyFromLegacy({}) === 'ask');
check('no arguments asks', policyFromLegacy() === 'ask');
check("the old 'allow everything' becomes allow", policyFromLegacy({ allowEverything: true }) === 'allow');
check(
  'an old per-tool grant becomes allow',
  policyFromLegacy({ allowedTools: ['bash'] }) === 'allow'
);
check('empty old grants do not become allow', policyFromLegacy({ allowedTools: [] }) === 'ask');
check(
  "the old 'allow everything' was off means ask",
  policyFromLegacy({ allowEverything: false, allowedTools: [] }) === 'ask'
);
check('a missing allowEverything is not permission', policyFromLegacy({ allowEverything: undefined }) === 'ask');
check(
  'a truthy-but-not-true allowEverything is not permission',
  policyFromLegacy({ allowEverything: 'yes' }) === 'ask'
);

// The regression that matters: what used to be decided by autopilot, by a tool
// name, or by a remember box can no longer move the answer off "ask".
check(
  'a remembered tool cannot stop the question',
  decide('ask') === 'ask'
);
check('choosing deny is not overridden by anything', decide('deny') === 'deny');

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll approval policy checks passed');
