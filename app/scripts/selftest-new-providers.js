/**
 * z.ai, OpenRouter and Cloudflare join the keyed providers.
 *
 * Three things have to hold before a turn is sent to any of them:
 *
 *   1. The provider config pi receives must describe the real endpoint — for
 *      Workers AI that includes the account id in the base URL, because the same
 *      token reaches every account this app was never told about.
 *   2. A key is proven before it is saved, and a server's own wording never
 *      carries the key back into the window.
 *   3. None of the three may become the default while a free provider exists:
 *      all of them bill from the first token.
 *
 * Run: node scripts/selftest-new-providers.js
 */
'use strict';

const {
  ZAI_PROVIDER,
  ZAI_BASE_URL,
  ZAI_MODEL_CANDIDATES,
  zaiProviderConfig,
  zaiModelEntries,
  checkZaiKey,
  resolveZaiModels,
} = require('../src/zai');
const {
  OPENROUTER_PROVIDER,
  OPENROUTER_BASE_URL,
  openrouterProviderConfig,
  openrouterModelEntries,
  openrouterRowToModel,
  checkOpenRouterKey,
  resolveOpenRouterModels,
} = require('../src/openrouter');
const {
  CLOUDFLARE_PROVIDER,
  cloudflareBaseUrl,
  cloudflareProviderConfig,
  cloudflareModelEntries,
  cloudflareRowToModel,
  checkCloudflareKey,
  resolveCloudflareModels,
} = require('../src/cloudflare');
const { planProviders } = require('../src/provider-plan');
require('../src/renderer/provider-ui');
const { providerLabel, providerLogoPath, providerChrome } = globalThis.FPProvider;

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
    failures += 1;
  }
}

