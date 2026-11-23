'use strict';

/**
 * OpenRouter provider — one key, many vendors, OpenAI-compatible.
 *
 * OpenRouter resells other people's models behind a single `sk-or-` key and
 * prices each one separately, which is why the price is read from its own public
 * catalog instead of being baked into this file: the numbers move. The picker is
 * built from that same catalog — several hundred rows, which is what the
 * dropdown's search box, its provider grouping and its "free only" tick are for
 * — and the shortlist below is only the fallback for a catalog that cannot be
 * read.
 *
 * The catalog states whether a route is free (`$0` in and out), what it can
 * take (`image` input), and whether it is a text route at all; image and audio
 * generators are dropped because they cannot answer a chat turn.
 *
 * `GET /key` is the cheapest authenticated call, and it answers even for an
 * account with no credit left (the balance is in the body), so "key works but
 * balance is zero" stays a 402 at the first turn rather than a wrong-key error
 * here.
 */

const OPENROUTER_PROVIDER = 'openrouter';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_PLAN = 'paid';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * The shortlist used when the public catalog cannot be read: one cheap general
 * model, one strong one, one long-context one.
 */
const OPENROUTER_MODEL_CANDIDATES = [
  {
    id: 'deepseek/deepseek-chat-v3.1',
    name: 'DeepSeek V3.1 (OpenRouter)',
    contextWindow: 163840,
    maxTokens: 32768,
    vision: false,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (OpenRouter)',
    contextWindow: 1048576,
    maxTokens: 65536,
    vision: true,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B (OpenRouter)',
    contextWindow: 131072,
    maxTokens: 16384,
    vision: false,
  },
];

/** `$0.27/$1.10` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** OpenRouter quotes per token; the picker and the balance panel speak per 1M. */
function perMillion(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : 0;
}

/** What pi's registerProvider expects. */
function openrouterProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : OPENROUTER_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      // Whether a given route thinks is the route's business; pi passes the
      // reasoning effort through and a model without the feature ignores it.
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 131072,
      maxTokens: m.maxTokens || 16384,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function openrouterModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => {
    const paid = m.plan !== 'free';
    return {
      provider: OPENROUTER_PROVIDER,
      id: m.id,
      name: m.name,
      // `:free` routes really are $0 in and out; everything else carries a
      // price, so the two never share a heading in the dropdown.
      plan: paid ? 'paid' : 'free',
      planNote: paid ? priceNote(m.cost) : '',
      // A $0 route costs nothing at all, rather than drawing on a daily
      // allowance — so the row is free without the quota chip, which would
      // claim a limit that does not exist here.
      freeTier: false,
      cost: m.cost || null,
    };
  });
}

/**
 * One public catalog row as a picker row, or null when it cannot answer a chat
 * turn at all.
 */
function openrouterRowToModel(row) {
  const id = String(row?.id || '').trim();
  if (!id) return null;
  const outputs = row?.architecture?.output_modalities;
  // A row that only outputs an image or audio has nothing to say in a chat turn.
  if (Array.isArray(outputs) && outputs.length && !outputs.includes('text')) return null;
  const pricing = row?.pricing || {};
  const input = perMillion(pricing.prompt);
  const output = perMillion(pricing.completion);
  const contextWindow = Number(row?.context_length);
  const maxTokens = Number(row?.top_provider?.max_completion_tokens);
  const inputs = row?.architecture?.input_modalities;
  return {
    id,
    name: typeof row?.name === 'string' && row.name ? row.name : id,
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 131072,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 16384,
    vision: Array.isArray(inputs) && inputs.includes('image'),
    plan: input === 0 && output === 0 ? 'free' : 'paid',
    cost: {
      input,
      output,
      cacheRead: perMillion(pricing.input_cache_read),
      cacheWrite: perMillion(pricing.input_cache_write),
    },
  };
}

/**
 * Prove a key before saving it. `/key` is authenticated and cheap; `/models` is
 * public, so it cannot tell a good key from a bad one.
 */
async function checkOpenRouterKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter an OpenRouter API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${key}`,
      // OpenRouter asks for an identifying referer; the app's own name is
      // enough and it keeps the key out of anybody else's dashboard.
      'HTTP-Referer': 'https://ntapi.app',
      'X-Title': 'NTAPI',
    },
  };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${OPENROUTER_BASE_URL}/key`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach OpenRouter — check your connection (${message}).`,
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
 * The public catalog, as the picker offers it.
 *
 * - No key: empty.
 * - Reachable: every text route in the catalog, with the price and context
 *   window the catalog quotes. Free routes are marked free, which is what the
 *   dropdown's "free only" tick filters on.
 * - Unreachable: the shortlist, so a flaky network does not hide a provider the
 *   user just configured.
 */
async function resolveOpenRouterModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json' } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let live = [];
  try {
    const res = await doFetch(`${OPENROUTER_BASE_URL}/models`, init);
    if (res.ok) {
      const body = await res.json();
      live = Array.isArray(body?.data) ? body.data : [];
    }
  } catch {
    return OPENROUTER_MODEL_CANDIDATES.slice();
  }

  const models = live.map(openrouterRowToModel).filter(Boolean);
  return models.length ? models : OPENROUTER_MODEL_CANDIDATES.slice();
}

module.exports = {
  OPENROUTER_PROVIDER,
  OPENROUTER_BASE_URL,
  OPENROUTER_PLAN,
  OPENROUTER_MODEL_CANDIDATES,
  priceNote,
  openrouterRowToModel,
  openrouterProviderConfig,
  openrouterModelEntries,
  checkOpenRouterKey,
  resolveOpenRouterModels,
};
