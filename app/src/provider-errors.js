'use strict';

const { MESSAGES } = require('./error-messages');

/**
 * English sentence -> message key.
 *
 * The wording below stays where it is (and stays English) because that is what
 * logs and tests expect. This map is how the same sentence gets a key the
 * renderer can translate into the language the user picked.
 */
const KEY_BY_TEXT = new Map(Object.entries(MESSAGES).map(([key, entry]) => [entry.en, key]));

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
  upgrade_required: 'This client is out of date — press Retry to update the connection automatically.',
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
  rate_limit:
    'Coarena limits this key to a set number of requests per minute — wait a few seconds and try again.',
  rate_limit_exceeded:
    'Coarena limits this key to a set number of requests per minute — wait a few seconds and try again.',
  insufficient_quota: 'Coarena has no quota left today — it resets at UTC midnight.',
  // Not the daily quota: a free key is refused this *model*, on a catalog that
  // prices everything at zero. Saying "quota" here sent people looking for a
  // reset that never comes.
  payment_required:
    'This model is not part of the Coarena free tier — pick a free model, or add credits to use it.',
};

/**
 * The models a free Coarena key may use, as named in its own refusal:
 *   "Free accounts can use GPT-6 Luna, Gemini 3.8 Flash and DeepSeek V4.1 Flash 1017."
 * Returns display names — the caller matches them against the catalog. An
 * unfamiliar sentence yields an empty list, never a guess.
 */
const FREE_TIER_PATTERN = /free accounts? can use (.+?)\.\s/i;

function parseFreeTierModels(message) {
  const match = FREE_TIER_PATTERN.exec(String(message || ''));
  if (!match) return [];
  return match[1]
    .split(/\s*,\s*|\s+and\s+/i)
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 20);
}

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
  account_not_enabled:
    'This NVIDIA account does not have Public API Endpoints access yet — the key can list models, but chat is blocked. Ask NVIDIA to enable it (help@build.nvidia.com) and retry.',
};

/**
 * Token Harbor's blockers are account setup, not the model: an unverified email
 * or free models left off both answer 403, and an exhausted weekly allowance
 * answers 402 without ever charging the wallet.
 */
const TOKENHARBOR_HINTS = {
  email_verification_required:
    'Token Harbor needs the account email verified — open the link they sent, then retry.',
  free_models_disabled:
    'Free models are switched off in the Token Harbor dashboard — enable them under Free, then retry.',
  vendor_not_allowed: 'This Token Harbor key is not allowed to use that model.',
  invalid_api_key: 'Token Harbor rejected this key — open Settings, replace it, then retry.',
  insufficient_quota:
    'The free allowance for this 7-day window is used up — it resets on its own; no charge was made.',
  rate_limit: 'Token Harbor allows 60 requests per minute on free accounts. Wait a moment and retry.',
  request_too_large: 'This request is over Token Harbor’s 4 MB limit — start a new chat or attach a smaller file.',
};

/**
 * LLM7 is a gateway in front of many vendors, so its failures are usually about
 * the token, the free-token allowance or one model's upstream. The free lane is
 * capped at 100,000 tokens per 24 hours.
 */
const LLM7_HINTS = {
  invalid_api_key: 'LLM7 rejected this token — open Settings, replace it, then retry.',
  insufficient_quota:
    'The LLM7 free-token allowance for today is used up (100,000 tokens per 24 hours). Wait for it to reset, or use a pro model with a topped-up balance.',
  rate_limit:
    'LLM7 allows 1 request a second, 60 a minute and 250 an hour on free tokens. Wait a moment and retry.',
  model_not_found:
    'LLM7 no longer lists this model. Pick another one from the dropdown — its catalog changes often.',
  content_filter: 'LLM7 blocked this request with its content filter. Rephrase it and retry.',
  service_unavailable:
    'LLM7’s upstream for this model is unavailable right now (it is their side, not your token). Retry in a few minutes, or pick another model.',
  upstream_error: 'The vendor behind LLM7 failed this request — retry, or pick another model.',
  request_timeout:
    'LLM7 accepted the request and never answered. Retry once; if it keeps going quiet, switch model.',
};

/**
 * DeepSeek bills a prepaid balance, so a 402 is the ordinary failure: the money
 * ran out, not the key, and the answer is a top-up rather than a new key.
 *
 * Thinking mode is on by default and its chain of thought must be replayed with
 * a tools request; a 400 on a turn that worked moments ago is almost always
 * that, which is fixed by starting a new chat rather than by retrying.
 */
const DEEPSEEK_HINTS = {
  invalid_api_key: 'DeepSeek rejected this API key — open Settings, replace it, then retry.',
  insufficient_balance:
    'This DeepSeek account has no balance left — top up at platform.deepseek.com, or pick another provider. Failed turns are not charged.',
  insufficient_quota:
    'This DeepSeek account has no balance left — top up at platform.deepseek.com, or pick another provider. Failed turns are not charged.',
  rate_limit: 'DeepSeek is rate limiting this account — wait a moment and retry.',
  rate_limit_exceeded: 'DeepSeek is rate limiting this account — wait a moment and retry.',
  model_not_found:
    'DeepSeek no longer serves this id. Pick the other model from the dropdown — its catalog is two ids.',
};

/**
 * A stalled request is not a network failure: the connection is fine, the other
 * end simply stopped answering. pi's idle timeout surfaces as an AbortError or
 * a plain "timed out", so both shapes are recognised here and each provider
 * gets its own advice, because what to do next depends on who went quiet.
 */
const STALL_PATTERNS = ['timed out', 'timeout', 'abort', 'timeouterror', 'etimedout'];

