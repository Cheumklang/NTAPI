/**
 * DeepSeek is the first provider here that bills a prepaid balance from the
 * first token, so two things have to be right before a turn is ever sent:
 *
 *   1. The provider config pi receives must describe the real endpoint — two
 *      ids, thinking on, the right window and cap, the published price as cost
 *      (used for the spend estimate), and no image part for the text-only id.
 *   2. The catalog must follow `/models`, because DeepSeek retires ids behind
 *      legacy names: a picker row that the account cannot call fails every turn.
 *
 * The plan rules matter just as much: DeepSeek is the only route that costs
 * money, so it must never become the default while a free provider exists.
 *
 * Run: node scripts/selftest-deepseek.js
 */
'use strict';

const {
  DEEPSEEK_PROVIDER,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL_CANDIDATES,
  deepseekProviderConfig,
  deepseekModelEntries,
  priceNote,
  checkDeepSeekKey,
  resolveDeepSeekModels,
} = require('../src/deepseek');
const { planProviders } = require('../src/provider-plan');
// provider-ui attaches itself to the global object when loaded outside a page.
require('../src/renderer/provider-ui');
const { providerLabel, providerChrome, providerLogoPath } = globalThis.FPProvider;
const { friendlyProviderError } = require('../src/provider-errors');
const { messageFor } = require('../src/error-messages');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** A fetch stand-in: records the call, answers with what the test wants. */
function fakeFetch({ ok = true, status = 200, body = {}, error = null }) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (error) throw error;
    return { ok, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

async function main() {
  /* ------------------------------- the endpoint ------------------------------ */

  check('the provider id is what the bridge registers', DEEPSEEK_PROVIDER === 'deepseek');
  check('the base url is the documented one', DEEPSEEK_BASE_URL === 'https://api.deepseek.com');
  check('two ids are offered', DEEPSEEK_MODEL_CANDIDATES.length === 2);
  check(
    'the ids are the current catalog names',
    DEEPSEEK_MODEL_CANDIDATES.map((m) => m.id).join(',') === 'deepseek-flash,deepseek-v4-pro'
  );

  const cfg = deepseekProviderConfig({ apiKey: 'sk-test', models: DEEPSEEK_MODEL_CANDIDATES });
  check('the config speaks openai-completions', cfg.api === 'openai-completions');
  check('the config is named DeepSeek', cfg.name === 'DeepSeek');
  check('the key is carried in the config, not the env', cfg.apiKey === 'sk-test');
  check('both models are handed to pi', cfg.models.length === 2);
  check('thinking is enabled for both', cfg.models.every((m) => m.reasoning === true));
  check(
    'the text-only id never receives an image part',
    cfg.models.find((m) => m.id === 'deepseek-v4-pro').input.join(',') === 'text'
  );
  check(
    'the vision id accepts images',
    cfg.models.find((m) => m.id === 'deepseek-flash').input.join(',') === 'text,image'
  );
  check(
    'the published window and cap are carried',
    cfg.models.every((m) => m.contextWindow === 1048576 && m.maxTokens === 393216)
  );
  check(
    'cost is the peak price, so an estimate can only overstate',
    cfg.models.find((m) => m.id === 'deepseek-flash').cost.input === 0.3 &&
      cfg.models.find((m) => m.id === 'deepseek-flash').cost.output === 1.2
  );
  check(
    'the pro route is priced higher than flash',
    cfg.models.find((m) => m.id === 'deepseek-v4-pro').cost.input > 0.3
  );
  // A gateway that does not accept the developer role must be told so, or every
  // system prompt becomes a 400 on the first request.
  check('developer role is off', cfg.models.every((m) => m.compat?.supportsDeveloperRole === false));

  const fallbackCfg = deepseekProviderConfig({ apiKey: 'sk-test', models: [] });
  check('an empty catalog still registers one usable id', fallbackCfg.models.length === 1);

  /* --------------------------------- the rows -------------------------------- */

  const entries = deepseekModelEntries(DEEPSEEK_MODEL_CANDIDATES);
  check('both ids appear in the picker', entries.length === 2);
  check('every row is tagged paid', entries.every((e) => e.plan === 'paid'));
  check('the row carries the provider id', entries.every((e) => e.provider === 'deepseek'));
  check(
    'the row shows the price it will charge',
    entries[0].planNote === '$0.30/$1.20' && entries[1].planNote === '$1.32/$3.96'
  );
  check('priceNote formats two decimals', priceNote({ input: 0.3, output: 1.2 }) === '$0.30/$1.20');
  check('priceNote survives a missing cost', priceNote(null) === '');

  /* ------------------------------- the key check ----------------------------- */

  const good = fakeFetch({
    body: {
      data: [
        {
          id: 'deepseek-flash',
          context_window: 1048576,
          max_output_tokens: 393216,
        },
        { id: 'deepseek-v4-pro', context_window: 1048576, max_output_tokens: 393216 },
        { id: 'deepseek-chat' },
      ],
    },
  });
  const goodCheck = await checkDeepSeekKey('sk-ok', { fetchImpl: good });
  check('a good key passes', goodCheck.ok === true);
  check('it asks /models, the cheapest authenticated call', good.calls[0].url.endsWith('/models'));
  check('it sends the key as a bearer token', /^Bearer sk-ok$/.test(good.calls[0].init.headers.authorization));
  check('it reports the live ids', goodCheck.ids.includes('deepseek-flash'));

  const bad = fakeFetch({ ok: false, status: 401, body: { error: { message: 'Authentication Fails' } } });
  const badCheck = await checkDeepSeekKey('sk-bad', { fetchImpl: bad });
  check('a rejected key fails', badCheck.ok === false);
  check('a rejected key is not reported as offline', !badCheck.offline);
  check('the status is kept for the UI', badCheck.status === 401);
  check('the server message is passed on', /Authentication Fails/.test(badCheck.error));

  const echo = fakeFetch({
    ok: false,
    status: 401,
    body: { error: { message: 'Incorrect API key provided: sk-echo-1234' } },
  });
  const echoCheck = await checkDeepSeekKey('sk-echo-1234', { fetchImpl: echo });
  check('a server message never echoes the key back', !echoCheck.error.includes('sk-echo-1234'));

  const offline = await checkDeepSeekKey('sk-x', {
    fetchImpl: fakeFetch({ error: new Error('getaddrinfo ENOTFOUND') }),
  });
  check('an unreachable API is offline, not a bad key', offline.ok === false && offline.offline === true);

  const empty = await checkDeepSeekKey('', { fetchImpl: good });
  check('an empty key is refused before any request', empty.ok === false && empty.status === 0);

  /* ------------------------------ the live catalog --------------------------- */

  const live = await resolveDeepSeekModels('sk-ok', { fetchImpl: good });
  check('the catalog keeps the ids the account can call', live.length === 2);
  check('a retired id is not offered', !live.some((m) => m.id === 'deepseek-chat'));
  check('a live row keeps its name and plan', live[0].name === 'DeepSeek V4.1 Flash');

  const gone = await resolveDeepSeekModels('sk-ok', {
    fetchImpl: fakeFetch({ body: { data: [{ id: 'some-other-model' }] } }),
  });
  check('a catalog with none of our ids offers nothing', gone.length === 0);

  const flaky = await resolveDeepSeekModels('sk-ok', {
    fetchImpl: fakeFetch({ error: new Error('socket hang up') }),
  });
  check('a flaky network still shows the provider', flaky.length === 1 && flaky[0].id === 'deepseek-flash');

  check('no key means no catalog', (await resolveDeepSeekModels('', { fetchImpl: good })).length === 0);

  /* --------------------------------- the plan -------------------------------- */

  const models = [{ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }];
  const freeModels = [{ id: 'deepseek-v4.1-flash', name: 'Free' }];

  const alone = planProviders({ hasFreePiAuth: false, deepseekKey: 'k', deepseekModels: models });
  check('a DeepSeek key alone makes a session possible', alone.available === true && alone.deepseek === true);
  check('a DeepSeek-only session defaults to it', alone.defaultProvider === DEEPSEEK_PROVIDER);
  check('it carries no ads and no FreePi tools', alone.ads === false && alone.freePiTools === false);

  const withFree = planProviders({
    hasFreePiAuth: true,
    freePiModels: freeModels,
    deepseekKey: 'k',
    deepseekModels: models,
  });
  check('a free provider outranks the paid one', withFree.defaultProvider === 'free-pi');
  check('DeepSeek is still registered alongside it', withFree.deepseek === true);

  const withLlm7 = planProviders({
    hasFreePiAuth: false,
    llm7Key: 'k',
    llm7Models: freeModels,
    deepseekKey: 'k',
    deepseekModels: models,
  });
  check('LLM7 outranks DeepSeek too', withLlm7.defaultProvider === 'llm7');

  const noKey = planProviders({ hasFreePiAuth: false, deepseekKey: null, deepseekModels: models });
  check('no key means no DeepSeek, even with a catalog', noKey.deepseek === false);

  const noCatalog = planProviders({ hasFreePiAuth: false, deepseekKey: 'k', deepseekModels: [] });
  check('a key with no catalog is not usable', noCatalog.deepseek === false);
  check('and nothing is available', noCatalog.available === false);

  /* ------------------------------ the presentation --------------------------- */

  check('the provider reads as DeepSeek', providerLabel('deepseek') === 'DeepSeek');
  check('it has a bundled logo', providerLogoPath('deepseek') === 'assets/providers/deepseek.svg');
  check('it shows its own meter, never ads', providerChrome({ provider: 'deepseek' }).meter === 'deepseek');
  check('ads stay off', providerChrome({ provider: 'deepseek' }).showAds === false);

  /* -------------------------------- the errors ------------------------------- */

  const balance = friendlyProviderError(
    '{"error":{"message":"Insufficient Balance","type":"unknown_error","code":"invalid_request_error"}}',
    { provider: 'deepseek' }
  );
  check('an empty balance is explained as a balance, not a key', /no balance left/i.test(balance.text));
  check('it points at the top-up page', /platform\.deepseek\.com/.test(balance.text));
  check('the refused turn is not billed', /not charged/i.test(balance.text));
  check(
    'the sentence resolves to a translation key',
    // `insufficient_balance` and `insufficient_quota` share one sentence on
    // purpose (some gateways report the same failure under either code), and
    // the en-text index keeps the last of them.
    /^deepseek\.insufficient_(balance|quota)$/.test(balance.key || '')
  );

  const key = friendlyProviderError('401 Authentication Fails', { provider: 'deepseek' });
  check('a bad key is explained as a bad key', /rejected this API key/i.test(key.text));

  const limited = friendlyProviderError('429 Too Many Requests', { provider: 'deepseek' });
  check('a rate limit says to wait', /rate limiting/i.test(limited.text));

  const reasoning = friendlyProviderError('400 reasoning_content is required when tools are provided', {
    provider: 'deepseek',
  });
  check('a lost chain of thought says to start a new chat', /start a new chat/i.test(reasoning.text));

  const down = friendlyProviderError('fetch failed', { provider: 'deepseek' });
  check('a dead network names DeepSeek', /Could not reach DeepSeek/.test(down.text) && down.key === 'net.deepseek');

  const quiet = friendlyProviderError('Request timed out.: This operation was aborted', {
    provider: 'deepseek',
  });
  check('a stall is not read as a cancel', /never answered/i.test(quiet.text));

  check(
    'every DeepSeek sentence is translated both ways',
    ['deepseek.insufficient_balance', 'deepseek.invalid_api_key', 'deepseek.rate_limit', 'stall.deepseek'].every(
      (k) => messageFor(k, 'en') && messageFor(k, 'th')
    )
  );

  console.log(failures === 0 ? '\nAll DeepSeek checks passed.' : `\n${failures} DeepSeek check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});