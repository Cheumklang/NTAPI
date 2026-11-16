'use strict';

/**
 * Automatic model switching when a free allowance runs out.
 *
 * The free lanes are rationed per account, so a turn can die with "429 ·
 * free_tier_limit_reached" while another free route still answers. The rule the
 * user asked for is deliberately narrow and needs no dialog:
 *
 *   - only DeepSeek routes, only the free ones;
 *   - walk the picker from the top down, skipping what already failed;
 *   - when every candidate is spent, stop trying and say so.
 *
 * This module is pure so the ordering rules can be tested without a session.
 */

const { isDeepSeekModel, isFreeModel } = require('./model-filter');

/**
 * Error texts that mean "this account is out of allowance", not "this request
 * was wrong". Everything here is worth another model; nothing else is.
 *
 * The provider error parser already maps most of these to a stable code, so the
 * code list is the reliable path and the text patterns cover raw bodies.
 */
const LIMIT_CODES = new Set([
  'rate_limit',
  'insufficient_quota',
  'quota_exceeded',
  'usage_limit',
  'usage_limit_reached',
  'limit_reached',
  'daily_limit_reached',
  'free_tier_limit_reached',
  'tokens_exhausted',
  'credit_exhausted',
  'out_of_budget',
  'subscription_limit',
  'monthly_limit',
]);

const LIMIT_TEXT = [
  /free[_\s-]?tier[_\s-]?limit/i,
  /\b429\b/,
  /too many requests/i,
  /rate[_\s-]?limit/i,
  /insufficient[_\s-]?(quota|credit|balance|funds)/i,
  /quota[_\s-]?(exceeded|reached|exhausted)/i,
  /(used up|ran out of|run out of|no longer available)[^.]{0,24}(quota|credit|balance|allowance|tokens)/i,
  /(daily|monthly|weekly)[_\s-]?limit[_\s-]?(reached|exceeded)/i,
  /exceeded[^.]{0,24}(quota|budget|allowance)/i,
  /out of budget/i,
];

/**
 * Failures where another model cannot help: a wrong key fails everywhere, a
 * dead network fails everywhere, and a context overflow is compaction's job.
 * These are checked first so a message that says both "limit" and "invalid key"
 * is not retried.
 */
const NOT_LIMIT_TEXT = [
  /invalid[_\s-]?(api[_\s-]?)?key/i,
  /unauthori[sz]ed/i,
  /\b401\b/,
  /unknown model|model[_\s-]?not[_\s-]?found/i,
  /context[_\s-]?(length|window|overflow)/i,
  /maximum context/i,
  /fetch failed|network|ECONNREFUSED|ENOTFOUND|socket hang up/i,
  /aborted|cancelled by the user|canceled by the user/i,
];

/**
 * @param {{ text?: string, code?: string }} error
 * @returns {boolean} true when switching models is worth a try.
 */
function isLimitError({ text, code } = {}) {
  const body = String(text || '');
  const normalizedCode = String(code || '').toLowerCase();

  if (NOT_LIMIT_TEXT.some((re) => re.test(body))) return false;
  if (normalizedCode && LIMIT_CODES.has(normalizedCode)) return true;
  if (!body) return false;
  return LIMIT_TEXT.some((re) => re.test(body));
}

/*
 * Two kinds of 429 want opposite answers.
 *
 * A requests-per-minute limit is exactly what pi's own backoff is for: wait the
 * few seconds it asks for and the *same* route answers. A free allowance that
 * is spent until a published reset will still be spent after that wait, so it
 * is worth cancelling the backoff and moving the turn to another route.
 *
 * `isLimitError` cannot tell them apart — both say 429 — and treating a short
 * throttle as a spent route is how a conversation died: the abort cancelled a
 * retry that would have worked, and the abort then hid the reason.
 */
const SPENT_CODES = new Set([
  'insufficient_quota',
  'quota_exceeded',
  'free_tier_limit_reached',
  'usage_limit',
  'usage_limit_reached',
  'limit_reached',
  'daily_limit_reached',
  'monthly_limit',
  'tokens_exhausted',
  'credit_exhausted',
  'out_of_budget',
  'subscription_limit',
]);

const SPENT_TEXT = [
  /insufficient[_\s-]?quota/i,
  /free[_\s-]?tier[_\s-]?limit/i,
  /(quota|allowance|balance|credits?)[^.]{0,24}(used up|exhausted|reached|spent|ran out)/i,
  /(used up|ran out of|run out of)[^.]{0,24}(quota|allowance|balance|credits?|tokens)/i,
  /(daily|monthly|weekly)[_\s-]?limit/i,
  /\b(comes? back|resets?) (on|at)\b/i,
  /out of budget/i,
];

