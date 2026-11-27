'use strict';

/**
 * The Linux adapter: one JSON job to `atspi.py`, one JSON answer back.
 *
 * It knows how to look (`windows`, `snapshot`) and how to press one thing
 * (`act`); it does not decide whether it is allowed to — that is the main
 * process's job, so the same guard covers every caller.
 *
 * Real input is a different story on Linux: there is no built-in SendInput. The
 * adapter therefore asks what the session actually has — xdotool on X11, wtype
 * or ydotool on Wayland — and builds the command for whichever it finds. When
 * the session has nothing, it says so and names what to install instead of
 * typing into the void.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile, execFileSync, spawn } = require('node:child_process');
const { helperPath } = require('./helper-path');

const HELPER = helperPath('atspi.py');
const PORTAL_SHOT = helperPath('portal-shot.py');
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
function run(args, { timeoutMs = 15000, helper = HELPER } = {}) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [helper, ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
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

/* ------------------------------------------------------------- real input */

/**
 * Which input backend this session has.
 *
 * xdotool first: on X11 (and XWayland) it types, clicks and focuses by name.
 * On Wayland only a virtual-keyboard client can do it, and whether one exists at
 * all depends on the compositor — wtype needs wlroots or KDE, ydotool needs its
 * uinput daemon running as root. Nothing is assumed; each is looked for.
 */
function sessionType() {
  return String(process.env.XDG_SESSION_TYPE || '').toLowerCase();
}

/** Raw keycodes for ydotool, which speaks posix keycodes and not key names. */
const KEYCODES = {
  ctrl: 29, control: 29, shift: 42, alt: 56, super: 125, win: 125, meta: 125,
  enter: 28, return: 28, tab: 15, esc: 1, escape: 1, space: 57, backspace: 14,
  delete: 111, del: 111, home: 102, end: 107, pageup: 104, pagedown: 109,
  up: 103, down: 108, left: 105, right: 106,
  a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36, k: 37,
  l: 38, m: 50, n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22, v: 47,
  w: 17, x: 45, y: 21, z: 44,
  1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11,
  '-': 12, '=': 13, '[': 26, ']': 27, ';': 39, "'": 40, '`': 41, ',': 51, '.': 52, '/': 53, '\\': 43,
};
for (let n = 1; n <= 12; n += 1) KEYCODES[`f${n}`] = 58 + n;

/** True when the text needs more than a keycode per character. */
function needsUnicode(text) {
  return /[^\x20-\x7e\t\n]/.test(text);
}

/** Where the ydotool client looks for the daemon unless told otherwise. */
function ydotoolSocket() {
  return String(process.env.YDOTOOL_SOCKET || '/tmp/.ydotool_socket');
}

/**
 * ydotool 1.0.4 looks in `$XDG_RUNTIME_DIR/.ydotool_socket`, while the daemon
 * here is a system service with a fixed path — so the path travels with the
 * call instead of being assumed.
 */
function envFor(binary) {
  if (binary !== 'ydotool') return undefined;
  return { ...process.env, YDOTOOL_SOCKET: ydotoolSocket() };
}

function daemonRunning() {
  try {
    return fs.statSync(ydotoolSocket()).isSocket();
  } catch {
    return false;
  }
}

/**
 * ydotool counts 1024 units across the screen, not pixels, and does so on both
 * axes whatever the screen is: on a 1920x1080 desktop `mousemove --absolute
 * 512 288` put the pointer exactly at the centre and `960 540` in the far corner
 * (measured 2026-11-27). Handing it raw pixels therefore lands every click 1.875
 * times too far, which reads as "the pointer control is broken".
 */
const YDOTOOL_UNITS = 1024;
let screenWidthCache = null;

/** The width every other coordinate we are handed is measured against. */
function screenWidth() {
  if (screenWidthCache) return screenWidthCache;
  const fromEnv = Number(process.env.YDOTOOL_SCREEN_WIDTH || 0);
  if (fromEnv > 0) {
    screenWidthCache = fromEnv;
    return screenWidthCache;
  }
  try {
    const out = String(execFileSync('xdotool', ['getdisplaygeometry'], { timeout: 4000, encoding: 'utf8' }) || '');
    const width = Number(out.trim().split(/\s+/)[0]);
    if (width > 0) {
      screenWidthCache = width;
      return screenWidthCache;
    }
  } catch {
    /* No X11 to ask: the fallback below is still better than raw pixels. */
  }
  screenWidthCache = 1920;
  return screenWidthCache;
}

