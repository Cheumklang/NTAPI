/**
 * Browser control: the app side of the Chrome-extension bridge.
 *
 * The pure parts (protocol, tool catalogue) live at the top so they can be
 * tested without Chrome. The WebSocket server that pairs with the extension
 * lives below.
 *
 * Chrome 136+ ignores `--remote-debugging-port` on the default profile, so the
 * only way to drive the browser the user is already signed into is a companion
 * MV3 extension talking `chrome.debugger`. This module is that extension's
 * peer.
 */
'use strict';

const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 51789;
const CHROME_EXTENSIONS_URL = 'chrome://extensions';

/** Pinned by the `key` in browser-extension/manifest.json. */
const EXTENSION_ID = 'fnbhakfiojndenlkelamkfljofdojlba';

/** Files one `upload` may attach at a time. Visual uploads take one clip; more
 *  than a handful is a mistake worth catching before Chrome sees it. */
const MAX_UPLOAD_FILES = 5;

/**
 * Absolute, existing, non-empty files — checked in the app, not in the page.
 *
 * The extension hands these paths straight to Chrome's debugger, so this is the
 * last place that can refuse a typo, a folder, or a relative path that would be
 * resolved against Chrome's working directory instead of the user's.
 */
function checkUploadFiles(files) {
  const fs = require('node:fs');
  const path = require('node:path');
  const list = Array.isArray(files) ? files.filter((f) => typeof f === 'string' && f.trim()) : [];
  if (!list.length) {
    return { ok: false, code: 'BAD_ARGS', message: '`files` is required: absolute paths to upload.' };
  }
  if (list.length > MAX_UPLOAD_FILES) {
    return { ok: false, code: 'BAD_ARGS', message: `At most ${MAX_UPLOAD_FILES} files at once.` };
  }
  const resolved = [];
  for (const raw of list) {
    if (!path.isAbsolute(raw.trim())) {
      return { ok: false, code: 'BAD_ARGS', message: `An upload needs an absolute path, got: ${raw}` };
    }
    const file = path.resolve(raw.trim());
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return { ok: false, code: 'NO_FILE', message: `No such file: ${raw}` };
    }
    if (!stat.isFile()) return { ok: false, code: 'NO_FILE', message: `Not a file: ${raw}` };
    if (stat.size === 0) return { ok: false, code: 'BAD_ARGS', message: `That file is empty: ${raw}` };
    resolved.push(file);
  }
  return { ok: true, files: resolved };
}

/**
 * Every tool the agent can call, and whether it changes the page. Read tools
 * never prompt; write tools go through the app's existing approval dialog.
 */
const BROWSER_TOOLS = {
  browser_tabs: { write: false, cmd: 'tabs' },
  browser_find_tab: { write: false, cmd: 'tabs-real' },
  browser_read: { write: false, cmd: 'read' },
  browser_snapshot: { write: false, cmd: 'snapshot' },
  browser_screenshot: { write: false, cmd: 'screenshot' },
  browser_wait: { write: false, cmd: 'wait' },
  browser_scroll: { write: false, cmd: 'scroll' },
  browser_open: { write: true, cmd: 'open' },
  browser_upload: { write: true, cmd: 'upload' },
  browser_goto: { write: true, cmd: 'goto' },
  browser_click: { write: true, cmd: 'click' },
  browser_type: { write: true, cmd: 'type' },
  browser_fill: { write: true, cmd: 'fill' },
  browser_key: { write: true, cmd: 'key' },
  browser_eval: { write: true, cmd: 'eval' },
  browser_dialog: { write: true, cmd: 'dialog' },
  browser_close: { write: true, cmd: 'close' },
};

function browserToolNames() {
  return Object.keys(BROWSER_TOOLS);
}

function browserGuardedTools() {
  return Object.keys(BROWSER_TOOLS).filter((name) => BROWSER_TOOLS[name].write);
}

function isBrowserTool(name) {
  return Object.prototype.hasOwnProperty.call(BROWSER_TOOLS, name);
}

/** True only for the exact pinned origin; a page cannot fake it in a real client. */
function isAllowedOrigin(origin, extensionId = EXTENSION_ID) {
  return origin === `chrome-extension://${extensionId}`;
}

/**
 * Parse an incoming request frame. Returns null for anything that is not a
 * well-formed `{id, cmd}` object, so a half-open socket cannot crash the loop.
 */
function parseFrame(raw) {
  let value;
  try {
    value = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Number.isInteger(value.id) || value.id < 1) return null;
  // A request carries `cmd`; a response carries `ok`. Both share the id.
  const isRequest = typeof value.cmd === 'string' && value.cmd.length > 0;
  const isResponse = typeof value.ok === 'boolean';
  if (!isRequest && !isResponse) return null;
  return value;
}

function makeRequest(id, cmd, args) {
  return { id, cmd, args: args && typeof args === 'object' ? args : {} };
}

