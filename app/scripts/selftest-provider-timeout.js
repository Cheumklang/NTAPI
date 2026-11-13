/**
 * The window must not spin for five minutes when a provider goes silent.
 *
 * pi's default idle timeout is 300000 ms, which is fine for a terminal and awful
 * for a chat window: a stalled endpoint looks exactly like a frozen app. The
 * bridge passes a shorter value, and this keeps that value honest.
 *
 * Run from app/:   node scripts/selftest-provider-timeout.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PROVIDER_IDLE_TIMEOUT_MS, providerIdleTimeoutMs } = require('../src/provider-timeout');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

check('default is shorter than pi five minutes', DEFAULT_PROVIDER_IDLE_TIMEOUT_MS < 300000);
check('default leaves room for a slow first token', DEFAULT_PROVIDER_IDLE_TIMEOUT_MS >= 60000);
check('no env gives the default', providerIdleTimeoutMs({}) === DEFAULT_PROVIDER_IDLE_TIMEOUT_MS);
check('env overrides the default', providerIdleTimeoutMs({ FREEPI_PROVIDER_IDLE_TIMEOUT_MS: '45000' }) === 45000);
check('zero disables the override', providerIdleTimeoutMs({ FREEPI_PROVIDER_IDLE_TIMEOUT_MS: '0' }) === 0);
check('garbage falls back', providerIdleTimeoutMs({ FREEPI_PROVIDER_IDLE_TIMEOUT_MS: 'soon' }) === DEFAULT_PROVIDER_IDLE_TIMEOUT_MS);
check('negative falls back', providerIdleTimeoutMs({ FREEPI_PROVIDER_IDLE_TIMEOUT_MS: '-1' }) === DEFAULT_PROVIDER_IDLE_TIMEOUT_MS);

const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
check('the bridge actually sets httpIdleTimeoutMs', /httpIdleTimeoutMs:\s*providerIdleTimeoutMs\(\)/.test(bridge));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: a silent provider fails in this window, not after five minutes');
