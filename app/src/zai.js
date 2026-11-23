'use strict';

/**
 * z.ai (Zhipu / GLM) provider — OpenAI-compatible endpoint, paid per token.
 *
 * The international brand of Zhipu's open platform. Keys start with a long
 * dot-separated id followed by a secret. `/models` lists the account's ids but
 * publishes no metadata at all — no window, no price — so the table below is the
 * only source for both, and an id z.ai documents nothing about carries the
 * family's conservative floor with no price rather than an invented number.
 * There is no free tier to detect, so the rows are tagged `paid`.
 *
 * The GLM family answers in `reasoning_content` when thinking is on, which pi
 * already understands over an `openai-completions` registration.
 */

const ZAI_PROVIDER = 'zai';
const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const ZAI_PLAN = 'paid';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * The GLM ids this picker offers, in family order.
 *
 * `contextWindow` and `maxTokens` are what z.ai publishes for that model, or the
 * family floor (128k / 96k) when it publishes nothing — under-claiming only
 * compacts earlier, while over-claiming sends a request the model refuses.
 * `cost` is null for an id with no published price, and a paid row with no price
 * says just "paid" instead of a number nobody can check.
 */
const ZAI_MODEL_CANDIDATES = [
  {
    id: 'glm-4.5',
    name: 'GLM-4.5',
    contextWindow: 131072,
    maxTokens: 98304,
    vision: false,
    cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
  },
  {
    id: 'glm-4.5-air',
    name: 'GLM-4.5 Air',
    contextWindow: 131072,
    maxTokens: 98304,
    vision: false,
    cost: { input: 0.2, output: 1.1, cacheRead: 0.03, cacheWrite: 0 },
  },
  {
    id: 'glm-4.6',
    name: 'GLM-4.6',
    contextWindow: 204800,
    maxTokens: 131072,
    vision: false,
    cost: { input: 0.6, output: 2.2, cacheRead: 0.11, cacheWrite: 0 },
  },
  { id: 'glm-4.7', name: 'GLM-4.7', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5', name: 'GLM-5', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5-turbo', name: 'GLM-5 Turbo', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.1', name: 'GLM-5.1', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.2', name: 'GLM-5.2', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.3-flash', name: 'GLM-5.3 Flash', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.3-flashx', name: 'GLM-5.3 FlashX', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.3-flashx-legal', name: 'GLM-5.3 FlashX Legal', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
  { id: 'glm-5.4', name: 'GLM-5.4', contextWindow: 131072, maxTokens: 98304, vision: false, cost: null },
];

/** `$0.60/$2.20` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost || (!cost.input && !cost.output)) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** What pi's registerProvider expects. */
function zaiProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : ZAI_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'z.ai',
    baseUrl: ZAI_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 204800,
      maxTokens: m.maxTokens || 131072,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function zaiModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: ZAI_PROVIDER,
    id: m.id,
    name: m.name,
    plan: ZAI_PLAN,
    planNote: priceNote(m.cost),
    cost: m.cost || null,
  }));
}

/**
 * Prove a key before saving it. `GET /models` is the cheapest authenticated call
 * and also reports which ids this account can reach.
 *
 * A network failure is not a bad key and is reported separately as `offline`.
 */
async function checkZaiKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a z.ai API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${ZAI_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach z.ai — check your connection (${message}).`,
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
    // Defence in depth: a server message must never echo the key back.
    error: String(message).split(key).join('[key]'),
  };
}

/**
 * The catalog this account can call.
 *
 * - No key: empty.
 * - Reachable and some candidates listed: just those, keeping the published
 *   limits unless the live entry is more specific.
 * - Reachable and none listed: the first candidate, so an account whose /models
 *   does not enumerate chat ids still reaches a model it can use.
 * - Unreachable: the first candidate, so a flaky network does not hide a
 *   provider the user just configured.
 */
async function resolveZaiModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkZaiKey(key, { fetchImpl });
  if (!check.ok) return [ZAI_MODEL_CANDIDATES[0]];

  const live = new Set(check.ids || []);
  const matched = ZAI_MODEL_CANDIDATES.filter((m) => live.has(m.id)).map((m) => {
    const listed = (check.models || []).find((row) => row?.id === m.id);
    const contextWindow = Number(listed?.context_window);
    const maxTokens = Number(listed?.max_output_tokens);
    return {
      ...m,
      contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : m.contextWindow,
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : m.maxTokens,
    };
  });
  return matched.length ? matched : [ZAI_MODEL_CANDIDATES[0]];
}

module.exports = {
  ZAI_PROVIDER,
  ZAI_BASE_URL,
  ZAI_PLAN,
  ZAI_MODEL_CANDIDATES,
  priceNote,
  zaiProviderConfig,
  zaiModelEntries,
  checkZaiKey,
  resolveZaiModels,
};
