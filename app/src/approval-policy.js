/**
 * Who answers an approval request — the user, always, or never.
 *
 * The app used to answer that question in four places at once: a "don't ask
 * again" checkbox per tool, an "allow everything" switch, the browser autopilot,
 * and a pay/delete guard that was only ever wired into its own test. Whichever
 * one happened to be set decided whether a dialog appeared, so the same command
 * asked on Monday and ran silently on Tuesday. Worse, none of it survived a
 * restart, so the answer changed again on the next launch.
 *
 * This module replaces all of it with one setting the user picks and can see:
 *
 *   ask   — ask every time (the default; no memory, no exceptions)
 *   allow — never ask, run
 *   deny  — never ask, refuse
 *
 * The model, the provider, the tool and the tab make no difference. That is the
 * whole point: the answer must not depend on which model is active.
 *
 * Pure: no I/O, no Electron. The caller supplies the stored policy.
 */
'use strict';

/** The three answers, in the order the UI shows them. */
const POLICIES = ['ask', 'allow', 'deny'];

/** Every install starts by asking. Silence is only ever given on purpose. */
const DEFAULT_POLICY = 'ask';

/** What a decision means to the caller. */
const ASK = 'ask';
const ALLOW = 'allow';
const DENY = 'deny';

function isPolicy(value) {
  return typeof value === 'string' && POLICIES.includes(value);
}

/** Stored/UI value -> a policy we are willing to act on. */
function normalizePolicy(value) {
  return isPolicy(value) ? value : DEFAULT_POLICY;
}

/**
 * Older builds stored two ad-hoc switches instead of a policy. Read them so an
 * upgrade does not resurrect the "sometimes it asks" behaviour for someone who
 * had already turned prompts off on purpose.
 *
 * `allowEverything` wins over a per-tool grant: it was the broader promise.
 */
function policyFromLegacy({ allowEverything, allowedTools } = {}) {
  if (allowEverything === true) return 'allow';
  if (Array.isArray(allowedTools) && allowedTools.length) return 'allow';
  return DEFAULT_POLICY;
}

/**
 * The decision for one tool call.
 *
 * There is deliberately no argument for the model, the provider, the tab or the
 * tool: none of them may change the answer, and leaving them out makes that
 * impossible to break by accident.
 */
function decide(policy) {
  return normalizePolicy(policy);
}

/**
 * Should a dialog be shown at all, and what should happen if the user never
 * answers? `ask` shows it; the other two settle without the window.
 */
function needsDialog(policy) {
  return normalizePolicy(policy) === ASK;
}

module.exports = {
  POLICIES,
  DEFAULT_POLICY,
  ASK,
  ALLOW,
  DENY,
  isPolicy,
  normalizePolicy,
  policyFromLegacy,
  decide,
  needsDialog,
};
