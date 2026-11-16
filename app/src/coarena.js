'use strict';

/**
 * Coarena Model API client.
 *
 * Coarena speaks the OpenAI chat-completions protocol, so pi's
 * `openai-completions` adapter can drive it unchanged. What this module owns is
 * everything around that: the model catalog (with a verified fallback so an
 * offline start still shows models), the provider config pi registers, and the
 * read-only key check the Settings dialog uses to prove a pasted key works.
 *
 * The API key never appears in an error string, a log line or a model entry.
 */

const { planOf, planNote } = require('./model-filter');

const COARENA_PROVIDER = 'coarena';
const COARENA_BASE_URL = 'https://coarena.ai/api/v1';

const CATALOG_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 16384;

/**
 * Used only when the catalog cannot be reached and nothing is cached. These are
 * the ids the live catalog served when this app was built; a stale id fails a
 * turn with a clear provider error instead of leaving the model list empty.
 */
const FALLBACK_MODELS = [
  { id: 'claude-fable-5', name: 'Claude Fable 5' },
  { id: 'deepseek-v4-1-flash-1017', name: 'DeepSeek V4.1 Flash' },
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon' },
  { id: 'kimi-k3-1-pro', name: 'Kimi K3.1 Pro' },
  { id: 'grok-4-7', name: 'Grok 4.7' },
];

/** @type {{ at: number, models: Array<object> } | null} */
let modelCache = null;

/**
 * Display names (lowercased) that Coarena itself said a free account can use.
 *
 * Its catalog cannot be trusted for this: every route in `GET /models` is
 * priced `0/0`, Claude included, yet a free key is refused with 402
 * `payment_required`. The refusal sentence is the only free/paid signal the API
 * offers, so it is remembered here and the picker stops calling the rest free.
 */
const freeTierNames = new Set();

function nameKey(value) {
  return String(value || '').trim().toLowerCase();
}

/** `'free'`, `'paid'`, or `null` while nothing is known about this tier. */
function planFromFreeTier(model) {
  if (freeTierNames.size === 0) return null;
  const name = nameKey(model?.name);
  const id = nameKey(model?.id);
  if (!name && !id) return null;
  return freeTierNames.has(name) || freeTierNames.has(id) ? 'free' : 'paid';
}

/**
 * Remember the free-tier list Coarena named in a 402. Replaces the previous
 * list (the API may publish a different one next month) and reports whether
 * anything changed, so a caller can skip a pointless repaint.
 */
function setCoarenaFreeTier(names) {
  const next = [...new Set((names || []).map(nameKey).filter(Boolean))];
  const before = [...freeTierNames].sort().join('\n');
  freeTierNames.clear();
  for (const name of next) freeTierNames.add(name);
  return { changed: before !== [...next].sort().join('\n'), names: next };
}

/** Re-label an already-normalised catalog after the tier list changed. */
function retagModels(models) {
  return (models || []).map((model) => {
    const tier = planFromFreeTier(model);
    if (!tier) return model;
    return { ...model, plan: tier, planNote: tier === 'paid' ? 'credit' : '' };
  });
}

/** Tests only: forget the catalog so the next call hits the injected fetch. */
function resetCoarenaModelCache() {
  modelCache = null;
}

/**
 * GET helper. The timeout applies only to the real global fetch; a fake fetch
 * in tests must not be handed a signal it cannot understand.
 */
async function coarenaGet(pathname, { fetchImpl, headers } = {}) {
  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', ...headers } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return doFetch(`${COARENA_BASE_URL}${pathname}`, init);
}

