'use strict';

/**
 * Zro (zro.moonmath.ai) provider.
 *
 * Zro serves open-weight coding models over the OpenAI chat-completions API.
 * The catalog is static on purpose: a hard-coded list cannot drift into a
 * retired id, and each entry states its own plan because `/v1/models` returns
 * ids and aliases with no price attached.
 *
 * The Free plan includes daily usage on DeepSeek V4.1 Flash; every other model
 * bills against a usage pack, so those rows are tagged `paid` and carry their
 * list price. Vision is per model, read from each model page on the docs site:
 * only DeepSeek V4.1 Flash takes images, the rest are text only.
 */

const ZRO_PROVIDER = 'zro';
const ZRO_BASE_URL = 'https://zro.moonmath.ai/v1';
const REQUEST_TIMEOUT_MS = 8000;

const ZRO_MODELS = [
  {
    id: 'deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1000000,
    maxTokens: 65536,
    vision: true,
    // Included in the Free plan's daily allowance.
    plan: 'free',
    planNote: '',
  },
  {
    id: 'glm-5.3',
    name: 'GLM-5.3',
    contextWindow: 1000000,
    maxTokens: 131072,
    vision: false,
    plan: 'paid',
    planNote: '$1.40/$4.20',
  },
  {
    id: 'dolly2-security',
    name: 'Dolly 2 Security',
    contextWindow: 1000000,
    maxTokens: 131072,
    vision: false,
    plan: 'paid',
    planNote: '$2.10/$6.30',
  },
  {
    id: 'abyss1',
    name: 'Abyss 1',
    contextWindow: 1000000,
    maxTokens: 65536,
    vision: false,
    plan: 'paid',
    planNote: '$0.30/$1.10',
  },
  {
    // Prices as the routed model, so the row says so instead of showing a rate.
    id: 'auto',
    name: 'Auto (router)',
    contextWindow: 1000000,
    maxTokens: 131072,
    vision: false,
    plan: 'paid',
    planNote: 'routed',
  },
];

/** What pi's registerProvider expects. */
function zroProviderConfig({ apiKey }) {
  return {
    name: 'Zro',
    baseUrl: ZRO_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: ZRO_MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      // Zro lists text + image for this model; read/look_at_image can hand it
      // the picture directly instead of falling back to a second provider.
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function zroModelEntries() {
  return ZRO_MODELS.map((m) => ({
    provider: ZRO_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan || 'free',
    planNote: m.planNote || '',
  }));
}

/**
 * Prove a key before saving it. Zro has no key-metadata endpoint, so the model
 * list is the cheapest authenticated call. A network failure is not a bad key
 * and is reported separately as `offline`.
 */
async function checkZroKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Zro API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${ZRO_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Zro — check your connection (${message}).`,
    };
  }

  if (res.ok) return { ok: true, status: res.status };

  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    message = body?.error?.message || body?.message || message;
  } catch {}
  return {
    ok: false,
    status: res.status,
    // Defence in depth: a server message must never echo the key back.
    error: String(message).split(key).join('[key]'),
  };
}

module.exports = {
  ZRO_PROVIDER,
  ZRO_BASE_URL,
  ZRO_MODELS,
  zroProviderConfig,
  zroModelEntries,
  checkZroKey,
};
