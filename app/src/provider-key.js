'use strict';

/**
 * Storage for one provider's API key.
 *
 * Keys are per-machine state, not app settings: each lives beside the rest of
 * the data root in its own file (e.g. `coarena.json`, `zro.json`), encrypted
 * with Electron's safeStorage (DPAPI on Windows) whenever that is available.
 * The renderer never receives the raw value — only a status object with a
 * readable hint (the last four characters).
 *
 * A copied data folder must fail soft: the file still says "configured", but it
 * cannot be decrypted here, so the UI asks for the key again instead of deleting
 * it or crashing at startup.
 */

const fs = require('node:fs');
const path = require('node:path');

const FILE_VERSION = 1;
const MODE = 0o600;

const EMPTY_STATUS = { configured: false, readable: false, encrypted: false, hint: null };

function lastFour(key) {
  return key.length >= 4 ? key.slice(-4) : key;
}

function createProviderKeyStore({ dir, safeStorage, fileName }) {
  if (!fileName) throw new Error('fileName is required');
  const filePath = path.join(dir, fileName);

  /** @returns {{ state: 'missing' } | { state: 'corrupt' } | { state: 'ok', record: object }} */
  function readRecord() {
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      if (err && err.code === 'ENOENT') return { state: 'missing' };
      return { state: 'corrupt' };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.key !== 'string') {
        return { state: 'corrupt' };
      }
      return { state: 'ok', record: parsed };
    } catch {
      return { state: 'corrupt' };
    }
  }

  function decrypt(record) {
    const key = record.encrypted
      ? safeStorage.decryptString(Buffer.from(record.key, 'base64'))
      : record.key;
    return typeof key === 'string' ? key : null;
  }

  function status() {
    const found = readRecord();
    if (found.state === 'missing') return { ...EMPTY_STATUS };
    if (found.state === 'corrupt') {
      return { configured: true, readable: false, encrypted: false, hint: null, error: 'corrupt' };
    }

    const { record } = found;
    const encrypted = record.encrypted === true;
    try {
      const key = decrypt(record);
      if (!key) {
        return { configured: true, readable: false, encrypted, hint: null, error: 'undecryptable' };
      }
      return { configured: true, readable: true, encrypted, hint: lastFour(key) };
    } catch {
      return { configured: true, readable: false, encrypted, hint: null, error: 'undecryptable' };
    }
  }

  function read() {
    const found = readRecord();
    if (found.state !== 'ok') return null;
    try {
      return decrypt(found.record);
    } catch {
      return null;
    }
  }

  function save(raw) {
    const key = String(raw || '').trim();
    if (!key) throw new Error('empty key');

    fs.mkdirSync(dir, { recursive: true });

    const encrypted = Boolean(safeStorage.isEncryptionAvailable());
    const record = {
      v: FILE_VERSION,
      encrypted,
      key: encrypted ? safeStorage.encryptString(key).toString('base64') : key,
    };

    // Write-then-rename so a crash mid-write cannot leave half a key file.
    // PID and time keep two saves in the same millisecond apart.
    const tmp = path.join(dir, `${fileName}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(record), { mode: MODE });
      fs.renameSync(tmp, filePath);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
      const message = err instanceof Error ? err.message : String(err);
      // Never attach the key itself to the error the settings dialog shows.
      throw new Error(`could not save the key: ${message}`);
    }

    return status();
  }

  function clear() {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  return { path: filePath, status, read, save, clear };
}

module.exports = { createProviderKeyStore };
