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
  'selftest-notice-i18n.js',
  'selftest-skill-menu.js',
  'selftest-skill-scan.js',
  'selftest-approval-policy.js',
  'selftest-approval-ui.js',
  'selftest-compact-queue.js',
  'selftest-queue-chrome.js',
  'selftest-reload-reattach.js',
  'selftest-history-merge.js',
  'selftest-hold-before-send.js',
  'selftest-update-splash.js',
  'selftest-attachments.js',
  'selftest-read-position.js',
  'selftest-turn-blocks.js',
  'selftest-turn-abort.js',
  'selftest-copy-button.js',
  'selftest-queue-edit.js',
  'selftest-queue-controls.js',
  'selftest-queue-edit-hold.js',
  'selftest-queue-number.js',
  'selftest-release-notes.js',
  'selftest-prune-releases.js',
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
  'selftest-coarena-free-tier.js',
  'selftest-retry-notice.js',
  'selftest-busy-state.js',
  'selftest-activity-state.js',
  'selftest-message-order.js',
  'selftest-notices.js',
  'selftest-legal-docs.js',
  'selftest-boot-skeleton.js',
  'selftest-installer-assets.js',
  'selftest-duration.js',
  'selftest-sidebar-min.js',
  'selftest-sponsor.js',
  'selftest-sponsor-feed.js',
  'selftest-sponsor-refresh.js',
  'selftest-usage-pill.js',
  'selftest-token-usage.js',
  'selftest-ad-label.js',
  'selftest-about-name.js',
  'selftest-sidebar-reset.js',
  'selftest-transcript-resilience.js',
  'selftest-transcript-speed.js',
  'selftest-update-handoff.js',
  'selftest-image-history.js',
  'selftest-image-review.js',
  'selftest-image-viewer.js',
  'selftest-deepseek.js',
  'selftest-anthropic.js',
  'selftest-google-ai.js',
  'selftest-follow-stream.js',
  'selftest-queue-edit-media.js',
  'selftest-session-date.js',
  'selftest-i18n-keys.js',
  'selftest-first-run-lang.js',
  'selftest-theme.js',
  'selftest-markup-structure.js',
  'selftest-notice-countdown.js',
  'selftest-llm7.js',
  'selftest-markdown.js',
  'selftest-mcp-config.js',
  'selftest-mcp-guard.js',
  'selftest-model-filter.js',
  'selftest-prompt-mode.js',
  'selftest-provider-errors.js',
  'selftest-reset-session.js',
  'selftest-provider-key.js',
  'selftest-provider-plan.js',
  'selftest-busy-guards.js',
  'selftest-provider-timeout.js',
  'selftest-resolve-sdk.js',
  'selftest-session-paths.js',
  'selftest-session-marks.js',
  'selftest-session-marks-ui.js',
  'selftest-single-instance.js',
  'selftest-sse-guard.js',
  'selftest-system-info.js',
  'selftest-update-channel.js',
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

/**
 * Catch a syntax error before running anything.
 *
 * An apostrophe inside a single-quoted label ("the composer's left edge") is
 * enough to break a file, and the only symptom was Electron throwing a dialog
 * during a manual check — the offline run happily reported everything passing
 * because it never parses the optional Electron scripts. Checking every file
 * under src/ and scripts/ makes that a test failure instead.
 */
const allJs = [];
for (const dir of ['src', 'scripts']) {
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        allJs.push(full);
      }
    }
  };
  walk(path.join(scriptsDir, '..', dir));
}

const badSyntax = [];
for (const file of allJs) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) badSyntax.push({ file, out: `${res.stdout || ''}${res.stderr || ''}` });
}
if (badSyntax.length) {
  console.error('');
  console.error(`${badSyntax.length} file(s) with a syntax error:`);
  for (const item of badSyntax) {
    const where = path.relative(path.join(scriptsDir, '..'), item.file);
    const head = item.out.trim().split(String.fromCharCode(10)).slice(0, 6).join(String.fromCharCode(10));
    console.error('');
    console.error(`--- ${where} ---`);
    console.error(head);
  }
  process.exit(1);
}
console.log(`Syntax OK: ${allJs.length} file(s)`);

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
