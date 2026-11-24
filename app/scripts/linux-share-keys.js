'use strict';

/**
 * Linux only: make the shared API-key files readable by both the normal user
 * and by `pkexec` (root), so switching launch mode does not ask for keys again.
 *
 * Why this exists: Electron's safeStorage on Linux keeps the encryption key in
 * the login keyring, which is only reachable by the logged-in user. A root
 * process gets `isEncryptionAvailable() === false`, so every key file written by
 * the normal user is undecryptable there. The app already supports unencrypted
 * records (`encrypted: false` in provider-key.js), and both users can read those.
 *
 * Run as the normal user (never as root, or the keyring stays out of reach):
 *
 *   cd app && ./node_modules/electron/dist/electron --no-sandbox \
 *     scripts/linux-share-keys.js
 *
 * A copy of every original file is written to <data>/keys-backup-<timestamp>/.
 * The launch script passes --password-store=basic, so keys saved from now on are
 * stored unencrypted too — that is what keeps the two modes in sync.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

// Same identity the app uses, otherwise safeStorage looks up the wrong keyring
// entry and every decryption fails.
app.setName('FreePi');

function dataRoot() {
  if (process.env.NTAPI_DATA_DIR) return process.env.NTAPI_DATA_DIR;
  if (process.env.FREEPI_DATA_DIR) return process.env.FREEPI_DATA_DIR;
  const base = process.env.XDG_DATA_HOME || path.join(app.getPath('home'), '.local', 'share');
  return path.join(base, 'ntapi');
}

app.whenReady().then(() => {
  const dir = dataRoot();
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')) : [];
  const backup = path.join(dir, `keys-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const lines = [];
  let changed = 0;
  let skipped = 0;

  for (const name of entries) {
    const file = path.join(dir, name);
    let record;
    try {
      record = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!record || typeof record.key !== 'string' || typeof record.encrypted !== 'boolean') continue;
    if (record.encrypted === false) {
      lines.push(`${name}: already plaintext, left alone`);
      continue;
    }

    let plain;
    try {
      plain = safeStorage.decryptString(Buffer.from(record.key, 'base64'));
    } catch {
      lines.push(`${name}: CANNOT DECRYPT here (only the user who saved it can) — left alone`);
      skipped++;
      continue;
    }
    if (typeof plain !== 'string' || !plain) {
      lines.push(`${name}: decrypted to nothing — left alone`);
      skipped++;
      continue;
    }

    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    fs.copyFileSync(file, path.join(backup, name));

    const tmp = path.join(dir, `${name}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, encrypted: false, key: plain }), { mode: 0o600 });
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 0o600);

    lines.push(`${name}: plaintext now (hint ${plain.slice(-4)})`);
    changed++;
  }

  lines.push(`done: ${changed} converted, ${skipped} skipped${changed ? `, originals in ${backup}` : ''}`);
  console.log(lines.join('\n'));
  app.quit();
});
