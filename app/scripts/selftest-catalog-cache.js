/**
 * Provider catalogs survive a restart — without the keys they were filed under.
 *
 * Opening the app again used to re-ask every configured provider for its model
 * list before any chat could be drawn, which is the "loading chats is slow"
 * report of 2026-11-26. The answers are now written to the app data root and read
 * back on the next launch.
 *
 * The one thing that must never happen is a key in that file: the cache is keyed
 * by a hash, and this test reads the real bytes to prove it.
 *
 * Run from app/:   node scripts/selftest-catalog-cache.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { catalogCacheForTests } = require('../src/freepi-bridge');
const { catalogCache, cachedCatalog, loadCatalogCache, saveCatalogCache } = catalogCacheForTests;

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-catalog-'));
  const file = path.join(dir, 'catalogs.json');
  const SECRET = 'sk-live-abcdef0123456789';
  catalogCache.clear();
  loadCatalogCache(file);

  let runs = 0;
  const first = await cachedCatalog('deepseek', SECRET, async () => {
    runs += 1;
    return [{ id: 'deepseek-v4' }];
  });
  check('catalog: the first read runs the fetch', runs === 1 && first[0].id === 'deepseek-v4');

  const second = await cachedCatalog('deepseek', SECRET, async () => {
    runs += 1;
    return [];
  });
  check('catalog: a second tab reuses the answer', runs === 1 && second[0].id === 'deepseek-v4');

  /* Two tabs opening at the same instant share one request, not two. */
  let slowRuns = 0;
  const [a, b] = await Promise.all([
    cachedCatalog('nvidia', 'nvapi-secret', async () => {
      slowRuns += 1;
      await wait(30);
      return [{ id: 'nvidia-x' }];
    }),
    cachedCatalog('nvidia', 'nvapi-secret', async () => {
      slowRuns += 1;
      return [{ id: 'nvidia-duplicate' }];
    }),
  ]);
  check('catalog: two concurrent reads share one request', slowRuns === 1 && a === b);

  /* The file on disk: kept, fresh, and free of the key. */
  saveCatalogCache();
  await wait(450);
  const bytes = fs.readFileSync(file, 'utf8');
  const saved = JSON.parse(bytes);
  const ids = Object.keys(saved);
  check('disk: the answers are written', ids.length >= 1, bytes.slice(0, 120));
  check('disk: no provider key reaches the file', !bytes.includes(SECRET) && !bytes.includes('nvapi-secret'), ids.join(','));
  check('disk: an id is the provider plus a hash', ids.every((id) => /^(deepseek|nvidia):[0-9a-f]{16}$/.test(id)), ids.join(','));

  /* A relaunch reads the file back instead of calling the network. */
  catalogCache.clear();
  // Same bytes, different string: the loader remembers which file it read, and
  // a second path spelled differently is how a fresh process sees it.
  loadCatalogCache(dir + '/./catalogs.json');
  let afterRestartRuns = 0;
  const revived = await cachedCatalog('deepseek', SECRET, async () => {
    afterRestartRuns += 1;
    return [];
  });
  check(
    'disk: a relaunch opens on the saved catalog',
    afterRestartRuns === 0 && revived.some((m) => m.id === 'deepseek-v4'),
    JSON.stringify(revived)
  );

  /* A stale entry is dropped rather than served. */
  fs.writeFileSync(
    file,
    JSON.stringify({
      [`deepseek:${'0'.repeat(16)}`]: { at: Date.now() - 11 * 60 * 1000, value: [{ id: 'old' }] },
    })
  );
  catalogCache.clear();
  loadCatalogCache(dir + '/./catalogs.json');
  check('disk: an expired answer is ignored', catalogCache.size === 0, [...catalogCache.keys()].join(','));

  /* An entry can carry a shorter clock than a catalog: the account check. */
  let accountRuns = 0;
  const account = () =>
    cachedCatalog(
      'me',
      'token-abc',
      async () => {
        accountRuns += 1;
        return { guest: false };
      },
      null,
      40
    );
  await account();
  await account();
  const stillFresh = accountRuns === 1;
  await wait(70);
  await account();
  check('account: the answer expires on its own clock', stillFresh && accountRuns === 2, `runs=${accountRuns}`);

  /* A failed account check is never written down. */
  catalogCache.clear();
  const rejected = await cachedCatalog(
    'me',
    'token-bad',
    async () => {
      throw new Error('401');
    },
    null
  );
  check('account: a rejected token is not cached', rejected === null && catalogCache.size === 0);

  fs.rmSync(dir, { recursive: true, force: true });
  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll catalog-cache checks passed.');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
