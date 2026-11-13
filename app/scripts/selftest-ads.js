/**
 * Diagnostic: prove that one ad per turn unlocks free completions.
 *
 * Run from app/:   node scripts/selftest-ads.js
 *
 * 1. builds the app's ads client,
 * 2. fires its `session_start` handler (as pi would),
 * 3. prints the ad, the impression result and the turn id,
 * 4. asks the backend for a tiny completion with that same turn id.
 *
 * Exits non-zero when the completion is not 2xx, so it can be used as a check
 * after a free-pi backend change.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bridge = require('../src/freepi-bridge');

const credentials = path.join(os.homedir(), '.free-pi', 'agent', 'credentials.json');
const token = JSON.parse(fs.readFileSync(credentials, 'utf8')).token;
const baseUrl = bridge.resolveBaseUrl();

(async () => {
  let seenAd = null;
  const ads = bridge.adsClientFactory({
    baseUrl,
    getToken: () => token,
    sessionId: `selftest-${Date.now()}`,
    onAd: (ad) => {
      seenAd = ad;
    },
    log: (line) => console.log('log:', line),
  });

  const handlers = new Map();
  const fakePi = { on: (name, fn) => handlers.set(name, fn) };
  ads.extension.factory(fakePi);

  await handlers.get('session_start')();
  console.log('ad:', seenAd ? `${seenAd.creative.headline} [${seenAd.source}]` : 'NONE');
  if (!seenAd) {
    console.error('FAIL: no ad served, so the backend will keep answering 403 ads_required');
    process.exit(1);
  }

  const headers = {};
  await handlers.get('before_provider_headers')({ headers });
  console.log('turn header:', headers['x-turn-id'] || 'MISSING');
  if (!headers['x-turn-id']) {
    console.error('FAIL: completion would carry no turn id, so the ad would not count');
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-client-version': '0.6.20',
      'x-client-os': process.platform,
      'x-client-arch': process.arch,
      'x-session-id': `selftest-${Date.now()}`,
      'x-turn-id': headers['x-turn-id'],
    },
    body: JSON.stringify({
      model: 'deepseek-v4.1-flash',
      messages: [{ role: 'user', content: 'reply with the single word ok' }],
      max_tokens: 8,
    }),
  });
  const body = await res.text();
  console.log('completion:', res.status);
  if (!res.ok) {
    console.error('FAIL:', body.slice(0, 400));
    process.exit(1);
  }
  console.log('reply:', JSON.parse(body).choices?.[0]?.message?.content);
  console.log('PASS: ad -> impression -> completion');
  process.exit(0);
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
