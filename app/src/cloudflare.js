'use strict';

/**
 * Cloudflare Workers AI provider — OpenAI-compatible, priced per token.
 *
 * Unlike every other keyed provider here, one credential is not the whole
 * account: Workers AI is scoped to an account id, and the same token reaches
 * whatever that account runs. The window therefore asks for two values and this
 * module joins them into the base URL the OpenAI-compatible client talks to.
 *
 * Model ids carry an `@cf/` prefix and are namespaced by vendor (`@cf/meta/...`),
 * and Workers AI retires them, so the picker is built from the account's own
 * catalog rather than a list written here. The hand list below is only what the
 * picker falls back to when the catalog cannot be read at all.
 *
 * Every row of that catalog arrives with its own facts — `context_window`,
 * `price`, `vision`, `reasoning`, `function_calling`, and `require_workers_paid`
 * for the handful of frontier models a Workers Free plan cannot run. Labels are
 * therefore read from the API, not guessed: a model that draws on the free daily
 * allowance is offered as free, and one that needs the paid plan says so.
 */

const CLOUDFLARE_PROVIDER = 'cloudflare';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_PLAN = 'paid';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * What the picker falls back to when the catalog cannot be read at all: models
 * that have been on Workers AI for a long time, carrying the prices Cloudflare
 * publishes for them (USD per million tokens).
 */
const CLOUDFLARE_MODEL_CANDIDATES = [
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    name: 'meta/llama-3.3-70b-instruct-fp8-fast',
    contextWindow: 24000,
    maxTokens: 4096,
    vision: false,
    reasoning: false,
    plan: 'free',
    cost: { input: 0.293, output: 2.253, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    name: 'qwen/qwen2.5-coder-32b-instruct',
    contextWindow: 32000,
    maxTokens: 4096,
    vision: false,
    reasoning: false,
    plan: 'free',
    cost: { input: 0.66, output: 1, cacheRead: 0, cacheWrite: 0 },
  },
  {
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    name: 'meta/llama-3.2-11b-vision-instruct',
    contextWindow: 128000,
    maxTokens: 4096,
    vision: true,
    reasoning: false,
    plan: 'free',
    cost: { input: 0.0485, output: 0.676, cacheRead: 0, cacheWrite: 0 },
  },
];

/** `$0.29/$2.25` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost || (!cost.input && !cost.output)) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/**
 * The free rows a new chat should open on, best first.
 *
 * Workers Free cannot run the frontier models the catalog lists first — the
 * `require_workers_paid` rows answer 403 on every turn — so "whatever is row 0"
 * is not a usable default. A reasoning row that answers with only
 * `reasoning_content` is a poor opening too: it reads as an empty reply in a
 * plain chat. These are free-plan rows that answer normally through the
 * OpenAI-compatible endpoint.
 */
const PREFERRED_CLOUDFLARE_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/openai/gpt-oss-20b',
];

/** The best free row for a new chat: a preferred one, else any free row. */
function preferredCloudflareModel(models) {
  const list = Array.isArray(models) ? models.filter(Boolean) : [];
  const free = list.filter((m) => m.plan !== 'paid');
  for (const id of PREFERRED_CLOUDFLARE_MODELS) {
    const hit = free.find((m) => m.id === id);
    if (hit) return hit;
  }
  return free[0] || list[0] || null;
}

/** One `property` value out of a catalog row, or undefined. */
function propertyValue(properties, id) {
  const rows = Array.isArray(properties) ? properties : [];
  const row = rows.find((p) => p && p.property_id === id);
  return row ? row.value : undefined;
}

/** Workers AI quotes USD per million tokens; the app's rows speak the same unit. */
function costFromProperties(properties) {
  const value = propertyValue(properties, 'price');
  const rows = Array.isArray(value) ? value : [];
  const read = (unit) => {
    const row = rows.find((r) => String(r?.unit || '').includes(unit));
    const price = Number(row?.price);
    return Number.isFinite(price) && price > 0 ? price : 0;
  };
  return { input: read('input'), output: read('output'), cacheRead: read('cached input'), cacheWrite: 0 };
}

/**
 * Whether a catalog row is priced like a chat model, i.e. it charges for output.
 *
 * Cloudflare's own `clairic`/`clef` rows are tagged Text Generation but answer
 * with a set of fields, not a reply: the chat endpoint rejects them with
 * `required properties at '/' are 'model,fields'`. The catalog's own tell is the
 * price list — those rows quote an input rate only, while every model that
 * speaks chat also prices its output. Rows with no price at all (free or
 * unmetered) are kept: they still answer.
 */
function pricesItsOutput(properties) {
  const value = propertyValue(properties, 'price');
  const rows = Array.isArray(value) ? value : [];
  if (!rows.length) return true;
  return rows.some((r) => String(r?.unit || '').toLowerCase().includes('output'));
}

/**
 * One catalog row as a picker row, or null for a model that is not a chat model.
 *
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` keeps its vendor in the label: with
 * a whole catalog in one list, "which meta/qwen/zai model" is the first thing a
 * reader needs. Guard models are dropped — a moderation model answers with a
 * label, not a reply, and would fail every turn it was picked for.
 */
