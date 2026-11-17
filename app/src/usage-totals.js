'use strict';

/**
 * Token accounting for one conversation.
 *
 * Every assistant message the SDK stores carries the provider's own `usage`
 * block (`input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`, `cost`).
 * Nothing here is estimated: a number is reported only because a provider
 * reported it, which is also why the same code works for every model — the
 * provider that omits usage simply contributes nothing.
 *
 * The figures are easy to confuse, so they are spelled out:
 *
 *   input     — the prompt the model had to read, excluding anything it found
 *               in its cache.
 *   cache     — `cacheRead + cacheWrite`: the same conversation re-sent on the
 *               next turn, read back from the provider's cache. In a long chat
 *               this dwarfs `input`, and it is billed at the cache price (free
 *               on most of the free tiers), so it is never folded into `input`.
 *   output    — the reply. `reasoning` is a subset of it for the providers that
 *               report it, so it is shown beside the figure, never added to it:
 *               adding it would overstate every reply.
 *   total     — what the session actually consumed: input + cache + output.
 *
 * A "turn" is one user message, because a single turn can ask the model several
 * times — every tool call is another request with its own usage block.
 *
 * A compaction rewrites the messages this is computed from, so the session total
 * starts again on its own. That is deliberate: after a summary the old numbers
 * no longer describe the conversation that is running.
 */

const FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function blank() {
  const out = { calls: 0, costUsd: 0, costReported: false };
  for (const field of FIELDS) out[field] = 0;
  return out;
}

/** Fold one `usage` block in. Returns false when there was nothing to fold. */
function add(into, usage) {
  if (!usage || typeof usage !== 'object') return false;
  into.calls += 1;
  for (const field of FIELDS) into[field] += num(usage[field]);
  const cost = usage.cost && typeof usage.cost === 'object' ? usage.cost : {};
  const total = cost.total !== undefined ? cost.total : usage.costUsd;
  const costUsd = num(total);
  into.costUsd += costUsd;
  // "Priced" means the provider told us a price — not that the price is zero.
  // Without it, a zero would have to be shown as "unknown", never as "free".
  if (costUsd > 0 || cost.totalFromProvider === true) into.costReported = true;
  return true;
}

function seal(bucket) {
  bucket.cache = bucket.cacheRead + bucket.cacheWrite;
  bucket.received = bucket.output || bucket.reasoning;
  bucket.sentAll = bucket.input + bucket.cache;
  bucket.sentPlusReplied = bucket.input + bucket.received;
  bucket.total = bucket.sentAll + bucket.received;
  return bucket;
}

/**
 * @param {Array} messages  `session.messages`, in order.
 * @param {{free?: boolean}} options  `free` marks a provider whose models cost
 *        nothing by design (FreePi), so a zero may honestly be called free.
 */
function usageTotals(messages, options = {}) {
  const session = blank();
  const turns = [];
  let current = null;
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || typeof message !== 'object') continue;
    if (message.role === 'user') {
      current = blank();
      turns.push(current);
      continue;
    }
    if (message.role !== 'assistant' || !message.usage) continue;
    if (!current) {
      current = blank();
      turns.push(current);
    }
    add(current, message.usage);
    add(session, message.usage);
  }
  const used = turns.filter((turn) => turn.calls > 0).map(seal);
  const result = { ...seal(session), free: Boolean(options.free), turns: used };
  // The comparison the panel shows, computed here so the arithmetic stays in one
  // place instead of being redone in the renderer.
  result.recent = recentTurns(result, 2);
  return result;
}

/** What one turn added over the turn before it. Negative when the turn was smaller. */
function turnDelta(a, b) {
  const out = {};
  for (const field of ['input', 'cache', 'received', 'sentAll', 'sentPlusReplied', 'total']) {
    out[field] = a[field] - b[field];
  }
  out.costUsd = a.costUsd - b.costUsd;
  return out;
}

/**
 * The last `count` turns, oldest first, each carrying the change from the turn
 * before it.
 *
 * Two figures side by side answer the real question — "is this turn costing more
 * than the last one?" — which a single number cannot, because it is forgotten by
 * the next turn. The earliest turn returned still gets a delta when there is a
 * turn before it, even though that turn is not shown: without it the comparison
 * would silently restart at zero.
 */
function recentTurns(totals, count = 2) {
  const turns = Array.isArray(totals && totals.turns) ? totals.turns : [];
  const out = [];
  for (let i = Math.max(0, turns.length - count); i < turns.length; i += 1) {
    out.push({ ...turns[i], delta: i > 0 ? turnDelta(turns[i], turns[i - 1]) : null });
  }
  return out;
}

module.exports = { usageTotals, recentTurns, turnDelta };