/** Turn a screen pixel into the number ydotool wants. */
function toYdotoolUnits(value) {
  return Math.round((Number(value) * YDOTOOL_UNITS) / screenWidth());
}

function commandExists(binary) {
  return new Promise((resolve) => {
    execFile('sh', ['-c', `command -v ${binary} >/dev/null 2>&1`], (err) => resolve(!err));
  });
}

let capsCache = null;
async function capabilities() {
  if (String(process.env.NTAPI_LINUX_INPUT || '').toLowerCase() === 'none') {
    return { session: sessionType(), xdotool: false, wtype: false, ydotool: false, backend: '' };
  }
  if (capsCache) return capsCache;
  const session = sessionType();
  const [xdotool, wtype, ydotool] = await Promise.all([
    commandExists('xdotool'),
    commandExists('wtype'),
    commandExists('ydotool'),
  ]);
  let backend = '';
  // Wayland first: XTest events from XWayland never reach a native Wayland
  // window, so xdotool types and clicks into nothing there. Measured 2026-11-27:
  // text aimed at gedit landed in whichever XWayland window had focus instead,
  // and read as keycode garbage for Thai. ydotool goes through uinput, which the
  // compositor treats as a real keyboard and pointer.
  const ydotoolReady = ydotool ? daemonRunning() : false;
  if (session === 'wayland' && ydotoolReady) backend = 'ydotool';
  else if (xdotool) backend = 'xdotool';
  else if (ydotool) backend = 'ydotool';
  else if (wtype) backend = 'wtype';
  // An installed binary is not the same as a running daemon: without it every
  // keystroke fails with "failed to connect socket", which reads like a bug.
  capsCache = {
    session,
    xdotool,
    wtype,
    ydotool,
    backend,
    ydotoolReady,
    clipboard: ['wl-copy', 'xclip', 'xsel'].some((tool) => commandExists(tool)),
  };
  return capsCache;
}

/** The install line for the session in front of us, when nothing is there. */
function installHint(caps) {
  if (caps.session === 'wayland') {
    return 'Wayland needs a virtual-keyboard tool: install ydotool and start its daemon (`sudo systemctl enable --now ydotool`), or wtype on a wlroots compositor. X11 users can install xdotool.';
  }
  return 'Install xdotool (`sudo apt install xdotool`), which types, clicks and focuses windows on X11.';
}

const WTYPE_MODIFIERS = { ctrl: 'ctrl', control: 'ctrl', shift: 'shift', alt: 'alt', altgr: 'altgr', win: 'logo', meta: 'logo' };
const WTYPE_KEYS = {
  enter: 'Return',
  return: 'Return',
  tab: 'Tab',
  escape: 'Escape',
  esc: 'Escape',
  space: 'space',
  backspace: 'BackSpace',
  delete: 'Delete',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  pageup: 'Prior',
  pagedown: 'Next',
  insert: 'Insert',
};

/**
 * Turn one action into the commands to run. Pure on purpose: every backend's
 * command line is decided here, so it can be tested without any of them
 * installed and without touching a real desktop.
 *
 * @returns {{steps: Array<{binary: string, args: string[]}>}|{missing: string}}
 */
