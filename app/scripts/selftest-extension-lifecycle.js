/**
 * Offline guard for the extension lifecycle hook.
 *
 * A pi session hands extensions `session_start` only from `bindExtensions`,
 * which the TUI and the CLI call right after building the session. This app is a
 * windowed host and used to skip that call, so every extension that keys its
 * state off the event stayed switched off: claude-mem never anchored, recorded
 * nothing, and looked installed while sitting idle. Ponytail's ruleset lives in
 * `before_agent_start` behind the same event.
 *
 * The failure mode is silent — no error, no log, just a feature that does
 * nothing — so it is pinned here rather than left to a live session.
 *
 * Run: node scripts/selftest-extension-lifecycle.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const bridge = fs.readFileSync(path.join(root, 'src', 'freepi-bridge.js'), 'utf8');

check(
  'the session binds its extensions, which is what emits session_start',
  /await session\.bindExtensions\(/.test(bridge)
);

const builtAt = bridge.indexOf('sdk.createAgentSessionFromServices(');
const boundAt = bridge.indexOf('await session.bindExtensions(');
check(
  'the binding happens right after the session is built, before any prompt',
  builtAt !== -1 && boundAt > builtAt && boundAt - builtAt < 2000,
  `createAgentSessionFromServices at ${builtAt}, bindExtensions at ${boundAt}`
);

check(
  'a failing extension cannot take the window down with it',
  /try\s*\{\s*await session\.bindExtensions\([\s\S]{0,200}?catch/.test(bridge),
  'an extension that throws in session_start must be logged, not fatal'
);

check(
  'no terminal mode is claimed, because there is no terminal',
  /bindExtensions\(\{\s*mode:\s*'print'\s*\}\)/.test(bridge)
);

// The event is only useful if the SDK still emits it from that call.
const sessionSource = path.join(
  root,
  'node_modules',
  '@earendil-works',
  'pi-coding-agent',
  'dist',
  'core',
  'agent-session.js'
);
if (fs.existsSync(sessionSource)) {
  const sdk = fs.readFileSync(sessionSource, 'utf8');
  check(
    'the SDK emits session_start from bindExtensions',
    /bindExtensions\(bindings\)\s*\{[\s\S]{0,1200}?_extensionRunner\.emit\(this\._sessionStartEvent\)/.test(sdk)
  );
} else {
  console.log('skip the SDK assertion (the SDK is not vendored beside the app)');
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll extension lifecycle checks passed');
process.exit(failures ? 1 : 0);