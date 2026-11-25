'use strict';

/**
 * Pollinations.ai (pollinations.ai) provider — free, OpenAI-compatible.
 *
 * Pollinations serves open-weight models over an OpenAI-compatible endpoint at
 * `text.pollinations.ai/openai`. The service is free with rate limits; an API
 * key raises the limits but is not required for basic use. This app requires a
 * key to keep every provider uniform — the key is the rate-limit token from
 * the user's Pollinations account.
 *
 * The catalog is resolved from `/openai/models` per session. The hand list
 * below is only what the picker falls back to when the catalog cannot be read.
 */

const POLLINATIONS_PROVIDER = 'pollinations';
const POLLINATIONS_BASE_URL = 'https://text.pollinations.ai/openai';
const REQUEST_TIMEOUT_MS = 12000;

const POLLINATIONS_MODEL_CANDIDATES = [
  {
    id: 'openai-fast',
    name: 'GPT-OSS 20B (via Pollinations)',
    contextWindow: 128000,
    maxTokens: 4096,
    vision: false,
    plan: 'free',
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  },
];

function pollinationsProviderConfig({ apiKey, models }) {
  const list =
    Array.isArray(models) && models.length ? models : POLLINATIONS_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Pollinations',
    baseUrl: POLLINATIONS_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 128000,
      maxTokens: m.maxTokens || 4096,
    })),
  };
}

function pollinationsModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: POLLINATIONS_PROVIDER,
    id: m.id,
    name: m.name,
    plan: 'free',
    planNote: '',
    cost: null,
  }));
}

async function checkPollinationsKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Pollinations API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${POLLINATIONS_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Pollinations — check your connection (${message}).`,
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
  try {
    const body = await res.json();
    message = body?.error?.message || body?.message || message;
  } catch {}
  return {
    ok: false,
    status: res.status,
    error: String(message).split(key).join('[key]'),
  };
}

async function resolvePollinationsModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkPollinationsKey(key, { fetchImpl });
  if (check.ok) {
    const live = new Set(check.ids || []);
    // Include candidates that are live, plus any live models not in candidates.
    const known = POLLINATIONS_MODEL_CANDIDATES.filter((m) => live.has(m.id));
    const knownIds = new Set(known.map((m) => m.id));
    const extra = (check.models || [])
      .filter((row) => row?.id && !knownIds.has(row.id))
      .map((row) => ({
        id: row.id,
        name: row.name || row.id,
        contextWindow: 128000,
        maxTokens: 4096,
        vision: false,
        plan: 'free',
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      }));
    return [...known, ...extra];
  }
  if (check.offline) return [POLLINATIONS_MODEL_CANDIDATES[0]];
  return [];
}

module.exports = {
  POLLINATIONS_PROVIDER,
  POLLINATIONS_BASE_URL,
  POLLINATIONS_MODEL_CANDIDATES,
  pollinationsProviderConfig,
  pollinationsModelEntries,
  checkPollinationsKey,
  resolvePollinationsModels,
};