function buildSteps(action, input = {}, caps = { backend: '' }) {
  const backend = caps.backend || '';
  if (!backend) return { missing: installHint(caps) };

  if (backend === 'ydotool' && caps.ydotoolReady === false) {
    return {
      missing:
        'ydotool is installed but its daemon is not running. Start it with `sudo ydotoold --socket-path=/tmp/.ydotool_socket --socket-perm=0666` (or add a systemd unit) and try again.',
    };
  }

  if (action === 'type') {
    const text = String(input.text || '');
    if (!text) return { missing: 'nothing to type' };
    if (backend === 'xdotool') return { steps: [{ binary: 'xdotool', args: ['type', '--clearmodifiers', '--delay', '20', '--', text] }] };
    if (backend === 'ydotool') {
      // ydotool's type maps one keycode per character, so it stays silent about
      // Thai, emoji and anything else outside ASCII: those go through the
      // clipboard and one real ctrl+v instead of being dropped.
      if (!needsUnicode(text)) return { steps: [{ binary: 'ydotool', args: ['type', '--', text] }] };
      if (!caps.clipboard) {
        return {
          missing:
            'ydotool can only type plain ASCII. Install wl-clipboard (`sudo apt install wl-clipboard`) so other text can be pasted, or wtype on a wlroots session.',
        };
      }
      return {
        steps: [
          {
            binary: process.env.NTAPI_CLIPBOARD || (commandExists('wl-copy') ? 'wl-copy' : 'xclip'),
            // xclip needs to be told which clipboard; wl-copy has only one.
            args: commandExists('wl-copy') ? [] : ['-selection', 'clipboard'],
            stdin: text,
            // wl-copy keeps running to serve the selection, so it must not be
            // waited on — only its first write matters here.
            holdsClipboard: true,
          },
          { binary: 'ydotool', args: ['key', '29:1', '47:1', '47:0', '29:0'] },
        ],
        note: 'typed by pasting: ydotool cannot type text outside ASCII',
        verifyClipboard: 'wl-paste',
      };
    }
    return { steps: [{ binary: 'wtype', args: ['--', text] }] };
  }

  if (action === 'keys') {
    const combo = String(input.keys || '').trim();
    if (!combo) return { missing: 'nothing to press' };
    if (backend === 'xdotool') return { steps: [{ binary: 'xdotool', args: ['key', '--clearmodifiers', combo] }] };
    if (backend === 'ydotool') {
      const parts = combo.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean);
      if (!parts.length) return { missing: 'nothing to press' };
      const codes = [];
      for (const part of parts) {
        const code = KEYCODES[part];
        if (code === undefined) return { missing: `ydotool has no keycode for '${part}'` };
        codes.push(code);
      }
      // Held in order, released in reverse: press each down, then each up.
      const seq = [...codes.map((code) => `${code}:1`), ...codes.slice().reverse().map((code) => `${code}:0`)];
      return { steps: [{ binary: 'ydotool', args: ['key', ...seq] }] };
    }
    const parts = combo.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return { missing: 'nothing to press' };
    const args = [];
    const held = [];
    for (const part of parts.slice(0, -1)) {
      const modifier = WTYPE_MODIFIERS[part];
      if (!modifier) return { missing: `wtype does not know the modifier '${part}'` };
      held.push(modifier);
      args.push('-M', modifier);
    }
    const last = parts[parts.length - 1];
    args.push('-k', WTYPE_KEYS[last] || last);
    for (const modifier of held.reverse()) args.push('-m', modifier);
    return { steps: [{ binary: 'wtype', args }] };
  }

  if (action === 'click') {
    const hasPoint = Number.isFinite(Number(input.x)) && Number.isFinite(Number(input.y));
    if (backend === 'xdotool') {
      const steps = [];
      if (hasPoint) {
        steps.push({ binary: 'xdotool', args: ['mousemove', '--sync', String(Math.round(Number(input.x))), String(Math.round(Number(input.y)))] });
      }
      steps.push({ binary: 'xdotool', args: ['click', input.button === 'right' ? '3' : '1'] });
      return { steps };
    }
    if (backend === 'ydotool') {
      // 0xC0 is BTN_LEFT with the press and release bits set, 0xC1 is the right
      // button. The pointer has to be moved first: ydotool clicks where it is.
      const steps = [];
      if (hasPoint) {
        steps.push({ binary: 'ydotool', args: ['mousemove', '--absolute', String(toYdotoolUnits(input.x)), String(toYdotoolUnits(input.y))] });
      }
      steps.push({ binary: 'ydotool', args: ['click', input.button === 'right' ? '0xC1' : '0xC0'] });
      return { steps };
    }
    return { missing: 'wtype cannot move the pointer. Install ydotool (Wayland) or xdotool (X11) to click by coordinate.' };
  }

  if (action === 'drag') {
    const point = (value) => Math.round(Number(value));
    const from = [point(input.x), point(input.y)];
    const to = [point(input.toX), point(input.toY)];
    if (![...from, ...to].every(Number.isFinite)) {
      return { missing: 'drag needs x, y, toX and toY in screen coordinates' };
    }
    const steps = Math.max(2, Math.min(Math.trunc(Number(input.steps) || 8), 40));
    const right = input.button === 'right';
    // A press and a release in one place is a click, not a drag: the pointer has
    // to travel between them or nothing that listens for motion (a slider, a
    // selection, a file being moved) ever hears about it.
    const path = [];
    for (let i = 1; i <= steps; i += 1) {
      path.push([Math.round(from[0] + ((to[0] - from[0]) * i) / steps), Math.round(from[1] + ((to[1] - from[1]) * i) / steps)]);
    }
    if (backend === 'xdotool') {
      // No `--sync` on the travel: with a button held the pointer is grabbed and
      // `--sync` waits for a position the compositor can report late — measured
      // once as a 15 s timeout in the middle of a drag, on a desktop where the
      // same xdotool call finishes in 11 ms on its own.
      const steps_ = [
        { binary: 'xdotool', args: ['mousemove', String(from[0]), String(from[1])] },
        { binary: 'xdotool', args: ['mousedown', right ? '3' : '1'] },
      ];
      for (const [px, py] of path) steps_.push({ binary: 'xdotool', args: ['mousemove', String(px), String(py)] });
      steps_.push({ binary: 'xdotool', args: ['mouseup', right ? '3' : '1'] });
      return { steps: steps_ };
    }
    if (backend === 'ydotool') {
      // 0x40 is BTN_LEFT pressed and 0x80 released; the right button adds 1.
      const down = right ? '0x41' : '0x40';
      const up = right ? '0x81' : '0x80';
      const steps_ = [
        { binary: 'ydotool', args: ['mousemove', '--absolute', String(toYdotoolUnits(from[0])), String(toYdotoolUnits(from[1]))] },
        { binary: 'ydotool', args: ['click', down] },
      ];
      for (const [px, py] of path) {
        steps_.push({ binary: 'ydotool', args: ['mousemove', '--absolute', String(toYdotoolUnits(px)), String(toYdotoolUnits(py))] });
      }
      steps_.push({ binary: 'ydotool', args: ['click', up] });
      return { steps: steps_ };
    }
    return { missing: 'dragging needs xdotool (X11) or ydotool (Wayland) - install one of them' };
  }

  if (action === 'scroll') {
    if (backend !== 'xdotool') {
      // ydotool 1.0.4 has no wheel: its click only presses buttons.
      return { missing: 'scrolling a window needs xdotool on X11; the ydotool version here cannot turn the wheel.' };
    }
    const notches = Math.abs(Math.trunc(Number(input.notches) || 3)) || 3;
    // Wheel up is button 4 and wheel down is 5 in X11; one click per notch.
    const button = Number(input.notches) < 0 ? '4' : '5';
    return { steps: [{ binary: 'xdotool', args: ['click', '--repeat', String(notches), '--delay', '40', button] }] };
  }

  if (action === 'focus') {
    const title = String(input.title || '').trim();
    if (!title) return { missing: 'this window reports no title, so xdotool cannot find it' };
    if (backend !== 'xdotool') {
      return { missing: 'on Wayland a window cannot be raised by name; click it, or switch to it from the task switcher.' };
    }
    // `search` matches a pattern, so a literal title has to be escaped.
    const literal = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      steps: [{ binary: 'xdotool', args: ['search', '--name', `^${literal}$`, 'windowactivate', '--sync'] }],
    };
  }

  return { missing: `unknown action ${action}` };
}

