'use strict';

/**
 * Google AI Studio / Gemini API (aistudio.google.com) provider — first party,
 * paid with a free tier, per token.
 *
 * pi speaks Gemini natively (`api: 'google-generative-ai'`), so this app gets
 * function calling, thinking budgets and multimodal input straight from the
 * documented API rather than through an OpenAI-compatibility shim.
 *
 * `GET /v1beta/models` is public metadata per key and is the authority on what
 * this key can reach: it lists the full id (`models/gemini-2.5-pro`), the input
 * and output caps, and which generation methods each model supports. The
 * candidate families below are matched against that list, and a family with no
 * live id disappears from the dropdown instead of failing a turn.
 *
 * Plan tags: the Gemini API bills per token from the first request, and its
 * free tier is an allowance on the *account* rather than a per-model flag, so
 * every row is `paid` with the published price.
 */

const GOOGLE_PROVIDER = 'google';
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 12000;

const GOOGLE_PLAN = 'paid';

const DEFAULT_CONTEXT_WINDOW = 1048576;
const DEFAULT_MAX_TOKENS = 65536;

/**
 * The families this app offers, newest first. `family` is matched against the
 * live ids (`gemini-2.5-flash` and `gemini-2.5-flash-001` are the same model).
 * Prices are the published per-million-token rates for the paid tier and double
 * as the badge on a paid row.
 */
const GOOGLE_MODEL_CANDIDATES = [
  {
    family: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    contextWindow: 1048576,
    maxTokens: 65536,
    vision: true,
    cost: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 0 },
  },
  {
    family: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    contextWindow: 1048576,
    maxTokens: 65536,
    vision: true,
    cost: { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0 },
  },
  {
    family: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    contextWindow: 1048576,
    maxTokens: 65536,
    vision: true,
    cost: { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0 },
  },
];

/** `$0.30/$2.50` — the paid row's short cost hint, in the picker's own format. */
function priceNote(cost) {
  const fmt = (v) => `$${Number(v).toFixed(2)}`;
  if (!cost) return '';
  return `${fmt(cost.input)}/${fmt(cost.output)}`;
}

/** What pi's registerProvider expects. */
function googleProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : GOOGLE_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Gemini',
    baseUrl: GOOGLE_BASE_URL,
    api: 'google-generative-ai',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      // Every current Gemini model thinks; pi maps its thinking levels onto the
      // API's thinking budget.
      reasoning: true,
      input: m.vision === false ? ['text'] : ['text', 'image'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || DEFAULT_CONTEXT_WINDOW,
      maxTokens: m.maxTokens || DEFAULT_MAX_TOKENS,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its price. */
function googleModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: GOOGLE_PROVIDER,
    id: m.id,
    name: m.name,
    plan: GOOGLE_PLAN,
    planNote: priceNote(m.cost),
    // The raw table as well: the window shows the price in the language's
    // currency, and a pre-formatted dollar string cannot be converted.
    cost: m.cost || null,
  }));
}

/**
 * Prove a key before saving it.
 *
 * The key travels in the `x-goog-api-key` header rather than a query string, so
 * it never lands in a URL that a log or an error message might print. A network
 * failure is not a bad key and is reported separately as `offline`.
 */
async function checkGoogleKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Gemini API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = {
    headers: { accept: 'application/json', 'x-goog-api-key': key },
  };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${GOOGLE_BASE_URL}/models?pageSize=200`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Gemini — check your connection (${message}).`,
    };
  }

  if (res.ok) {
    const body = await res.json().catch(() => null);
    const rows = Array.isArray(body?.models) ? body.models : [];
    return { ok: true, status: res.status, models: rows };
  }

  let message = `HTTP ${res.status}`;
  let code = null;
  try {
    const body = await res.json();
    message = body?.error?.message || body?.message || message;
    code = body?.error?.status || body?.error?.code || null;
  } catch {}
  return {
    ok: false,
    status: res.status,
    code,
    // Defence in depth: a server message must never echo the key back.
    error: String(message).split(key).join('[key]'),
  };
}

/** `models/gemini-2.5-pro` -> `gemini-2.5-pro`. */
function bareId(name) {
  return String(name || '').replace(/^models\//, '');
}

/**
 * The catalog this account can call.
 *
 * - No key: empty.
 * - Reachable: the candidate families that have a live id, with the caps the
 *   API reports for that key. Only models that can `generateContent` count: the
 *   list also carries embedding and image-only entries.
 * - Unreachable: the first candidate, so a flaky network does not hide a
 *   provider the user just configured.
 */
async function resolveGoogleModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkGoogleKey(key, { fetchImpl });
  if (!check.ok) {
    return check.offline ? [toModel(GOOGLE_MODEL_CANDIDATES[0], GOOGLE_MODEL_CANDIDATES[0].family)] : [];
  }

  const rows = (Array.isArray(check.models) ? check.models : []).filter((row) => {
    const methods = row?.supportedGenerationMethods;
    return !Array.isArray(methods) || methods.includes('generateContent');
  });
  const live = rows.map((row) => bareId(row?.name)).filter(Boolean);

  const out = [];
  for (const candidate of GOOGLE_MODEL_CANDIDATES) {
    const exact = live.find((id) => id === candidate.family);
    // `-001`, `-002` … are numbered releases of the same family; newest sorts
    // last, so compare in reverse.
    const numbered = live
      .filter((id) => id.startsWith(`${candidate.family}-`))
      .sort((a, b) => b.localeCompare(a));
    const id = exact || numbered[0];
    if (!id) continue;
    const row = rows.find((r) => bareId(r?.name) === id) || null;
    const inputCap = Number(row?.inputTokenLimit);
    const outputCap = Number(row?.outputTokenLimit);
    out.push(
      toModel(candidate, id, {
        contextWindow: Number.isFinite(inputCap) && inputCap > 0 ? inputCap : candidate.contextWindow,
        maxTokens: Number.isFinite(outputCap) && outputCap > 0 ? outputCap : candidate.maxTokens,
      })
    );
  }
  return out;
}

function toModel(candidate, id, overrides = {}) {
  return {
    id,
    name: candidate.name,
    contextWindow: overrides.contextWindow || candidate.contextWindow,
    maxTokens: overrides.maxTokens || candidate.maxTokens,
    vision: candidate.vision,
    cost: candidate.cost,
  };
}

module.exports = {
  GOOGLE_PROVIDER,
  GOOGLE_BASE_URL,
  GOOGLE_PLAN,
  GOOGLE_MODEL_CANDIDATES,
  priceNote,
  googleProviderConfig,
  googleModelEntries,
  bareId,
  checkGoogleKey,
  resolveGoogleModels,
};