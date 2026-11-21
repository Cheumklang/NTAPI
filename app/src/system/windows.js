'use strict';

/**
 * The Windows adapter: one JSON job to `uia.ps1`, one JSON answer back.
 *
 * Same shape as the Linux one on purpose — look with `windows`/`snapshot`,
 * press one thing with `act` — so the prompt, the switch and the audit log do
 * not need to know which system is underneath.
 *
 * Pressing a published action is the safe half; the rest of what a person does
 * needs real input, so `focus`/`launch`/`keys`/`type`/`clickat`/`scroll` go
 * through SendInput. Every one of them refuses unless the window they name is
 * in front, and a coordinate click has to land inside it.
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
/** NTAPI's own window, so the helper can refuse to type into the app itself. */
let selfHandle = '';

function setSelfHandle(handle) {
  selfHandle = handle ? String(handle) : '';
}

function run(args, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    // -NonInteractive matters: a UAC prompt or a stray Read-Host would otherwise
    // hang the helper until the timeout, with no way for the user to see why.
    const flags = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER];
    // -Self travels with every call so "the window in front" can never mean the
    // chat window the agent is talking in.
    const argv = selfHandle ? [...args, '-Self', selfHandle] : args;
    execFile(
      POWERSHELL,
      [...flags, ...argv],
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

async function snapshot({ app = 0, maxNodes = MAX_NODES, window = '' } = {}) {
  const requested = Number.isFinite(Number(maxNodes)) ? Math.max(1, Math.min(Number(maxNodes), MAX_NODES)) : MAX_NODES;
  const args = ['snapshot', '-Max', String(requested)];
  const target = windowArgs({ app, window }, 'snapshot');
  args.push(...target);
  const result = await run(args, { timeoutMs: 30000 });
  return { app: result.app, appName: result.appName || '', handle: result.handle, nodes: asList(result.nodes) };
}

/**
 * A window is named by its handle when the caller kept one, and by its position
 * only when it has nothing better: the positions move when windows come and go.
 */
function windowArgs({ app, window }, label) {
  if (window !== undefined && window !== null && String(window).trim() !== '') {
    return ['-Window', String(window).trim()];
  }
  if (!Number.isFinite(Number(app))) throw failure('BAD_ARGS', `${label} needs an app number or a window handle`);
  return ['-App', String(app)];
}

async function act({ ref, action = 'click', text = '' } = {}) {
  if (!ref) throw failure('BAD_ARGS', 'act needs the ref of an element from a snapshot');
  if (action !== 'click' && action !== 'settext') throw failure('BAD_ARGS', `unknown action ${action}`);
  const args = ['act', '-Ref', String(ref), '-Action', action];
  if (text) args.push('-Text', String(text));
  return run(args, { timeoutMs: 20000 });
}

/** Bring a window to the front; refuses if Windows would not allow it. */
async function focus({ app = 0, window = '' } = {}) {
  return run(['focus', ...windowArgs({ app, window }, 'focus')]);
}

/**
 * Start a program, a document or a url and report the window that appeared.
 * `app` is -1 when nothing new showed up within the helper's wait.
 */
async function launch({ target = '' } = {}) {
  const wanted = typeof target === 'string' ? target.trim() : '';
  if (!wanted) throw failure('BAD_ARGS', 'launch needs a target: an executable, a document or a url');
  return run(['launch', '-Target', wanted], { timeoutMs: 30000 });
}

/** A shortcut such as `ctrl+s`, pressed after the window is in front. */
async function keys({ app = 0, keys = '', window = '' } = {}) {
  const combo = typeof keys === 'string' ? keys.trim() : '';
  if (!combo) throw failure('BAD_ARGS', 'keys needs a shortcut such as ctrl+s');
  return run(['keys', ...windowArgs({ app, window }, 'keys'), '-Keys', combo]);
}

/** Type text as keystrokes — the only way into a control with no ValuePattern. */
async function typeText({ app = 0, text = '', window = '' } = {}) {
  if (typeof text !== 'string' || !text) throw failure('BAD_ARGS', 'type needs the text to type');
  return run(['type', ...windowArgs({ app, window }, 'type'), '-Text', text], { timeoutMs: 60000 });
}

/** Click a screen position, which must fall inside the named window. */
async function clickAt({ app = 0, x, y, button = 'left', window = '' } = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    throw failure('BAD_ARGS', 'clickat needs x and y in screen coordinates');
  }
  const action = button === 'right' ? 'rightclick' : 'click';
  return run(['clickat', ...windowArgs({ app, window }, 'clickat'), '-X', String(Math.round(Number(x))), '-Y', String(Math.round(Number(y))), '-Action', action]);
}

/**
 * A picture of another application's window. The helper draws it into a PNG in
 * the temp folder; the file is read and removed here so the caller only ever
 * sees an image.
 */
async function screenshot({ app = 0, window = '' } = {}) {
  const result = await run(['screenshot', ...windowArgs({ app, window }, 'screenshot')], { timeoutMs: 45000 });
  const file = String(result.path || '');
  if (!file) throw failure('SHOT_FAILED', 'the helper returned no picture');
  let data;
  try {
    data = require('node:fs').readFileSync(file).toString('base64');
  } finally {
    try { require('node:fs').unlinkSync(file); } catch { }
  }
  return {
    app: result.app,
    title: result.title || '',
    width: result.width,
    height: result.height,
    method: result.method || 'printwindow',
    mimeType: 'image/png',
    data,
  };
}

/** Wheel over the middle of a window; a negative count scrolls up. */
async function scroll({ app = 0, notches = 3, window = '' } = {}) {
  const count = Number.isFinite(Number(notches)) ? Math.trunc(Number(notches)) : 3;
  return run(['scroll', ...windowArgs({ app, window }, 'scroll'), '-Delta', String(count)]);
}

module.exports = {
  platform: 'win32',
  setSelfHandle,
  available,
  windows,
  snapshot,
  act,
  focus,
  launch,
  keys,
  type: typeText,
  clickAt,
  scroll,
  screenshot,
  MAX_NODES,
};
