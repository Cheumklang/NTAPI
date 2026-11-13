/**
 * Diagnostic: a provider key must survive a round-trip through safeStorage
 * without the raw value ever reaching the disk, and a key file that cannot be
 * decrypted must fail soft instead of throwing at startup.
 *
 * Runs the same cases for every provider's file so a new provider cannot ship
 * with a weaker store.
 *
 * Run from app/:   node scripts/selftest-provider-key.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createProviderKeyStore } = require('../src/provider-key');

const KEY = 'coa_test_000000000000';
const FILES = ['coarena.json', 'zro.json'];

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// A prefix stands in for DPAPI: whatever the fake returns is what lands on disk,
// so a raw key appearing in the file would be visible to these checks.
const fakeSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(`enc:${s}`),
  decryptString: (b) => b.toString().slice(4),
};

function run(fileName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `provider-key-${fileName}-`));

  function listDir() {
    return fs.readdirSync(dir);
  }

  try {
    const store = createProviderKeyStore({ dir, safeStorage: fakeSafe, fileName });

    const empty = store.status();
    check(`${fileName}: store path`, path.basename(store.path) === fileName);
    check(
      `${fileName}: empty store is not configured`,
      empty.configured === false &&
        empty.readable === false &&
        empty.encrypted === false &&
        empty.hint === null,
      JSON.stringify(empty)
    );
    check(`${fileName}: empty store reads null`, store.read() === null);

    store.save(KEY);
    check(`${fileName}: read returns the saved key`, store.read() === KEY);

    const saved = store.status();
    check(
      `${fileName}: saved key is configured, readable and encrypted`,
      saved.configured === true && saved.readable === true && saved.encrypted === true && saved.hint === '0000',
      JSON.stringify(saved)
    );

    const onDisk = fs.readFileSync(store.path, 'utf8');
    check(`${fileName}: raw key never hits the disk`, !onDisk.includes(KEY), onDisk);
    check(
      `${fileName}: file carries the version and encrypted flag`,
      JSON.parse(onDisk).v === 1 && JSON.parse(onDisk).encrypted === true
    );

    // A key saved on another machine decrypts to garbage or throws here.
    const brokenStore = createProviderKeyStore({
      dir,
      fileName,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(`enc:${s}`),
        decryptString: () => {
          throw new Error('decrypt failed');
        },
      },
    });
    const broken = brokenStore.status();
    check(
      `${fileName}: undecryptable key is unreadable, not unconfigured`,
      broken.configured === true && broken.readable === false && broken.encrypted === true && broken.hint === null,
      JSON.stringify(broken)
    );
    check(`${fileName}: undecryptable key reports its reason`, broken.error === 'undecryptable');
    check(`${fileName}: the reason never contains the key`, !String(broken.error).includes(KEY));
    check(`${fileName}: undecryptable key reads null`, brokenStore.read() === null);

    // Without encryption available the store still works, but must say so.
    const plainStore = createProviderKeyStore({
      dir,
      fileName,
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: () => {
          throw new Error('encryption unavailable');
        },
        decryptString: () => {
          throw new Error('encryption unavailable');
        },
      },
    });
    plainStore.save(KEY);
    const plain = plainStore.status();
    check(`${fileName}: plaintext key still reads back`, plainStore.read() === KEY);
    check(
      `${fileName}: plaintext key is reported as unencrypted`,
      plain.configured === true && plain.readable === true && plain.encrypted === false,
      JSON.stringify(plain)
    );
    check(
      `${fileName}: plaintext file records encrypted: false`,
      JSON.parse(fs.readFileSync(plainStore.path, 'utf8')).encrypted === false
    );

    // A truncated file is a corrupt store, not an empty one: the user must be
    // told the key is broken rather than quietly offered an empty field.
    fs.writeFileSync(plainStore.path, '{not json', { mode: 0o600 });
    const corrupt = plainStore.status();
    check(
      `${fileName}: corrupt file stays configured but unreadable`,
      corrupt.configured === true && corrupt.readable === false,
      JSON.stringify(corrupt)
    );
    check(`${fileName}: corrupt file reports its reason`, corrupt.error === 'corrupt');

    plainStore.clear();
    check(`${fileName}: clear removes the file`, !fs.existsSync(plainStore.path));
    check(`${fileName}: cleared store is not configured`, plainStore.status().configured === false);
    check(`${fileName}: clear twice is harmless`, (plainStore.clear(), plainStore.clear() === undefined));

    // An empty key is a programming error, not something to write to disk.
    let thrown = null;
    try {
      plainStore.save('   ');
    } catch (err) {
      thrown = err;
    }
    check(`${fileName}: blank key throws empty key`, thrown instanceof Error && thrown.message === 'empty key');
    check(`${fileName}: blank key writes nothing`, !fs.existsSync(plainStore.path));

    // A storage failure must not echo the key into the error the UI shows.
    const failingStore = createProviderKeyStore({
      dir,
      fileName,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: () => {
          throw new Error('dpapi failed');
        },
        decryptString: () => {
          throw new Error('dpapi failed');
        },
      },
    });
    let saveError = null;
    try {
      failingStore.save(KEY);
    } catch (err) {
      saveError = err;
    }
    check(
      `${fileName}: encryption failure throws without the key`,
      saveError instanceof Error && !String(saveError.message).includes(KEY),
      saveError && saveError.message
    );

    const leftovers = listDir().filter((name) => name !== fileName);
    check(`${fileName}: no temp files are left behind`, leftovers.length === 0, leftovers.join(', '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const fileName of FILES) run(fileName);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: every provider key is stored encrypted and read back safely');
