'use strict';

/**
 * session-reset unit test.
 *
 * resetFreePiSession() calls the same endpoint free-pi-cli's
 * /close-other-session uses (POST /session/reset) so a user can free a stale
 * free-pi session from inside the app when the account is full
 * (`concurrent_session`). Tested against a fake fetch and a temp credentials
 * file — no network, no real account.
 *
 * Run: node scripts/selftest-reset-session.js
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resetFreePiSession } = require('../src/session-reset');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name} — ${err && err.message ? err.message : err}`);
  }
}

async function run() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-reset-'));
  const credPath = path.join(dir, 'credentials.json');
  const baseUrl = 'https://api.freepi.ai';

  const noCred = await resetFreePiSession({ credentialsPath: path.join(dir, 'missing.json'), baseUrl });
  check('no credentials file -> signed_out', () => {
    assert.strictEqual(noCred.ok, false);
    assert.strictEqual(noCred.code, 'signed_out');
  });

  fs.writeFileSync(credPath, JSON.stringify({ token: 'tok-123' }));

  const released = await resetFreePiSession({
    credentialsPath: credPath,
    baseUrl,
    fetchImpl: async (url, init) => {
      assert.strictEqual(String(url), `${baseUrl}/session/reset`);
      assert.strictEqual(init.method, 'POST');
      assert.strictEqual(init.headers.authorization, 'Bearer tok-123');
      return { ok: true, status: 200, json: async () => ({ released: true }) };
    },
  });
  check('a released session reports ok + released', () => {
    assert.strictEqual(released.ok, true);
    assert.strictEqual(released.released, true);
  });

  const none = await resetFreePiSession({
    credentialsPath: credPath,
    baseUrl,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ released: false }) }),
  });
  check('nothing running reports ok + released false', () => {
    assert.strictEqual(none.ok, true);
    assert.strictEqual(none.released, false);
  });

  const server = await resetFreePiSession({
    credentialsPath: credPath,
    baseUrl,
    fetchImpl: async () => ({ ok: false, status: 500 }),
  });
  check('server refusal -> code server', () => {
    assert.strictEqual(server.ok, false);
    assert.strictEqual(server.code, 'server');
  });

  const net = await resetFreePiSession({
    credentialsPath: credPath,
    baseUrl,
    fetchImpl: async () => {
      throw new Error('fetch failed');
    },
  });
  check('network failure -> code network', () => {
    assert.strictEqual(net.ok, false);
    assert.strictEqual(net.code, 'network');
  });

  fs.rmSync(dir, { recursive: true, force: true });

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll session-reset checks passed');
}

run().catch((err) => {
  console.error('selftest aborted:', err && err.stack ? err.stack : err);
  process.exit(1);
});