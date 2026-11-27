'use strict';

/**
 * Which free-pi-cli version this app claims to be.
 *
 * The backend compares the `x-client-version` header against the `min` it
 * publishes at `/client-version`, and answers HTTP 426 `upgrade_required` when
 * the header is lower. Two things went wrong before this module existed:
 *
 *   1. The detector ran once, at module load. Updating the CLI while the app was
 *      open changed nothing until the app restarted.
 *   2. The fallback (used when no CLI is installed) was a hardcoded older
 *      number, so a fresh machine without the CLI was rejected outright.
 *
 * So detection now happens per call, reads every place a CLI can live, and
 * never reports something older than the floor below. The floor is a promise
 * about the *protocol* this build speaks, not about the CLI's release number:
 * `0.6.21` is the version whose `/v1/chat/completions` contract this code
 * targets. Bumping it is the one manual step when the backend raises `min`.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Oldest CLI protocol this build speaks. Keep in step with the backend. */
const CLIENT_VERSION_FLOOR = '0.6.21';

/**
 * The floor actually in force.
 *
 * `CLIENT_VERSION_FLOOR` is only what this *build* was written against, and the
 * backend raises its `min` whenever it likes. A machine with no free-pi-cli
 * installed has nothing to read from disk, so it would otherwise be pinned to
 * a number that goes stale. `resolveClientVersionFloor` refreshes this from
 * `/client-version` at startup, which keeps such a machine working without an
 * app update. It only ever moves up.
 */
let activeFloor = CLIENT_VERSION_FLOOR;

/** The floor currently in force (hardcoded value, or a higher one from the backend). */
function clientVersionFloor() {
  return activeFloor;
}

/** Last resort when nothing can be read at all. */
const FALLBACK_CLIENT_VERSION = CLIENT_VERSION_FLOOR;

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function parseVersion(value) {
  if (typeof value !== 'string' || !VERSION_RE.test(value.trim())) return null;
  const [core] = value.trim().split(/[-+]/);
  const parts = core.split('.').map((n) => Number(n) || 0);
  return { raw: value.trim(), parts };
}

/** Compare two dotted versions: negative if a < b, 0 if equal, positive if a > b. */
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  for (let i = 0; i < 3; i += 1) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] - right.parts[i];
  }
  return 0;
}

function readPackageVersion(pkgJsonPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const version = parseVersion(parsed && parsed.version);
    return version ? version.raw : null;
  } catch {
    return null;
  }
}

/**
 * Every installed free-pi-cli version we can see, highest first.
 *
 * Read fresh on each call: a CLI the user updates mid-session must be visible
 * without a restart. Never throws — a missing directory is just no candidate.
 */
function installedClientVersions({ home = os.homedir() } = {}) {
  const found = [];

  const npxRoot = path.join(home, 'AppData', 'Local', 'npm-cache', '_npx');
  try {
    for (const dir of fs.readdirSync(npxRoot)) {
      const version = readPackageVersion(
        path.join(npxRoot, dir, 'node_modules', 'free-pi-cli', 'package.json')
      );
      if (version) found.push(version);
    }
  } catch {
    // No npx cache on this machine.
  }

  // A global `npm i -g free-pi-cli` lands here.
  for (const candidate of [
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', 'free-pi-cli', 'package.json'),
    path.join(home, 'AppData', 'Local', 'Roaming', 'npm', 'node_modules', 'free-pi-cli', 'package.json'),
  ]) {
    const version = readPackageVersion(candidate);
    if (version) found.push(version);
  }

  return [...new Set(found)].sort((a, b) => compareVersions(b, a));
}

/**
 * The version to put in `x-client-version`.
 *
 * An explicit override wins (handy for testing a new backend), then the highest
 * installed CLI, then the floor. The result is never below the floor: sending a
 * lower number only guarantees a 426 for no benefit.
 */
function detectClientVersion({ home = os.homedir(), env = process.env } = {}) {
  const override = parseVersion(env.FREEPI_CLIENT_VERSION);
  if (override) return override.raw;

  const floor = clientVersionFloor();
  const installed = installedClientVersions({ home });
  const newest = installed[0];
  if (newest && compareVersions(newest, floor) >= 0) return newest;
  return floor;
}

