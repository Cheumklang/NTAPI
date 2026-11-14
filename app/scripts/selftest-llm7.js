/**
 * LLM7 provider: catalog mapping, provider config, key check.
 *
 * The gateway's `/v1/models` is public, so the interesting parts are what this
 * module does with the vendor's own metadata — tier labelling, chat-only
 * filtering, modality flags — and the rule that a token is refused only when
 * LLM7 says the token is wrong.
 *
 * Run from app/:   node scripts/selftest-llm7.js
 */
'use strict';

const {
  LLM7_PROVIDER,
  LLM7_BASE_URL,
  PING_MODEL,
  FALLBACK_MODELS,
  fetchLlm7Models,
  llm7ProviderConfig,
  llm7ModelEntries,
  preferredLlm7Model,
  checkLlm7Key,
  resetLlm7ModelCache,
} = require('../src/llm7');

const KEY = 'llm7-test-0000000000000000';

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

/** Four models shaped exactly like the live catalog. */
const CATALOG = {
  object: 'list',
  data: [
    {
      id: 'anthropic/claude-opus-4-6',
      object: 'model',
      model_type: 'chat',
      tier: 'pro',
      pricing: { input: 3, output: 15, currency: 'USD', unit: '1M tokens' },
      pricing_mode: 'token',
      modalities: { input: ['text', 'image'], output: ['text'] },
      context_window: { tokens: 1000000, chars: null },
      reasoning: true,
      tools_calling: true,
    },
    {
      id: 'DeepSeek-V4-Flash-0731',
      object: 'model',
      model_type: 'chat',
      tier: 'turbo',
      pricing: { input: 0.02, output: 0.04, currency: 'USD', unit: '1M tokens' },
      pricing_mode: 'token',
      modalities: { input: ['text'], output: ['text'] },
      context_window: { tokens: 400000, chars: null },
      reasoning: true,
      tools_calling: true,
    },
    {
      id: 'gpt-image-2',
      object: 'model',
      model_type: 'image',
      tier: 'pro',
      modalities: { input: ['text'], output: ['image'] },
    },
    {
      id: 'seedance-2.0-mini',
      object: 'model',
      model_type: 'video',
      tier: 'pro',
      modalities: { input: ['text', 'image'], output: ['video'] },
    },
  ],
};

(async () => {
  resetLlm7ModelCache();
  const live = await fetchLlm7Models({ fetchImpl: jsonResponse(200, CATALOG) });
  const ids = live.models.map((m) => m.id);
  check('source is live', live.source === 'live');
  check('only chat models survive', !ids.includes('gpt-image-2') && !ids.includes('seedance-2.0-mini'));
  check('chat models kept', ids.length === 2, JSON.stringify(ids));

  const pro = live.models.find((m) => m.id === 'anthropic/claude-opus-4-6');
  const free = live.models.find((m) => m.id === 'DeepSeek-V4-Flash-0731');
  check('pro tier is paid', pro?.plan === 'paid');
  check('pro carries a price note', pro?.planNote === '$3.00/$15.00', JSON.stringify(pro));
  check('turbo tier is free', free?.plan === 'free' && free?.planNote === '');
  check('vision comes from modalities', pro?.vision === true && free?.vision === false);
  check('context window is read', free?.contextWindow === 400000);
  check('maxTokens is derived and capped', free?.maxTokens === 32768, String(free?.maxTokens));

  const cached = await fetchLlm7Models({ fetchImpl: async () => { throw new Error('should not fetch'); } });
  check('second call uses the cache', cached.source === 'cache' && cached.models.length === 2);

  resetLlm7ModelCache();
  const offline = await fetchLlm7Models({ fetchImpl: async () => { throw new Error('offline'); } });
  check('offline falls back', offline.source === 'fallback' && offline.models.length === FALLBACK_MODELS.length);

  const entries = llm7ModelEntries(live.models);
  check('entries carry the provider', entries.every((e) => e.provider === LLM7_PROVIDER));
  check('entry keeps the plan', entries.find((e) => e.id === 'DeepSeek-V4-Flash-0731')?.plan === 'free');

  const config = llm7ProviderConfig({ apiKey: KEY, models: live.models });
  check('config names LLM7.io', config.name === 'LLM7.io');
  check('config base URL', config.baseUrl === LLM7_BASE_URL);
  check('config api', config.api === 'openai-completions');
  check('config carries the token', config.apiKey === KEY);
  check('vision model accepts images', config.models.find((m) => m.id === 'anthropic/claude-opus-4-6')?.input.includes('image'));
  check('text model rejects images', !config.models.find((m) => m.id === 'DeepSeek-V4-Flash-0731')?.input.includes('image'));
  check('config always lists a model', llm7ProviderConfig({ apiKey: KEY, models: [] }).models.length >= 1);

  // pi defaults to `max_completion_tokens` and to sending `reasoning_effort` on
  // an OpenAI-shaped gateway. LLM7 answers the first with a small implied cap
  // and turns "minimal" effort into a thinking budget that swallows the whole
  // answer, so both are pinned off here: the user sees a reply, not a spinner.
  const compat = config.models[0].compat || {};
  check('sends max_tokens, not max_completion_tokens', compat.maxTokensField === 'max_tokens', JSON.stringify(compat));
  check('never sends reasoning_effort', compat.supportsReasoningEffort === false, JSON.stringify(compat));
  check('system role stays system', compat.supportsDeveloperRole === false, JSON.stringify(compat));

  // The free lane trims a reasoning model hard enough that it can answer with
  // nothing, so the default model must come from the proven free list.
  const picked = preferredLlm7Model([
    { id: 'DeepSeek-V4-Flash-0731', plan: 'free', reasoning: true },
    { id: 'codestral-latest', plan: 'free', reasoning: false },
    { id: 'gpt-oss:20b', plan: 'free', reasoning: false },
  ]);
  check('default model is a proven free one', picked?.id === 'gpt-oss:20b', JSON.stringify(picked));
  check('default falls back to a free row', preferredLlm7Model([{ id: 'x', plan: 'paid' }, { id: 'y', plan: 'free' }])?.id === 'y');
  check('default never invents a model', preferredLlm7Model([]) === null);

  // The key check: 200 is good, 401 is a rejection, anything else is unsure.
  const ok = await checkLlm7Key(KEY, { fetchImpl: jsonResponse(200, { choices: [] }) });
  check('200 proves the token', ok.ok === true);

  const bad = await checkLlm7Key(KEY, {
    fetchImpl: jsonResponse(401, { error: { message: `bad token ${KEY}`, code: 'invalid_api_key' } }),
  });
  check('401 refuses the token', bad.ok === false && !bad.unverified);
  check('the token is never echoed back', !bad.error.includes(KEY));

  const limited = await checkLlm7Key(KEY, {
    fetchImpl: jsonResponse(429, { error: { message: 'slow down', code: 'rate_limit' } }),
  });
  check('429 keeps the token as unverified', limited.ok === false && limited.unverified === true);

  const down = await checkLlm7Key(KEY, {
    fetchImpl: async () => { throw new Error('offline'); },
  });
  check('network failure is unverified, not rejected', down.unverified === true && down.offline === true);

  check('empty token is refused before any request', (await checkLlm7Key('')).ok === false);
  check('ping model is the free selector', PING_MODEL === 'fast');

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: LLM7 catalog, config and key check');
})();
