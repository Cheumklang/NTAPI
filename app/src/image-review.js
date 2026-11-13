'use strict';

/**
 * Per-turn image review budget.
 *
 * A render-QC loop can open dozens of frames, which is slow, expensive and
 * pointless when the user watches the finished video. Each user turn gets a
 * small number of looks; a new turn starts a fresh budget.
 *
 * Pure so the counting is testable without a live model.
 */
function reviewAllowance(turn, state, max = 4) {
  const current = state && state.turn === turn ? state : { turn, used: 0 };
  if (current.used >= max) return { allowed: false, state: current };
  return { allowed: true, state: { turn, used: current.used + 1 } };
}

module.exports = { reviewAllowance };