/**
 * What the backend says it currently accepts.
 *
 * Returns `{ min, latest }` or null. Used after a 426 so the retry sends a
 * number the server just told us is acceptable, instead of guessing again.
 */
async function fetchRequiredVersion(baseUrl, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!baseUrl) return null;
  try {
    const url = new URL('/client-version', baseUrl);
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const parsed = await res.json();
    const min = parseVersion(parsed && parsed.min);
    const latest = parseVersion(parsed && parsed.latest);
    if (!min && !latest) return null;
    return { min: min ? min.raw : null, latest: latest ? latest.raw : null };
  } catch {
    return null;
  }
}

/**
 * Adopt the `min` the backend publishes, at startup.
 *
 * This is what stops the app going stale on its own: the hardcoded floor is a
 * snapshot of the backend on the day the build was cut, and a machine with no
 * CLI installed has nothing newer to fall back on. Offline or a failed fetch
 * simply leaves the previous floor in place — the app still works.
 *
 * Returns the floor now in force.
 */
async function resolveClientVersionFloor({
  baseUrl,
  fetchImpl = fetch,
  env = process.env,
} = {}) {
  const required = await fetchRequiredVersion(baseUrl, { fetchImpl });
  const candidates = [required && required.min, required && required.latest, activeFloor, CLIENT_VERSION_FLOOR]
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a));
  const best = candidates[0];
  if (best && compareVersions(best, activeFloor) > 0) activeFloor = best;

  // An env override is the operator saying exactly what to send; it must not sit
  // below a floor we just raised, or the override stops meaning anything.
  const override = parseVersion(env.FREEPI_CLIENT_VERSION);
  if (override && compareVersions(activeFloor, override.raw) > 0) activeFloor = override.raw;
  return activeFloor;
}

/**
 * How long before a 426 recovery may run again for the same tab.
 *
 * The old gate allowed one attempt per tab for the tab's whole life, so a second
 * 426 in the same session was never recovered and the window kept showing the
 * same dead end. A cooldown stops a genuine mismatch from looping while letting
 * a later failure (a backend that raised `min` again) recover on its own.
 */
const UPGRADE_RETRY_COOLDOWN_MS = 15000;

/** Whether a 426 recovery may run now. `lastAttemptAt` 0/undefined means never. */
function shouldAttemptUpgradeRetry(lastAttemptAt, now = Date.now(), cooldownMs = UPGRADE_RETRY_COOLDOWN_MS) {
  if (!lastAttemptAt) return true;
  return now - lastAttemptAt >= cooldownMs;
}

/** Test seam: drop back to the hardcoded floor. */
function resetClientVersionFloor() {
  activeFloor = CLIENT_VERSION_FLOOR;
}

/**
 * Decide the header to send after the backend rejected us with 426.
 *
 * Highest of: what the server says it accepts, what is installed, and the
 * floor. Returns null when nothing could improve on what was already sent, so
 * the caller knows not to retry an identical request.
 */
async function upgradedClientVersion({
  baseUrl,
  sent,
  home = os.homedir(),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const required = await fetchRequiredVersion(baseUrl, { fetchImpl });
  const candidates = [required && required.latest, required && required.min, detectClientVersion({ home, env })]
    .filter(Boolean)
    .sort((a, b) => compareVersions(b, a));
  const best = candidates[0] || clientVersionFloor();
  if (sent && compareVersions(best, sent) <= 0) return null;
  return best;
}

/** True when a provider error body is the backend's "your client is too old". */
function isUpgradeRequired(text) {
  if (!text) return false;
  const raw = typeof text === 'string' ? text : JSON.stringify(text);
  return /upgrade_required/.test(raw) || /\b426\b/.test(raw);
}

module.exports = {
  CLIENT_VERSION_FLOOR,
  FALLBACK_CLIENT_VERSION,
  UPGRADE_RETRY_COOLDOWN_MS,
  shouldAttemptUpgradeRetry,
  clientVersionFloor,
  resolveClientVersionFloor,
  resetClientVersionFloor,
  compareVersions,
  detectClientVersion,
  installedClientVersions,
  fetchRequiredVersion,
  upgradedClientVersion,
  isUpgradeRequired,
};
