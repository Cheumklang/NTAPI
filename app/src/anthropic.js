'use strict';

/**
 * Anthropic (platform.claude.com) provider — first party, paid, per token.
 *
 * Claude is served over the native Messages API, which pi speaks directly
 * (`api: 'anthropic-messages'`), so there is no OpenAI-compatibility shim
 * between this app and the model: tool calls, reasoning blocks and prompt
 * caching all behave the way Anthropic documents them.
 *
 * There is no free tier to detect, so every row is tagged `paid` with the
 * published price. `GET /v1/models` is the authority on what this key can
 * actually reach: Anthropic retires ids and moves them behind dated snapshots,
 * so the candidate families below are matched against the live list and only the
 * reachable ids reach the dropdown. A family with no live id disappears instead
 * of failing a turn.
 */

const ANTHROPIC_PROVIDER = 'anthropic';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
/** Pin the API version: the Messages API requires it on every request. */
const ANTHROPIC_VERSION = '2023-06-01';
const REQUEST_TIMEOUT_MS = 12000;

const ANTHROPIC_PLAN = 'paid';

/**
 * The families this app offers, newest first. `family` is matched against the
 * live ids (`claude-opus-4-5` and `claude-opus-4-5-20251101` are the same
 * model), `cost` is the published price per million tokens and doubles as the
 * badge on a paid row.
 */
const ANTHROPIC_MODEL_CANDIDATES = [
  {
    family: 'claude-opus-4-5',
    name: 'Claude Opus 4.5',
    contextWindow: 200000,
    maxTokens: 64000,
    vision: true,
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  },
  {
    family: 'claude-sonnet-4-5',
    name: 'Claude Sonnet 4.5',
    contextWindow: 200000,
    maxTokens: 64000,
    vision: true,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  },
  {
    family: 'claude-haiku-4-5',
    name: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxTokens: 64000,
    vision: true,
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  },
];

/** `$3.00/$15.00` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** What pi's registerProvider expects. */
function anthropicProviderConfig({ apiKey, models }) {
  const list =
    Array.isArray(models) && models.length ? models : ANTHROPIC_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Claude',
    baseUrl: ANTHROPIC_BASE_URL,
    api: 'anthropic-messages',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      // Every current Claude model thinks when asked; pi maps its thinking
      // levels onto the Messages API's thinking budget.
      reasoning: true,
      // Claude takes images natively on every current model.
      input: m.vision === false ? ['text'] : ['text', 'image'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 200000,
      maxTokens: m.maxTokens || 32000,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its price. */
function anthropicModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: ANTHROPIC_PROVIDER,
    id: m.id,
    name: m.name,
    plan: ANTHROPIC_PLAN,
    planNote: priceNote(m.cost),
    // The raw table as well: the window shows the price in the language's
    // currency, and a pre-formatted dollar string cannot be converted.
    cost: m.cost || null,
  }));
}

/** One page of `GET /v1/models`, following `has_more` up to a sane limit. */
async function fetchAnthropicModelIds(key, { fetchImpl } = {}) {
  const doFetch = fetchImpl || fetch;
  const ids = [];
  let after = null;
  for (let page = 0; page < 4; page += 1) {
    const url = new URL(`${ANTHROPIC_BASE_URL}/v1/models`);
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after_id', after);
    const init = {
      headers: {
        accept: 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    };
    if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await doFetch(url.toString(), init);
    if (!res.ok) return { ok: false, status: res.status, ids };
    const body = await res.json().catch(() => null);
    const data = Array.isArray(body?.data) ? body.data : [];
    for (const row of data) {
      if (typeof row?.id === 'string' && row.id) ids.push(row.id);
    }
    if (!body?.has_more || !data.length) break;
    after = data[data.length - 1]?.id || null;
    if (!after) break;
  }
  return { ok: true, status: 200, ids };
}

/**
 * Prove a key before saving it. `GET /v1/models` is the cheapest authenticated
 * call and also reports which ids this account can reach. A network failure is
 * not a bad key and is reported separately as `offline`.
 */
async function checkAnthropicKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Claude API key first.' };

  let result;
  try {
    result = await fetchAnthropicModelIds(key, { fetchImpl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Anthropic — check your connection (${message}).`,
    };
  }
  if (result.ok) return { ok: true, status: result.status, ids: result.ids };

  return {
    ok: false,
    status: result.status,
    // Never echo the key back, whatever the server said.
    error:
      result.status === 401
        ? 'Anthropic rejected this API key.'
        : `Anthropic did not accept the key (HTTP ${result.status}).`,
  };
}

/**
 * The catalog this account can call.
 *
 * - No key: empty.
 * - Reachable: the candidate families that have a live id, each pointed at the
 *   plain alias when it is served, otherwise at the newest dated snapshot.
 * - Unreachable: the first candidate, so a flaky network does not hide a
 *   provider the user just configured.
 */
async function resolveAnthropicModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkAnthropicKey(key, { fetchImpl });
  if (!check.ok) {
    return check.offline ? [toModel(ANTHROPIC_MODEL_CANDIDATES[0], ANTHROPIC_MODEL_CANDIDATES[0].family)] : [];
  }

  const live = Array.isArray(check.ids) ? check.ids : [];
  const out = [];
  for (const candidate of ANTHROPIC_MODEL_CANDIDATES) {
    // Exact alias first (Anthropic documents it as the stable id), then the
    // dated snapshot; dates sort newest-first as plain strings.
    const exact = live.find((id) => id === candidate.family);
    const dated = live
      .filter((id) => id.startsWith(`${candidate.family}-`))
      .sort((a, b) => b.localeCompare(a));
    const id = exact || dated[0];
    if (id) out.push(toModel(candidate, id));
  }
  return out;
}

function toModel(candidate, id) {
  return {
    id,
    name: candidate.name,
    contextWindow: candidate.contextWindow,
    maxTokens: candidate.maxTokens,
    vision: candidate.vision,
    cost: candidate.cost,
  };
}

module.exports = {
  ANTHROPIC_PROVIDER,
  ANTHROPIC_BASE_URL,
  ANTHROPIC_VERSION,
  ANTHROPIC_PLAN,
  ANTHROPIC_MODEL_CANDIDATES,
  priceNote,
  anthropicProviderConfig,
  anthropicModelEntries,
  fetchAnthropicModelIds,
  checkAnthropicKey,
  resolveAnthropicModels,
};