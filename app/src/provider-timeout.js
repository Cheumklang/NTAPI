'use strict';

/**
 * How long a provider may sit silent before the turn is failed.
 *
 * pi's own default (`httpIdleTimeoutMs`) is 300000 ms. That is fine for a
 * terminal you can leave running, but in this window a stalled provider just
 * looks like a frozen app: the spinner turns, nothing streams, and the user has
 * no way to tell a slow model from a dead endpoint. NVIDIA's free DSV4 endpoint
 * reproduced exactly that — the request was accepted and then never answered.
 *
 * 90 s of complete silence is already far longer than any healthy first token
 * on the tiers this app uses (FreePi streams a banner before the model answers,
 * the keyed providers answer within a few seconds), so this only fires when
 * something is genuinely stuck. Set `FREEPI_PROVIDER_IDLE_TIMEOUT_MS` to change
 * it, or to `0` to fall back to pi's own five minutes.
 */

const DEFAULT_PROVIDER_IDLE_TIMEOUT_MS = 90000;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number} milliseconds; never negative.
 */
function providerIdleTimeoutMs(env = process.env) {
  const raw = Number(env?.FREEPI_PROVIDER_IDLE_TIMEOUT_MS);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_PROVIDER_IDLE_TIMEOUT_MS;
  return Math.floor(raw);
}

module.exports = { DEFAULT_PROVIDER_IDLE_TIMEOUT_MS, providerIdleTimeoutMs };