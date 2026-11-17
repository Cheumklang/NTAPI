'use strict';

/**
 * Telling a user's Stop apart from a provider that went quiet.
 *
 * Both end the same way on the wire: the request is aborted, and pi surfaces the
 * failure as "aborted" / "The operation was aborted" / "Request cancelled". The
 * stall wording ("X stopped responding — their side went quiet") is right for a
 * provider that never answered, and wrong for a stop the person pressed: it puts
 * a scary banner under a message they just cancelled, and sends them off to
 * switch models when nothing is broken.
 *
 * So the two are separated here, where it can be tested without Electron: an
 * abort-shaped sentence only counts as the user's own when a stop was requested
 * for the turn that is still running, and only while that request is recent. A
 * provider abort half a minute later is a real failure and is still reported.
 */

/** Sentences that mean "this request was aborted", not "the provider is slow". */
const ABORT_SHAPED = /\b(abort|aborted|aborting|cancell?ed|cancell?ing|interrupted)\b/i;

/** How long a Stop keeps swallowing abort-shaped failures. */
const USER_ABORT_WINDOW_MS = 20000;

/** @param {unknown} text */
function isAbortShaped(text) {
  return ABORT_SHAPED.test(String(text || ''));
}

/**
 * @param {object} input
 * @param {unknown} input.raw            the provider's failure sentence
 * @param {number} [input.seq]           the prompt number that is running
 * @param {{seq: number, at: number}|null} [input.userAbort]  the recorded Stop
 * @param {number} [input.now]
 * @param {number} [input.freshMs]
 * @returns {boolean} true when this failure is the user's own Stop
 */
function isUserAbort({ raw, seq, userAbort, now = Date.now(), freshMs = USER_ABORT_WINDOW_MS } = {}) {
  if (!userAbort || typeof userAbort.at !== 'number') return false;
  // A prompt sent after the Stop is a new turn: its failures are its own.
  if (Number(userAbort.seq) !== Number(seq ?? userAbort.seq)) return false;
  if (now - userAbort.at > freshMs) return false;
  return isAbortShaped(raw);
}

module.exports = { isAbortShaped, isUserAbort, USER_ABORT_WINDOW_MS, ABORT_SHAPED };