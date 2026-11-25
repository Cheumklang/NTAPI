'use strict';

/**
 * Mistral AI (console.mistral.ai) provider — first party, freemium.
 *
 * Mistral serves its own open-weight and commercial models over an
 * OpenAI-compatible endpoint. The free experiment tier has rate limits but no
 * daily cap, so rows carry `plan: 'free'`. The La Plateforme paid tier bills
 * per token from the first one.
 *
 * The catalog is resolved from `/v1/models` per session: Mistral retires ids
 * and ships new ones, so a hard-coded list would drift. The hand list below is
 * only what the picker falls back to when the catalog cannot be read.
 */

const MISTRAL_PROVIDER = 'mistral';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const REQUEST_TIMEOUT_MS = 12000;

const MISTRAL_MODEL_CANDIDATES = [
  {
    id: 'mistral-large-latest',
    name: 'Mistral Large',
    contextWindow: 128000,
    maxTokens: 4096,
    vision: false,
    plan: 'free',
    cost: { input: 2, output: 6, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'mistral-small-latest',
    name: 'Mistral Small',
    contextWindow: 128000,
    maxTokens: 4096,
    vision: false,
    plan: 'free',
    cost: { input: 0.2, output: 0.6, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'open-mistral-nemo',
    name: 'Open Mistral Nemo',
    contextWindow: 128000,
    maxTokens: 4096,
    vision: false,
    plan: 'free',
    cost: { input: 0.15, output: 0.15, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: 'codestral-latest',
    name: 'Codestral',
    contextWindow: 256000,
    maxTokens: 4096,
    vision: false,
    plan: 'free',
    cost: { input: 0.3, output: 0.9, cacheRead: 0, cacheWrite: 0 },
  },
];

function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost || (!cost.input && !cost.output)) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

function mistralProviderConfig({ apiKey, models }) {
  const list =
    Array.isArray(models) && models.length ? models : MISTRAL_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Mistral',
    baseUrl: MISTRAL_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      reasoning: m.reasoning === true,
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 128000,
      maxTokens: m.maxTokens || 4096,
    })),
  };
}

function mistralModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: MISTRAL_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan || 'free',
    planNote: m.plan === 'paid' ? priceNote(m.cost) : '',
    cost: m.cost || null,
  }));
}

async function checkMistralKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Mistral API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${MISTRAL_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Mistral — check your connection (${message}).`,
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
    message = body?.error?.message || body?.message || message;
    code = body?.error?.code || body?.code || null;
  } catch {}
  return {
    ok: false,
    status: res.status,
    code,
    error: String(message).split(key).join('[key]'),
  };
}

async function resolveMistralModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkMistralKey(key, { fetchImpl });
  if (check.ok) {
    const live = new Set(check.ids || []);
    return MISTRAL_MODEL_CANDIDATES.filter((m) => live.has(m.id)).map((m) => {
      const listed = (check.models || []).find((row) => row?.id === m.id);
      const contextWindow = Number(listed?.context_window);
      const maxTokens = Number(listed?.max_output_tokens);
      return {
        ...m,
        contextWindow:
          Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : m.contextWindow,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : m.maxTokens,
      };
    });
  }
  if (check.offline) return [MISTRAL_MODEL_CANDIDATES[0]];
  return [];
}

module.exports = {
  MISTRAL_PROVIDER,
  MISTRAL_BASE_URL,
  MISTRAL_MODEL_CANDIDATES,
  priceNote,
  mistralProviderConfig,
  mistralModelEntries,
  checkMistralKey,
  resolveMistralModels,
};