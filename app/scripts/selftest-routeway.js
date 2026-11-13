/**
 * Routeway provider: catalog mapping, provider config, key check.
 *
 * The gateway's `/v1/models` is public, so the interesting parts are what this
 * module does with the vendor's own metadata — plan labelling from the `:free`
 * suffix and the price block, chat-only filtering, and the rule that a key is
 * refused only when Routeway says the key is wrong.
 *
 * Run from app/:   node scripts/selftest-routeway.js
 */
'use strict';

const {
  ROUTEWAY_PROVIDER,
  ROUTEWAY_BASE_URL,
  PING_MODEL,
  FALLBACK_MODELS,
  fetchRoutewayModels,
  routewayProviderConfig,
  routewayModelEntries,
  checkRoutewayKey,
  resetRoutewayModelCache,
} = require('../src/routeway');

const KEY = 'sk-routeway-test-0000000000000000';

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const jsonResponse = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** Two models shaped exactly like the live catalog. */
const CATALOG = {
  object: 'list',
  data: [
    {
      id: 'claude-fable-5-2',
      name: 'Anthropic: Claude Fable 5 2',
      short_name: 'Claude Fable 5.2',
      context_length: 1000000,
      owned_by: 'anthropic',
      available: true,
      endpoints: ['/v1/chat/completions', '/v1/responses'],
      pricing: {
        input: { unit: '1M tokens', price_per_million_t: 8 },
        output: { unit: '1M tokens', price_per_million_t: 40 },
      },
      capabilities: { vision: true, reasoning: true },
    },
    {
      id: 'deepseek-v4.1-flash:free',
      name: 'DeepSeek V4.1 Flash (Free)',
      short_name: 'DeepSeek V4.1 Flash (Free)',
      context_length: 42000,
      owned_by: 'deepseek',
      available: true,
      endpoints: ['/v1/chat/completions'],
      pricing: {
        input: { unit: '1M tokens', price_per_million_t: 0 },
        output: { unit: '1M tokens', price_per_million_t: 0 },
      },
      capabilities: { vision: false, reasoning: true },
    },
    {
      // Not a chat model: an embedding endpoint must never reach the picker.
      id: 'text-embedding-5-large',
      short_name: 'Embedding 5 Large',
      context_length: 8000,
      available: true,
      endpoints: ['/v1/embeddings'],
      pricing: { input: { price_per_million_t: 0.1 }, output: { price_per_million_t: 0 } },
      capabilities: {},
    },
    {
      // Retired: the catalog says so, so it is not offered.
      id: 'old-model-4',
      short_name: 'Old Model 4',
      context_length: 32000,
      available: false,
      endpoints: ['/v1/chat/completions'],
      pricing: { input: { price_per_million_t: 1 }, output: { price_per_million_t: 2 } },
      capabilities: {},
    },
  ],
};