function cloudflareRowToModel(row) {
  const id = String(row?.name || '').trim();
  if (!id) return null;
  const tags = Array.isArray(row?.tags) ? row.tags : [];
  if (tags.includes('moderation')) return null;
  const properties = row?.properties;
  // Tagged Text Generation, but answers with fields instead of a reply — the
  // chat endpoint refuses it on every turn, so it must not reach the picker.
  if (!pricesItsOutput(properties)) return null;
  const paidOnly = String(propertyValue(properties, 'require_workers_paid') || '') === 'true';
  const contextWindow = Number(propertyValue(properties, 'context_window'));
  return {
    id,
    name: id.replace(/^@cf\//, ''),
    contextWindow: Number.isFinite(contextWindow) && contextWindow > 0 ? contextWindow : 24000,
    maxTokens: 4096,
    vision: String(propertyValue(properties, 'vision') || '') === 'true',
    reasoning: String(propertyValue(properties, 'reasoning') || '') === 'true',
    functionCalling: String(propertyValue(properties, 'function_calling') || '') === 'true',
    plan: paidOnly ? 'paid' : 'free',
    cost: costFromProperties(properties),
  };
}

/** The OpenAI-compatible endpoint for one account. */
function cloudflareBaseUrl(accountId) {
  const id = String(accountId || '').trim();
  return `${CLOUDFLARE_API}/accounts/${encodeURIComponent(id)}/ai/v1`;
}

/** What pi's registerProvider expects. */
function cloudflareProviderConfig({ apiKey, accountId, models }) {
  const list =
    Array.isArray(models) && models.length ? models : CLOUDFLARE_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Cloudflare',
    baseUrl: cloudflareBaseUrl(accountId),
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      compat: { supportsDeveloperRole: false },
      input: m.vision ? ['text', 'image'] : ['text'],
      // Whether a route thinks is the route's business; the catalog is asked
      // rather than assumed.
      reasoning: m.reasoning === true,
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 24000,
      maxTokens: m.maxTokens || 4096,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function cloudflareModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => {
    const paid = m.plan === 'paid';
    return {
      provider: CLOUDFLARE_PROVIDER,
      id: m.id,
      name: m.name,
      // Free means the account's daily Neuron allowance can run it; the paid
      // plan is only needed for the models the catalog flags.
      plan: paid ? 'paid' : 'free',
      planNote: paid ? priceNote(m.cost) || 'paidOnly' : '',
      freeTier: !paid,
      cost: m.cost || null,
    };
  });
}

/**
 * Prove the token *and* the account id before saving either.
 *
 * The account's model search is the cheapest call that needs both: a wrong token
 * is a 401, a wrong or foreign id is a 403/404. A network failure is not a bad
 * credential and is reported separately as `offline`.
 */
async function checkCloudflareKey(rawKey, accountId, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  const account = String(accountId || '').trim();
  if (!account) return { ok: false, status: 0, error: 'Enter your Cloudflare account id first.' };
  if (!key) return { ok: false, status: 0, error: 'Enter a Cloudflare API token first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  // Same call proves the credential and lists the account's chat models: the
  // task filter is what keeps image, embedding and speech models out of the
  // picker.
  const search = `${CLOUDFLARE_API}/accounts/${encodeURIComponent(account)}/ai/models/search?task=Text%20Generation&per_page=100`;

  let res;
  try {
    res = await doFetch(search, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Cloudflare — check your connection (${message}).`,
    };
  }

  if (res.ok) {
    let ids = [];
    let models = [];
    try {
      const body = await res.json();
      const rows = Array.isArray(body?.result) ? body.result : [];
      ids = rows.map((m) => m?.name || m?.id).filter(Boolean);
      models = rows;
    } catch {}
    return { ok: true, status: res.status, ids, models };
  }

  let message = `HTTP ${res.status}`;
  let code = null;
  try {
    const body = await res.json();
    const first = Array.isArray(body?.errors) ? body.errors[0] : null;
    message = first?.message || body?.error?.message || body?.message || message;
    code = first?.code || body?.error?.code || body?.code || null;
  } catch {}
  return {
    ok: false,
    status: res.status,
    code,
    // Defence in depth: a server message must never echo the token back.
    error: String(message).split(key).join('[key]'),
  };
}

/**
 * The account's own chat catalog, as the picker should offer it.
 *
 * - No key or no account id: empty.
 * - Reachable: every text-generation model the account can see, each with the
 *   facts the API published for it. A model retired from the catalog simply is
 *   not in this list, so no row can point at one.
 * - Unreachable, or a catalog that mapped to nothing: the shortlist below, so a
 *   flaky network never empties a picker the user just configured.
 */
async function resolveCloudflareModels(rawKey, accountId, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key || !String(accountId || '').trim()) return [];

  const check = await checkCloudflareKey(key, accountId, { fetchImpl });
  if (!check.ok) return CLOUDFLARE_MODEL_CANDIDATES.slice();

  const rows = Array.isArray(check.models) ? check.models : [];
  const models = rows.map(cloudflareRowToModel).filter(Boolean);
  if (!models.length) return CLOUDFLARE_MODEL_CANDIDATES.slice();

  // Free-plan rows first: the catalog opens with the frontier models a Workers
  // Free account cannot run, so a list drawn as-is starts with rows that answer
  // 403 on every turn. Sorting is stable — the catalog's own order is kept
  // inside each group.
  return models.slice().sort((a, b) => Number(a.plan === 'paid') - Number(b.plan === 'paid'));
}

module.exports = {
  CLOUDFLARE_PROVIDER,
  CLOUDFLARE_API,
  CLOUDFLARE_PLAN,
  CLOUDFLARE_MODEL_CANDIDATES,
  PREFERRED_CLOUDFLARE_MODELS,
  priceNote,
  cloudflareRowToModel,
  preferredCloudflareModel,
  cloudflareBaseUrl,
  cloudflareProviderConfig,
  cloudflareModelEntries,
  checkCloudflareKey,
  resolveCloudflareModels,
};
