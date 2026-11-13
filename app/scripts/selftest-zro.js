/**
 * Diagnostic: the Zro provider config and key check, with the network faked.
 *
 * Run from app/:   node scripts/selftest-zro.js
 */
'use strict';

const {
  ZRO_PROVIDER,
  ZRO_BASE_URL,
  ZRO_MODELS,
  zroProviderConfig,
  zroModelEntries,
  checkZroKey,
} = require('../src/zro');

const KEY = 'sk-test-000000000000';

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
  check('provider id', ZRO_PROVIDER === 'zro');
  check('base url', ZRO_BASE_URL === 'https://zro.moonmath.ai/v1');

  check('one model only', ZRO_MODELS.length === 1);
  const model = ZRO_MODELS[0];
  check(
    'deepseek model spec',
    model.id === 'deepseek-v4.1-flash' &&
      model.name === 'DeepSeek V4.1 Flash' &&
      model.contextWindow === 1000000 &&
      model.maxTokens === 65536,
    JSON.stringify(model)
  );

  const config = zroProviderConfig({ apiKey: KEY });
  check('provider display name', config.name === 'Zro');
  check('provider base url', config.baseUrl === ZRO_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  check(
    'model accepts text and images',
    config.models.length === 1 &&
      config.models[0].id === 'deepseek-v4.1-flash' &&
      config.models[0].input.join(',') === 'text,image' &&
      config.models[0].reasoning === true,
    JSON.stringify(config.models[0])
  );
  check(
    'catalog window and output cap',
    config.models[0].contextWindow === 1000000 && config.models[0].maxTokens === 65536
  );
  check(
    'zero cost fields',
    config.models[0].cost.input === 0 &&
      config.models[0].cost.output === 0 &&
      config.models[0].cost.cacheRead === 0 &&
      config.models[0].cost.cacheWrite === 0
  );

  const entries = zroModelEntries();
  check(
    'dropdown entry is provider-tagged',
    entries.length === 1 &&
      entries[0].provider === 'zro' &&
      entries[0].id === 'deepseek-v4.1-flash' &&
      entries[0].name === 'DeepSeek V4.1 Flash'
  );

  const good = await checkZroKey(KEY, { fetchImpl: fake(200, { data: [] }) });
  check('good key passes', good.ok === true, JSON.stringify(good));

  const bad = await checkZroKey(KEY, { fetchImpl: fake(401, { error: { message: 'bad key' } }) });
  check('bad key fails', bad.ok === false && bad.status === 401);
  check('bad key does not echo the key', !String(bad.error).includes(KEY));

  const offline = await checkZroKey(KEY, {
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND zro.moonmath.ai');
    },
  });
  check('offline is marked offline', offline.ok === false && offline.offline === true);
  check('offline message names Zro', /Zro/.test(offline.error));

  let called = false;
  const blank = await checkZroKey('   ', {
    fetchImpl: async () => {
      called = true;
      return fake(200, { data: [] })();
    },
  });
  check('blank key is rejected before the request', blank.ok === false && blank.status === 0 && !called);

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the Zro provider config and key check behave');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