(async () => {
  check('provider id', ROUTEWAY_PROVIDER === 'routeway');
  check('base url', ROUTEWAY_BASE_URL === 'https://api.routeway.ai/v1');
  check('fallback is the free routes only', FALLBACK_MODELS.every((m) => m.id.endsWith(':free')));

  resetRoutewayModelCache();
  const fetched = await fetchRoutewayModels({ fetchImpl: jsonResponse(200, CATALOG) });
  check('catalog is live', fetched.source === 'live', fetched.source);
  check(
    'only chat models that are available survive',
    fetched.models.length === 2 && fetched.models.map((m) => m.id).join() === 'claude-fable-5-2,deepseek-v4.1-flash:free',
    JSON.stringify(fetched.models.map((m) => m.id))
  );

  const paid = fetched.models[0];
  const free = fetched.models[1];
  check('a priced model is paid', paid.plan === 'paid');
  check('the price block becomes the note', paid.planNote === '$8.00/$40.00', paid.planNote);
  check('a :free route is free', free.plan === 'free' && free.planNote === '');
  check('short_name wins for the label', paid.name === 'Claude Fable 5.2', paid.name);
  check('vision follows the catalog', paid.vision === true && free.vision === false);
  check('context comes from the catalog', paid.contextWindow === 1000000 && free.contextWindow === 42000);
  check(
    'the output cap is derived, never invented past the cap',
    paid.maxTokens === 32768 && free.maxTokens === 10500,
    `${paid.maxTokens} / ${free.maxTokens}`
  );

  // A second call inside the TTL must not hit the network again.
  let called = 0;
  resetRoutewayModelCache();
  const counting = async (url, init) => {
    called += 1;
    return jsonResponse(200, CATALOG)(url, init);
  };
  await fetchRoutewayModels({ fetchImpl: counting });
  await fetchRoutewayModels({ fetchImpl: counting });
  check('the catalog is cached', called === 1, String(called));

  resetRoutewayModelCache();
  const offline = await fetchRoutewayModels({
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND api.routeway.ai');
    },
  });
  check('offline falls back to the free routes', offline.source === 'fallback' && offline.models.length === FALLBACK_MODELS.length);
  check('the fallback is labelled free', offline.models.every((m) => m.plan === 'free'));

  const config = routewayProviderConfig({ apiKey: KEY, models: fetched.models });
  check('provider display name', config.name === 'Routeway');
  check('provider base url', config.baseUrl === ROUTEWAY_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  const cfgPaid = config.models.find((m) => m.id === 'claude-fable-5-2');
  const cfgFree = config.models.find((m) => m.id === 'deepseek-v4.1-flash:free');
  check('a vision model accepts images', cfgPaid.input.join(',') === 'text,image');
  check('a text-only model does not', cfgFree.input.join(',') === 'text');
  check('config without a catalog still has a model', routewayProviderConfig({ apiKey: KEY }).models.length > 0);

  const entries = routewayModelEntries(fetched.models);
  check(
    'dropdown entries are provider-tagged',
    entries.every((e) => e.provider === 'routeway') && entries.length === 2
  );
  check('entries carry the plan', entries[0].plan === 'paid' && entries[1].plan === 'free');

  // --- key check ---

  const good = await checkRoutewayKey(KEY, { fetchImpl: jsonResponse(200, { choices: [] }) });
  check('a working key passes', good.ok === true, JSON.stringify(good));

  const bad = await checkRoutewayKey(KEY, {
    fetchImpl: jsonResponse(401, {
      error: { message: 'Invalid API key', code: 'invalid_api_key', type: 'authentication_error' },
    }),
  });
  check('a wrong key fails', bad.ok === false && bad.unverified !== true);
  check('the server message never echoes the key', !String(bad.error).includes(KEY));

  const limited = await checkRoutewayKey(KEY, {
    fetchImpl: jsonResponse(429, { error: { message: 'Too many requests' } }),
  });
  check('a rate limit is inconclusive, not a rejection', limited.ok === false && limited.unverified === true);

  const unconfirmed = await checkRoutewayKey(KEY, {
    fetchImpl: jsonResponse(403, { error: { message: 'Model not available on your plan' } }),
  });
  check('a plan restriction is inconclusive too', unconfirmed.unverified === true, JSON.stringify(unconfirmed));

  const down = await checkRoutewayKey(KEY, {
    fetchImpl: async () => {
      throw new Error('socket hang up');
    },
  });
  check('offline is marked offline', down.ok === false && down.offline === true && down.unverified === true);
  check('the offline message names Routeway', /Routeway/.test(down.error));

  let pinged = false;
  const blank = await checkRoutewayKey('   ', {
    fetchImpl: async () => {
      pinged = true;
      return jsonResponse(200, {})();
    },
  });
  check('a blank key never reaches the network', blank.ok === false && blank.status === 0 && !pinged);
  check('the ping model is a free route', PING_MODEL.endsWith(':free'));

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the Routeway gateway is wired correctly');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
