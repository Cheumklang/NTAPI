/**
 * Run the offline selftests (no network, no API keys, no Electron window).
 *
 * CI uses this on a bare Windows runner. Each test is a plain Node script that
 * exits non-zero on failure, so the runner only needs to spawn and report.
 *
 * Run from app/:   node scripts/run-unit-tests.js
 *                 node scripts/run-unit-tests.js --list
 */
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Scripts that only touch Node built-ins and local fixtures. Anything that
 * needs a live provider key or an Electron window is deliberately absent —
 * those still run by hand (see .AGENT/HANDOFF.md).
 */
const TESTS = [
  'selftest-approval-policy.js',
  'selftest-approval-ui.js',
  'selftest-compact-queue.js',
  'selftest-queue-chrome.js',
  'selftest-reload-reattach.js',
  'selftest-history-merge.js',
  'selftest-hold-before-send.js',
  'selftest-update-splash.js',
  'selftest-browser-autopilot.js',
  'selftest-browser-bridge.js',
  'selftest-browser-claims.js',
  'selftest-browser-extension.js',
  'selftest-browser-snapshot.js',
  'selftest-browser-target.js',
  'selftest-browser-tools.js',
  'selftest-client-version.js',
  'selftest-error-ux.js',
  'selftest-model-fallback.js',
  'selftest-error-messages.js',
  'selftest-installer-assets.js',
  'selftest-duration.js',
  'selftest-sidebar-min.js',
  'selftest-empty-answer.js',
  'selftest-image-history.js',
  'selftest-image-review.js',
  'selftest-llm7.js',
  'selftest-markdown.js',
  'selftest-mcp-config.js',
  'selftest-mcp-guard.js',
  'selftest-model-filter.js',
  'selftest-prompt-mode.js',
  'selftest-provider-errors.js',
  'selftest-provider-key.js',
  'selftest-provider-plan.js',
  'selftest-provider-timeout.js',
  'selftest-resolve-sdk.js',
  'selftest-session-paths.js',
  'selftest-single-instance.js',
  'selftest-sse-guard.js',
  'selftest-system-info.js',
];

const scriptsDir = __dirname;

if (process.argv.includes('--list')) {
  for (const name of TESTS) console.log(name);
  process.exit(0);
}

const missing = TESTS.filter((name) => !fs.existsSync(path.join(scriptsDir, name)));
if (missing.length) {
  console.error(`missing test script(s): ${missing.join(', ')}`);
  process.exit(1);
}

const failed = [];
for (const name of TESTS) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const res = spawnSync(process.execPath, [path.join(scriptsDir, name)], {
    cwd: path.join(scriptsDir, '..'),
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  process.stdout.write(out);
  if (res.status !== 0) {
    failed.push({ name, status: res.status, signal: res.signal, out });
  }
}

if (failed.length) {
  console.error(`\n${failed.length}/${TESTS.length} test script(s) failed:`);
  for (const item of failed) {
    const tail = item.out.trim().split('\n').slice(-20).join('\n');
    console.error(`\n--- ${item.name} (exit ${item.status ?? item.signal}) ---\n${tail}`);
  }
  process.exit(1);
}

console.log(`\nPASS: all ${TESTS.length} offline test scripts passed`);
