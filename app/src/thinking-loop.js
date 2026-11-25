'use strict';

/**
 * Catching a model that has stopped moving and started repeating itself.
 *
 * A reasoning model can fall into a loop: the same paragraph or clause comes
 * back again and again while the turn never ends. From the outside the app just
 * looks busy forever, and the person has to press Stop and re-issue the job.
 * This watches the streamed thinking and says, conservatively, when the text has
 * started repeating.
 *
 * Conservative on purpose. A healthy model restates a short phrase ("let me
 * check", a variable name) several times, and a false positive would kill a good
 * turn. Only a long run of characters — the most recent 160 of them — coming
 * back three or more times inside a small window counts as a loop. A paraphrased
 * loop that never reuses an exact span is missed on purpose: that costs the user
 * only today's behaviour, while a wrong stop costs them the turn.
 */

const DEFAULTS = {
  windowChars: 2400, // how much recent thinking is remembered
  minChars: 160, // the tail span that must come back
  minRepeats: 3, // ... this many times before it is called a loop
  checkEvery: 120, // rescans at most once per this many new characters
};

/**
 * A resettable per-turn detector. `push(delta)` returns true the moment the
 * recent thinking looks like a loop; `reset()` starts a fresh window (a new
 * prompt, or the automatic continuation after a stop).
 */
function createLoopGuard(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  let recent = '';
  let sinceCheck = 0;

  return {
    push(delta) {
      const text = String(delta || '');
      if (!text) return false;
      recent += text;
      if (recent.length > cfg.windowChars) recent = recent.slice(-cfg.windowChars);
      sinceCheck += text.length;
      if (sinceCheck < cfg.checkEvery) return false;
      sinceCheck = 0;
      return looksLooping(recent, cfg);
    },
    reset() {
      recent = '';
      sinceCheck = 0;
    },
    get text() {
      return recent;
    },
  };
}

/**
 * Does this text contain an exact span that returns `minRepeats` times?
 *
 * The span tested is the *tail* — the most recent thing the model wrote — so a
 * loop is only flagged once the repetition has actually reached the present,
 * not when an older part of a long, healthy reasoning pass happens to rhyme.
 */
function looksLooping(text, opts = {}) {
  const { minChars, minRepeats } = { ...DEFAULTS, ...opts };
  const body = String(text || '');
  if (body.length < minChars * minRepeats) return false;
  const span = body.slice(-minChars);
  // A run that is only whitespace or punctuation has no reasoning in it to
  // repeat, and counting it would fire on formatting.
  if (span.replace(/[\s\p{P}]/gu, '').length < minChars / 2) return false;
  let count = 0;
  let at = body.indexOf(span);
  while (at !== -1) {
    count += 1;
    if (count >= minRepeats) return true;
    at = body.indexOf(span, at + 1);
  }
  return false;
}

module.exports = { createLoopGuard, looksLooping, DEFAULTS };
