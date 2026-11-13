/**
 * Diagnostic: the Token Harbor provider config and its free-catalog check.
 *
 * Run from app/:   node scripts/selftest-tokenharbor.js
 */
'use strict';

const {
  TOKENHARBOR_PROVIDER,
  TOKENHARBOR_BASE_URL,
  TOKENHARBOR_MODEL_CANDIDATES,
  tokenharborProviderConfig,
  tokenharborModelEntries,
  checkTokenHarborKey,
  resolveTokenHarborModels,
} = require('../src/tokenharbor');

const KEY = 'thk_live_test_000000000000';
const FREE_ID = 'deepseek-v4.1-flash:free';

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
  check('provider id', TOKENHARBOR_PROVIDER === 'tokenharbor');
  check('base url', TOKENHARBOR_BASE_URL === 'https://tokenharbor.ai/v1');

  check('the documented free routes', TOKENHARBOR_MODEL_CANDIDATES.length === 2);
  check('every candidate is free', TOKENHARBOR_MODEL_CANDIDATES.every((m) => m.plan === 'free'));
  const model = TOKENHARBOR_MODEL_CANDIDATES[0];
  check('the free deepseek route', model.id === FREE_ID, model.id);
  check('context and output cap', model.contextWindow === 1048576 && model.maxTokens === 128000);

  const config = tokenharborProviderConfig({ apiKey: KEY, models: [model] });
  check('provider display name', config.name === 'Token Harbor');
  check('provider base url', config.baseUrl === TOKENHARBOR_BASE_URL);
  check('openai-completions api', config.api === 'openai-completions');
  check('key passed to the sdk', config.apiKey === KEY);
  check(
    'model accepts text and images',
    config.models.length === 1 &&
      config.models[0].id === FREE_ID &&
      config.models[0].input.join(',') === 'text,image' &&
      config.models[0].reasoning === true,
    JSON.stringify(config.models[0])
  );
  check(
    'free route costs nothing',
    config.models[0].cost.input === 0 &&
      config.models[0].cost.output === 0 &&
      config.models[0].cost.cacheRead === 0 &&
      config.models[0].cost.cacheWrite === 0
  );

  const entries = tokenharborModelEntries([model]);
  check(
    'dropdown entries are provider-tagged',
    entries.length === 1 && entries[0].provider === 'tokenharbor' && entries[0].id === FREE_ID,
    JSON.stringify(entries)
  );
  check('a free route is labelled free', entries[0].plan === 'free', JSON.stringify(entries[0]));

  const good = await checkTokenHarborKey(KEY, { fetchImpl: fake(200, { data: [{ id: FREE_ID }] }) });
  check('good key returns the live ids', good.ok === true && good.ids.includes(FREE_ID), JSON.stringify(good));

  // The account is real and the key is valid, but the email is unverified.
  const unverified = await checkTokenHarborKey(KEY, {
    fetchImpl: fake(403, {
      error: { message: 'Verify your email address to use the API.', type: 'email_verification_required', code: 'email_verification_required' },
    }),
  });
  check('unverified email is a 403 with its code', unverified.ok === false && unverified.code === 'email_verification_required');
  check('unverified error never echoes the key', !String(unverified.error).includes(KEY));

  const bad = await checkTokenHarborKey(KEY, { fetchImpl: fake(401, { error: { message: 'invalid key' } }) });
  check('bad key fails', bad.ok === false && bad.status === 401);

  const offline = await checkTokenHarborKey(KEY, {
    fetchImpl: async () => {
      throw new Error('getaddrinfo ENOTFOUND tokenharbor.ai');
    },
  });
  check('offline is marked offline', offline.ok === false && offline.offline === true);
  check('offline message names Token Harbor', /Token Harbor/.test(offline.error));

  let called = false;
  const blank = await checkTokenHarborKey('   ', {
    fetchImpl: async () => {
      called = true;
      return fake(200, { data: [] })();
    },
  });
  check('blank key is rejected before the request', blank.ok === false && blank.status === 0 && !called);

  const listed = await resolveTokenHarborModels(KEY, {
    fetchImpl: fake(200, { data: [{ id: FREE_ID }, { id: 'claude-opus-5.5' }] }),
  });
  check(
    'the resolver keeps the free route first and lists the wallet route',
    listed.length === 2 && listed[0].id === FREE_ID && listed[0].plan === 'free' && listed[1].plan === 'paid',
    JSON.stringify(listed)
  );
  check('the wallet route says where the money comes from', listed[1].planNote === 'wallet');
  check('the wallet route is treated as text only', listed[1].vision === false);

  const missing = await resolveTokenHarborModels(KEY, {
    fetchImpl: fake(200, { data: [{ id: 'claude-opus-5.5' }] }),
  });
  // The free routes rotated out, but the key can still call the wallet ones:
  // the provider stays and the paid rows are labelled rather than hidden.
  check(
    'a rotated free route leaves the paid catalog visible',
    missing.length === 1 && missing[0].plan === 'paid'
  );

  const flaky = await resolveTokenHarborModels(KEY, {
    fetchImpl: async () => {
      throw new Error('socket hang up');
    },
  });
  check('offline keeps the candidate', flaky.length === 1 && flaky[0].id === FREE_ID);
  check('no key means no catalog', (await resolveTokenHarborModels(null)).length === 0);

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the Token Harbor free route is wired correctly');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
