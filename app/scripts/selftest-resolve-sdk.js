/**
 * Where the pi SDK is looked up, and that the bundled copy really loads.
 *
 * Run from app/:   node scripts/selftest-resolve-sdk.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sdkCandidatePaths } = require('../src/sdk-path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// A fake home with one npx cache slot, so the fallback order is testable.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sdk-'));
const npxRoot = path.join(home, 'AppData', 'Local', 'npm-cache', '_npx');
fs.mkdirSync(path.join(npxRoot, 'abc123', 'node_modules', '@earendil-works', 'pi-coding-agent'), {
  recursive: true,
});

const appDir = path.join('C:', 'app');
const tail = path.join('@earendil-works', 'pi-coding-agent');
const paths = sdkCandidatePaths({ appDir, home, env: { NTAPI_SDK_PATH: 'C:\\override' } });

check('bundled copy is tried first', paths[0] === path.join(appDir, 'node_modules', tail), paths[0]);
check('env override comes next', paths[1] === 'C:\\override', paths[1]);
check(
  'npx cache slots come last',
  paths.some((p) => p.includes('abc123') && p.endsWith(tail)),
  paths.join('\n')
);
check('no home means no npx scan', sdkCandidatePaths({ appDir }).length === 1);
check('a missing npx root is not an error', sdkCandidatePaths({ appDir, home: 'C:\\does-not-exist' }).length === 1);

fs.rmSync(home, { recursive: true, force: true });

// The bundled package must actually require (the whole point of Batch B).
const bundled = path.join(__dirname, '..', 'node_modules', ...['@earendil-works', 'pi-coding-agent']);
if (fs.existsSync(bundled)) {
  let sdk = null;
  let threw = false;
  try {
    sdk = require(bundled);
  } catch {
    threw = true;
  }
  check(
    'bundled SDK loads and exposes the API',
    !threw && typeof sdk?.SessionManager === 'function' && typeof sdk?.createMcpExtension === 'function',
    threw ? 'require threw' : `SessionManager=${typeof sdk?.SessionManager}`
  );
} else {
  check('bundled SDK is installed', false, 'run `npm install` in app/');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: the pi SDK resolves bundled-first and loads');