function runTool(step, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(step.binary, step.args, { env: envFor(step.binary), stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(failure('TIMEOUT', `${step.binary} did not finish within ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(failure('NOT_SUPPORTED', `${step.binary} is not installed`));
        return;
      }
      reject(failure('INPUT_FAILED', `${step.binary} failed: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ binary: step.binary, args: step.args, stderr: stderr.trim() });
        return;
      }
      // ydotool says "failed to connect socket" when its daemon is down, and
      // that sentence is worth more to the caller than the exit code.
      const detail = stderr.trim() || `exit code ${code}`;
      reject(failure(/socket/i.test(detail) ? 'NO_INPUT_DAEMON' : 'INPUT_FAILED', `${step.binary}: ${detail}`));
    });
    if (step.stdin !== undefined) child.stdin.end(String(step.stdin));
    else child.stdin.end();
    if (step.holdsClipboard) {
      clearTimeout(timer);
      child.unref();
      // Give it a moment to own the selection before the paste key is sent.
      setTimeout(() => resolve({ binary: step.binary, args: step.args }), 250);
    }
  });
}

async function clipboardHolds(binary, text) {
  return new Promise((resolve) => {
    const child = spawn(binary, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    const done = (value) => {
      try { child.kill('SIGKILL'); } catch { }
      resolve(value);
    };
    const timer = setTimeout(() => done(false), 2500);
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('close', () => { clearTimeout(timer); done(out.trim() === String(text).trim()); });
  });
}

async function perform(action, input) {
  const caps = await capabilities();
  const planned = buildSteps(action, input, caps);
  if (planned.missing) throw failure('NOT_SUPPORTED', planned.missing);
  for (const [index, step] of planned.steps.entries()) {
    await runTool(step);
    // A paste that reads an empty selection types nothing and says nothing, so
    // the clipboard is checked before the ctrl+v goes out.
    if (planned.verifyClipboard && index === 0) {
      if (!(await clipboardHolds(planned.verifyClipboard, input.text))) {
        throw failure('CLIPBOARD_EMPTY', 'the text did not reach the clipboard, so there is nothing to paste. Install wl-clipboard (`sudo apt install wl-clipboard`) and try again.');
      }
    }
  }
  return caps.backend;
}

/** Raise the window at `app` by the title the snapshot reported. */
async function focus({ app = 0, title = '' } = {}) {
  let name = title;
  if (!name) {
    const list = await windows();
    const found = list.find((entry) => Number(entry.app) === Number(app));
    name = (found && (found.title || found.appName)) || '';
  }
  const backend = await perform('focus', { title: name });
  return { ok: true, app, appName: name, did: `focused ${name}`, backend };
}

/**
 * Start a program or open a document, then report the window that appeared.
 * Spawning detached works the same under X11 and Wayland, so only the "which
 * window is new" part needs the accessibility tree.
 */
async function launch({ target = '' } = {}) {
  const wanted = String(target || '').trim();
  if (!wanted) throw failure('BAD_ARGS', 'launch needs a target: a program, a document or a url');
  // Counted, not remembered: a second terminal has the same title as the first,
  // so "a title I have not seen" would miss it while "one more of that title"
  // catches it.
  const keyOf = (entry) => `${entry.appName}|${entry.title}`;
  const before = new Map();
  for (const entry of await windows().catch(() => [])) {
    const key = keyOf(entry);
    before.set(key, (before.get(key) || 0) + 1);
  }
  // No shell: the target is a path or a url, and passing it as one argument means
  // nothing in it can be read as a second command.
  const isUrl = /^(https?|file):\/\//i.test(wanted);
  const child = isUrl
    ? spawn('xdg-open', [wanted], { detached: true, stdio: 'ignore' })
    : spawn(wanted, [], { detached: true, stdio: 'ignore' });
  child.unref();
  child.on('error', () => {});
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const list = await windows().catch(() => []);
    const tally = new Map();
    let fresh = null;
    for (const entry of list) {
      const key = keyOf(entry);
      const seen = (tally.get(key) || 0) + 1;
      tally.set(key, seen);
      if (!fresh && seen > (before.get(key) || 0) && (entry.title || '').trim()) fresh = entry;
    }
    if (fresh) {
      return { ok: true, app: Number(fresh.app), appName: fresh.title || fresh.appName || '', did: `started ${wanted}` };
    }
  }
  /*
   * Nothing new appeared, which usually means the program was already running and
   * the window was raised instead of created. Reporting -1 there sent callers off
   * to launch it again and again, so the existing window is looked up by the
   * program's own name and handed back with `reused`.
   */
  const stem = path.basename(wanted).replace(/\.(desktop|sh)$/i, '').toLowerCase();
  const reused = (await windows().catch(() => [])).find((entry) => {
    const name = `${entry.appName || ''} ${entry.title || ''}`.toLowerCase();
    return stem && name.includes(stem);
  });
  if (reused) {
    return {
      ok: true,
      app: Number(reused.app),
      appName: reused.title || reused.appName || '',
      reused: true,
      did: `started ${wanted}; it was already open, so this is the window it owns`,
    };
  }
  return { ok: true, app: -1, appName: '', did: `started ${wanted} but no window appeared` };
}

