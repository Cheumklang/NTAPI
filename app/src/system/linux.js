'use strict';

/**
 * The Linux adapter: one JSON job to `atspi.py`, one JSON answer back.
 *
 * Deliberately narrow. It knows how to look (`windows`, `snapshot`) and how to
 * press one thing (`act`); it does not decide whether it is allowed to — that
 * is the main process's job, so the same guard covers every caller.
 */

const path = require('node:path');
const { execFile } = require('node:child_process');
const { helperPath } = require('./helper-path');

const HELPER = helperPath('atspi.py');
const PYTHON = process.env.NTAPI_PYTHON || 'python3';
/** What a snapshot returns unless the caller asks for less. */
const MAX_NODES = 250;

function failure(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Runs the helper and returns what it printed. The helper answers failures as
 * JSON too ({"ok": false}), so a non-zero exit still carries a reason worth
 * passing on — the only things lost here are crashes and timeouts.
 */
function run(args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [HELPER, ...args], { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
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
        reject(failure('NO_PYTHON', `python3 is not installed (${PYTHON})`));
        return;
      }
      if (err && err.killed) {
        reject(failure('TIMEOUT', 'the desktop did not answer in time'));
        return;
      }
      reject(failure('ERROR', (err && err.message) || 'the accessibility helper failed'));
    });
  });
}

/** Can this machine be seen at all, and what is open right now? */
async function available() {
  try {
    const probe = await run(['probe'], { timeoutMs: 8000 });
    return { ok: true, apps: (probe.apps || []).length };
  } catch (err) {
    return { ok: false, code: err.code || 'ERROR', reason: err.message };
  }
}

async function windows() {
  const result = await run(['windows']);
  return result.windows || [];
}

async function snapshot({ app = 0, maxNodes = MAX_NODES } = {}) {
  const requested = Number.isFinite(Number(maxNodes)) ? Math.max(1, Math.min(Number(maxNodes), MAX_NODES)) : MAX_NODES;
  const result = await run(['snapshot', '--app', String(app), '--max', String(requested)], { timeoutMs: 20000 });
  return { app: result.app, appName: result.appName || '', nodes: result.nodes || [] };
}

async function act({ ref, action = 'click', text = '' } = {}) {
  if (!ref) throw failure('BAD_ARGS', 'act needs the ref of an element from a snapshot');
  if (action !== 'click' && action !== 'settext') throw failure('BAD_ARGS', `unknown action ${action}`);
  const args = ['act', '--ref', String(ref), '--action', action];
  if (text) args.push('--text', String(text));
  return run(args, { timeoutMs: 15000 });
}

/**
 * Real input is Windows-only for now: the Windows half can reach SendInput
 * through PowerShell with nothing to install, while Linux would need XTest or a
 * portal that behaves differently on X11 and Wayland. Saying so honestly beats a
 * half-version that types into the wrong window.
 */
function notOnLinux(name) {
  return async () => {
    throw failure(
      'NOT_SUPPORTED',
      `${name} is not implemented on Linux yet. Here the desktop tools can only press a control that publishes an accessibility action (system_act).`,
    );
  };
}

module.exports = {
  focus: notOnLinux('focus'),
  launch: notOnLinux('launch'),
  keys: notOnLinux('keys'),
  type: notOnLinux('type'),
  clickAt: notOnLinux('clickAt'),
  scroll: notOnLinux('scroll'),
  platform: 'linux',
  available,
  windows,
  snapshot,
  act,
  MAX_NODES,
};
