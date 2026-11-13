'use strict';

/**
 * Token Harbor (tokenharbor.ai) provider.
 *
 * A gateway that speaks the OpenAI chat-completions API. This app exposes only
 * the free DeepSeek route (`deepseek-v4.1-flash:free`): a zero-cost model id on
 * a rolling 7-day allowance, no card required. Paid ids stay out of the picker
 * so a typo cannot spend the wallet.
 *
 * Two conditions live in the dashboard rather than the API: the account email
 * must be verified, and free models must be switched on. Both surface as 403s,
 * which `provider-errors.js` explains.
 */

const TOKENHARBOR_PROVIDER = 'tokenharbor';
const TOKENHARBOR_BASE_URL = 'https://tokenharbor.ai/v1';
const REQUEST_TIMEOUT_MS = 8000;

const TOKENHARBOR_MODEL_CANDIDATES = [
  {
    id: 'deepseek-v4.1-flash:free',
    name: 'DeepSeek V4.1 Flash (Free)',
    contextWindow: 1048576,
    maxTokens: 128000,
  },
];

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
      // The free route accepts text and images.
      input: ['text', 'image'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.contextWindow || 1048576,
      maxTokens: m.maxTokens || 128000,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider. */
function tokenharborModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({ provider: TOKENHARBOR_PROVIDER, id: m.id, name: m.name }));
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
 * The free catalog this account can actually call.
 *
 * - No key: empty.
 * - Reachable and the free id is listed: that entry.
 * - Reachable without it: empty, because the dashboard has free models off or
 *   the route rotated out. Offering a dead id would fail every turn.
 * - Unreachable: the candidate, so a flaky network does not hide the provider.
 */
async function resolveTokenHarborModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkTokenHarborKey(key, { fetchImpl });
  if (check.ok) {
    const live = new Set(check.ids || []);
    return TOKENHARBOR_MODEL_CANDIDATES.filter((m) => live.has(m.id));
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