const STALL_HINTS = {
  coarena: 'Coarena stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
  zro: 'Zro stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
  nvidia:
    'NVIDIA accepted the request and never answered. This free endpoint is often slow to cold-start and can stay silent — retry once, then pick another model or provider.',
  tokenharbor:
    'Token Harbor stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
  llm7:
    'LLM7 stopped responding — the connection is fine, their side went quiet. Retry, or switch model.',
  deepseek:
    'DeepSeek accepted the request and never answered. A long reasoning pass can go quiet for minutes — wait, or start a new chat with a shorter question.',
  default: 'The model stopped responding — the connection is fine, the provider went quiet. Retry.',
};

function looksLikeStall(text) {
  const lower = String(text || '').toLowerCase();
  return STALL_PATTERNS.some((p) => lower.includes(p));
}

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
    else if (status === '402') hint = COARENA_HINTS.insufficient_quota;
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
    // A live 404 from this API often means the account lacks the "Public API
    // Endpoints" entitlement, not that the model id is wrong: /v1/models works,
    // every POST names a function "not found for account".
    if (/not found for account/i.test(text)) hint = NVIDIA_HINTS.account_not_enabled;
    else if (code && NVIDIA_HINTS[code]) hint = NVIDIA_HINTS[code];
    else if (status === '401') hint = NVIDIA_HINTS.invalid_api_key;
    else if (status === '403') hint = NVIDIA_HINTS.forbidden;
    else if (status === '429') hint = NVIDIA_HINTS.rate_limit;
    else if (status === '404') hint = NVIDIA_HINTS.model_not_found;
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach NVIDIA — check your connection and retry.';
  } else if (provider === 'tokenharbor') {
    if (code && TOKENHARBOR_HINTS[code]) hint = TOKENHARBOR_HINTS[code];
    else if (/free models/i.test(text)) hint = TOKENHARBOR_HINTS.free_models_disabled;
    else if (status === '401') hint = TOKENHARBOR_HINTS.invalid_api_key;
    else if (status === '402') hint = TOKENHARBOR_HINTS.insufficient_quota;
    else if (status === '413') hint = TOKENHARBOR_HINTS.request_too_large;
    else if (status === '429') hint = TOKENHARBOR_HINTS.rate_limit;
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach Token Harbor — check your connection and retry.';
  } else if (provider === 'llm7') {
    if (code && LLM7_HINTS[code]) hint = LLM7_HINTS[code];
    else if (status === '401') hint = LLM7_HINTS.invalid_api_key;
    else if (status === '402' || status === '403') hint = LLM7_HINTS.insufficient_quota;
    else if (status === '404') hint = LLM7_HINTS.model_not_found;
    else if (status === '429') hint = LLM7_HINTS.rate_limit;
    else if (looksLikeNetworkFailure(text)) hint = 'Could not reach LLM7 — check your connection and retry.';
  } else if (provider === 'deepseek') {
    // A 402 body says "Insufficient Balance" with an ordinary
    // `invalid_request_error` code, so the status and the sentence both decide.
    if (/insufficient balance/i.test(text)) hint = DEEPSEEK_HINTS.insufficient_balance;
    else if (code && DEEPSEEK_HINTS[code]) hint = DEEPSEEK_HINTS[code];
    else if (status === '401') hint = DEEPSEEK_HINTS.invalid_api_key;
    else if (status === '402') hint = DEEPSEEK_HINTS.insufficient_balance;
    else if (status === '429') hint = DEEPSEEK_HINTS.rate_limit;
    else if (status === '404') hint = DEEPSEEK_HINTS.model_not_found;
    else if (/reasoning_content/i.test(text)) {
      hint =
        'DeepSeek lost the reasoning of this chat, which thinking mode needs when tools are on — start a new chat and send the message again.';
    } else if (looksLikeNetworkFailure(text)) {
      hint = 'Could not reach DeepSeek — check your connection and retry.';
    }
  }
  // Only reached when no provider-specific branch matched: a stalled request
  // must not fall through to the raw "This operation was aborted", which reads
  // like the user cancelled rather than the provider going quiet.
  if (!hint && looksLikeStall(text)) hint = STALL_HINTS[provider] || STALL_HINTS.default;
  if (!hint) hint = (code && ERROR_HINTS[code]) || message || text || 'The model request failed.';
  // A provider body is JSON; nobody should have to read `{"message":…}` in the
  // chat window, so a body that failed to parse falls back to a plain sentence.
  if (/^\s*[[{]/.test(hint) || /\{\s*"/.test(hint)) hint = 'The model request failed — retry, or pick another model.';
  // A network failure names no provider code, so it gets the generic key; the
  // renderer still has one sentence per provider for the stall cases above.
  const suffix = status ? ` (HTTP ${status}${code ? ` · ${code}` : ''})` : '';
  const key = KEY_BY_TEXT.get(hint) || null;
  // Only Coarena publishes a free-tier list inside its refusals; other
  // providers get an empty array so callers can read the field unconditionally.
  const freeModels = provider === 'coarena' ? parseFreeTierModels(message) : [];
  return { text: `${hint}${suffix}`, code, key, status, freeModels };
}

module.exports = {
  KEY_BY_TEXT,
  ERROR_HINTS,
  COARENA_HINTS,
  ZRO_HINTS,
  NVIDIA_HINTS,
  TOKENHARBOR_HINTS,
  LLM7_HINTS,
  DEEPSEEK_HINTS,
  STALL_HINTS,
  parseProviderError,
  parseFreeTierModels,
  friendlyProviderError,
};
