'use strict';

/**
 * xAI Grok (console.x.ai) provider — first party, paid from the first token.
 *
 * xAI serves Grok over an OpenAI-compatible endpoint, so the same provider
 * config shape as DeepSeek and Mistral works unchanged. There is no free tier:
 * every row carries `plan: 'paid'` and a price note, and the picker must never
 * make a Grok model the default while a free provider exists (see
 * `provider-plan.js`).
 *
 * The catalog is resolved from `/v1/models` per session. When xAI lists ids this
 * app has never heard of, those are offered too with the default limits — a
 * retired id disappearing is better than a new one being invisible.
 */

const GROK_PROVIDER = 'grok';
const GROK_BASE_URL = 'https://api.x.ai/v1';
const REQUEST_TIMEOUT_MS = 12000;

const GROK_MODEL_CANDIDATES = [
  {
    id: 'grok-4.1',
    name: 'Grok 4.1',
    contextWindow: 256000,
    maxTokens: 32768,
    vision: true,
    reasoning: true,
    plan: 'paid',
    cost: { input: 3, output: 15, cacheRead: 0.75, cacheWrite: 0 },
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    contextWindow: 256000,
    maxTokens: 32768,
    vision: true,
    reasoning: true,
    plan: 'paid',
    cost: { input: 3, output: 15, cacheRead: 0.75, cacheWrite: 0 },
  },
  {
    id: 'grok-4-fast',
    name: 'Grok 4 Fast',
    contextWindow: 2000000,
    maxTokens: 32768,
    vision: true,
    reasoning: true,
    plan: 'paid',
    cost: { input: 0.2, output: 0.5, cacheRead: 0.05, cacheWrite: 0 },
  },
  {
    id: 'grok-3-mini',
    name: 'Grok 3 Mini',
    contextWindow: 131072,
    maxTokens: 32768,
    vision: false,
    plan: 'paid',
    cost: { input: 0.3, output: 0.5, cacheRead: 0.075, cacheWrite: 0 },
  },
  {
    id: 'grok-code-fast-1',
    name: 'Grok Code Fast 1',
    contextWindow: 256000,
    maxTokens: 32768,
    vision: false,
    plan: 'paid',
    cost: { input: 0.2, output: 1.5, cacheRead: 0.02, cacheWrite: 0 },
  },
];

const DEFAULT_CONTEXT_WINDOW = 256000;
const DEFAULT_MAX_TOKENS = 32768;

function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost || (!cost.input && !cost.output)) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

function grokProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : GROK_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Grok',
    baseUrl: GROK_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      reasoning: m.reasoning === true,
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || DEFAULT_CONTEXT_WINDOW,
      maxTokens: m.maxTokens || DEFAULT_MAX_TOKENS,
    })),
  };
}

function grokModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: GROK_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan || 'paid',
    planNote: priceNote(m.cost),
    cost: m.cost || null,
  }));
}

async function checkGrokKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Grok API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${GROK_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Grok — check your connection (${message}).`,
    };
  }

  if (res.ok) {
    let ids = [];
    let models = [];
    try {
      const body = await res.json();
      const data = Array.isArray(body?.data) ? body.data : [];
      ids = data.map((m) => m?.id).filter(Boolean);
      models = data;
    } catch {}
    return { ok: true, status: res.status, ids, models };
  }

  let message = `HTTP ${res.status}`;
  let code = null;
  try {
    const body = await res.json();
    // xAI answers `{"code":"permission-denied","error":"..."}` — `error` is a
    // *string* here, not the `{message}` object most OpenAI-compatible servers
    // send. Reading only `error.message` threw the one sentence that says why
    // away and left the window showing a bare "HTTP 403", which is exactly what
    // the first Grok user saw (2026-11-26).
    const raw = body?.error;
    message =
      (typeof raw === 'string' && raw) ||
      raw?.message ||
      body?.message ||
      (typeof body?.detail === 'string' && body.detail) ||
      message;
    code = raw?.code || body?.code || null;
  } catch {}
  return {
    ok: false,
    status: res.status,
    code,
    // 403 is not "bad key": xAI has accepted the key and is refusing the action
    // (no team permission, no credit, a blocked team). The key is worth saving so
    // the turn itself can say what is wrong; a 400/401 is a key that will never
    // work and must not be stored.
    restricted: res.status === 403,
    error: String(message).split(key).join('[key]'),
  };
}

/**
 * The curated rows xAI still lists, plus anything newer it lists instead.
 * Newer ids are guesses about limits, so they carry the default window rather
 * than a number this app made up.
 */
async function resolveGrokModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkGrokKey(key, { fetchImpl });
  if (!check.ok) {
    // A key xAI accepted but would not list models for still gets the curated
    // rows: the picker has to offer something the first turn can try, and that
    // turn reports the refusal in xAI's own words.
    if (check.offline) return [GROK_MODEL_CANDIDATES[0]];
    if (check.restricted) return GROK_MODEL_CANDIDATES;
    return [];
  }

  const live = new Set(check.ids || []);
  const known = GROK_MODEL_CANDIDATES.filter((m) => live.has(m.id));
  const knownIds = new Set(known.map((m) => m.id));
  const extra = [...live]
    .filter((id) => !knownIds.has(id) && !/^grok-(?:vision|beta|image|2|1)\b/.test(id))
    .map((id) => ({
      id,
      name: id,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
      vision: false,
      plan: 'paid',
      cost: null,
    }));

  const list = [...known, ...extra];
  return list.length ? list : [GROK_MODEL_CANDIDATES[0]];
}

module.exports = {
  GROK_PROVIDER,
  GROK_BASE_URL,
  GROK_MODEL_CANDIDATES,
  priceNote,
  grokProviderConfig,
  grokModelEntries,
  checkGrokKey,
  resolveGrokModels,
};
