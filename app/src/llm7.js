'use strict';

/**
 * LLM7.io (api.llm7.io) provider.
 *
 * LLM7 speaks the OpenAI chat-completions protocol behind one API token, so
 * this module owns the same three things the other gateways own: the live
 * catalog, the provider config pi registers, and the check that proves a
 * pasted token before it is saved.
 *
 * What the catalog publishes and how this module reads it:
 *   - `GET /v1/models` is public and carries the tier, price, context window
 *     and modality flags per model, so the picker labels a row from the
 *     vendor's own metadata instead of a list kept here.
 *   - `tier: "turbo"` is the free-token lane (100,000 tokens per 24 hours,
 *     1 request/second, 60/minute, 250/hour). `tier: "pro"` bills from a Pro
 *     allowance or a topped-up balance.
 *   - The catalog is live and reordered often, so the free half is used as the
 *     default and every other id is still one click away in the picker.
 *
 * The model list is public, so a garbage token gets a 200 from it. LLM7 also
 * serves some anonymous free traffic, so the key check spends one token on the
 * `fast` selector: a 200 proves the gateway is reachable, and a 401 is the only
 * answer that proves the token itself is wrong.
 */

const LLM7_PROVIDER = 'llm7';
const LLM7_BASE_URL = 'https://api.llm7.io/v1';

const CATALOG_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_CONTEXT_WINDOW = 128000;
/** Output cap asked for when the model says nothing: never more than this. */
const MAX_TOKENS_CAP = 32768;
const MAX_TOKENS_FLOOR = 4096;

/** The cheapest call that proves a token: a free selector, one token of output. */
const PING_MODEL = 'fast';

/**
 * Used only when the catalog cannot be reached and nothing is cached. These are
 * free-tier ids the live catalog served when this app was built — the paid half
 * is deliberately absent, because a stale price is worse than no list.
 */
const FALLBACK_MODELS = [
  {
    id: 'DeepSeek-V4-Flash-0731',
    name: 'DeepSeek V4 Flash',
    contextWindow: 400000,
    vision: false,
    reasoning: true,
    plan: 'free',
    planNote: '',
  },
  {
    id: 'GLM-5.3-Flash',
    name: 'GLM 5.3 Flash',
    contextWindow: 400000,
    vision: false,
    reasoning: true,
    plan: 'free',
    planNote: '',
  },
  {
    id: 'gpt-oss:20b',
    name: 'GPT OSS 20B',
    contextWindow: 128000,
    vision: false,
    reasoning: false,
    plan: 'free',
    planNote: '',
  },
  {
    id: 'minimax-m2.7',
    name: 'MiniMax M2.7',
    contextWindow: 180000,
    vision: false,
    reasoning: false,
    plan: 'free',
    planNote: '',
  },
];

/** @type {{ at: number, models: Array<object> } | null} */
let modelCache = null;

/** Tests only: forget the catalog so the next call hits the injected fetch. */
function resetLlm7ModelCache() {
  modelCache = null;
}

function finiteOr(value, fallback) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** `$0.30/$1.10` — input/output dollars per 1M tokens, as the catalog states them. */
function priceNote(pricing) {
  const fmt = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : '';
  };
  const input = fmt(pricing?.prompt);
  const output = fmt(pricing?.completion);
  if (!input && !output) return '';
  return `${input}/${output}`;
}

/** Only text-in/text-out chat models belong in a coding agent's dropdown. */
function isChatModel(raw) {
  const type = String(raw?.model_type || '').toLowerCase();
  if (type && type !== 'chat') return false;
  const input = raw?.modalities?.input;
  const output = raw?.modalities?.output;
  if (Array.isArray(input) && !input.includes('text')) return false;
  if (Array.isArray(output) && !output.includes('text')) return false;
  return true;
}

