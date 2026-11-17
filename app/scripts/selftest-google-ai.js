/**
 * Offline check for src/google-ai.js — no network, injected fetch.
 * Run: node scripts/selftest-google-ai.js
 */
'use strict';

const {
  GOOGLE_PROVIDER,
  GOOGLE_BASE_URL,
  GOOGLE_MODEL_CANDIDATES,
  googleProviderConfig,
  googleModelEntries,
  checkGoogleKey,
  resolveGoogleModels,
  bareId,
  priceNote,
} = require('../src/google-ai');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

function fakeFetch({ status = 200, body = {}, throws = null } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (throws) throw new Error(throws);
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
    };
  };
  impl.calls = calls;
  return impl;
}

(async () => {
  check('provider id', GOOGLE_PROVIDER === 'google');
  check('versioned base url', GOOGLE_BASE_URL.endsWith('/v1beta'));
  check('flash and flash-lite carry the free allowance',
    GOOGLE_MODEL_CANDIDATES.filter((m) => m.freeTier === true).length === 2 &&
      GOOGLE_MODEL_CANDIDATES.find((m) => m.family === 'gemini-2.5-flash')?.freeTier === true &&
      GOOGLE_MODEL_CANDIDATES.find((m) => m.family === 'gemini-2.5-flash-lite')?.freeTier === true,
    JSON.stringify(GOOGLE_MODEL_CANDIDATES.map((m) => `${m.family}:${m.freeTier}`)));
  check('pro has no free allowance',
    GOOGLE_MODEL_CANDIDATES.find((m) => m.family === 'gemini-2.5-pro')?.freeTier === false);
  check('every row is still paid and priced',
    GOOGLE_MODEL_CANDIDATES.every((m) => m.plan === 'paid' && m.cost?.input > 0));
  check('price note format', priceNote({ input: 0.3, output: 2.5 }) === '$0.30/$2.50', priceNote({ input: 0.3, output: 2.5 }));
  check('models/ prefix is stripped', bareId('models/gemini-2.5-pro') === 'gemini-2.5-pro');

  const cfg = googleProviderConfig({ apiKey: 'k', models: GOOGLE_MODEL_CANDIDATES });
  check('registerProvider shape', cfg.api === 'google-generative-ai' && cfg.baseUrl === GOOGLE_BASE_URL);
  check('api key is carried', cfg.apiKey === 'k');
  check('images allowed', cfg.models.every((m) => m.input.includes('image')));
  check('cost reaches pi', cfg.models[0].cost.input === 1.25);

  const entries = googleModelEntries([{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', cost: { input: 1.25, output: 10 } }]);
  check('entry is paid', entries[0].plan === 'paid');
  check('entry badge is the price', entries[0].planNote === '$1.25/$10.00');
  check('entry keeps the raw cost', entries[0].cost.output === 10);

  const freeEntry = googleModelEntries([
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', freeTier: true, cost: { input: 0.3, output: 2.5 } },
  ]);
  check('a quota row is still paid', freeEntry[0].plan === 'paid');
  check('a quota row still shows its price', freeEntry[0].planNote === '$0.30/$2.50', freeEntry[0].planNote);
  check('the free allowance reaches the picker', freeEntry[0].freeTier === true);
  check('a plain row has no allowance',
    googleModelEntries([{ id: 'x', cost: { input: 1, output: 2 } }])[0].freeTier === false);

  const ok = fakeFetch({
    body: { models: [{ name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] }] },
  });
  const res = await checkGoogleKey('AIza-test', { fetchImpl: ok });
  check('valid key passes', res.ok === true);
  check('models are read', Array.isArray(res.models) && res.models.length === 1);
  check('the key travels in x-goog-api-key', ok.calls[0].init.headers['x-goog-api-key'] === 'AIza-test');
  check('the key never lands in the URL', !ok.calls[0].url.includes('AIza-test'));

  const bad = await checkGoogleKey('nope', {
    fetchImpl: fakeFetch({ status: 400, body: { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } } }),
  });
  check('a rejected key is not offline', bad.ok === false && bad.offline !== true);
  check('the server message is passed on', bad.error === 'API key not valid', bad.error);

  const offline = await checkGoogleKey('k', { fetchImpl: fakeFetch({ throws: 'getaddrinfo ENOTFOUND' }) });
  check('network failure is offline', offline.ok === false && offline.offline === true);

  const live = fakeFetch({
    body: {
      models: [
        { name: 'models/gemini-2.5-pro', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
      ],
    },
  });
  const models = await resolveGoogleModels('k', { fetchImpl: live });
  check('only generateContent models are offered', models.length === 2, JSON.stringify(models.map((m) => m.id)));
  check('embedding models are dropped', !models.some((m) => m.id.includes('embedding')));
  check('the live caps are used', models[0].contextWindow === 1048576 && models[0].maxTokens === 65536);
  check('the free allowance survives the live catalog', models[0].freeTier === false && models[1].freeTier === true,
    JSON.stringify(models.map((m) => `${m.id}:${m.freeTier}`)));

  const numbered = await resolveGoogleModels('k', {
    fetchImpl: fakeFetch({
      body: {
        models: [
          { name: 'models/gemini-2.5-pro-001', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-pro-002', supportedGenerationMethods: ['generateContent'] },
        ],
      },
    }),
  });
  check('the newest numbered release wins', numbered[0].id === 'gemini-2.5-pro-002', numbered[0].id);

  const noKey = await resolveGoogleModels('', {});
  check('no key means no models', Array.isArray(noKey) && noKey.length === 0);

  const unreachable = await resolveGoogleModels('k', { fetchImpl: fakeFetch({ throws: 'boom' }) });
  check('unreachable still offers one model', unreachable.length === 1);

  console.log(failures ? `\n${failures} check(s) failed` : '\nall google ai checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('GOOGLE FAIL:', err.message);
  process.exit(1);
});