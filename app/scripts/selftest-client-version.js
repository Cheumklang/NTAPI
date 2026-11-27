/**
 * Which client version we claim to be, and how a 426 recovers.
 *
 * The failure this guards: the backend raises `min` in /client-version, the app
 * keeps sending its old hardcoded number, and every free-pi turn fails with
 * HTTP 426 `upgrade_required` — even on a machine whose CLI is current.
 *
 * Run from app/:   node scripts/selftest-client-version.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CLIENT_VERSION_FLOOR,
  compareVersions,
  detectClientVersion,
  installedClientVersions,
  fetchRequiredVersion,
  upgradedClientVersion,
  isUpgradeRequired,
  clientVersionFloor,
  resolveClientVersionFloor,
  resetClientVersionFloor,
  shouldAttemptUpgradeRetry,
  UPGRADE_RETRY_COOLDOWN_MS,
} = require('../src/client-version');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/** A throwaway home with the given CLI versions planted where detection looks. */
function fakeHome({ npx = [], roaming = [] } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-client-version-'));
  const writePkg = (dir, version) => {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.writeFileSync(dir, JSON.stringify({ name: 'free-pi-cli', version }));
  };
  npx.forEach((version, i) => {
    writePkg(path.join(home, 'AppData', 'Local', 'npm-cache', '_npx', `slot${i}`, 'node_modules', 'free-pi-cli', 'package.json'), version);
  });
  roaming.forEach((version) => {
    writePkg(path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'free-pi-cli', 'package.json'), version);
  });
  return home;
}

/* ---------------------------- version compare ---------------------------- */

check('compare: 0.6.20 is below 0.6.21', compareVersions('0.6.20', '0.6.21') < 0);
check('compare: 0.6.21 equals 0.6.21', compareVersions('0.6.21', '0.6.21') === 0);
check('compare: 0.10.0 is above 0.9.9', compareVersions('0.10.0', '0.9.9') > 0);
check('compare: a prerelease strip still compares by core', compareVersions('0.6.21-beta.1', '0.6.21') === 0);

/* ------------------------------ detection ------------------------------- */

{
  // The regression: only a Roaming CLI older than the floor. Detection must not
  // hand the backend a number it is guaranteed to reject.
  const home = fakeHome({ roaming: ['0.6.19'] });
  const version = detectClientVersion({ home, env: {} });
  check('an old Roaming CLI never drops below the floor', compareVersions(version, CLIENT_VERSION_FLOOR) >= 0, version);
}

{
  const home = fakeHome({ npx: ['0.6.19'], roaming: ['0.6.21'] });
  check('the highest installed CLI wins', detectClientVersion({ home, env: {} }) === '0.6.21');
}

{
  const home = fakeHome({ npx: ['0.6.21', '0.7.0'] });
  check('a newer CLI on disk is picked up immediately', detectClientVersion({ home, env: {} }) === '0.7.0');
}

{
  const home = fakeHome();
  const version = detectClientVersion({ home, env: {} });
  check('no CLI at all falls back to the floor, not something older', version === CLIENT_VERSION_FLOOR, version);
}

{
  const home = fakeHome({ npx: ['0.6.21'] });
  check('an explicit env override wins', detectClientVersion({ home, env: { FREEPI_CLIENT_VERSION: '0.9.9' } }) === '0.9.9');
  check('a junk env override is ignored', detectClientVersion({ home, env: { FREEPI_CLIENT_VERSION: 'latest' } }) === '0.6.21');
}

{
  // Detection runs per call, so a CLI installed while the app is open is seen.
  const home = fakeHome();
  const before = detectClientVersion({ home, env: {} });
  fs.mkdirSync(path.join(home, 'AppData', 'Local', 'npm-cache', '_npx', 'late', 'node_modules', 'free-pi-cli'), { recursive: true });
  fs.writeFileSync(
    path.join(home, 'AppData', 'Local', 'npm-cache', '_npx', 'late', 'node_modules', 'free-pi-cli', 'package.json'),
    JSON.stringify({ version: '0.8.0' })
  );
  const after = detectClientVersion({ home, env: {} });
  check('a CLI added mid-session is seen without a restart', before !== after && after === '0.8.0', `${before} -> ${after}`);
}

{
  const home = fakeHome({ npx: ['0.6.21', '0.6.21'] });
  check('duplicates collapse to one candidate', installedClientVersions({ home }).length === 1);
  check('a missing home is not an error', installedClientVersions({ home: path.join(os.tmpdir(), 'ntapi-nope-xyz') }).length === 0);
}

/* --------------------------- 426 recovery ------------------------------- */

function fakeFetch(body, { status = 200 } = {}) {
  return async () => ({ ok: status === 200, status, json: async () => body });
}

