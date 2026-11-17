'use strict';

/**
 * Free a stale free-pi session on the account.
 *
 * free-pi allows 4 running sessions per account. A tab closed in this app does
 * not close its server-side session (there is no per-session close endpoint the
 * app calls), so tabs opened and closed over time can fill the account and make
 * every new tab unable to send (`concurrent_session`). This is the same call
 * free-pi-cli's `/close-other-session` makes: POST /session/reset. The server
 * answers `{ released }` — true when a session was actually freed, false when
 * none was running.
 *
 * Kept in its own module (no bridge dependency) so a plain-node selftest can
 * exercise it against a fake fetch.
 */

const fs = require('node:fs');

/**
 * @param {{ credentialsPath: string, baseUrl: string, fetchImpl?: Function }} [options]
 * @returns {Promise<{ok: boolean, released?: boolean, code?: string, error?: string}>}
 */
async function resetFreePiSession({ credentialsPath, baseUrl, fetchImpl = fetch } = {}) {
  let jwt = '';
  try {
    jwt = JSON.parse(await fs.promises.readFile(credentialsPath, 'utf8')).token || '';
  } catch {}
  if (!jwt) {
    return { ok: false, code: 'signed_out', error: 'Sign in to free-pi first.' };
  }
  try {
    const res = await fetchImpl(new URL('/session/reset', baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (res.ok) {
      let released = false;
      try {
        released = Boolean((await res.json()).released);
      } catch {}
      return { ok: true, released };
    }
    return { ok: false, code: 'server', error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, code: 'network', error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { resetFreePiSession };