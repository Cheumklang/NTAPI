'use strict';

/**
 * Kilo AI Gateway provider — one key, hundreds of vendors, OpenAI-compatible.
 *
 * Kilo resells other providers' models behind a single `kilo-` key and prices
 * each one separately, so — exactly like the OpenRouter tile — the price is read
 * from its own public catalog instead of being baked into this file: the numbers
 * move. The picker is built from that same catalog (several hundred rows, which
 * is what the dropdown's search box, its provider grouping and its "free only"
 * tick are for), and the shortlist below is only the fallback for a catalog that
 * cannot be read.
 *
 * The catalog states whether a route is free (`$0` in and out, or a `:free`
 * id), what it can take (`image` input), and whether it is a text route at all;
 * image and audio generators are dropped because they cannot answer a chat turn.
 * The `kilo-auto/*` tiers price at `-1` (decided server-side per request): they
 * are kept as paid rows with no fixed number rather than a price nobody quoted.
 *
 * `GET /models` is public, so it cannot tell a good key from a bad one. There is
 * no `/key` endpoint either. The cheapest authenticated call is a one-token chat
 * completion on a free route: a bad key answers 401, while a key that is merely
 * out of credit (402), out of model scope (403) or rate-limited (429) is still a
 * real key and is saved. A server error is treated as "could not verify", so a
 * flaky gateway never blocks a key the user just pasted.
 */

const KILO_PROVIDER = 'kilo';
const KILO_BASE_URL = 'https://ai-gateway.kilo.ai/api/v1';
const KILO_PLAN = 'paid';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * The shortlist used when the public catalog cannot be read: the always-free
 * auto tier first, then one strong general model and one fast one. The ids move
 * server-side, so this is only a fallback to keep a freshly-saved key usable.
 */
const KILO_MODEL_CANDIDATES = [
  {
    id: 'kilo-auto/free',
    name: 'Auto Free (Kilo)',
    contextWindow: 256000,
    maxTokens: 32768,
    vision: false,
    plan: 'free',
    cost: null,
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6 (Kilo)',
    contextWindow: 1000000,
    maxTokens: 64000,
    vision: true,
    plan: 'paid',
    cost: null,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Kilo)',
    contextWindow: 1048576,
    maxTokens: 65536,
    vision: true,
    plan: 'paid',
    cost: null,
  },
];

/** `$0.27/$1.10` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost || (!cost.input && !cost.output)) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** Kilo quotes per token; the picker and the balance panel speak per 1M. */
function perMillion(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : 0;
}

/** What pi's registerProvider expects. */
function kiloProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : KILO_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Kilo',
    baseUrl: KILO_BASE_URL,
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
function kiloModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => {
    const paid = m.plan !== 'free';
    return {
      provider: KILO_PROVIDER,
      id: m.id,
      name: m.name,
      // A `$0` (or `:free`) route really costs nothing; everything else carries
      // a price or is a dynamic `-1` auto tier, so the two never share a heading.
      plan: paid ? 'paid' : 'free',
      planNote: paid ? priceNote(m.cost) : '',
      // A $0 route costs nothing at all, rather than drawing on a daily
      // allowance — so the row is free without the quota chip.
      freeTier: false,
      cost: m.cost || null,
    };
  });
}

/**
 * One public catalog row as a picker row, or null when it cannot answer a chat
 * turn at all.
 */
function kiloRowToModel(row) {
  const id = String(row?.id || '').trim();
  if (!id) return null;
  const outputs = row?.architecture?.output_modalities;
  // A row that only outputs an image or audio has nothing to say in a chat turn.
  if (Array.isArray(outputs) && outputs.length && !outputs.includes('text')) return null;
  const pricing = row?.pricing || {};
  const rawPrompt = String(pricing.prompt ?? '');
  const rawCompletion = String(pricing.completion ?? '');
  // `-1` is the auto tiers' "decided per request": not a quoted price, not free.
  const dynamic = rawPrompt === '-1' || rawCompletion === '-1';
  const input = perMillion(pricing.prompt);
  const output = perMillion(pricing.completion);
  const free = !dynamic && (rawPrompt === '0' || id.endsWith(':free')) && (rawCompletion === '0' || id.endsWith(':free'));
  const contextWindow = Number(row?.context_length ?? row?.top_provider?.context_length);
  const maxTokens = Number(row?.top_provider?.max_completion_tokens);
  const inputs = row?.architecture?.input_modalities;
  return {
    id,
    name: typeof row?.name === 'string' && row.name ? row.name : id,
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 131072,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 16384,
    vision: Array.isArray(inputs) && inputs.includes('image'),
    plan: free ? 'free' : 'paid',
    // A dynamic auto tier has no fixed price to show; a free row is $0.
    cost: free
      ? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      : dynamic
        ? null
        : {
            input,
            output,
            cacheRead: perMillion(pricing.input_cache_read),
            cacheWrite: perMillion(pricing.input_cache_write),
          },
  };
}

/**
 * Prove a key before saving it.
 *
 * `/models` is public and there is no `/key`, so the cheapest authenticated
 * call is a one-token completion on a free route. A bad key answers 401; a key
 * that is out of credit, out of scope or rate-limited is still a real key and is
 * reported `ok` (the first real turn surfaces the 402/403/429). A network or
 * server failure is `offline`, so the key is saved unverified rather than
 * rejected.
 */
async function checkKiloKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Kilo API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'kilo-auto/free',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    }),
  };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${KILO_BASE_URL}/chat/completions`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Kilo — check your connection (${message}).`,
    };
  }

  // 2xx, or a key that is real but cannot complete right now (no credit, model
  // not in scope, rate limited): the credential itself is good.
  if (res.ok || res.status === 402 || res.status === 403 || res.status === 429) {
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

  // 401 is the only "wrong key" answer; 5xx is a gateway problem, not the key's.
  if (res.status === 401) {
    let message = 'HTTP 401';
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

  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    message = body?.error?.message || body?.message || message;
  } catch {}
  return {
    ok: false,
    offline: true,
    status: res.status,
    error: `Kilo could not verify the key right now (${message}).`,
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
async function resolveKiloModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json' } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let live = [];
  try {
    const res = await doFetch(`${KILO_BASE_URL}/models`, init);
    if (res.ok) {
      const body = await res.json();
      live = Array.isArray(body?.data) ? body.data : [];
    }
  } catch {
    return KILO_MODEL_CANDIDATES.slice();
  }

  const models = live.map(kiloRowToModel).filter(Boolean);
  return models.length ? models : KILO_MODEL_CANDIDATES.slice();
}

module.exports = {
  KILO_PROVIDER,
  KILO_BASE_URL,
  KILO_PLAN,
  KILO_MODEL_CANDIDATES,
  priceNote,
  kiloRowToModel,
  kiloProviderConfig,
  kiloModelEntries,
  checkKiloKey,
  resolveKiloModels,
};