async function keys({ app = 0, keys = '' } = {}) {
  const combo = String(keys || '').trim();
  if (!combo) throw failure('BAD_ARGS', 'keys needs a shortcut such as ctrl+s');
  await focus({ app }).catch(() => null);
  const backend = await perform('keys', { keys: combo });
  return { ok: true, app, did: `pressed ${combo}`, backend };
}

async function typeText({ app = 0, text = '' } = {}) {
  if (typeof text !== 'string' || !text) throw failure('BAD_ARGS', 'type needs the text to type');
  // The focus failure used to be swallowed here, so the text went into whatever
  // window happened to be in front and the result still said it was typed
  // (2026-11-27). With an app named, that window has to come forward first.
  if (Number(app) > 0) await focus({ app });
  const backend = await perform('type', { text });
  return { ok: true, app, did: `typed ${text.length} characters`, backend };
}

async function clickAt({ app = 0, x, y, button = 'left' } = {}) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
    throw failure('BAD_ARGS', 'clickat needs x and y in screen coordinates');
  }
  await focus({ app }).catch(() => null);
  const backend = await perform('click', { x, y, button });
  return { ok: true, app, did: `clicked ${Math.round(Number(x))},${Math.round(Number(y))}`, backend };
}

/**
 * A picture of another application's window, where the desktop allows one. X11
 * has no such rule, so ImageMagick is asked for the window by name; Wayland
 * refuses outright and says so rather than returning a blank rectangle.
 */
