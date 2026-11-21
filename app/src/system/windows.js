'use strict';

/**
 * The Windows adapter: one JSON job to `uia.ps1`, one JSON answer back.
 *
 * Same shape as the Linux one on purpose — look with `windows`/`snapshot`,
 * press one thing with `act` — so the prompt, the switch and the audit log do
 * not need to know which system is underneath.
 *
 * UI Automation is part of Windows itself, so there is nothing to install and
 * nothing to rebuild when Electron changes: a helper process reads the same
 * accessibility tree a screen reader reads, and only ever presses a control
 * that publishes an action. No coordinates are guessed and the pointer is not
 * moved, which is also why a click on a canvas-only widget honestly fails
 * instead of landing wherever the mouse happened to be.
 */

const { execFile } = require('node:child_process');
const { helperPath } = require('./helper-path');

const HELPER = helperPath('uia.ps1');
const POWERSHELL = process.env.NTAPI_POWERSHELL || 'powershell.exe';
/** What a snapshot returns unless the caller asks for less. */
const MAX_NODES = 250;

function failure(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Runs the script and returns what it printed. The script answers failures as
 * JSON too ({"ok": false}), so a non-zero exit still carries a reason worth
 * passing on — the only things lost here are crashes and timeouts.
 */
function run(args, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    // -NonInteractive matters: a UAC prompt or a stray Read-Host would otherwise
    // hang the helper until the timeout, with no way for the user to see why.
    const flags = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER];
    execFile(
      POWERSHELL,
      [...flags, ...args],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        const text = String(stdout || '').trim();
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text.slice(text.indexOf('{')));
          } catch {
            parsed = null;
          }
        }
        if (parsed && parsed.ok) {
          resolve(parsed);
          return;
        }
        if (parsed && parsed.error) {
          reject(failure(parsed.code || 'ERROR', parsed.error));
          return;
        }
        if (err && err.code === 'ENOENT') {
          reject(failure('NO_POWERSHELL', `Windows PowerShell is missing (${POWERSHELL})`));
          return;
        }
        if (err && err.killed) {
          reject(failure('TIMEOUT', 'the desktop did not answer in time'));
          return;
        }
        reject(failure('ERROR', (err && err.message) || 'the accessibility helper failed'));
      },
    );
  });
}

/** PowerShell turns a one-item array into a bare object; the caller wants a list. */
function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

/** Can this machine be seen at all, and what is open right now? */
async function available() {
  try {
    const probe = await run(['probe'], { timeoutMs: 15000 });
    return { ok: true, apps: asList(probe.apps)[0] ?? 0 };
  } catch (err) {
    return { ok: false, code: err.code || 'ERROR', reason: err.message };
  }
}

async function windows() {
  const result = await run(['windows']);
  return asList(result.windows);
}

async function snapshot({ app = 0, maxNodes = MAX_NODES } = {}) {
  const requested = Number.isFinite(Number(maxNodes)) ? Math.max(1, Math.min(Number(maxNodes), MAX_NODES)) : MAX_NODES;
  const result = await run(['snapshot', '-App', String(app), '-Max', String(requested)], { timeoutMs: 30000 });
  return { app: result.app, appName: result.appName || '', nodes: asList(result.nodes) };
}

async function act({ ref, action = 'click', text = '' } = {}) {
  if (!ref) throw failure('BAD_ARGS', 'act needs the ref of an element from a snapshot');
  if (action !== 'click' && action !== 'settext') throw failure('BAD_ARGS', `unknown action ${action}`);
  const args = ['act', '-Ref', String(ref), '-Action', action];
  if (text) args.push('-Text', String(text));
  return run(args, { timeoutMs: 20000 });
}

module.exports = {
  platform: 'win32',
  available,
  windows,
  snapshot,
  act,
  MAX_NODES,
};
