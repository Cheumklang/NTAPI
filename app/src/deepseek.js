'use strict';

/**
 * DeepSeek (platform.deepseek.com) provider — first party, paid, per token.
 *
 * Every other provider in this app is a gateway to somebody else's free lane.
 * This one is the source: an OpenAI-compatible endpoint with a catalog of two
 * ids and a prepaid balance behind them. There is no free tier to detect, so the
 * rows are tagged `paid` with the published price, and a 402 means the balance is
 * empty rather than a daily allowance that resets.
 *
 * Thinking is on by default at DeepSeek and the chain of thought comes back in
 * `reasoning_content` beside the answer. pi already knows this format (it
 * auto-detects `thinking.type` + `reasoning_effort` from the DeepSeek host and
 * echoes the reasoning back on replayed assistant messages), which matters here:
 * with `tools` in the request DeepSeek answers 400 if a previous turn's
 * reasoning is not passed back, and this app always sends tools.
 */

const DEEPSEEK_PROVIDER = 'deepseek';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * Prices are published in two bands: peak and off-peak, where off-peak is half.
 * The rows carry the peak price — an estimate that can only overstate, never
 * flatter a balance that is about to run out.
 */
const DEEPSEEK_PLAN = 'paid';

const DEEPSEEK_MODEL_CANDIDATES = [
  {
    id: 'deepseek-flash',
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1048576,
    maxTokens: 393216,
    // Flash is the id that accepts images; Pro is text only.
    vision: true,
    cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    contextWindow: 1048576,
    maxTokens: 393216,
    vision: false,
    cost: { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 0 },
  },
];

/** `$0.30/$1.20` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** What pi's registerProvider expects. */
function deepseekProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : DEEPSEEK_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'DeepSeek',
    baseUrl: DEEPSEEK_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      // The chain of thought is a feature of the API, not of one id: both
      // models think unless the request turns it off.
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      // A text-only endpoint must never be handed an image part.
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 1048576,
      maxTokens: m.maxTokens || 393216,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function deepseekModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: DEEPSEEK_PROVIDER,
    id: m.id,
    name: m.name,
    plan: DEEPSEEK_PLAN,
    planNote: priceNote(m.cost),
  }));
}

/**
 * Prove a key before saving it. `GET /models` is the cheapest authenticated call
 * and also reports which ids this account can actually reach — DeepSeek retires
 * an id behind a legacy name (the old `deepseek-v4-flash` now answers as Flash),
 * so the catalog is intersected with the live list.
 *
 * A network failure is not a bad key and is reported separately as `offline`.
 */
async function checkDeepSeekKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a DeepSeek API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${DEEPSEEK_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach DeepSeek — check your connection (${message}).`,
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
 * - Reachable and none listed: empty — offering a retired id would fail every
 *   turn.
 * - Unreachable: the first candidate, so a flaky network does not hide a
 *   provider the user just configured.
 */
async function resolveDeepSeekModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkDeepSeekKey(key, { fetchImpl });
  if (check.ok) {
    const live = new Set(check.ids || []);
    return DEEPSEEK_MODEL_CANDIDATES.filter((m) => live.has(m.id)).map((m) => {
      const listed = (check.models || []).find((row) => row?.id === m.id);
      // `/models` reports the real window and cap per account; use them when
      // they are numbers, and stay with the published values when they are not.
      const contextWindow = Number(listed?.context_window);
      const maxTokens = Number(listed?.max_output_tokens);
      return {
        ...m,
        contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : m.contextWindow,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : m.maxTokens,
      };
    });
  }
  if (check.offline) return [DEEPSEEK_MODEL_CANDIDATES[0]];
  return [];
}

module.exports = {
  DEEPSEEK_PROVIDER,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_PLAN,
  DEEPSEEK_MODEL_CANDIDATES,
  deepseekProviderConfig,
  deepseekModelEntries,
  priceNote,
  checkDeepSeekKey,
  resolveDeepSeekModels,
};
