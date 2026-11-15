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
  assert.doesNotMatch(
    block,
    /\n\s*refreshSponsorFeed\(\)\.catch/,
    'a non-forced startup refresh is back — fresh cache means no publish until it ages out',
  );
});

check('primeSponsorCache still runs, so the first frame is never blank', () => {
  const block = startupBlock();
  assert.match(block, /primeSponsorCache\(\)[\s\S]*refreshSponsorFeed/);
});

check('the six-hour timer is forced too, not left a millisecond short of the TTL', () => {
  const at = main.indexOf('sponsorRefreshTimer = setInterval(');
  assert.ok(at > 0, 'no refresh timer');
  const body = main.slice(at, at + 260);
  assert.match(body, /refreshSponsorFeed\(\{ force: true \}\)/);
  assert.match(body, /sponsorFeed\.TTL_MS/);
});

check('a changed feed is pushed to the window', () => {
  const at = main.indexOf('function refreshSponsorFeed');
  assert.ok(at > 0);
  const body = main.slice(at, at + 1400);
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

check('the TTL still guards the cache read, it is only the boot path that ignores it', () => {
  assert.match(main, /if \(!force && sponsorFeed\.isFresh\(cached\)\) return sponsorState\.feed;/);
  assert.match(feedSrc, /const TTL_MS = 6 \* 60 \* 60 \* 1000;/);
});

check('a failed fetch still leaves the previous feed on screen', () => {
  const at = main.indexOf('async function refreshSponsorFeed');
  const body = main.slice(at, at + 700);
  assert.match(body, /if \(!fetched\) return sponsorState\.feed;/);
});

console.log(`${pass} checks passed`);
