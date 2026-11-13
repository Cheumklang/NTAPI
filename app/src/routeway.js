'use strict';

/**
 * Routeway (routeway.ai) provider.
 *
 * Routeway is an OpenAI-compatible gateway in front of 200+ models, so this
 * module is closer to Token Harbor's than to a single-vendor one: one key, one
 * base URL, and a catalog that changes without notice.
 *
 * What the gateway publishes and how this module reads it:
 *   - `GET /v1/models` is public and carries pricing, context length and
 *     capabilities per model, so the picker can label free against paid from
 *     the vendor's own numbers instead of a list kept here.
 *   - Free routes are the ids ending in `:free` ($0, 20 requests/minute and
 *     200/day); every other id bills per token.
 *   - The catalog states no output cap, so `maxTokens` is derived from the
 *     context window rather than invented per model.
 *
 * The model list endpoint answers 200 even with a garbage key, so it cannot
 * prove a key. `checkRoutewayKey` therefore spends one token on a free route,
 * which is the cheapest call that fails with 401 when the key is wrong.
 */

const { planOf, planNote } = require('./model-filter');

const ROUTEWAY_PROVIDER = 'routeway';
const ROUTEWAY_BASE_URL = 'https://api.routeway.ai/v1';

const CATALOG_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_CONTEXT_WINDOW = 128000;
/** Output cap asked for when the model says nothing: never more than this. */
const MAX_TOKENS_CAP = 32768;
const MAX_TOKENS_FLOOR = 4096;

/** The cheapest call that proves a key: a free route, one token of output. */
const PING_MODEL = 'deepseek-v4.1-flash:free';

/**
 * Used only when the catalog cannot be reached and nothing is cached. These are
 * the free routes the live catalog served when this app was built — the paid
 * half is deliberately absent, because a stale price is worse than no list.
 */
const FALLBACK_MODELS = [
  {
    id: 'deepseek-v4.1-flash:free',
    name: 'DeepSeek V4.1 Flash (Free)',
    contextWindow: 42000,
    vision: false,
    reasoning: true,
  },
  {
    id: 'minimax-m3.1-flash:free',
    name: 'MiniMax M3.1 Flash (Free)',
    contextWindow: 42000,
    vision: false,
    reasoning: true,
  },
  {
    id: 'muse-glimmer-30b:free',
    name: 'Glimmer 30B (Free)',
    contextWindow: 131072,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-chimerax:free',
    name: 'Gemma 4 26B Chimerax (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-darksoul:free',
    name: 'Gemma 4 26B Darksoul (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-luminous:free',
    name: 'Gemma 4 26B Luminous (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-moonlight:free',
    name: 'Gemma 4 26B Moonlight (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-musica:free',
    name: 'Gemma 4 26B Musica (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
  {
    id: 'gemma-4-26b-a4b-it-meromero:free',
    name: 'Gemma 4 26B MeroMero (Free)',
    contextWindow: 62000,
    vision: true,
    reasoning: true,
  },
];

/** @type {{ at: number, models: Array<object> } | null} */
let modelCache = null;

/** Tests only: forget the catalog so the next call hits the injected fetch. */
function resetRoutewayModelCache() {
  modelCache = null;
}

function finiteOr(value, fallback) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** `$0.95/$4.00` — input/output dollars per 1M tokens, as the catalog states them. */
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

/** Only the chat models belong in a coding agent's dropdown. */
function isChatModel(raw) {
  if (!Array.isArray(raw?.endpoints)) return true;
  return raw.endpoints.includes('/v1/chat/completions');
}

function normalizeModel(raw) {
  const id = typeof raw?.id === 'string' ? raw.id : '';
  const contextWindow = finiteOr(raw?.context_length, DEFAULT_CONTEXT_WINDOW);
  const pricing = raw?.pricing
    ? {
        prompt: raw.pricing.input?.price_per_million_t,
        completion: raw.pricing.output?.price_per_million_t,
      }
    : undefined;
  const model = {
    id,
    name:
      (typeof raw?.short_name === 'string' && raw.short_name) ||
      (typeof raw?.name === 'string' && raw.name) ||
      id,
    owner: typeof raw?.owned_by === 'string' ? raw.owned_by : '',
    contextWindow,
    // The catalog never states an output cap. A quarter of the window, floored
    // at 4K and capped at 32K, gives a long answer room without asking a small
    // model for more than it can produce.
    maxTokens: Math.min(
      Math.max(MAX_TOKENS_FLOOR, Math.floor(contextWindow / 4)),
      MAX_TOKENS_CAP
    ),
    vision: Boolean(raw?.capabilities?.vision),
    reasoning: Boolean(raw?.capabilities?.reasoning),
    pricing,
  };
  return { ...model, plan: planOf(model), planNote: planNote(model) };
}

/**
 * The catalog, in order of preference: live fetch, recent cache, the free
 * fallback. Never throws — a chat session must still open offline.
 */
async function fetchRoutewayModels({ fetchImpl, now = Date.now, force = false } = {}) {
  if (!force && modelCache && now() - modelCache.at < CATALOG_TTL_MS) {
    return { models: modelCache.models, source: 'cache' };
  }

  try {
    const doFetch = fetchImpl || fetch;
    const init = { headers: { accept: 'application/json' } };
    if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await doFetch(`${ROUTEWAY_BASE_URL}/models`, init);
    if (!res.ok) throw new Error(`model catalog request failed (HTTP ${res.status})`);
    const body = await res.json().catch(() => null);
    const list = Array.isArray(body?.data) ? body.data : [];
    const models = list
      .filter((raw) => raw?.available !== false && isChatModel(raw))
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
  return FALLBACK_MODELS.map((m) => {
    const model = {
      ...m,
      owner: '',
      maxTokens: Math.min(
        Math.max(MAX_TOKENS_FLOOR, Math.floor(m.contextWindow / 4)),
        MAX_TOKENS_CAP
      ),
      // Every free route is priced zero, so there is nothing to show.
      plan: 'free',
      planNote: '',
    };
    return model;
  });
}

/** What pi's registerProvider expects for Routeway. */
function routewayProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : fallbackCatalog();
  return {
    name: 'Routeway',
    baseUrl: ROUTEWAY_BASE_URL,
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
function routewayModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: ROUTEWAY_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan || planOf(m),
    planNote: m.planNote || planNote(m),
  }));
}

/**
 * Prove a key before saving it.
 *
 * A 401 (or an `invalid_api_key` code) is the only answer that proves the key
 * is wrong. A rate limit, a rotated free route or a plan restriction means the
 * key could not be confirmed rather than rejected, so those come back marked
 * `unverified` and the caller saves the key anyway.
 */
async function checkRoutewayKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Routeway API key first.' };

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
    res = await doFetch(`${ROUTEWAY_BASE_URL}/chat/completions`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      unverified: true,
      status: 0,
      error: `Could not reach Routeway — check your connection (${message}).`,
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
    error: rejected ? error : `Routeway did not confirm this key (${error}).`,
  };
}

module.exports = {
  ROUTEWAY_PROVIDER,
  ROUTEWAY_BASE_URL,
  PING_MODEL,
  FALLBACK_MODELS,
  fetchRoutewayModels,
  routewayProviderConfig,
  routewayModelEntries,
  checkRoutewayKey,
  resetRoutewayModelCache,
};