(async () => {
  const home = fakeHome({ npx: ['0.6.21'] });

  const required = await fetchRequiredVersion('https://api.example', {
    fetchImpl: fakeFetch({ min: '0.6.21', latest: '0.6.21' }),
  });
  check('reads min/latest from the backend', required && required.min === '0.6.21' && required.latest === '0.6.21', JSON.stringify(required));

  const dead = await fetchRequiredVersion('https://api.example', {
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  check('an unreachable backend yields null, not a throw', dead === null);

  // The backend wants 0.6.22 but nothing local has it: trust the server.
  const serverSays = await upgradedClientVersion({
    baseUrl: 'https://api.example',
    sent: '0.6.21',
    home,
    env: {},
    fetchImpl: fakeFetch({ min: '0.6.22', latest: '0.6.22' }),
  });
  check('after 426 the backend min is adopted', serverSays === '0.6.22', serverSays);

  // Already sending the newest the server names: no pointless retry.
  const same = await upgradedClientVersion({
    baseUrl: 'https://api.example',
    sent: '0.6.21',
    home,
    env: {},
    fetchImpl: fakeFetch({ min: '0.6.20', latest: '0.6.21' }),
  });
  check('no retry when nothing newer exists', same === null, same);

  /* ------------------------------ classifier ---------------------------- */

  check('426 body is recognised', isUpgradeRequired('HTTP 426 {"code":"upgrade_required"}'));
  check('bare code is recognised', isUpgradeRequired('{"code":"upgrade_required"}'));
  check('a 500 is not an upgrade problem', isUpgradeRequired('HTTP 500 upstream_error') === false);
  check('a normal message is not an upgrade problem', isUpgradeRequired('hey there') === false);
  check('null is safe', isUpgradeRequired(null) === false);

  /* --------------------------- startup floor ---------------------------- */

  // The point of the whole thing: a build cut months ago, on a machine with no
  // free-pi-cli installed, must still work after the backend raises `min`.
  {
    resetClientVersionFloor();
    const bareHome = fakeHome();
    const staleBuild = detectClientVersion({ home: bareHome, env: {} });
    check('no CLI means the build\'s own floor is used', staleBuild === CLIENT_VERSION_FLOOR, staleBuild);

    const raised = await resolveClientVersionFloor({
      baseUrl: 'https://api.example',
      env: {},
      fetchImpl: fakeFetch({ min: '0.7.4', latest: '0.7.9' }),
    });
    check('startup adopts the newer backend min', raised === '0.7.9', raised);

    const nowSending = detectClientVersion({ home: bareHome, env: {} });
    check('a machine with no CLI now sends the adopted version', nowSending === '0.7.9', nowSending);
    resetClientVersionFloor();
  }

  {
    // Offline must not break startup, and must not lower the floor either.
    resetClientVersionFloor();
    const offline = await resolveClientVersionFloor({
      baseUrl: 'https://api.example',
      env: {},
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    check('offline startup keeps the built-in floor', offline === CLIENT_VERSION_FLOOR, offline);
    resetClientVersionFloor();
  }

  {
    // The floor only moves up: an older `min` must not undo a newer one.
    resetClientVersionFloor();
    await resolveClientVersionFloor({ baseUrl: 'https://api.example', env: {}, fetchImpl: fakeFetch({ min: '0.9.0' }) });
    const older = await resolveClientVersionFloor({
      baseUrl: 'https://api.example',
      env: {},
      fetchImpl: fakeFetch({ min: '0.6.0', latest: '0.6.5' }),
    });
    check('the floor never moves backwards', older === '0.9.0', older);
    check('clientVersionFloor() reports the raised value', clientVersionFloor() === '0.9.0', clientVersionFloor());
    resetClientVersionFloor();
    check('reset restores the built-in floor', clientVersionFloor() === CLIENT_VERSION_FLOOR);
  }

  /* ----------------------- 426 retry window ------------------------------- */

  // The gate that broke: one attempt per tab for the tab's whole life meant the
  // second 426 in a session never recovered, so the user saw the same dead end
  // twice (this happened in the wild). A cooldown still stops a loop.
  {
    const now = 1_000_000;
    check('first 426 may recover', shouldAttemptUpgradeRetry(0, now) === true);
    check('second 426 inside the cooldown does not', shouldAttemptUpgradeRetry(now, now + 1000) === false);
    check(
      'a later 426 may recover again',
      shouldAttemptUpgradeRetry(now, now + UPGRADE_RETRY_COOLDOWN_MS) === true
    );
    check('an undefined attempt time is treated as never', shouldAttemptUpgradeRetry(undefined, now) === true);
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: client version detection and 426 recovery');
})();
