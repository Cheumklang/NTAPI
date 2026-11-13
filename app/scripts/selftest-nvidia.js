/**
 * Diagnostic: the NVIDIA NIM provider config and its catalog check, network faked.
 *
 * Run from app/:   node scripts/selftest-nvidia.js
 */
'use strict';

const {
  NVIDIA_PROVIDER,
  NVIDIA_BASE_URL,
  NVIDIA_MODEL_CANDIDATES,
  nvidiaProviderConfig,
  nvidiaModelEntries,
  checkNvidiaKey,
  resolveNvidiaModels,
} = require('../src/nvidia');

const KEY = 'nvapi-test-000000000000';

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

(async () => {
  check('provider id', NVIDIA_PROVIDER === 'nvidia');
  check('base url', NVIDIA_BASE_URL === 'https://integrate.api.nvidia.com/v1');

  check('candidates listed', NVIDIA_MODEL_CANDIDATES.length > 0);
  check(
    'every candidate is a deepseek v4 flash id',
    NVIDIA_MODEL_CANDIDATES.every((m) => String(m.id).startsWith('deepseek-ai/deepseek-v4')),
    JSON.stringify(NVIDIA_MODEL_CANDIDATES.map((m) => m.id))
  );
  check(
    'catalog window and output cap',
    NVIDIA_MODEL_CANDIDATES.every((m) => m.contextWindow === 1048576 && m.maxTokens === 16384),
    JSON.stringify(NVIDIA_MODEL_CANDIDATES)
  );

  const config = nvidiaProviderConfig({ apiKey: KEY, models: [NVIDIA_MODEL_CANDIDATES[0]] });
  check('provider display name', config.name === 'NVIDIA');
  check('provider base url', config.baseUrl === NVIDIA_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  check(
    'model is text only',
    config.models.length === 1 &&
      config.models[0].input.join(',') === 'text' &&
      config.models[0].reasoning === true &&
      config.models[0].maxTokens === 16384,
    JSON.stringify(config.models[0])
  );
  check(
    'zero cost fields',
    config.models[0].cost.input === 0 &&
      config.models[0].cost.output === 0 &&
      config.models[0].cost.cacheRead === 0 &&
      config.models[0].cost.cacheWrite === 0
  );

  const entries = nvidiaModelEntries([NVIDIA_MODEL_CANDIDATES[0]]);
  check(
    'dropdown entries are provider-tagged',
    entries.length === 1 &&
      entries[0].provider === 'nvidia' &&
      entries[0].name === NVIDIA_MODEL_CANDIDATES[0].name &&
      /DeepSeek V4/.test(entries[0].name),
    JSON.stringify(entries)
  );

  const live = await checkNvidiaKey(KEY, {
    fetchImpl: fake(200, { data: [{ id: 'deepseek-ai/deepseek-v4-flash-0731' }] }),
  });
  check(
    'good key returns the live ids',
    live.ok === true && live.ids.includes('deepseek-ai/deepseek-v4-flash-0731'),
    JSON.stringify(live)
  );

  const bad = await checkNvidiaKey(KEY, { fetchImpl: fake(401, { error: { message: 'bad key' } }) });
  check('bad key fails', bad.ok === false && bad.status === 401);
  check('bad key does not echo the key', !String(bad.error).includes(KEY));

  const offline = await checkNvidiaKey(KEY, {
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND integrate.api.nvidia.com');
    },
  });
  check('offline is marked offline', offline.ok === false && offline.offline === true);
  check('offline message names NVIDIA', /NVIDIA/.test(offline.error));

  let called = false;
  const blank = await checkNvidiaKey('   ', {
    fetchImpl: async () => {
      called = true;
      return fake(200, { data: [] })();
    },
  });
  check('blank key is rejected before the request', blank.ok === false && blank.status === 0 && !called);

  // Two ids on the live list, three candidates: only the two survive.
  const twoIds = {
    data: [
      { id: 'deepseek-ai/deepseek-v4-flash' },
      { id: 'deepseek-ai/deepseek-v4-flash-0731' },
      { id: 'meta/llama-3.3-70b-instruct' },
    ],
  };
  const resolved = await resolveNvidiaModels(KEY, { fetchImpl: fake(200, twoIds) });
  check(
    'resolver keeps only ids the server actually lists',
    resolved.length === 2 && resolved.every((m) => twoIds.data.some((d) => d.id === m.id)),
    JSON.stringify(resolved)
  );

  const gone = await resolveNvidiaModels(KEY, {
    fetchImpl: fake(200, { data: [{ id: 'meta/llama-3.3-70b-instruct' }] }),
  });
  check('no flash on the live list hides the provider', Array.isArray(gone) && gone.length === 0);

  const flaky = await resolveNvidiaModels(KEY, {
    fetchImpl: async () => {
      throw new Error('socket hang up');
    },
  });
  check(
    'offline keeps the first candidate',
    flaky.length === 1 && flaky[0].id === NVIDIA_MODEL_CANDIDATES[0].id,
    JSON.stringify(flaky)
  );

  let blankCalled = false;
  const noKey = await resolveNvidiaModels(null, {
    fetchImpl: async () => {
      blankCalled = true;
      return fake(200, { data: [] })();
    },
  });
  check('no key means no catalog', noKey.length === 0 && !blankCalled);

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the NVIDIA provider config and catalog behave');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
