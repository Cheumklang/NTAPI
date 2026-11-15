'use strict';

/**
 * A publish must be visible on the next launch, not six hours later.
 *
 * The bug this guards against is invisible in a unit test of any single module:
 * the feed fetched fine, the cache wrote fine, the sidebar painted fine — it just
 * painted the *old* sponsor, because startup honoured the six-hour TTL and the
 * window had already drawn the cache before the refresh finished.
 *
 * So the checks are deliberately cross-file: the main process has to force the
 * revalidation, tell the window when the feed changed, and the renderer has to be
 * listening. Any one of the three missing brings the bug back.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const READ = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const main = READ('src/main.js');
const preload = READ('src/preload.js');
const renderer = READ('src/renderer/app.js');
const feedSrc = READ('src/sponsor-feed.js');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/** The app.whenReady body, so a match cannot come from a comment elsewhere. */
function startupBlock() {
  const at = main.indexOf('refreshSponsorFeed({ force: true })');
  assert.ok(at > 0, 'startup never forces a refresh');
  return main.slice(Math.max(0, at - 1600), at + 900);
}

check('boot revalidates the feed instead of trusting the cache', () => {
  const block = startupBlock();
  assert.match(block, /createWindow\(\)[\s\S]*refreshSponsorFeed\(\{ force: true \}\)/);
});

check('primeSponsorCache still runs, so the first frame is never blank', () => {
  const block = startupBlock();
  assert.match(block, /primeSponsorCache\(\)[\s\S]*refreshSponsorFeed/);
});

check('while the app is open the feed is polled every 30 seconds', () => {
  // The six-hour tick was the whole "I published it and nothing happened" bug:
  // a user who leaves the app running waited half a day. The live tick is 30
  // seconds, and the cache lifetime must not creep back in as the timer.
  const at = main.indexOf('sponsorRefreshTimer = setInterval(');
  assert.ok(at > 0, 'no refresh timer');
  const body = main.slice(at, at + 300);
  assert.match(body, /refreshSponsorFeed\(\)\.catch/);
  assert.match(body, /sponsorFeed\.REVALIDATE_MS/);
  assert.doesNotMatch(body, /sponsorFeed\.TTL_MS/, 'the six-hour cache lifetime is back as the live tick');
});

check('coming back to the window also checks the feed', () => {
  assert.match(main, /app\.on\('browser-window-focus',[\s\S]{0,160}refreshSponsorFeed\(\)/);
});

check('the live refresh asks with the cached validator', () => {
  const at = main.indexOf('async function refreshSponsorFeed');
  const body = main.slice(at, at + 2200);
  assert.match(body, /fetchFeed\(\{ etag: sponsorState\.etag \}\)/);
  assert.match(body, /if \(fetched\.unchanged\) \{/);
});

check('a change is detected by fingerprint, not just the published stamp', () => {
  const at = main.indexOf('async function refreshSponsorFeed');
  const body = main.slice(at, at + 2200);
  assert.match(body, /feedFingerprint\(fetched\.feed\)/);
  assert.match(body, /fingerprint !== sponsorState\.fingerprint/);
  assert.match(feedSrc, /function feedFingerprint\(feed\)/);
});

check('a changed feed is pushed to the window', () => {
  const at = main.indexOf('function refreshSponsorFeed');
  assert.ok(at > 0);
  const body = main.slice(at, at + 2600);
  assert.match(body, /if \(changed\) \{/);
  assert.match(body, /send\('sponsor:changed'/);
  // The push must sit inside the `changed` branch: an unchanged feed repainting
  // the strip would restart the rotation on every six-hourly check.
  const sendAt = body.indexOf("send('sponsor:changed'");
  const branchAt = body.indexOf('if (changed) {');
  assert.ok(sendAt > branchAt, 'the push happens on every refresh, not only on a change');
});

check('the push carries the feed timestamp, not the bytes', () => {
  assert.match(main, /send\('sponsor:changed', \{ updated: fetched\.feed\.updated \}\)/);
});

check('preload exposes the event through the contextBridge', () => {
  assert.match(preload, /onSponsorChanged: on\('sponsor:changed'\)/);
});

check('the renderer subscribes at boot', () => {
  assert.match(renderer, /initSponsor\(\);\s*\n\s*if \(typeof api\.onSponsorChanged === 'function'\) api\.onSponsorChanged\(reloadSponsor\)/);
});

check('reloading drops the cached creative bytes', () => {
  const at = renderer.indexOf('function reloadSponsor()');
  assert.ok(at > 0, 'no reloadSponsor()');
  const body = renderer.slice(at, at + 220);
  assert.match(body, /sponsorMediaCache\.clear\(\)/);
  assert.match(body, /sponsorMediaPending\.clear\(\)/);
  assert.match(body, /initSponsor\(\)/);
});

check('reloading cannot stack rotation timers', () => {
  const at = renderer.indexOf('function scheduleSponsorRotation()');
  assert.ok(at > 0);
  const body = renderer.slice(at, at + 240);
  assert.match(body, /clearInterval\(sponsorTimer\)/);
});

check('the cache lifetime is still a cache lifetime', () => {
  // TTL_MS no longer gates the live refresh — the 30-second tick does — but it
  // is still the window a cached feed may be trusted for on disk.
  assert.match(feedSrc, /const TTL_MS = 6 \* 60 \* 60 \* 1000;/);
  assert.match(feedSrc, /const REVALIDATE_MS = 30 \* 1000;/);
  assert.doesNotMatch(
    main,
    /if \(!force && sponsorFeed\.isFresh\(cached\)\) return sponsorState\.feed;/,
    'the live refresh is gated by the six-hour TTL again',
  );
});

check('a failed fetch still leaves the previous feed on screen', () => {
  const at = main.indexOf('async function refreshSponsorFeed');
  const body = main.slice(at, at + 900);
  assert.match(body, /if \(!fetched\) return sponsorState\.feed;/);
});

check('the payload carries each slot\'s published frame', () => {
  // The geometry harness invents `media.ratio` by hand, so it could never catch
  // this: the main process was dropping the field, the renderer fell back to
  // 2:1 for everything, and a square upload rendered as a letterboxed wide band.
  const at = main.indexOf('function sponsorPayload()');
  assert.ok(at > 0, 'no sponsorPayload()');
  const body = main.slice(at, at + 900);
  assert.match(body, /ratio: slot\.media\.ratio/);
  assert.match(renderer, /'9:16': 9 \/ 16/);
  assert.match(renderer, /function sponsorRatio\(slot\)/);
});

check('rotation needs more than one slot and the feed\'s own interval', () => {
  const at = renderer.indexOf('function scheduleSponsorRotation()');
  assert.ok(at > 0);
  const body = renderer.slice(at, at + 700);
  assert.match(body, /sponsor\.slots\.length < 2/);
  assert.match(body, /sponsorSlotIndex = \(sponsorSlotIndex \+ 1\) % sponsor\.slots\.length/);
  assert.match(body, /seconds \* 1000/);
});

console.log(`${pass} checks passed`);
