/**
 * Nothing waits on the network before a chat can be drawn.
 *
 * Three things made a launch slow enough to be reported as "loading chats is
 * very slow" (2026-11-26): every restored tab awaited a banner-ad fetch inside
 * `session_start`, the tabs were opened one after another, and every launch
 * re-asked each provider for its model list. Each is checked here in the source,
 * because all three hides inside a big function where a later edit puts the
 * wait back without anything failing.
 *
 * Run from app/:   node scripts/selftest-startup-speed.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const bridge = fs.readFileSync(path.join(SRC, 'freepi-bridge.js'), 'utf8');
const main = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(SRC, 'renderer', 'app.js'), 'utf8');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/* 1. A banner ad must never be on the path of opening a tab. */
check(
  'ads: session_start does not await the ad fetch',
  !/pi\.on\(\s*['"]session_start['"][\s\S]{0,200}?prefetchLaunchAd/.test(bridge),
  'a session_start handler still calls prefetchLaunchAd()'
);
check(
  'ads: the ad is still requested, off the critical path',
  /prefetchLaunchAd\(\)\.catch/.test(bridge) && /void prefetchLaunchAd|prefetchLaunchAd\(\)\.catch/.test(bridge)
);

/* 2. Only the conversation the window was on is built before it can be shown. */
const restoreBlock = renderer.slice(
  renderer.indexOf('const wantedTabs = []'),
  renderer.indexOf('bootMark(`tabs restored')
);
check(
  'restore: the remembered conversation is built first',
  /a\.sessionFile === remembered/.test(restoreBlock) && /firstOk/.test(restoreBlock),
  'the restore loop no longer starts with the remembered session'
);
check(
  'restore: the other conversations wait behind the splash',
  /pendingRestoreTabs\.push\(t\)/.test(restoreBlock) && !/Promise\.all\(/.test(restoreBlock),
  'every saved tab is built before the window appears again'
);
check(
  'restore: they are opened after the window is up',
  /setTimeout\(restorePendingTabs/.test(renderer) && /async function restorePendingTabs/.test(renderer)
);
check(
  'restore: a deferred tab still does not paint over the active one',
  /applyTabState\(res\.state, \{ show: false \}\)/.test(
    renderer.slice(renderer.indexOf('async function restorePendingTabs'), renderer.indexOf('async function restorePendingTabs') + 900)
  )
);
check(
  'restore: a failed tab does not take the others with it',
  /catch \{\}/.test(restoreBlock)
);

/* 3. Catalogs outlive the process, filed under a hash and never a raw key. */
check('catalog: main hands the bridge a cache file', /catalogCachePath:\s*path\.join\(DATA_ROOT/.test(main));
check('catalog: the bridge reads it before building a tab', /loadCatalogCache\(catalogCachePath\)/.test(bridge));
check('catalog: ids are hashed, not the keys themselves', /sha256'\)\.update\(clean\)/.test(bridge) && !/`\$\{name\}:\$\{clean\}`/.test(bridge));
check('catalog: concurrent reads share one request', /catalogInFlight\.get\(id\)/.test(bridge));

if (failed) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll startup-speed checks passed.');
