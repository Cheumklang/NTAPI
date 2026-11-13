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

  check('the documented catalog', ZRO_MODELS.length === 5, String(ZRO_MODELS.length));
  const model = ZRO_MODELS.find((m) => m.id === 'deepseek-v4.1-flash');
  check(
    'deepseek model spec',
    model?.name === 'DeepSeek V4.1 Flash' &&
      model?.contextWindow === 1000000 &&
      model?.maxTokens === 65536,
    JSON.stringify(model)
  );
  check('deepseek is the free daily route', model?.plan === 'free');
  check(
    'the paid routes carry their list price',
    ZRO_MODELS.filter((m) => m.plan === 'paid').every((m) => /\$/.test(m.planNote) || m.planNote === 'routed'),
    JSON.stringify(ZRO_MODELS.map((m) => [m.id, m.plan, m.planNote]))
  );
  check(
    'the paid models are the ones Zro documents',
    ZRO_MODELS.filter((m) => m.plan === 'paid').map((m) => m.id).join(',') ===
      'glm-5.3,dolly2-security,abyss1,auto'
  );

  const config = zroProviderConfig({ apiKey: KEY });
  check('provider display name', config.name === 'Zro');
  check('provider base url', config.baseUrl === ZRO_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  const ds = config.models.find((m) => m.id === 'deepseek-v4.1-flash');
  check(
    'deepseek accepts text and images',
    ds?.input.join(',') === 'text,image' && ds?.reasoning === true,
    JSON.stringify(ds)
  );
  check(
    'the text-only models are not handed images',
    config.models.filter((m) => m.id !== 'deepseek-v4.1-flash').every((m) => m.input.join(',') === 'text'),
    JSON.stringify(config.models.map((m) => [m.id, m.input.join(',')]))
  );
  check('catalog window and output cap', ds?.contextWindow === 1000000 && ds?.maxTokens === 65536);
  check(
    'zero cost fields',
    config.models.every(
      (m) =>
        m.cost.input === 0 &&
        m.cost.output === 0 &&
        m.cost.cacheRead === 0 &&
        m.cost.cacheWrite === 0
    )
  );

  const entries = zroModelEntries();
  check(
    'dropdown entries are provider-tagged',
    entries.length === ZRO_MODELS.length &&
      entries.every((e) => e.provider === 'zro') &&
      entries.find((e) => e.id === 'deepseek-v4.1-flash')?.name === 'DeepSeek V4.1 Flash'
  );
  check(
    'dropdown entries carry the plan',
    entries.find((e) => e.id === 'deepseek-v4.1-flash')?.plan === 'free' &&
      entries.find((e) => e.id === 'glm-5.3')?.plan === 'paid',
    JSON.stringify(entries)
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
