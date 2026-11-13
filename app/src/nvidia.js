'use strict';

/**
 * NVIDIA NIM (build.nvidia.com) provider.
 *
 * NVIDIA serves open-weight models over the OpenAI chat-completions API. This
 * app exposes only the DeepSeek Flash family, because the account uses the free
 * trial tier (40 requests/minute, 10,000/day) and the user does not want the
 * rest of NVIDIA's catalog in the picker.
 *
 * The free endpoints are retired without much notice, so the catalog is a list
 * of candidates intersected with `/v1/models` at key-save time. A retired id
 * disappears from the dropdown instead of failing a turn.
 *
 * The endpoint is text-only: `input` stays `['text']`, so no image is ever sent
 * here. Image questions belong on a provider that declares image input.
 */

const NVIDIA_PROVIDER = 'nvidia';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Preference order. Only the ids NVIDIA actually lists are kept, so the dropdown
 * can hold a subset depending on what is live and provisioned for the account.
 *
 * The Nemotron entries come first because they answered while DeepSeek Flash was
 * stuck on NVIDIA's side; DeepSeek stays available for when that endpoint
 * recovers. `vision` is per model: the Super VL endpoint accepts images, the
 * others are text only.
 */
const NVIDIA_MODEL_CANDIDATES = [
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b',
    name: 'Nemotron 3 Ultra',
    contextWindow: 1048576,
    maxTokens: 32768,
    vision: false,
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
    name: 'Nemotron 3.5 Super VL',
    contextWindow: 1048576,
    maxTokens: 32768,
    vision: true,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    name: 'Nemotron 3.5 Lightning',
    contextWindow: 1048576,
    maxTokens: 32768,
    vision: false,
  },
  {
    id: 'deepseek-ai/deepseek-v4.1-flash',
    name: 'DeepSeek V4.1 Flash',
    contextWindow: 1048576,
    maxTokens: 16384,
    vision: false,
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash-0731',
    name: 'DeepSeek V4 Flash 0731',
    contextWindow: 1048576,
    maxTokens: 16384,
    vision: false,
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    contextWindow: 1048576,
    maxTokens: 16384,
    vision: false,
  },
];

/** What pi's registerProvider expects. */
function nvidiaProviderConfig({ apiKey, models }) {
  const list = Array.isArray(models) && models.length ? models : NVIDIA_MODEL_CANDIDATES.slice(0, 1);
  return {
    name: 'NVIDIA',
    baseUrl: NVIDIA_BASE_URL,
    api: 'openai-completions',
    apiKey,
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: true,
      compat: { supportsDeveloperRole: false },
      // Per-model: only the Super VL endpoint accepts image parts.
      input: m.vision ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      // The published API cap varies per endpoint (DeepSeek: 16,384).
      contextWindow: m.contextWindow || 1048576,
      maxTokens: m.maxTokens || 16384,
    })),
  };
}

/** Model-dropdown entries, tagged with the provider. */
function nvidiaModelEntries(models) {
  const list = Array.isArray(models) ? models : [];
  return list.map((m) => ({ provider: NVIDIA_PROVIDER, id: m.id, name: m.name }));
}

/**
 * Prove a key before saving it. `GET /v1/models` is the cheapest authenticated
 * call and also tells us which DeepSeek ids are still live. A network failure
 * is not a bad key and is reported separately as `offline`.
 */
async function checkNvidiaKey(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 0, error: 'Enter an NVIDIA API key first.' };

  const doFetch = fetchImpl || fetch;
  const init = { headers: { accept: 'application/json', authorization: `Bearer ${key}` } };
  if (doFetch === fetch) init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(`${NVIDIA_BASE_URL}/models`, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      offline: true,
      status: 0,
      error: `Could not reach NVIDIA — check your connection (${message}).`,
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

/**
 * The catalog this machine can actually use.
 *
 * - No key: empty.
 * - Reachable and some candidates listed: just those.
 * - Reachable and none listed: empty, because the free endpoint is gone and
 *   offering a dead id would fail every turn.
 * - Unreachable: the first candidate, so a flaky network does not hide a
 *   provider the user just configured.
 */
async function resolveNvidiaModels(rawKey, { fetchImpl } = {}) {
  const key = String(rawKey || '').trim();
  if (!key) return [];

  const check = await checkNvidiaKey(key, { fetchImpl });
  if (check.ok) {
    const live = new Set(check.ids || []);
    return NVIDIA_MODEL_CANDIDATES.filter((m) => live.has(m.id));
  }
  if (check.offline) return [NVIDIA_MODEL_CANDIDATES[0]];
  return [];
}

module.exports = {
  NVIDIA_PROVIDER,
  NVIDIA_BASE_URL,
  NVIDIA_MODEL_CANDIDATES,
  nvidiaProviderConfig,
  nvidiaModelEntries,
  checkNvidiaKey,
  resolveNvidiaModels,
};
