/**
 * Offline check for src/anthropic.js — no network, injected fetch.
 * Run: node scripts/selftest-anthropic.js
 */
'use strict';

const {
  ANTHROPIC_PROVIDER,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_MODEL_CANDIDATES,
  anthropicProviderConfig,
  anthropicModelEntries,
  checkAnthropicKey,
  resolveAnthropicModels,
  priceNote,
} = require('../src/anthropic');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/** A fetch that answers one canned body and records what it was asked. */
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
  check('provider id', ANTHROPIC_PROVIDER === 'anthropic');
  check('native messages endpoint', ANTHROPIC_BASE_URL === 'https://api.anthropic.com');
  check('every candidate is paid and priced', ANTHROPIC_MODEL_CANDIDATES.every((m) => m.cost?.input > 0));
  check('price note format', priceNote({ input: 3, output: 15 }) === '$3.00/$15.00', priceNote({ input: 3, output: 15 }));
  check('no price note without a cost', priceNote(null) === '');

  const cfg = anthropicProviderConfig({ apiKey: 'k', models: ANTHROPIC_MODEL_CANDIDATES });
  check('registerProvider shape', cfg.api === 'anthropic-messages' && cfg.baseUrl === ANTHROPIC_BASE_URL);
  check('api key is carried', cfg.apiKey === 'k');
  check('images allowed', cfg.models.every((m) => m.input.includes('image')));
  check('reasoning on', cfg.models.every((m) => m.reasoning === true));
  check('cost reaches pi', cfg.models[0].cost.input === 5);

  const entries = anthropicModelEntries([{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', cost: { input: 3, output: 15 } }]);
  check('entry is paid', entries[0].plan === 'paid');
  check('entry keeps the raw cost', entries[0].cost.input === 3);
  check('entry badge is the price', entries[0].planNote === '$3.00/$15.00');

  // A key is proven by GET /v1/models, with the pinned API version header.
  const ok = fakeFetch({ body: { data: [{ id: 'claude-sonnet-4-5' }], has_more: false } });
  const res = await checkAnthropicKey('sk-ant-test', { fetchImpl: ok });
  check('valid key passes', res.ok === true);
  check('ids are read', res.ids.includes('claude-sonnet-4-5'));
  check('the key travels in x-api-key', ok.calls[0].init.headers['x-api-key'] === 'sk-ant-test');
  check('the version is pinned', ok.calls[0].init.headers['anthropic-version'] === '2023-06-01');
  check('the key never lands in the URL', !ok.calls[0].url.includes('sk-ant-test'));

  const bad = await checkAnthropicKey('nope', { fetchImpl: fakeFetch({ status: 401, body: {} }) });
  check('401 is a rejection', bad.ok === false && bad.offline !== true);
  check('401 message names Anthropic', /Anthropic rejected/.test(bad.error), bad.error);

  const offline = await checkAnthropicKey('k', { fetchImpl: fakeFetch({ throws: 'getaddrinfo ENOTFOUND' }) });
  check('network failure is offline, not rejected', offline.ok === false && offline.offline === true);

  const empty = await checkAnthropicKey('   ', {});
  check('empty key is refused before any call', empty.ok === false && empty.status === 0);

  // Only families this key can actually reach reach the dropdown.
  const live = fakeFetch({
    body: {
      data: [
        { id: 'claude-opus-4-5' },
        { id: 'claude-sonnet-4-5-20250929' },
        { id: 'claude-3-5-haiku-latest' },
      ],
      has_more: false,
    },
  });
  const models = await resolveAnthropicModels('k', { fetchImpl: live });
  check('reachable families only', models.length === 2, JSON.stringify(models.map((m) => m.id)));
  check('the plain alias wins when served', models.some((m) => m.id === 'claude-opus-4-5'));
  check('a dated snapshot is used when the alias is absent', models.some((m) => m.id === 'claude-sonnet-4-5-20250929'));
  check('a retired family is dropped', !models.some((m) => m.id.startsWith('claude-haiku')));

  const noKey = await resolveAnthropicModels('', {});
  check('no key means no models', Array.isArray(noKey) && noKey.length === 0);

  const unreachable = await resolveAnthropicModels('k', { fetchImpl: fakeFetch({ throws: 'boom' }) });
  check('unreachable still offers one model', unreachable.length === 1, JSON.stringify(unreachable));

  console.log(failures ? `\n${failures} check(s) failed` : '\nall anthropic checks passed');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('ANTHROPIC FAIL:', err.message);
  process.exit(1);
});