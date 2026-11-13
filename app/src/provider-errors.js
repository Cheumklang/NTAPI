'use strict';

/**
 * Turn a provider error into something a person can act on.
 *
 * pi hands us the raw body, e.g.
 *   403: {"message":"...","code":"ads_required","type":"free_pi_error"}
 * The code is the actionable part, so map the ones free-pi-cli maps too.
 *
 * Keep the distinction between the two blocks clear:
 *   ads_required  the backend did not see an ad for this turn
 *   hourly_ceiling a temporary rate limit, unrelated to ads and not a ban
 */
const ERROR_HINTS = {
  ads_required:
    'free-pi refused this turn because it did not see an ad. The app requests one before every turn, so press Send again. If it keeps happening, check your connection, then run `npx free-pi-cli@latest` once so the backend sees a current client.',
  hourly_ceiling:
    "You hit free-pi's hourly request limit — this is a temporary rate limit, not a ban and not an ad block. It clears by itself within the hour; then press Send again. Your daily credits are not affected.",
  daily_cap: 'Out of free credits for today — they refill at UTC midnight.',
  queue_wait: 'free-pi is near its daily budget — wait a moment and retry.',
  rolling_cap: 'Over the rolling spend cap on the free tier — wait for the retry window.',
  concurrent: 'Only one request at a time on the free tier — wait for the current one to finish.',
  concurrent_session:
    'This account is already at its session limit. Close other FreePi windows/tabs or run /close-other-session in the terminal, then retry.',
  context_ceiling: "This conversation is too large for free-pi's context limit — start a new session.",
  context_too_long: 'This conversation is too long — start a new session (or /compact in the terminal).',
  context_too_long_for_fallback:
    'This conversation is too long for the fallback model — start a new session or switch models.',
  upstream_error: 'The upstream model provider had an issue — retry.',
  model_at_capacity: 'This model is busy right now — retry in a few minutes or pick another model.',
  global_cap: 'free-pi is over its daily budget — come back tomorrow.',
  consent_required: 'Review and accept the current free-pi terms, then retry.',
  account_review: 'This account is under review — contact free-pi support.',
  guest_allowance: 'Guest trial used up — sign in with GitHub from Settings for the full daily allowance.',
  guest_login_required: 'This model needs a GitHub sign-in — use Sign in… in Settings.',
  guest_unavailable: 'This model needs a GitHub sign-in — use Sign in… in Settings.',
  upgrade_required: 'This client is out of date — run `npx free-pi-cli@latest`, then retry.',
  region_unavailable: 'free-pi is not available in your region.',
  model_requires_credits: 'This model needs purchased credits — switch to a free model or buy credits.',
  premium_allowance: 'Premium allowance used up today — switch to the default model.',
  reward_required: 'This model is for reward holders — switch to another model.',
  subagents_unavailable: 'Subagents need the free Particle model or purchased credits — switch models.',
};

/**
 * Coarena's failures read nothing like free-pi's: its 401 means the key itself
 * is wrong, and its limits are published per key. Kept separate so the same
 * code from free-pi can never be described as a Coarena problem.
 */
const COARENA_HINTS = {
  invalid_api_key: 'Coarena rejected this API key — open Settings, replace it, then retry.',
  rate_limit: 'Coarena allows 30 requests per minute. Wait a moment and try again.',
  rate_limit_exceeded: 'Coarena allows 30 requests per minute. Wait a moment and try again.',
  insufficient_quota: 'Coarena has no quota left today — it resets at UTC midnight.',
};

/**
 * Zro's failures are its own: a 401 is a bad key, a 402 means the key's balance
 * is empty, and a 429 is a short rate limit.
 */
const ZRO_HINTS = {
  invalid_api_key: 'Zro rejected this API key — open Settings, replace it, then retry.',
  rate_limit: 'Zro is rate limiting this key. Wait a moment and try again.',
  rate_limit_exceeded: 'Zro is rate limiting this key. Wait a moment and try again.',
  insufficient_quota: 'This Zro key has no balance left — top up the account or switch provider.',
};

