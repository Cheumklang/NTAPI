'use strict';

/**
 * Where the pi SDK can live, best candidate first. Kept pure (takes the pieces
 * it needs) so the order can be tested without Electron or a real install.
 *
 *   1. Bundled with the app — a fresh machine that never ran the CLI has no npx
 *      cache, and the whole point of this app is "no terminal needed".
 *   2. An explicit override via NTAPI_SDK_PATH / FREEPI_SDK_PATH.
 *   3. Every npx cache slot that carries the CLI's own copy.
 *
 * The path is a package *directory*: the SDK is ESM-only with an `exports` map
 * that has no `require` target, so resolving it by package name throws; requiring
 * the directory falls back to its `main` and works.
 */
const fs = require('node:fs');
const path = require('node:path');

const SDK_PACKAGE = ['@earendil-works', 'pi-coding-agent'];

function sdkCandidatePaths({ appDir, home, env = {} } = {}) {
  const out = [];

  if (appDir) out.push(path.join(appDir, 'node_modules', ...SDK_PACKAGE));

  for (const key of ['NTAPI_SDK_PATH', 'FREEPI_SDK_PATH']) {
    if (env[key]) out.push(env[key]);
  }

  if (home) {
    const npxRoot = path.join(home, 'AppData', 'Local', 'npm-cache', '_npx');
    try {
      for (const dir of fs.readdirSync(npxRoot)) {
        out.push(path.join(npxRoot, dir, 'node_modules', ...SDK_PACKAGE));
      }
    } catch {
      // No npx cache on this machine: the bundled copy (or the override) is it.
    }
  }

  return out;
}

module.exports = { sdkCandidatePaths, SDK_PACKAGE };
