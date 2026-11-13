/**
 * Diagnostic: one session, two providers.
 *
 * The bridge used to assume FreePi was always there. These checks pin down the
 * cases the bridge now has to survive: both providers, Coarena alone (no FreePi
 * sign-in), an empty Coarena catalog, and nothing at all.
 *
 * Run from app/:   node scripts/selftest-provider-plan.js
 */
'use strict';

const { planProviders, PREFERRED_FREE_PI_MODEL, FREE_PI_TOOL_NAMES } = require('../src/provider-plan');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const pi = [{ id: PREFERRED_FREE_PI_MODEL, name: 'DeepSeek' }, { id: 'other', name: 'Other' }];
const co = [{ id: 'claude-fable-5', name: 'Claude Fable 5' }];

const both = planProviders({ hasFreePiAuth: true, coarenaKey: 'k', freePiModels: pi, coarenaModels: co });
console.log('both ->', JSON.stringify(both));
check('both providers registered', both.freePi && both.coarena);
check('free-pi stays the default', both.defaultProvider === 'free-pi' && both.defaultModel === PREFERRED_FREE_PI_MODEL);
check('ads only with free-pi', both.ads === true);
check('free-pi tools only with free-pi', both.freePiTools === true && FREE_PI_TOOL_NAMES.length === 5);

const coOnly = planProviders({ hasFreePiAuth: false, coarenaKey: 'k', freePiModels: pi, coarenaModels: co });
console.log('coarena-only ->', JSON.stringify(coOnly));
check('coarena-only works', coOnly.available && coOnly.coarena && !coOnly.freePi);
check(
  'coarena-only defaults to coarena',
  coOnly.defaultProvider === 'coarena' && coOnly.defaultModel === 'claude-fable-5'
);
check('no ads and no free-pi tools', coOnly.ads === false && coOnly.freePiTools === false);

const emptyCoarena = planProviders({ hasFreePiAuth: true, coarenaKey: 'k', freePiModels: pi, coarenaModels: [] });
check('empty catalog is not a provider', emptyCoarena.coarena === false);

const noPreferred = planProviders({
  hasFreePiAuth: true,
  coarenaKey: null,
  freePiModels: [{ id: 'other', name: 'Other' }],
  coarenaModels: [],
});
check('falls back to the first free-pi model', noPreferred.defaultModel === 'other');

const none = planProviders({ hasFreePiAuth: false, coarenaKey: null, freePiModels: [], coarenaModels: [] });
check('nothing available', none.available === false && none.defaultProvider === null && none.defaultModel === null);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: one session can run on free-pi, coarena or neither');