/**
 * NVIDIA's free trial is shared capacity. A 429 is usually other people, not
 * this key's budget, so the copy never says "quota" — waiting is the fix.
 */
const NVIDIA_HINTS = {
  invalid_api_key: 'NVIDIA rejected this API key — open Settings, replace it, then retry.',
  unauthorized: 'NVIDIA rejected this API key — open Settings, replace it, then retry.',
  forbidden: 'NVIDIA trial access ended for this key — check the trial terms or use another provider.',
  rate_limit: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
  rate_limit_exceeded: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
  too_many_requests: 'NVIDIA shared capacity is busy right now — wait a moment and retry.',
  model_not_found:
    'This NVIDIA model was retired. Pick another model from the dropdown — the free endpoints rotate.',
  function_not_found:
    'This NVIDIA model was retired. Pick another model from the dropdown — the free endpoints rotate.',
};

const NETWORK_FAILURE_PATTERNS = [
  'fetch failed',
  'econnrefused',
  'enotfound',
  'etimedout',
  'econnreset',
  'socket hang up',
  'network error',
];

function looksLikeNetworkFailure(text) {
  const lower = String(text || '').toLowerCase();
  return NETWORK_FAILURE_PATTERNS.some((p) => lower.includes(p));
}

function parseProviderError(raw) {
  const text = String(raw || '').trim();
  let code = null;
  let message = '';
  const brace = text.indexOf('{');
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(text.slice(brace));
      code = parsed.code || parsed.error?.code || null;
      message = parsed.message || parsed.error?.message || '';
    } catch {}
  }
  const status = /^(\d{3})/.exec(text)?.[1] || null;
  return { code, message, status, text };
}

/**
 * @param {string} raw
 * @param {{ provider?: string }} [options] Provider-aware wording; omitted, the
 *   output is identical to the free-pi-only version this replaces.
 */
function friendlyProviderError(raw, { provider } = {}) {
  const { code, message, status, text } = parseProviderError(raw);
  let hint = null;
  if (provider === 'coarena') {
    if (code && COARENA_HINTS[code]) hint = COARENA_HINTS[code];
    else if (status === '401') hint = COARENA_HINTS.invalid_api_key;
    else if (status === '429') hint = COARENA_HINTS.rate_limit;
    // A dead network has no status and no code; the raw body would just say
    // "fetch failed", which tells the user nothing about which service is down.
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach Coarena — check your connection and retry.';
  } else if (provider === 'zro') {
    if (code && ZRO_HINTS[code]) hint = ZRO_HINTS[code];
    else if (status === '401') hint = ZRO_HINTS.invalid_api_key;
    else if (status === '402') hint = ZRO_HINTS.insufficient_quota;
    else if (status === '429') hint = ZRO_HINTS.rate_limit;
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach Zro — check your connection and retry.';
  } else if (provider === 'nvidia') {
    if (code && NVIDIA_HINTS[code]) hint = NVIDIA_HINTS[code];
    else if (status === '401') hint = NVIDIA_HINTS.invalid_api_key;
    else if (status === '403') hint = NVIDIA_HINTS.forbidden;
    else if (status === '429') hint = NVIDIA_HINTS.rate_limit;
    else if (status === '404') hint = NVIDIA_HINTS.model_not_found;
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach NVIDIA — check your connection and retry.';
  }
  if (!hint) hint = (code && ERROR_HINTS[code]) || message || text || 'The model request failed.';
  const suffix = status ? ` (HTTP ${status}${code ? ` · ${code}` : ''})` : '';
  return { text: `${hint}${suffix}`, code };
}

module.exports = { ERROR_HINTS, COARENA_HINTS, ZRO_HINTS, NVIDIA_HINTS, parseProviderError, friendlyProviderError };