async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function finiteOr(value, fallback) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** Coarena reports timestamps as epoch milliseconds; the UI formats ISO. */
function epochToIso(value) {
  const n = finiteOr(value, null);
  if (n === null) return null;
  const date = new Date(n);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeModel(raw) {
  const id = typeof raw?.id === 'string' ? raw.id : '';
  // The catalog prices in USD per 1M tokens; "0"/"0" is its way of saying the
  // route bills nothing. Keeping the block is what lets the picker label a row
  // free or paid instead of guessing.
  const pricing = raw?.pricing && typeof raw.pricing === 'object'
    ? { prompt: raw.pricing.prompt, completion: raw.pricing.completion }
    : undefined;
  const model = {
    id,
    name: typeof raw?.display_name === 'string' && raw.display_name ? raw.display_name : id,
    owner: typeof raw?.owned_by === 'string' ? raw.owned_by : '',
    contextWindow: finiteOr(raw?.context_length, DEFAULT_CONTEXT_WINDOW),
    maxTokens: finiteOr(raw?.max_completion_tokens, finiteOr(raw?.max_tokens, DEFAULT_MAX_TOKENS)),
    vision: Boolean(raw?.capabilities?.vision),
    pricing,
  };
  const tier = planFromFreeTier(model);
  const plan = tier || planOf(model);
  // A route Coarena refused for a free key wears "credit", not a price: its
  // catalog says $0 for it, so a price would be the same lie in another font.
  return { ...model, plan, planNote: tier === 'paid' ? 'credit' : planNote({ ...model, plan }) };
}

function fallbackCatalog() {
  return FALLBACK_MODELS.map((m) => ({
    ...m,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    // Every verified fallback id is a vision model in the live catalog.
    vision: true,
    // The live catalog priced every one of them at zero when this app was
    // built, so the offline copy says the same rather than claiming a cost.
    plan: 'free',
    planNote: '',
  }));
}

/**
 * The catalog, in order of preference: live fetch, recent cache, verified
 * fallback. Never throws — a chat session must still open offline.
 */
async function fetchCoarenaModels({ fetchImpl, now = Date.now, force = false } = {}) {
  if (!force && modelCache && now() - modelCache.at < CATALOG_TTL_MS) {
    return { models: modelCache.models, source: 'cache' };
  }

  try {
    const res = await coarenaGet('/models', { fetchImpl });
    if (!res.ok) throw new Error(`model catalog request failed (HTTP ${res.status})`);
    const body = await readJson(res);
    const list = Array.isArray(body?.data) ? body.data : [];
    const models = list.map(normalizeModel).filter((m) => m.id);
    if (models.length === 0) throw new Error('model catalog was empty');
    modelCache = { at: now(), models };
    return { models, source: 'live' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (modelCache) return { models: modelCache.models, source: 'cache', error: message };
    return { models: fallbackCatalog(), source: 'fallback', error: message };
  }
}

/** What pi's registerProvider expects for Coarena. */
function coarenaProviderConfig({ apiKey, models }) {
  return {
    name: 'Coarena',
    baseUrl: COARENA_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: (models || []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      // Images go in as content blocks only for models the catalog says can
      // see them; a text-only model must never receive one.
      input: m.vision === false ? ['text'] : ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || DEFAULT_CONTEXT_WINDOW,
      maxTokens: m.maxTokens || DEFAULT_MAX_TOKENS,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function coarenaModelEntries(models) {
  return (models || []).map((m) => ({
    provider: COARENA_PROVIDER,
    id: m.id,
    name: m.name || m.id,
    plan: m.plan || planOf(m),
    planNote: m.planNote || planNote(m),
  }));
}

/**
 * Ask the API who this key is and what it has left. Used to reject a wrong key
 * before it is saved, and to show limits in Settings. A network failure is not
 * a bad key, so it is reported separately as `offline`.
 */
async function readCoarenaKeyInfo(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, code: 'missing_key', error: 'Enter a Coarena API key first.' };

  let res;
  try {
    res = await coarenaGet('/key', { fetchImpl, headers: { authorization: `Bearer ${key}` } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      code: null,
      error: `Could not reach Coarena — check your connection (${message}).`,
    };
  }

  const body = await readJson(res);
  if (!res.ok) {
    const parsed = body?.error || body || {};
    const code = typeof parsed.code === 'string' ? parsed.code : null;
    const message = typeof parsed.message === 'string' ? parsed.message : `HTTP ${res.status}`;
    return {
      ok: false,
      status: res.status,
      code,
      // Defence in depth: even a server message must never echo the key back.
      error: message.split(key).join('[key]'),
    };
  }

  const data = body?.data || body || {};
  const limits = data.limits || {};
  const usage = data.usage_today || {};
  return {
    ok: true,
    info: {
      label: typeof data.label === 'string' ? data.label : null,
      prefix: typeof data.prefix === 'string' ? data.prefix : null,
      isFreeTier: Boolean(data.is_free_tier),
      expiresAt: epochToIso(data.expires_at),
      limits: {
        requestsPerMinute: finiteOr(limits.requests_per_minute_key, finiteOr(limits.requests_per_minute_account, null)),
        concurrency: finiteOr(limits.concurrency, null),
        usdPerDay: finiteOr(limits.usd_per_day, null),
        maxOutputTokens: finiteOr(limits.max_output_tokens, null),
      },
      usageToday: {
        requests: finiteOr(usage.requests, 0),
        costUsd: finiteOr(usage.cost_usd, 0),
        resetsAt: epochToIso(usage.resets_at),
      },
    },
  };
}

module.exports = {
  COARENA_PROVIDER,
  COARENA_BASE_URL,
  FALLBACK_MODELS,
  fetchCoarenaModels,
  coarenaProviderConfig,
  coarenaModelEntries,
  readCoarenaKeyInfo,
  resetCoarenaModelCache,
  retagModels,
  setCoarenaFreeTier,
};