const THROTTLE_CODES = new Set([
  'rate_limit',
  'rate_limit_error',
  'rate_limit_exceeded',
  'too_many_requests',
]);

const THROTTLE_TEXT = [
  /requests?[_\s-]?per[_\s-]?minute/i,
  /per[_\s-]?minute/i,
  /too many requests/i,
  /rate[_\s-]?limit/i,
  /try again in \d+(?:\.\d+)?\s*(?:ms|s|sec|secs|seconds?|minutes?|mins?)\b/i,
];

/**
 * @param {{ text?: string, code?: string }} error
 * @returns {boolean} true when waiting (not switching) is the right recovery.
 */
function isTransientThrottle({ text, code } = {}) {
  const body = String(text || '');
  const normalizedCode = String(code || '').toLowerCase();
  // Spending wording wins: "your free allowance is used up" is not a throttle,
  // even when the same body mentions requests per minute.
  if (normalizedCode && SPENT_CODES.has(normalizedCode)) return false;
  if (SPENT_TEXT.some((re) => re.test(body))) return false;
  if (normalizedCode && THROTTLE_CODES.has(normalizedCode)) return true;
  return THROTTLE_TEXT.some((re) => re.test(body));
}

/** Stable key for a model entry, so "tried" survives a rebuilt model list. */
function modelKey(model) {
  return model ? `${model.provider}/${model.id}` : '';
}

/**
 * Which model actually refused?
 *
 * At settle time `session.model` may already be the route we switched *to*, so
 * reading it there blamed the new model for a failure it never saw and skipped
 * it on the next try. Every assistant message records who answered — use that.
 *
 * @param {{role?: string, provider?: string, model?: string, responseModel?: string}} message
 * @returns {{provider: string, id: string, name: string}|null}
 */
function failedModelFromMessage(message) {
  if (!message || message.role !== 'assistant') return null;
  const provider = message.provider;
  const id = message.model || message.responseModel;
  if (!provider || !id) return null;
  return { provider, id, name: id };
}

/** True when two entries describe the same route. */
function sameModel(a, b) {
  if (!a || !b) return false;
  return modelKey(a) === modelKey(b);
}

/**
 * Every free DeepSeek route, in the order the picker shows them (top down).
 * Paid routes are excluded: the whole point is spending no money.
 *
 * @param {Array<object>} models
 * @returns {Array<object>}
 */
function freeDeepSeekOrder(models) {
  const seen = new Set();
  const out = [];
  for (const model of Array.isArray(models) ? models : []) {
    if (!model || !model.id || !model.provider) continue;
    if (!isDeepSeekModel(model) || !isFreeModel(model)) continue;
    const key = modelKey(model);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(model);
  }
  return out;
}

/**
 * The next model to try, or null when the pool is spent.
 *
 * @param {Array<object>} models
 * @param {{ current?: object|null, tried?: Iterable<string> }} [options]
 * @returns {object|null}
 */
function nextFallbackModel(models, { current = null, tried = [] } = {}) {
  const used = new Set(tried || []);
  if (current) used.add(modelKey(current));
  for (const model of freeDeepSeekOrder(models)) {
    if (used.has(modelKey(model))) continue;
    return model;
  }
  return null;
}

/**
 * The message shown when every free DeepSeek route has been tried and refused.
 * Deliberately says what to do next instead of only reporting a failure.
 *
 * @param {number} [triedCount]
 * @returns {string}
 */
function exhaustedMessage(triedCount = 0) {
  const count = Number(triedCount) > 0 ? ` (${triedCount} routes)` : '';
  return (
    `All free DeepSeek models are used up${count}. ` +
    'Nothing else can run until the provider resets the free allowance — ' +
    'wait for the reset, then send the message again.'
  );
}

/** One line that explains an automatic switch while it happens. */
function switchMessage(from, to) {
  const fromName = from ? from.name || from.id : 'the current model';
  const toName = to ? to.name || to.id : 'another free model';
  return `Free allowance reached on ${fromName}. Switched to ${toName} and carrying on from here.`;
}

module.exports = {
  isLimitError,
  isTransientThrottle,
  freeDeepSeekOrder,
  nextFallbackModel,
  modelKey,
  failedModelFromMessage,
  sameModel,
  exhaustedMessage,
  switchMessage,
  LIMIT_CODES,
};
