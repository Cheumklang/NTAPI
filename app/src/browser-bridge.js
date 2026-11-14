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

/**
 * Every tool the agent can call, and whether it changes the page. Read tools
 * never prompt; write tools go through the app's existing approval dialog.
 */
const BROWSER_TOOLS = {
  browser_tabs: { write: false, cmd: 'tabs' },
  browser_read: { write: false, cmd: 'read' },
  browser_screenshot: { write: false, cmd: 'screenshot' },
  browser_wait: { write: false, cmd: 'wait' },
  browser_scroll: { write: false, cmd: 'scroll' },
  browser_open: { write: true, cmd: 'open' },
  browser_goto: { write: true, cmd: 'goto' },
  browser_click: { write: true, cmd: 'click' },
  browser_type: { write: true, cmd: 'type' },
  browser_fill: { write: true, cmd: 'fill' },
  browser_key: { write: true, cmd: 'key' },
  browser_eval: { write: true, cmd: 'eval' },
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
const WRITE_CMDS = new Set(Object.values(BROWSER_TOOLS).filter((t) => t.write).map((t) => t.cmd));

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

  function call(cmd, args, { timeoutMs = 15000 } = {}) {
    if (!server) return Promise.reject(bridgeError('DISABLED', 'Browser control is turned off.'));
    if (!connected || !socket) {
      return Promise.reject(bridgeError('NOT_CONNECTED', 'The browser extension is not connected.'));
    }
    seq += 1;
    const id = seq;
    const ws = socket;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(bridgeError('TIMEOUT', `The browser did not answer ${cmd} in ${timeoutMs}ms.`));
      }, timeoutMs);
      const write = WRITE_CMDS.has(cmd);
      const auditArgs = args && typeof args === 'object' ? args : {};
      pending.set(id, {
        resolve: (result) => {
          if (write) appendAudit({ cmd, url: auditArgs.url ?? null, selector: auditArgs.selector ?? null, ok: true });
          resolve(result);
        },
        reject: (err) => {
          if (write) appendAudit({ cmd, url: auditArgs.url ?? null, selector: auditArgs.selector ?? null, ok: false });
          reject(err);
        },
        timer,
        cmd,
      });
      try {
        ws.send(JSON.stringify(makeRequest(id, cmd, args)));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(bridgeError('NOT_CONNECTED', err.message));
      }
    });
  }

  return { start, stop, status, call, setToken, onStatus };
}

module.exports = {
  PROTOCOL_VERSION,
  DEFAULT_PORT,
  CHROME_EXTENSIONS_URL,
  EXTENSION_ID,
  BROWSER_TOOLS,
  browserToolNames,
  browserGuardedTools,
  isBrowserTool,
  isAllowedOrigin,
  parseFrame,
  makeRequest,
  createBrowserBridge,
};