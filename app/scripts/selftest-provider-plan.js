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
check('free-pi tools only with free-pi', both.freePiTools === true && FREE_PI_TOOL_NAMES.length === 6);

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

// LLM7 joins as a sixth keyed provider, and it is a gateway whose catalog can
// open on a paid model — the default has to find a free turbo model.
const l7 = [
  { id: 'claude-fable-5-2', name: 'Claude Fable 5.2', plan: 'paid' },
  { id: 'DeepSeek-V4-Flash-0731', name: 'DeepSeek V4 Flash', plan: 'free', reasoning: true },
  { id: 'gpt-oss:20b', name: 'GPT OSS 20B', plan: 'free', reasoning: false },
];
const rwOnly = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  zroKey: null,
  nvidiaKey: null,
  tokenharborKey: null,
  llm7Key: 'k',
  freePiModels: [],
  coarenaModels: [],
  zroModels: [],
  nvidiaModels: [],
  tokenharborModels: [],
  llm7Models: l7,
});
check('llm7-only registers', rwOnly.llm7 && rwOnly.available && !rwOnly.freePi);
check(
  'a new LLM7 session opens on a free turbo model, not the first paid one',
  rwOnly.defaultProvider === 'llm7' && rwOnly.defaultModel === 'gpt-oss:20b',
  JSON.stringify(rwOnly)
);

// The free lane trims a reasoning model's output: DeepSeek V4 Flash spent the
// whole cap thinking and answered nothing. The known-good free list must win
// even when a different free model is listed first.
const l7Reordered = [
  { id: 'DeepSeek-V4-Flash-0731', name: 'DeepSeek V4 Flash', plan: 'free', reasoning: true },
  { id: 'codestral-latest', name: 'Codestral', plan: 'free', reasoning: false },
  { id: 'gpt-oss:20b', name: 'GPT OSS 20B', plan: 'free', reasoning: false },
];
const rwReordered = planProviders({ llm7Key: 'k', llm7Models: l7Reordered });
check(
  'LLM7 default prefers the known-good free model over a reasoning one',
  rwReordered.defaultModel === 'gpt-oss:20b',
  JSON.stringify(rwReordered)
);

const l7Unknown = [
  { id: 'some-free-model', name: 'Some Free', plan: 'free', reasoning: false },
  { id: 'some-paid-model', name: 'Some Paid', plan: 'paid' },
];
const rwUnknown = planProviders({ llm7Key: 'k', llm7Models: l7Unknown });
check(
  'an unfamiliar LLM7 catalog still opens on a free model',
  rwUnknown.defaultModel === 'some-free-model',
  JSON.stringify(rwUnknown)
);

const rwNoKey = planProviders({
  hasFreePiAuth: false,
  coarenaKey: null,
  llm7Key: null,
  freePiModels: [],
  coarenaModels: [],
  llm7Models: l7,
});
check('no key means no llm7', rwNoKey.llm7 === false);
check('nothing at all stays unavailable', rwNoKey.available === false);

// Claude and Gemini join as first-party paid providers, last in the default
// order for the same reason DeepSeek is: a saved key must not start spending.
const ant = [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }];
const gem = [{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }];

const antOnly = planProviders({ anthropicKey: 'k', anthropicModels: ant });
check('anthropic-only works', antOnly.available && antOnly.anthropic && !antOnly.google);
check(
  'anthropic-only defaults to its first model',
  antOnly.defaultProvider === 'anthropic' && antOnly.defaultModel === 'claude-sonnet-4-5'
);
check('anthropic brings no ads and no free-pi tools', antOnly.ads === false && antOnly.freePiTools === false);

const gemOnly = planProviders({ googleKey: 'k', googleModels: gem });
check('google-only works', gemOnly.available && gemOnly.google && !gemOnly.anthropic);
check(
  'google-only defaults to its first model',
  gemOnly.defaultProvider === 'google' && gemOnly.defaultModel === 'gemini-2.5-pro'
);

const gemFree = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', plan: 'paid', freeTier: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', plan: 'paid', freeTier: false },
];
const gemFreeOnly = planProviders({ googleKey: 'k', googleModels: gemFree });
check(
  'a new Gemini chat opens on the row with a free allowance',
  gemFreeOnly.defaultProvider === 'google' && gemFreeOnly.defaultModel === 'gemini-2.5-flash',
  gemFreeOnly.defaultModel
);

const gemProFirst = [
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', plan: 'paid', freeTier: false },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', plan: 'paid', freeTier: true },
];
check(
  'the free-allowance row wins even when it is listed last',
  planProviders({ googleKey: 'k', googleModels: gemProFirst }).defaultModel === 'gemini-2.5-flash-lite'
);

const antNoKey = planProviders({ anthropicKey: null, anthropicModels: ant });
check('a catalog without a key is not a provider', antNoKey.anthropic === false && antNoKey.available === false);
const antNoModels = planProviders({ anthropicKey: 'k', anthropicModels: [] });
check('a key with an empty catalog is not a provider', antNoModels.anthropic === false);

const allPaid = planProviders({
  deepseekKey: 'k',
  deepseekModels: [{ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }],
  anthropicKey: 'k',
  anthropicModels: ant,
  googleKey: 'k',
  googleModels: gem,
});
check(
  'with every paid key saved, DeepSeek still opens first',
  allPaid.defaultProvider === 'deepseek' && allPaid.available === true
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: one session can run on any configured provider');
