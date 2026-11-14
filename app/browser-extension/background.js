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
  switch (cmd) {
    case 'tabs':
      return listTabs(args);
    case 'open':
      return openUrl(args);
    case 'goto':
      return gotoUrl(args);
    case 'read':
      return readPage(args);
    case 'screenshot':
      return screenshot(args);
    default:
      throw Object.assign(new Error('This command is not implemented yet.'), { code: 'UNSUPPORTED' });
  }
}

/* -------------------------------------------------------------- cdp layer */

const WINDOW_TITLE = 'NTAPI · Browser';

/** The dedicated window the agent drives, created on demand. */
async function ensureWindow() {
  if (agentWindowId !== null) {
    try {
      await chrome.windows.get(agentWindowId);
      return agentWindowId;
    } catch {
      agentWindowId = null;
    }
  }
  const win = await chrome.windows.create({ url: 'about:blank', focused: false, width: 1280, height: 860 });
  agentWindowId = win.id;
  if (win.tabs && win.tabs[0]) await chrome.tabs.update(win.tabs[0].id, { url: 'about:blank' }).catch(() => {});
  return agentWindowId;
}

/** The tab a command targets: explicit id, else the agent's last active tab. */
async function resolveTab(tabId) {
  if (Number.isInteger(tabId)) return tabId;
  const winId = await ensureWindow();
  const tabs = await chrome.tabs.query({ windowId: winId });
  const active = tabs.find((t) => t.active) || tabs[0];
  if (!active) throw Object.assign(new Error('No agent tab is open.'), { code: 'NO_TAB' });
  return active.id;
}

async function attach(tabId) {
  if (attached.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, '1.3');
  attached.add(tabId);
}

/** Send one CDP command to a tab, attaching the debugger first if needed. */
async function cdp(tabId, method, params) {
  await attach(tabId);
  const res = await chrome.debugger.sendCommand({ tabId }, method, params || {});
  return res || {};
}

function waitForLoad(tabId, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') finish();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(finish, timeoutMs);
  });
}

async function tabSummary(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return { tabId, url: tab ? tab.url : null, title: tab ? tab.title : null };
}

/* ------------------------------------------------------------ read commands */

async function listTabs(args) {
  const winId = await ensureWindow();
  if (args.focus && Number.isInteger(args.tab)) {
    await chrome.tabs.update(args.tab, { active: true }).catch(() => {});
    await chrome.windows.update(winId, { focused: true }).catch(() => {});
  }
  const tabs = await chrome.tabs.query({ windowId: winId });
  return {
    tabs: tabs.map((t) => ({ id: t.id, title: t.title || '', url: t.url || '', active: Boolean(t.active) })),
  };
}

async function openUrl(args) {
  if (typeof args.url !== 'string' || !args.url) {
    throw Object.assign(new Error('`url` is required.'), { code: 'BAD_ARGS' });
  }
  const winId = await ensureWindow();
  const tab = await chrome.tabs.create({ url: args.url, windowId: winId, active: Boolean(args.foreground) });
  await waitForLoad(tab.id);
  return tabSummary(tab.id);
}

async function gotoUrl(args) {
  if (typeof args.url !== 'string' || !args.url) {
    throw Object.assign(new Error('`url` is required.'), { code: 'BAD_ARGS' });
  }
  const tabId = await resolveTab(args.tab);
  await chrome.tabs.update(tabId, { url: args.url });
  await waitForLoad(tabId);
  return tabSummary(tabId);
}

async function readPage(args) {
  const tabId = await resolveTab(args.tab);
  const maxChars = Number.isInteger(args.maxChars) ? Math.max(200, args.maxChars) : 8000;
  const selector = typeof args.selector === 'string' && args.selector ? args.selector : null;
  const expression = selector
    ? `(document.querySelector(${JSON.stringify(selector)}) || {}).innerText || ''`
    : `document.body ? document.body.innerText : ''`;
  const res = await cdp(tabId, 'Runtime.evaluate', { expression, returnByValue: true });
  const text = String((res.result && res.result.value) || '').slice(0, maxChars);
  const summary = await tabSummary(tabId);
  return { ...summary, text };
}

async function screenshot(args) {
  const tabId = await resolveTab(args.tab);
  const res = await cdp(tabId, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: Boolean(args.fullPage),
  });
  if (!res.data) throw Object.assign(new Error('The page produced no image.'), { code: 'NO_IMAGE' });
  return Object.assign({ data: res.data, mimeType: 'image/png' }, await tabSummary(tabId));
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
