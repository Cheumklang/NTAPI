'use strict';

/**
 * Reading a provider's limit failures.
 *
 * This used to walk the free routes and switch models on its own. That was
 * removed: the model changing under the user, mid-conversation, was confusing —
 * people could not tell whether the app had done what they asked, and the switch
 * notice read like a second, unrelated event. The rule now is simple: the model
 * the user picked stays picked, and a spent allowance is reported as a spent
 * allowance.
 *
 * What is still needed is the reading part: telling a limit apart from a bad key
 * (never retried) and from a per-minute throttle (pi's own backoff handles it).
 * This module is pure so those rules can be tested without a session.
 */

/**
 * Error texts that mean "this account is out of allowance", not "this request
 * was wrong".
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
 * Failures where the allowance is not the story: a wrong key, a dead network, a
 * context overflow. Checked first so a message that says both "limit" and
 * "invalid key" is not reported as "out of allowance".
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
 * @returns {boolean} true when the account is out of allowance.
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
 * few seconds it asks for and the *same* route answers. Wording that says the
 * allowance is spent until a published reset will still be spent after that
 * wait, so cancelling the pointless backoff and reporting it is the honest
 * answer — the user then knows to wait for the reset.
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
 * @returns {boolean} true when waiting (not giving up) is the right recovery.
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

/**
 * The failure that ended this turn, from whichever record still has it.
 *
 * pi removes a failed attempt from its model projection when it schedules a
 * retry ("context_edit" with a null replacement). When this app cancels that
 * retry, the run settles with the message list already ending on the user's own
 * message: every settle-time reader then saw a normal turn, so a limited route
 * ended the conversation with no banner and no notice. The remembered limit is
 * the copy pi cannot take away.
 *
 * @param {{ messages?: Array<object>, limitFailure?: object|null, seq?: number }} [input]
 * @returns {{ text: string, provider: string|null, model: string|null }|null}
 */
function turnFailure({ messages = [], limitFailure = null, seq = 0 } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const last = list[list.length - 1];
  if (last && last.role === 'assistant' && (last.stopReason === 'error' || last.stopReason === 'aborted')) {
    return {
      text: last.errorMessage || limitFailure?.text || '',
      provider: last.provider || null,
      model: last.model || last.responseModel || null,
    };
  }
  if (limitFailure && limitFailure.seq === (seq || 0) && limitFailure.text) {
    return {
      text: limitFailure.text,
      provider: limitFailure.provider || null,
      model: limitFailure.model || null,
    };
  }
  return null;
}

module.exports = {
  isLimitError,
  isTransientThrottle,
  turnFailure,
  LIMIT_CODES,
};
