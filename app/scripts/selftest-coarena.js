/**
 * Diagnostic: the Coarena HTTP surface this app depends on, with the network
 * faked out. The shapes here are copied from the live API so a change on their
 * side fails this test before it fails a turn.
 *
 * Run from app/:   node scripts/selftest-coarena.js
 */
'use strict';

const {
  COARENA_PROVIDER,
  COARENA_BASE_URL,
  FALLBACK_MODELS,
  fetchCoarenaModels,
  coarenaProviderConfig,
  coarenaModelEntries,
  readCoarenaKeyInfo,
  resetCoarenaModelCache,
} = require('../src/coarena');

const KEY = 'coa_test_000000000000';

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const fake = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// Trimmed copy of GET https://coarena.ai/api/v1/models.
const modelsPayload = {
  object: 'list',
  data: [
    {
      id: 'm1',
      object: 'model',
      display_name: 'Model One',
      context_length: 64000,
      max_tokens: 4096,
      max_completion_tokens: 4096,
      lifecycle: 'active',
    },
    { id: 'm2', object: 'model', display_name: 'Model Two', context_length: 128000, max_tokens: 16384 },
  ],
};
const liveModels = fake(200, modelsPayload);
let calls = 0;
const countingFetch = (status, body) => async (...args) => {
  calls += 1;
  return liveModels(...args);
};

(async () => {
  resetCoarenaModelCache();

  check('provider id', COARENA_PROVIDER === 'coarena');
  check('base url', COARENA_BASE_URL === 'https://coarena.ai/api/v1');

  const live = await fetchCoarenaModels({ fetchImpl: countingFetch(), force: true });
  check('live catalog is labelled live', live.source === 'live', JSON.stringify(live.source));
  check('two models parsed', live.models.length === 2);
  check(
    'model fields normalized',
    live.models[0].id === 'm1' &&
      live.models[0].name === 'Model One' &&
      live.models[0].contextWindow === 64000 &&
      live.models[0].maxTokens === 4096,
    JSON.stringify(live.models[0])
  );

  calls = 0;
  const cached = await fetchCoarenaModels({
    // A fresh cache must answer without touching the network at all.
    fetchImpl: async () => {
      throw new Error('must not be called');
    },
  });
  check('fresh cache answers offline', cached.source === 'cache' && cached.models[0].id === 'm1');
  check('cache avoided the network', calls === 0);

  resetCoarenaModelCache();
  const fallback = await fetchCoarenaModels({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  check('failure with no cache falls back', fallback.source === 'fallback');
  check(
    'fallback catalog is the five verified ids',
    fallback.models.length === 5 && fallback.models[0].id === 'claude-fable-5',
    fallback.models.map((m) => m.id).join(', ')
  );
  check(
    'fallback matches FALLBACK_MODELS',
    FALLBACK_MODELS.length === 5 &&
      FALLBACK_MODELS.map((m) => m.id).join(',') ===
        'claude-fable-5,deepseek-v4-1-flash-1017,gemini-4-argon,kimi-k3-1-pro,grok-4-7'
  );
  check('fallback entries carry a name and window', Boolean(fallback.models[0].name) && fallback.models[0].contextWindow > 0);

  resetCoarenaModelCache();
  const config = coarenaProviderConfig({ apiKey: KEY, models: live.models });
  check('provider display name', config.name === 'Coarena');
  check('provider base url', config.baseUrl === COARENA_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  check(
    'model config keeps the catalog window',
    config.models[0].input[0] === 'text' &&
      config.models[0].reasoning === true &&
      config.models[0].contextWindow === 64000 &&
      config.models[0].maxTokens === 4096,
    JSON.stringify(config.models[0])
  );
  check(
    'zero cost fields',
    config.models[0].cost.input === 0 &&
      config.models[0].cost.output === 0 &&
      config.models[0].cost.cacheRead === 0 &&
      config.models[0].cost.cacheWrite === 0
  );

  const entries = coarenaModelEntries(live.models);
  check(
    'dropdown entries are provider-tagged',
    entries.length === 2 && entries[0].provider === 'coarena' && entries[0].id === 'm1' && entries[0].name === 'Model One'
  );

  // Trimmed copy of GET https://coarena.ai/api/v1/key.
  const meta = {
    data: {
      label: 'main',
      prefix: 'coa_1234',
      is_free_tier: true,
      expires_at: 1802350540242,
      limits: { requests_per_minute_key: 30, concurrency: 2, usd_per_day: 5, max_output_tokens: 16384 },
      usage_today: { requests: 4, cost_usd: 0.01, resets_at: 1794614400000 },
    },
  };
  const info = await readCoarenaKeyInfo(KEY, { fetchImpl: fake(200, meta) });
  check('key info ok', info.ok === true, JSON.stringify(info));
  check(
    'limits mapped',
    info.info.limits.requestsPerMinute === 30 &&
      info.info.limits.concurrency === 2 &&
      info.info.limits.usdPerDay === 5 &&
      info.info.limits.maxOutputTokens === 16384,
    JSON.stringify(info.info.limits)
  );
  check('usage mapped', info.info.usageToday.requests === 4 && info.info.usageToday.costUsd === 0.01);
  check('free tier flag', info.info.isFreeTier === true);
  check('epoch millis become ISO dates', /^\d{4}-\d{2}-\d{2}T/.test(info.info.usageToday.resetsAt));
  check('prefix kept for the settings hint', info.info.prefix === 'coa_1234');

  const bad = await readCoarenaKeyInfo(KEY, {
    fetchImpl: fake(401, { error: { code: 'invalid_api_key', message: 'bad key' } }),
  });
  check('bad key fails', bad.ok === false && bad.status === 401);
  check('bad key keeps the code', bad.code === 'invalid_api_key');
  check('bad key message does not echo the key', !String(bad.error).includes(KEY), String(bad.error));

  const offline = await readCoarenaKeyInfo(KEY, {
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND coarena.ai');
    },
  });
  check('offline key check is marked offline', offline.ok === false && offline.offline === true);
  check('offline message names Coarena', /Coarena/.test(offline.error));

  const empty = await readCoarenaKeyInfo('', { fetchImpl: fake(200, meta) });
  check('blank key is rejected before the request', empty.ok === false && empty.status === 0);

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the Coarena catalog, provider config and key metadata behave');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
