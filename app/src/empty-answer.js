'use strict';

/**
 * What to do when a turn ends with `finish_reason: "length"` and no answer.
 *
 * LLM7's free lane intermittently serves a trimmed route: it reports an absurdly
 * small prompt (`usage.prompt_tokens: 32`) and hard-caps the reply at 128 tokens.
 * A reasoning model then spends the whole cap thinking and returns nothing. The
 * route comes and goes within seconds, so the first move is to ask again; only
 * if that also comes back empty is the tab moved to a free model that answers
 * without reasoning first.
 *
 * Kept pure and separate from the Electron main process so the decision can be
 * tested without an app running.
 *
 * @param {object} input
 * @param {string} input.provider    provider of the failed turn
 * @param {string} input.model       model id of the failed turn
 * @param {string} input.plan        'free' | 'paid' for that model row
 * @param {boolean} input.reasoning  whether that model reasons before it writes
 * @param {number} input.attempts    recoveries already spent on this user turn
 * @param {boolean} input.hasPrompt  the user's message is still remembered
 * @param {string|null} input.fallbackId known-good free model to switch to
 * @returns {'repeat'|'switch'|null} null means "tell the user, do not retry"
 */
function nextRecoveryMove({ provider, model, plan, reasoning, attempts, hasPrompt, fallbackId }) {
  // Only the free lane trims output; a paid 128-token cut is a real answer limit
  // and retrying it would just burn credit.
  const repeatable = provider === 'llm7' && plan === 'free' && Boolean(hasPrompt);
  if (!repeatable) return null;

  if (attempts === 0) return 'repeat';

  const switchable = Boolean(reasoning) && Boolean(fallbackId) && fallbackId !== model;
  if (attempts === 1 && switchable) return 'switch';

  return null;
}

module.exports = { nextRecoveryMove };
