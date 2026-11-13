'use strict';

/**
 * Token Harbor (tokenharbor.ai) provider.
 *
 * A gateway that speaks the OpenAI chat-completions API. Two kinds of route
 * live here: an explicit free route (`deepseek-v4.1-flash:free`, drawn on a
 * rolling 7-day allowance, no card required) and the wallet routes, which bill
 * per token. The `:free` suffix is the gateway's own marker, so a row's plan is
 * read from the id instead of a hard-coded list, and every other id the key can
 * call is listed as `paid`.
 *
 * Two conditions live in the dashboard rather than the API: the account email
 * must be verified, and free models must be switched on. Both surface as 403s,
 * which `provider-errors.js` explains.
 */

const TOKENHARBOR_PROVIDER = 'tokenharbor';
const TOKENHARBOR_BASE_URL = 'https://tokenharbor.ai/v1';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The free routes Token Harbor documents, kept here so an offline start still
 * shows the provider. Anything else the key can call is discovered at runtime.
 */
const TOKENHARBOR_MODEL_CANDIDATES = [
  {
    id: 'deepseek-v4.1-flash:free',
    name: 'DeepSeek V4.1 Flash (Free)',
    contextWindow: 1048576,
    maxTokens: 128000,
    vision: true,
    plan: 'free',
    planNote: '',
  },
  {
    id: 'mimo-v2.6-flash:free',
    name: 'MiMo V2.6 Flash (Free)',
    contextWindow: 1048576,
    maxTokens: 128000,
    vision: true,
    plan: 'free',
    planNote: '',
  },
];

/** Defaults for a wallet route discovered from `/v1/models`. */
function walletModel(id) {
  return {
    id,
    name: id,
    contextWindow: 1048576,
    maxTokens: 128000,
    // The gateway does not publish modalities with the id, and a text-only
    // endpoint must never be handed an image part.
    vision: false,
    plan: 'paid',
    planNote: 'wallet',
  };
}

/** What pi's registerProvider expects. */
function tokenharborProviderConfig({ apiKey, models }) {
  const list =
    Array.isArray(models) && models.length ? models : TOKENHARBOR_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'Token Harbor',
    baseUrl: TOKENHARBOR_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      // The documented free routes accept text and images; a discovered wallet
      // route is treated as text only until it says otherwise.
      input: m.vision === false ? ['text'] : ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 1048576,
      maxTokens: m.maxTokens || 128000,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider and its plan. */
function tokenharborModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({
    provider: TOKENHARBOR_PROVIDER,
    id: m.id,
    name: m.name,
    plan: m.plan || 'free',
    planNote: m.planNote || '',
  }));
}

/**
 * Prove a key before saving it, and learn which free ids are still listed.
 * A network failure is reported as `offline`, not as a bad key.
 */
async function checkTokenHarborKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter a Token Harbor key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${TOKENHARBOR_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach Token Harbor — check your connection (${message}).`,
    };
  }

  if (res.ok) {
    let ids = [];
    try {
      const body = await res.json();
      ids = Array.isArray(body?.data) ? body.data.map((m) => m?.id).filter(Boolean) : [];
    } catch {}
    return { ok: true, status: res.status, ids };
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
 * The catalog this account can actually call.
 *
 * - No key: empty.
 * - Reachable: the free routes that are still listed, then every other id the
 *   key can call as a wallet route — the picker labels them, the user chooses.
 * - Unreachable: the first known free route, so a flaky network does not hide
 *   a provider the user just configured.
 */
async function resolveTokenHarborModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkTokenHarborKey(key, { fetchImpl });
  if (check.ok) {
    const live = [...new Set(check.ids || [])];
    const known = TOKENHARBOR_MODEL_CANDIDATES.filter((m) => live.includes(m.id));
    const knownIds = new Set(known.map((m) => m.id));
    const wallet = live.filter((id) => !knownIds.has(id)).map(walletModel);
    return [...known, ...wallet];
  }
  if (check.offline) return [TOKENHARBOR_MODEL_CANDIDATES[0]];
  return [];
}

module.exports = {
  TOKENHARBOR_PROVIDER,
  TOKENHARBOR_BASE_URL,
  TOKENHARBOR_MODEL_CANDIDATES,
  tokenharborProviderConfig,
  tokenharborModelEntries,
  checkTokenHarborKey,
  resolveTokenHarborModels,
};
