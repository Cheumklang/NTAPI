'use strict';

/**
 * USD → THB, for showing what a paid turn cost in the currency the reader
 * thinks in.
 *
 * The rate moves, so it is fetched rather than hard-coded — but it is fetched
 * rarely and never as part of sending a prompt: at most once every six hours,
 * and only when the numbers are actually about to be displayed. The last good
 * rate is kept in memory, so a network failure degrades to the previous figure
 * instead of to nothing, and a failure is never allowed to throw into a UI
 * paint.
 *
 * The request carries no account, no key and no usage data — it is a plain GET
 * for a public rate table, which is why PRIVACY.md lists it next to the other
 * outbound calls.
 */

const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 6 * 60 * 60 * 1000;

let cache = { rate: null, at: 0 };

function lastGood(error, extra = {}) {
  return { rate: cache.rate, at: cache.at, cached: true, stale: true, error, ...extra };
}

/**
 * @param {{force?: boolean, fetchImpl?: Function}} options
 * @returns {Promise<{rate: number|null, at: number, cached?: boolean, stale?: boolean, error?: string}>}
 *          Never rejects: the caller paints "—" when there is no rate.
 */
async function fetchUsdThb(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = Date.now();
  if (!options.force && cache.rate && now - cache.at < TTL_MS) {
    return { rate: cache.rate, at: cache.at, cached: true };
  }
  if (typeof fetchImpl !== 'function') return lastGood('no-fetch');
  try {
    const res = await fetchImpl(ENDPOINT, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return lastGood(`HTTP ${res.status}`);
    const data = await res.json();
    const rate = Number(data && data.rates && data.rates.THB);
    if (!Number.isFinite(rate) || rate <= 0) return lastGood('no-rate');
    cache = { rate, at: now };
    return { rate, at: now, cached: false };
  } catch (err) {
    return lastGood(err && err.message ? err.message : 'network');
  }
}

function resetCache() {
  cache = { rate: null, at: 0 };
}

module.exports = { fetchUsdThb, resetCache, ENDPOINT, TTL_MS };