/** A fetch stand-in: records the call and answers with whatever the case wants. */
function stubFetch(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  impl.calls = calls;
  return impl;
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

const KEY = 'sk-test-9f3a2b1c';

async function main() {
  /* ------------------------------- z.ai -------------------------------- */
  const zaiConfig = zaiProviderConfig({ apiKey: KEY, models: ZAI_MODEL_CANDIDATES });
  check('z.ai: provider name and endpoint', zaiConfig.name === 'z.ai' && zaiConfig.baseUrl === ZAI_BASE_URL);
  check('z.ai: OpenAI-compatible api', zaiConfig.api === 'openai-completions');
  check('z.ai: every candidate is registered', zaiConfig.models.length === ZAI_MODEL_CANDIDATES.length);
  check(
    'z.ai: the whole live family is offered',
    ZAI_MODEL_CANDIDATES.length >= 13 && ZAI_MODEL_CANDIDATES.some((m) => m.id === 'glm-5.3-flash'),
    ZAI_MODEL_CANDIDATES.map((m) => m.id).join(',')
  );
  check(
    'z.ai: a row with no published price carries none',
    ZAI_MODEL_CANDIDATES.filter((m) => m.cost === null).length > 0 &&
      ZAI_MODEL_CANDIDATES.every((m) => !m.cost || m.cost.input > 0)
  );
  check(
    'z.ai: a row with no price still says paid',
    zaiModelEntries(ZAI_MODEL_CANDIDATES).every((e) => e.plan === 'paid' && typeof e.planNote === 'string')
  );
  check(
    'z.ai: text-only rows carry no image part',
    zaiConfig.models.every((m) => m.input.length === 1 && m.input[0] === 'text')
  );
  check(
    'z.ai: cost is attached for the spend estimate',
    zaiConfig.models.every((m) => m.cost && Number.isFinite(m.cost.input))
  );
  const zaiEntries = zaiModelEntries(ZAI_MODEL_CANDIDATES);
  check('z.ai: entries are tagged paid', zaiEntries.every((e) => e.plan === 'paid'));
  check('z.ai: entries name their provider', zaiEntries.every((e) => e.provider === ZAI_PROVIDER));

  const zaiOk = stubFetch(() => jsonResponse({ data: [{ id: 'glm-4.6' }, { id: 'glm-4.5-air' }] }));
  const zaiCheck = await checkZaiKey(KEY, { fetchImpl: zaiOk });
  check('z.ai: a good key passes', zaiCheck.ok === true);
  check('z.ai: the check hit /models with a Bearer header', zaiOk.calls[0].url === `${ZAI_BASE_URL}/models`);
  check(
    'z.ai: the Bearer header carries the key',
    zaiOk.calls[0].init.headers.authorization === `Bearer ${KEY}`
  );
  check('z.ai: live ids are read', JSON.stringify(zaiCheck.ids) === JSON.stringify(['glm-4.6', 'glm-4.5-air']));

  const zaiBad = stubFetch(() => jsonResponse({ error: { message: 'invalid api key' } }, 401));
  const zaiBadResult = await checkZaiKey(KEY, { fetchImpl: zaiBad });
  check('z.ai: a rejected key fails', zaiBadResult.ok === false && zaiBadResult.status === 401);
  check('z.ai: an unreachable API is reported as offline', (await checkZaiKey(KEY, { fetchImpl: stubFetch(() => { throw new Error('ENOTFOUND'); }) })).offline === true);

  const zaiEcho = stubFetch(() => jsonResponse({ error: { message: `bad key ${KEY}` } }, 401));
  const zaiEchoResult = await checkZaiKey(KEY, { fetchImpl: zaiEcho });
  check('z.ai: the key is never echoed back', !zaiEchoResult.error.includes(KEY));

  const zaiLive = stubFetch(() => jsonResponse({ data: [{ id: 'glm-4.5-air' }] }));
  const zaiResolved = await resolveZaiModels(KEY, { fetchImpl: zaiLive });
  check(
    'z.ai: the catalog follows /models',
    zaiResolved.length === 1 && zaiResolved[0].id === 'glm-4.5-air'
  );
  check('z.ai: no key means no catalog', (await resolveZaiModels('')).length === 0);

  /* ----------------------------- OpenRouter ---------------------------- */
  const routerConfig = openrouterProviderConfig({ apiKey: KEY });
  check(
    'openrouter: name and endpoint',
    routerConfig.name === 'OpenRouter' && routerConfig.baseUrl === OPENROUTER_BASE_URL
  );
  check('openrouter: the first candidate is the fallback', routerConfig.models.length === 1);
  const routerEntries = openrouterModelEntries(
    openrouterModelEntriesFallback()
  );
  check('openrouter: entries are tagged paid', routerEntries.every((e) => e.plan === 'paid'));

  const routerKeyStub = stubFetch(() => jsonResponse({ data: { label: 'test', limit: null } }));
  const routerCheck = await checkOpenRouterKey(KEY, { fetchImpl: routerKeyStub });
  check('openrouter: a good key passes', routerCheck.ok === true);
  check('openrouter: validation asks /key', routerKeyStub.calls[0].url === `${OPENROUTER_BASE_URL}/key`);
  check(
    'openrouter: the request is identified',
    routerKeyStub.calls[0].init.headers['X-Title'] === 'NTAPI'
  );

  const routerDenied = stubFetch(() => jsonResponse({ error: { message: 'No auth credentials found' } }, 401));
  check('openrouter: a rejected key fails', (await checkOpenRouterKey(KEY, { fetchImpl: routerDenied })).ok === false);

  const routerModels = stubFetch(() =>
    jsonResponse({
      data: [
        {
          id: 'deepseek/deepseek-chat-v3.1',
          name: 'DeepSeek V3.1',
          context_length: 163840,
          pricing: { prompt: '0.00000027', completion: '0.0000011' },
          top_provider: { max_completion_tokens: 32768 },
        },
      ],
    })
  );
  const routerResolved = await resolveOpenRouterModels(KEY, { fetchImpl: routerModels });
  check(
    'openrouter: the whole public catalog becomes rows',
    routerResolved.length === 1 && routerResolved[0].id === 'deepseek/deepseek-chat-v3.1'
  );
  check(
    'openrouter: per-token pricing becomes per million',
    routerResolved[0].cost.input === 0.27 && routerResolved[0].cost.output === 1.1
  );
  check('openrouter: a live name replaces the shortlist label', routerResolved[0].name === 'DeepSeek V3.1');
  check('openrouter: no key means no catalog', (await resolveOpenRouterModels('')).length === 0);

  // A $0 route is a free route, and the picker's "free only" tick filters on
  // exactly that tag.
  const routerFree = openrouterRowToModel({
    id: 'nvidia/nemotron-3.5-super-vl:free',
    name: 'Nemotron 3.5 Super VL (free)',
    context_length: 1000000,
    pricing: { prompt: '0', completion: '0' },
    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
  });
  check('openrouter: a $0 route is tagged free', routerFree.plan === 'free', routerFree.plan);
  check('openrouter: a $0 route sees images', routerFree.vision === true);
  const routerFreeEntry = openrouterModelEntries([routerFree])[0];
  check(
    'openrouter: a free row carries no price and no quota chip',
    routerFreeEntry.plan === 'free' && routerFreeEntry.planNote === '' && routerFreeEntry.freeTier === false,
    routerFreeEntry
  );
  check(
    'openrouter: an image generator is dropped',
    openrouterRowToModel({
      id: 'black-forest-labs/flux',
      architecture: { output_modalities: ['image'] },
      pricing: { prompt: '0', completion: '0' },
    }) === null
  );

  /* ----------------------------- Cloudflare ---------------------------- */
  const account = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  check(
    'cloudflare: the account id is part of the endpoint',
    cloudflareBaseUrl(account) === `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`
  );
  const cfConfig = cloudflareProviderConfig({ apiKey: KEY, accountId: account });
  check('cloudflare: the config carries the account endpoint', cfConfig.baseUrl.includes(account));
  check('cloudflare: name is Cloudflare', cfConfig.name === 'Cloudflare');

  check(
    'cloudflare: a token without an account id is refused',
    (await checkCloudflareKey(KEY, '')).ok === false
  );
  const cfStub = stubFetch(() => jsonResponse({ result: [{ name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }] }));
  const cfCheck = await checkCloudflareKey(KEY, account, { fetchImpl: cfStub });
  check('cloudflare: both halves together pass', cfCheck.ok === true);
  check(
    'cloudflare: the check asks the account model search',
    cfStub.calls[0].url.includes(`/accounts/${account}/ai/models/search`)
  );
  const cfResolved = await resolveCloudflareModels(KEY, account, { fetchImpl: cfStub });
  check(
    'cloudflare: the catalog follows the account',
    cfResolved.length === 1 && cfResolved[0].id === '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
  );
  check(
    'cloudflare: no account id means no catalog',
    (await resolveCloudflareModels(KEY, '')).length === 0
  );
  check(
    'cloudflare: a model the catalog does not flag is free, not paid',
    cloudflareModelEntries(cfResolved).every((e) => e.plan === 'free' && e.freeTier === true)
  );

  /*
   * The catalog decides the label: `require_workers_paid` is Cloudflare saying a
   * Workers Free plan cannot run this one, and a free-plan row draws on the
   * account's daily Neuron allowance instead.
   */
  const cfFree = cloudflareRowToModel({
    name: '@cf/meta/llama-3.2-11b-vision-instruct',
    tags: [],
    properties: [
      { property_id: 'context_window', value: '128000' },
      { property_id: 'vision', value: 'true' },
      {
        property_id: 'price',
        value: [
          { unit: 'per M input tokens', price: 0.0485, currency: 'USD' },
          { unit: 'per M output tokens', price: 0.676, currency: 'USD' },
        ],
      },
    ],
  });
  check('cloudflare: facts are read off the row', cfFree.contextWindow === 128000 && cfFree.vision === true);
  check(
    'cloudflare: a price is read off the row',
    cfFree.cost.input === 0.0485 && cfFree.cost.output === 0.676
  );
  check('cloudflare: a free-plan model is offered as free', cfFree.plan === 'free', cfFree.plan);

  const cfPaid = cloudflareRowToModel({
    name: '@cf/zai-org/glm-5.3',
    tags: [],
    properties: [
      { property_id: 'require_workers_paid', value: 'true' },
      { property_id: 'context_window', value: '1048576' },
      { property_id: 'reasoning', value: 'true' },
      {
        property_id: 'price',
        value: [
          { unit: 'per M input tokens', price: 1.4, currency: 'USD' },
          { unit: 'per M output tokens', price: 4.4, currency: 'USD' },
        ],
      },
    ],
  });
  const cfPaidEntry = cloudflareModelEntries([cfPaid])[0];
  check('cloudflare: a Workers-Paid model is offered as paid', cfPaid.plan === 'paid', cfPaid.plan);
  check(
    'cloudflare: the paid row shows its price',
    cfPaidEntry.planNote === '$1.40/$4.40',
    cfPaidEntry.planNote
  );
  check('cloudflare: a paid row is not a free-tier row', cfPaidEntry.freeTier === false);
  check('cloudflare: thinking is read off the row', cfPaid.reasoning === true);
  check(
    'cloudflare: a guard model is dropped',
    cloudflareRowToModel({ name: '@cf/meta/llama-guard-3-8b', tags: ['moderation'], properties: [] }) === null
  );

  /* -------------------------------- plan -------------------------------- */
  const freePiPlan = planProviders({
    hasFreePiAuth: true,
    freePiModels: [{ id: 'deepseek-v4.1-flash' }],
    zaiKey: KEY,
    zaiModels: [{ id: 'glm-4.6' }],
    openrouterKey: KEY,
    openrouterModels: [{ id: 'deepseek/deepseek-chat-v3.1' }],
    cloudflareKey: KEY,
    cloudflareModels: [{ id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }],
  });
  check('plan: FreePi still wins the default', freePiPlan.defaultProvider === 'free-pi');
  check(
    'plan: the three are registered but not the default',
    freePiPlan.zai && freePiPlan.openrouter && freePiPlan.cloudflare
  );

  const paidPlan = planProviders({
    hasFreePiAuth: false,
    coarenaKey: 'coa_test',
    coarenaModels: [{ id: 'some-free' }],
    zaiKey: KEY,
    zaiModels: [{ id: 'glm-4.6' }],
  });
  check('plan: a free provider outranks a paid one', paidPlan.defaultProvider === 'coarena');

  const onlyZai = planProviders({ hasFreePiAuth: false, zaiKey: KEY, zaiModels: [{ id: 'glm-4.6' }] });
  check('plan: z.ai alone is usable', onlyZai.available === true && onlyZai.defaultProvider === 'zai');

  const keyNoCatalog = planProviders({ hasFreePiAuth: false, zaiKey: KEY, zaiModels: [] });
  check('plan: a key with no catalog is not a provider', keyNoCatalog.zai === false && keyNoCatalog.available === false);

  /* ----------------------------- presentation --------------------------- */
  check('ui: z.ai is named', providerLabel('zai') === 'z.ai');
  check('ui: OpenRouter is named', providerLabel('openrouter') === 'OpenRouter');
  check('ui: Cloudflare is named', providerLabel('cloudflare') === 'Cloudflare');
  check(
    'ui: every new provider has a bundled mark',
    ['zai', 'openrouter', 'cloudflare'].every((id) => providerLogoPath(id).endsWith('.svg'))
  );
  check(
    'ui: every new provider has its own meter',
    ['zai', 'openrouter', 'cloudflare'].every((id) => providerChrome({ provider: id }).meter === id)
  );

  if (failures) {
    console.log(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll z.ai / OpenRouter / Cloudflare checks passed.');
}

/** Two entries so the paid tag can be checked without a network call. */
function openrouterModelEntriesFallback() {
  return [
    { id: 'deepseek/deepseek-chat-v3.1', name: 'DeepSeek V3.1', cost: { input: 0.27, output: 1.1 } },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', cost: { input: 0.3, output: 2.5 } },
  ];
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
