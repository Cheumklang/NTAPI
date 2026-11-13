'use strict';

/**
 * The SDK option for a prompt sent while the agent is already working.
 *
 * pi throws when a prompt arrives during streaming without `streamingBehavior`:
 *   'steer'    delivered after the current assistant turn, before the next call
 *   'followUp' delivered only when the whole run finishes
 *
 * Idle prompts must not carry the option at all, so the caller can pass the
 * result straight through.
 */
function promptOptionsFor(isStreaming, mode) {
  if (!isStreaming) return undefined;
  return { streamingBehavior: mode === 'followUp' ? 'followUp' : 'steer' };
}

module.exports = { promptOptionsFor };