const AUDIT_MAX_BYTES = 5 * 1024 * 1024;

function bridgeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * The loopback server the extension pairs with. `start()` only listens; nothing
 * is written to prefs here. Callers own the enable flag.
 *
 * Returns { start, stop, status, call, setToken, onStatus }.
 */
function createBrowserBridge(options = {}) {
  const {
    port = DEFAULT_PORT,
    extensionId = EXTENSION_ID,
    token: initialToken = '',
    auditPath = null,
    log = () => {},
  } = options;

  let token = String(initialToken || '');
  let server = null;
  let socket = null;
  let connected = false;
  let seq = 0;
  let actualPort = port;
  const pending = new Map();
  const listeners = new Set();

  let claims = null;
  const activityListeners = new Set();
  const extensionEventListeners = new Set();

  function status() {
    return { enabled: Boolean(server), connected, port: actualPort, paired: Boolean(token) };
  }

  function emit() {
    const s = status();
    for (const fn of listeners) {
      try {
        fn(s);
      } catch {}
    }
  }

  function onStatus(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function setToken(next) {
    token = String(next || '');
  }

  /** The claim store decides which tabs the agent may touch at all. */
  function setClaims(next) {
    claims = next || null;
  }

  function onActivity(fn) {
    activityListeners.add(fn);
    return () => activityListeners.delete(fn);
  }

  function emitActivity(entry) {
    for (const fn of activityListeners) {
      try {
        fn(entry);
      } catch {}
    }
  }

  /** Unsolicited frames from the extension (the user handing a tab over). */
  function onExtensionEvent(fn) {
    extensionEventListeners.add(fn);
    return () => extensionEventListeners.delete(fn);
  }

  function emitExtensionEvent(event) {
    for (const fn of extensionEventListeners) {
      try {
        fn(event);
      } catch {}
    }
  }

  function hostOf(url) {
    try {
      return new URL(String(url)).hostname;
    } catch {
      return '';
    }
  }

  /**
   * Which tab a call may act on.
   *
   * An explicit tab id is honoured **only** when it is the tab the user handed
   * over. Any other id is refused — that is the whole difference between "the
   * agent may act" and "the agent may act anywhere". With no claim at all, a
   * call that names no tab is passed through untouched, so the agent's own
   * browser window keeps working exactly as it did before claims existed.
   */
  function targetFor(argsTab) {
    const held = claims && typeof claims.list === 'function' ? claims.list() : [];
    if (Number.isInteger(argsTab)) {
      if (!held.some((entry) => entry.tabId === argsTab)) {
        return {
          ok: false,
          code: 'NOT_CLAIMED',
          message: held.length
            ? `That tab was not handed to the agent. It is holding ${held.length} tab(s), and only those can be used.`
            : 'No tab is handed over yet, so there is nothing to read. Ask the user to hand one over — do not call browser_claim again if it was just refused.',
        };
      }
      return { ok: true, tabId: argsTab };
    }
    const newest = claims && typeof claims.get === 'function' ? claims.get() : null;
    return { ok: true, tabId: newest ? newest.tabId : null };
  }

  function prepareAudit() {
    if (!auditPath) return;
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      fs.mkdirSync(path.dirname(auditPath), { recursive: true });
      try {
        if (fs.statSync(auditPath).size > AUDIT_MAX_BYTES) fs.writeFileSync(auditPath, '');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (!fs.existsSync(auditPath)) fs.writeFileSync(auditPath, '');
    } catch (err) {
      log(`audit unavailable: ${err.message}`);
    }
  }

  function appendAudit(entry) {
    if (!auditPath) return;
    try {
      require('node:fs').appendFileSync(auditPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch {}
  }

  function rejectPending(code, message) {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(bridgeError(code, message));
    }
    pending.clear();
  }

  function handleConnection(ws, req) {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin, extensionId)) {
      log(`rejected origin ${origin}`);
      try {
        ws.close(1008, 'origin');
      } catch {}
      return;
    }

    let paired = false;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString('utf8'));
      } catch {
        return;
      }

      if (!paired) {
        if (!msg || msg.type !== 'hello') return;
        if (String(msg.token || '') !== token) {
          ws.send(JSON.stringify({ type: 'hello', ok: false, error: 'bad token' }));
          try {
            ws.close(1008, 'token');
          } catch {}
          return;
        }
        paired = true;
        socket = ws;
        connected = true;
        ws.send(JSON.stringify({ type: 'hello', ok: true, extensionId }));
        emit();
        return;
      }

      if (msg && typeof msg.event === 'string') {
        emitExtensionEvent(msg);
        return;
      }

      const frame = parseFrame(raw);
      if (!frame || frame.cmd) return; // the app only accepts responses here
      const entry = pending.get(frame.id);
      if (!entry) return;
      pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.ok) entry.resolve(frame.result ?? {});
      else entry.reject(bridgeError('EXTENSION_ERROR', (frame.error && frame.error.message) || 'extension error'));
    });

    ws.on('close', () => {
      if (socket !== ws) return;
      socket = null;
      connected = false;
      rejectPending('NOT_CONNECTED', 'The browser extension disconnected.');
      emit();
    });

    ws.on('error', () => {});
  }

  async function start() {
    if (server) return { port: actualPort };
    const { WebSocketServer } = require('ws');
    prepareAudit();
    return new Promise((resolve, reject) => {
      const srv = new WebSocketServer({ host: '127.0.0.1', port });
      srv.once('listening', () => {
        server = srv;
        actualPort = srv.address().port;
        log(`listening on 127.0.0.1:${actualPort}`);
        emit();
        resolve({ port: actualPort });
      });
      srv.once('error', (err) => {
        try {
          srv.close();
        } catch {}
        reject(err);
      });
      srv.on('connection', handleConnection);
    });
  }

  async function stop() {
    const srv = server;
    server = null;
    connected = false;
    try {
      if (socket) socket.close(1001, 'disabled');
    } catch {}
    socket = null;
    rejectPending('DISABLED', 'Browser control is turned off.');
    emit();
    if (!srv) return;
    await new Promise((resolve) => {
      try {
        srv.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  /**
   * Tab listings come back from Chrome knowing nothing about hand-over; the app
   * is what knows. Marking them here means `browser_find_tab` answers the whole
   * question "which tab is it, and may I use it" in one call.
   */
  function annotateTabs(result) {
    if (!result || !Array.isArray(result.tabs)) return result;
    const held = claimedTabs().map((entry) => entry.tabId);
    return {
      ...result,
      handedOver: held,
      tabs: result.tabs.map((tab) => ({ ...tab, claimed: held.includes(tab.id) })),
    };
  }

  function call(cmd, args, { timeoutMs = 15000 } = {}) {
    if (!server) return Promise.reject(bridgeError('DISABLED', 'Browser control is turned off.'));
    if (!connected || !socket) {
      return Promise.reject(bridgeError('NOT_CONNECTED', 'The browser extension is not connected.'));
    }

    const input = args && typeof args === 'object' ? { ...args } : {};
    const target = targetFor(input.tab);
    if (!target.ok) return Promise.reject(bridgeError(target.code, target.message));
    if (cmd === 'upload') {
      const checked = checkUploadFiles(input.files);
      if (!checked.ok) return Promise.reject(bridgeError(checked.code, checked.message));
      input.files = checked.files;
    }
    const callArgs = target.tabId === null ? input : { ...input, tab: target.tabId };

    seq += 1;
    const id = seq;
    const ws = socket;
    const claimed = claims && typeof claims.get === 'function' ? claims.get() : null;

    // Every command is recorded, not just the ones that change a page: the log
    // and the activity strip are the only witnesses to what the agent read as
    // well as what it did.
    const record = (ok) => {
      const tabId = Number.isInteger(callArgs.tab) ? callArgs.tab : null;
      appendAudit({
        cmd,
        tabId,
        url: callArgs.url ?? null,
        ref: callArgs.ref ?? null,
        selector: callArgs.selector ?? null,
        ok,
      });
      emitActivity({
        ts: new Date().toISOString(),
        cmd,
        tabId,
        host: hostOf(callArgs.url || (claimed ? claimed.url : '')),
        ref: callArgs.ref ?? null,
        selector: callArgs.selector ?? null,
        ok,
      });
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        record(false);
        reject(bridgeError('TIMEOUT', `The browser did not answer ${cmd} in ${timeoutMs}ms.`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (result) => {
          record(true);
          resolve(cmd === 'tabs-real' ? annotateTabs(result) : result);
        },
        reject: (err) => {
          record(false);
          reject(err);
        },
        timer,
        cmd,
      });
      try {
        ws.send(JSON.stringify(makeRequest(id, cmd, callArgs)));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(bridgeError('NOT_CONNECTED', err.message));
      }
    });
  }

  /** The tab the user handed over most recently, or null. Read live: a claim can change mid-turn. */
  function claimedTab() {
    return claims && typeof claims.get === 'function' ? claims.get() : null;
  }

  /** Every tab handed over, newest last. */
  function claimedTabs() {
    return claims && typeof claims.list === 'function' ? claims.list() : [];
  }

  return {
    start,
    stop,
    status,
    call,
    setToken,
    setClaims,
    claimedTab,
    claimedTabs,
    targetFor,
    onActivity,
    onExtensionEvent,
    onStatus,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  DEFAULT_PORT,
  CHROME_EXTENSIONS_URL,
  EXTENSION_ID,
  BROWSER_TOOLS,
  browserToolNames,
  checkUploadFiles,
  browserGuardedTools,
  isBrowserTool,
  isAllowedOrigin,
  parseFrame,
  makeRequest,
  createBrowserBridge,
};