/**
 * The whole desktop, in one picture, on a Wayland session.
 *
 * The compositor will not let a program photograph the screen behind its back,
 * so this asks the portal and waits for its answer — which may be a permission
 * dialog the user has to approve. Everything else about the reply matches what a
 * window photograph looks like, so the caller does not branch on the platform.
 */
async function screenshotScreen() {
  const shot = await run([], { helper: PORTAL_SHOT, timeoutMs: 90000 });
  return {
    scope: 'screen',
    title: 'whole screen',
    width: shot.width || 0,
    height: shot.height || 0,
    method: 'portal',
    mimeType: 'image/png',
    data: shot.data,
  };
}

async function screenshot({ app = 0 } = {}) {
  const list = await windows();
  // By app number, never by position in the list: the number the window list
  // prints is the accessibility index, which is not where the row sits in the
  // array, so list[app] told a caller that a live Calculator "is gone".
  const wanted = Number(app);
  const row = list.find((entry) => Number(entry.app) === wanted);
  if (!row) throw failure('STALE_REF', `window ${app} is gone - ask for the window list again`);
  const caps = await capabilities();
  if (caps.session !== 'x11') {
    throw failure(
      'NOT_CAPTURABLE',
      "this desktop does not let a program photograph another application's window. Only the NTAPI window can be captured here."
    );
  }
  if (!(await commandExists('import'))) {
    throw failure('NOT_SUPPORTED', 'photographing a window on X11 needs ImageMagick: `sudo apt install imagemagick`');
  }
  const target = path.join(os.tmpdir(), `ntapi-shot-${Date.now()}.png`);
  await runTool({ binary: 'import', args: ['-window', String(row.title || 'root'), target] }, 20000);
  let data;
  try {
    data = fs.readFileSync(target).toString('base64');
  } finally {
    try { fs.unlinkSync(target); } catch { }
  }
  return { app: row.app, title: row.title || '', method: 'import', mimeType: 'image/png', data };
}

async function drag({ app = 0, x, y, toX, toY, button = 'left', steps = 8 } = {}) {
  await focus({ app }).catch(() => null);
  const backend = await perform('drag', { x, y, toX, toY, button, steps });
  return {
    ok: true,
    app,
    did: `dragged ${Math.round(Number(x))},${Math.round(Number(y))} to ${Math.round(Number(toX))},${Math.round(Number(toY))}`,
    backend,
  };
}

async function scroll({ app = 0, notches = 3 } = {}) {
  await focus({ app }).catch(() => null);
  const backend = await perform('scroll', { notches });
  return { ok: true, app, did: `scrolled ${notches} notches`, backend };
}

module.exports = {
  platform: 'linux',
  focus,
  launch,
  keys,
  type: typeText,
  clickAt,
  drag,
  scroll,
  screenshot,
  screenshotScreen,
  capabilities,
  buildSteps,
  envFor,
  available,
  windows,
  snapshot,
  act,
  MAX_NODES,
};
