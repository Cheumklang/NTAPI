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

// Zro joins the same plan as a third keyed provider.
const zro = [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }];
const zroOnly = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: zro,
});
check('zro-only registers', zroOnly.zro && zroOnly.available && !zroOnly.freePi && !zroOnly.coarena);
check('zro-only default', zroOnly.defaultProvider === 'zro' && zroOnly.defaultModel === 'deepseek-v4.1-flash');

const zroWithoutKey = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  freePiModels: [],
  coarenaModels: [],
  zroModels: zro,
});
check('no key means no zro', zroWithoutKey.zro === false);

const coarenaWins = planProviders({
  hasFreePiAuth: false,
  coarenaKey: 'k',
  zroKey: 'k',
  freePiModels: [],
  coarenaModels: co,
  zroModels: zro,
});
check('coarena outranks zro', coarenaWins.defaultProvider === 'coarena' && coarenaWins.zro === true);

// NVIDIA is the fourth keyed provider and the last in priority.
const nv = [{ id: 'deepseek-ai/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }];
const nvOnly = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: nv,
});
check('nvidia-only registers', nvOnly.nvidia && nvOnly.available && !nvOnly.zro);
check('nvidia-only default', nvOnly.defaultProvider === 'nvidia' && nvOnly.defaultModel === nv[0].id);

const nvNoKey = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: null,
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: nv,
});
check('no key means no nvidia', nvNoKey.nvidia === false);

const zroWins = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: 'k',
  nvidiaKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: zro,
  nvidiaModels: nv,
});
check('zro outranks nvidia', zroWins.defaultProvider === 'zro' && zroWins.nvidia === true);

// Token Harbor is the fifth provider and the last in priority.
const th = [{ id: 'deepseek-v4.1-flash:free', name: 'DeepSeek V4.1 Flash (Free)' }];
const thOnly = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: null,
  tokenharborKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: [],
  tokenharborModels: th,
});
check('tokenharbor-only registers', thOnly.tokenharbor && thOnly.available && !thOnly.nvidia);
check('tokenharbor-only default', thOnly.defaultProvider === 'tokenharbor' && thOnly.defaultModel === th[0].id);
const thNoKey = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: null,
  tokenharborKey: null,
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: [],
  tokenharborModels: th,
});
check('no key means no tokenharbor', thNoKey.tokenharbor === false);
const nvBeatsTh = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: 'k',
  tokenharborKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: nv,
  tokenharborModels: th,
});
check('nvidia outranks tokenharbor', nvBeatsTh.defaultProvider === 'nvidia' && nvBeatsTh.tokenharbor === true);

// Routeway joins as a sixth keyed provider, and it is the one gateway whose
// catalog opens on a paid model — the default has to find a free route.
const rw = [
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', plan: 'paid' },
  { id: 'deepseek-v4.1-flash:free', name: 'DeepSeek V4.1 Flash (Free)', plan: 'free' },
];
const rwOnly = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: null,
  tokenharborKey: null,
  routewayKey: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: [],
  tokenharborModels: [],
  routewayModels: rw,
});
check('routeway-only registers', rwOnly.routeway && rwOnly.available && !rwOnly.freePi);
check(
  'a new Routeway session opens on a free route, not the first paid one',
  rwOnly.defaultProvider === 'routeway' && rwOnly.defaultModel === 'deepseek-v4.1-flash:free',
  JSON.stringify(rwOnly)
);

const rwNoKey = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  routewayKey: null,
  freePiModels: [],
  coarenaModels: [],
  routewayModels: rw,
});
check('no key means no routeway', rwNoKey.routeway === false);
check('nothing at all stays unavailable', rwNoKey.available === false);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: one session can run on any configured provider');