function normalizeModel(raw) {
  const id = typeof raw?.id === 'string' ? raw.id : '';
  const contextWindow = finiteOr(raw?.context_window?.tokens, DEFAULT_CONTEXT_WINDOW);
  const pricing = raw?.pricing
    ? { prompt: raw.pricing.input, completion: raw.pricing.output }
    : undefined;
  const tier = String(raw?.tier || '').toLowerCase();
  const model = {
    id,
    name: id,
    owner: typeof raw?.owned_by === 'string' ? raw.owned_by : '',
    contextWindow,
    // The catalog states no output cap. A quarter of the window, floored at 4K
    // and capped at 32K, gives a long answer room without asking a small model
    // for more than it can produce.
    maxTokens: Math.min(
      Math.max(MAX_TOKENS_FLOOR, Math.floor(contextWindow / 4)),
      MAX_TOKENS_CAP
    ),
    vision: Array.isArray(raw?.modalities?.input)
      ? raw.modalities.input.includes('image')
      : Boolean(raw?.capabilities?.vision),
    reasoning: Boolean(raw?.reasoning ?? raw?.capabilities?.reasoning),
    pricing,
    // turbo is the free-token lane; everything else (pro) bills allowance or
    // balance. The explicit plan wins over model-filter's price heuristic,
    // because a turbo model can carry a per-token price and still be free.
    plan: tier === 'turbo' ? 'free' : 'paid',
    planNote: '',
  };
  model.planNote = model.plan === 'paid' ? priceNote(pricing) : '';
  return model;
}

/**
 * The catalog, in order of preference: live fetch, recent cache, the free
 * fallback. Never throws — a chat session must still open offline.
 */
async function fetchLlm7Models({ fetchImpl, now = Date.now, force = false } = {}) {
  if (!force && modelCache && now() - modelCache.at < CATALOG_TTL_MS) {
    return { models: modelCache.models, source: 'cache' };
  }

  try {
    const doFetch = fetchImpl || fetch;
    const init = { headers: { accept: 'application/json' } };
    if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await doFetch(`${LLM7_BASE_URL}/models`, init);
    if (!res.ok) throw new Error(`model catalog request failed (HTTP ${res.status})`);
    const body = await res.json().catch(() => null);
    const list = Array.isArray(body?.data) ? body.data : [];
    const models = list
      .filter(isChatModel)
      .map(normalizeModel)
      .filter((m) => m.id);
    if (models.length === 0) throw new Error('model catalog was empty');
    modelCache = { at: now(), models };
    return { models, source: 'live' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (modelCache) return { models: modelCache.models, source: 'cache', error: message };
    return { models: fallbackCatalog(), source: 'fallback', error: message };
  }
}

function fallbackCatalog() {
  return FALLBACK_MODELS.map((m) => ({
    ...m,
    owner: '',
    maxTokens: Math.min(
      Math.max(MAX_TOKENS_FLOOR, Math.floor(m.contextWindow / 4)),
      MAX_TOKENS_CAP
    ),
  }));
}

/** What pi's registerProvider expects for LLM7. */
function llm7ProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : fallbackCatalog();
  return {
    name: 'LLM7.io',
    baseUrl: LLM7_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: m.reasoning !== false,
      compat: { supportsDeveloperRole: false },
      // Only a model the catalog marks as seeing images may receive one.
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || DEFAULT_CONTEXT_WINDOW,
      maxTokens: m.maxTokens || MAX_TOKENS_CAP,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function llm7ModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: LLM7_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan === 'paid' ? 'paid' : 'free',
    planNote: m.planNote || '',
  }));
}

/**
 * Prove a token before saving it.
 *
 * A 401 (or an `invalid_api_key` code) is the only answer that proves the token
 * is wrong. A rate limit or an exhausted free allowance means the token could
 * not be confirmed rather than rejected, so those come back marked
 * `unverified` and the caller saves the token anyway.
 */
async function checkLlm7Key(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter an LLM7 API token first.' };

  const doFetch = fetchImpl || fetch;
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: PING_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    }),
  };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${LLM7_BASE_URL}/chat/completions`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      unverified: true,
      status: 0,
      error: `Could not reach LLM7 — check your connection (${message}).`,
    };
  }

  if (res.ok) return { ok: true, status: res.status };

  let message = `HTTP ${res.status}`;
  let code = null;
  try {
    const body = await res.json();
    message = body?.error?.message || body?.message || message;
    code = body?.error?.code || body?.code || null;
  } catch {}

  // Defence in depth: a server message must never echo the key back.
  const error = String(message).split(key).join('[key]');
  const rejected = res.status === 401 || code === 'invalid_api_key';
  return {
    ok: false,
    status: res.status,
    code,
    // Not a rejection: the key is kept and shown as unverified.
    unverified: !rejected,
    error: rejected ? error : `LLM7 did not confirm this key (${error}).`,
  };
}

module.exports = {
  LLM7_PROVIDER,
  LLM7_BASE_URL,
  PING_MODEL,
  FALLBACK_MODELS,
  fetchLlm7Models,
  llm7ProviderConfig,
  llm7ModelEntries,
  checkLlm7Key,
  resetLlm7ModelCache,
};
