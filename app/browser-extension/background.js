/**
 * NTAPI Browser Bridge — MV3 service worker.
 *
 * Connects to the NTAPI desktop app over a loopback WebSocket, pairs with the
 * 6-digit code the app shows, and runs the commands the app asks for against
 * the browser the user is already signed into (via chrome.debugger, because
 * Chrome 136+ refuses remote debugging on the default profile).
 *
 * The service worker is suspended when idle, so the connection is re-established
 * on wake, on an alarm, and after any close.
 */
'use strict';

const PORT = 51789;
const RECONNECT_MS = 2000;

/** Tabs this extension has attached the debugger to, so it can detach cleanly. */
const attached = new Set();

let socket = null;
let connecting = false;
let wantConnection = true;
/** Tabs the agent created in the NTAPI window (kept so `close` can tidy up). */
let agentWindowId = null;

/* ------------------------------------------------------------------ badge */

function setBadge(text, color, title) {
  try {
    chrome.action.setBadgeText({ text });
    if (color) chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setTitle({ title: title || 'NTAPI Browser Bridge' });
  } catch {}
}

/* -------------------------------------------------------------- connection */

async function readToken() {
  const { token } = await chrome.storage.local.get('token');
  return String(token || '').trim();
}

async function connect() {
  if (connecting || socket || !wantConnection) return;
  const token = await readToken();
  if (!token) {
    setBadge('?', '#b48b16', 'NTAPI Browser Bridge — enter the pairing code');
    return;
  }

  connecting = true;
  let ws;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  } catch (err) {
    connecting = false;
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    connecting = false;
    ws.send(JSON.stringify({ type: 'hello', token, version: 1 }));
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      if (msg.ok) {
        socket = ws;
        setBadge('', '#2e9e5b', 'NTAPI Browser Bridge — connected');
      } else {
        setBadge('!', '#c0392b', 'NTAPI Browser Bridge — wrong pairing code');
        try {
          ws.close();
        } catch {}
      }
      return;
    }

    if (Number.isInteger(msg.id) && typeof msg.cmd === 'string') {
      runCommand(msg);
    }
  };

  ws.onclose = () => {
    connecting = false;
    if (socket === ws) socket = null;
    detachAll();
    setBadge('·', '#6b7280', 'NTAPI Browser Bridge — not connected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch {}
  };
}

function scheduleReconnect() {
  if (!wantConnection) return;
  setTimeout(() => {
    connect();
  }, RECONNECT_MS);
}

function send(frame) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(frame));
    return true;
  } catch {
    return false;
  }
}

/** The app turns the feature off; drop the connection and any debugger session. */
function disconnect() {
  wantConnection = false;
  detachAll();
  try {
    if (socket) socket.close();
  } catch {}
  socket = null;
  setBadge('', '#6b7280', 'NTAPI Browser Bridge — disabled');
}

/* ---------------------------------------------------------------- commands */

async function runCommand(msg) {
  let reply;
  try {
    const result = await handle(msg.cmd, msg.args || {});
    reply = { id: msg.id, ok: true, result: result || {} };
  } catch (err) {
    reply = {
      id: msg.id,
      ok: false,
      error: { code: (err && err.code) || 'EXTENSION_ERROR', message: (err && err.message) || String(err) },
    };
  }
  send(reply);
}

/** Set by the read/write command modules below; unknown cmds are rejected. */
async function handle(cmd, args) {
  void cmd;
  void args;
  throw Object.assign(new Error('This command is not implemented yet.'), { code: 'UNSUPPORTED' });
}

/* --------------------------------------------------------------- lifecycle */

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'reconnect') {
    wantConnection = true;
    try {
      if (socket) socket.close();
    } catch {}
    socket = null;
    connect();
    respond({ ok: true });
    return;
  }
  if (msg.type === 'detach-all') {
    detachAll();
    respond({ ok: true });
    return;
  }
  if (msg.type === 'status') {
    respond({ connected: Boolean(socket), token: Boolean(msg.needToken) });
  }
});

async function detachAll() {
  for (const tabId of [...attached]) {
    try {
      await chrome.debugger.detach({ tabId });
    } catch {}
    attached.delete(tabId);
  }
}

chrome.alarms.create('ntapi-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ntapi-reconnect') connect();
});

chrome.runtime.onStartup.addListener(() => connect());
chrome.runtime.onInstalled.addListener(() => connect());
connect();

/* Exported for the bundled smoke test; harmless in the service worker. */
if (typeof module !== 'undefined') {
  module.exports = { PORT, handle };
}
