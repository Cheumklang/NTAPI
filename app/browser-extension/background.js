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
async function dispatch(cmd, args) {
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
    case 'snapshot':
      return snapshotPage(args);
    case 'dialog':
      return answerDialog(args);
    case 'tabs-real':
      return listRealTabs(args);
    case 'detachAll':
      return detachEverything();
    case 'click':
      return click(args);
    case 'type':
      return typeText(args);
    case 'fill':
      return fillFields(args);
    case 'key':
      return pressKey(args);
    case 'scroll':
      return scrollPage(args);
    case 'wait':
      return waitFor(args);
    case 'eval':
      return evaluate(args);
    case 'close':
      return closeTab(args);
    default:
      throw Object.assign(new Error('This command is not implemented yet.'), { code: 'UNSUPPORTED' });
  }
}

/**
 * The service worker's entry point. A page dialog freezes the tab, so every
 * result carries whatever dialog is still waiting on it.
 */
async function handle(cmd, args) {
  return withDialog(await dispatch(cmd, args));
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

/** Page events (dialogs) only arrive once the domain is enabled. */
async function primeTab(tabId) {
  try {
    await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
  } catch {}
}

async function attach(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    attached.add(tabId);
    await primeTab(tabId);
    return;
  } catch (err) {
    const message = (err && err.message) || String(err);
    // A stale session from an earlier run looks exactly like DevTools being
    // open on the tab. Drop ours and try once more before giving up.
    if (!/another debugger|already attached/i.test(message)) throw err;
    try {
      await chrome.debugger.detach({ tabId });
    } catch {}
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      attached.add(tabId);
      await primeTab(tabId);
      return;
    } catch {
      throw Object.assign(
        new Error('Chrome is already debugging this tab. Close DevTools on it and try again.'),
        { code: 'DEBUGGER_BUSY' }
      );
    }
  }
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

/* ------------------------------------------------- dialogs + network --- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A page dialog freezes the renderer until someone answers it. Chrome tells us
 * about it as an event, so we buffer it per tab and hand it to the agent on the
 * next result instead of leaving it to guess why nothing happens.
 */
const openDialogs = new Map();
/** Requests still in flight per tab, for `wait { networkIdle: true }`. */
const inflight = new Map();
/** Tabs whose Network domain is already enabled. */
const networkOn = new Set();

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source && source.tabId;
  if (!Number.isInteger(tabId)) return;

  if (method === 'Page.javascriptDialogOpening') {
    const info = {
      type: (params && params.type) || 'alert',
      message: (params && params.message) || '',
      defaultPrompt: (params && params.defaultPrompt) || '',
    };
    // A beforeunload prompt would hang the tab until answered, and leaving the
    // page is what the agent asked for. Decline it without bothering anyone.
    if (info.type === 'beforeunload') {
      chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
      return;
    }
    openDialogs.set(tabId, info);
    return;
  }

  if (method === 'Page.javascriptDialogClosed') {
    openDialogs.delete(tabId);
    return;
  }

  if (method === 'Network.requestWillBeSent') {
    inflight.set(tabId, (inflight.get(tabId) || 0) + 1);
    return;
  }

  if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
    inflight.set(tabId, Math.max(0, (inflight.get(tabId) || 0) - 1));
  }
});

/** Every command result carries any dialog still waiting on that tab. */
function withDialog(result) {
  if (!result || typeof result !== 'object') return result;
  const tabId = result.tabId;
  if (!Number.isInteger(tabId)) return result;
  const dialog = openDialogs.get(tabId);
  if (!dialog) return result;
  return Object.assign({}, result, { dialog });
}

async function answerDialog(args = {}) {
  const tabId = await resolveTab(args.tab);
  const dialog = openDialogs.get(tabId) || null;
  const accept = Boolean(args.accept);
  await cdp(
    tabId,
    'Page.handleJavaScriptDialog',
    Object.assign({ accept }, typeof args.promptText === 'string' ? { promptText: args.promptText } : {})
  );
  openDialogs.delete(tabId);
  return Object.assign(
    { handled: Boolean(dialog), type: dialog ? dialog.type : null, message: dialog ? dialog.message : '' },
    await tabSummary(tabId)
  );
}

async function ensureNetwork(tabId) {
  if (networkOn.has(tabId)) return;
  await cdp(tabId, 'Network.enable');
  networkOn.add(tabId);
}

/**
 * A click may or may not navigate. Give a load a moment to start, then let it
 * finish — without charging a full timeout to clicks that change nothing.
 */
async function settleAfterAction(tabId) {
  await sleep(200);
  let tab = null;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {}
  if (tab && tab.status === 'loading') await waitForLoad(tabId, 10000);
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
  const maxChars = Number.isInteger(args.maxChars) ? Math.max(20, args.maxChars) : 8000;
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

/* --------------------------------------------------------- snapshot --- */

/** In-page ceiling; the app's own table cap is the same number. */
const MAX_SNAPSHOT_NODES = 1500;

/**
 * The one expression injected into a frame's isolated world.
 *
 * It reports facts only — tag, attributes, text, value — never a judgement
 * about what an element is. `src/browser-snapshot.js` makes those calls, so
 * they stay testable without a browser.
 *
 * Refs are frame-local (`e1`, `e2`, …); the app namespaces them per frame.
 */
function collectorSource() {
  return `(() => {
    const MAX = ${MAX_SNAPSHOT_NODES};
    document.querySelectorAll('[data-ntapi-ref]').forEach((el) => el.removeAttribute('data-ntapi-ref'));
    const SELECTOR = 'a,button,input,select,textarea,summary,label,option,h1,h2,h3,h4,h5,h6,' +
      '[role=button],[role=link],[role=tab],[role=checkbox],[role=radio],[role=menuitem],' +
      '[role=combobox],[role=textbox],[role=heading],[role=option],[contenteditable="true"],[onclick]';
    const kept = new Set();
    const out = [];
    let n = 0;
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (out.length >= MAX) break;
      if (el.hasAttribute('data-ntapi-ref')) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      if (el.hidden) continue;
      let depth = 0;
      for (let p = el.parentElement; p; p = p.parentElement) if (kept.has(p)) depth += 1;
      const ref = 'e' + (++n);
      el.setAttribute('data-ntapi-ref', ref);
      kept.add(el);
      let labelText = '';
      try {
        if (el.labels && el.labels.length) labelText = el.labels[0].innerText || '';
      } catch {}
      if (!labelText) {
        const by = el.getAttribute('aria-labelledby');
        if (by) {
          const target = document.getElementById(by);
          if (target) labelText = target.innerText || '';
        }
      }
      let text = '';
      try {
        text = (el.innerText || el.textContent || '').slice(0, 300);
      } catch {}
      out.push({
        ref,
        tag: (el.tagName || '').toLowerCase(),
        type: el.getAttribute('type') || '',
        roleAttr: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        labelText,
        placeholder: el.getAttribute('placeholder') || '',
        text,
        value: 'value' in el ? String(el.value == null ? '' : el.value) : '',
        disabled: el.disabled === true,
        href: el.getAttribute('href') || '',
        contentEditable: el.isContentEditable === true,
        depth,
      });
    }
    return out;
  })()`;
}

/** Flatten `Page.getFrameTree` into document order. The first entry is the root. */
function flattenFrames(tree, out = []) {
  if (!tree || !tree.frame) return out;
  out.push({ cdpFrameId: tree.frame.id || '', url: tree.frame.url || '' });
  for (const child of tree.childFrames || []) flattenFrames(child, out);
  return out;
}

/**
 * One isolated world per frame, so the collector can run where the elements
 * actually are. The root frame is reported to the app as the main frame (''),
 * which is what keeps its refs bare (`e1` rather than `MAIN:e1`).
 */
async function ensureFrameContexts(tabId) {
  await cdp(tabId, 'Page.enable');
  await cdp(tabId, 'Target.setAutoAttach', { autoAttach: true, flatten: true, waitForDebuggerOnStart: false });
  const tree = await cdp(tabId, 'Page.getFrameTree');
  const all = flattenFrames(tree && tree.frameTree ? tree.frameTree : tree);
  const rootId = all.length ? all[0].cdpFrameId : '';
  const contexts = [];
  for (const frame of all) {
    let contextId = null;
    try {
      const world = await cdp(tabId, 'Page.createIsolatedWorld', { frameId: frame.cdpFrameId, worldName: 'ntapi-snapshot' });
      contextId = world.executionContextId;
    } catch {}
    contexts.push({
      cdpFrameId: frame.cdpFrameId,
      frameId: frame.cdpFrameId === rootId ? '' : frame.cdpFrameId,
      url: frame.url,
      contextId,
    });
  }
  return contexts;
}

async function snapshotPage(args = {}) {
  const tabId = await resolveTab(args.tab);
  const contexts = await ensureFrameContexts(tabId);
  const nodes = [];
  for (const ctx of contexts) {
    if (ctx.contextId === null || ctx.contextId === undefined) continue;
    const res = await cdp(tabId, 'Runtime.evaluate', {
      expression: collectorSource(),
      contextId: ctx.contextId,
      returnByValue: true,
    });
    const list = (res.result && res.result.value) || [];
    for (const node of list) nodes.push(Object.assign({}, node, { frameId: ctx.frameId }));
  }
  return Object.assign(
    {
      frames: contexts.map((c) => ({ frameId: c.frameId, url: c.url })),
      nodes,
      truncated: nodes.length >= MAX_SNAPSHOT_NODES,
    },
    await tabSummary(tabId)
  );
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
  if (msg.type === 'claim-here') {
    const tabId = Number.isInteger(msg.tabId) ? msg.tabId : null;
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (!tab) throw new Error('no such tab');
        send({ event: 'claim', tabId: tab.id, url: tab.url || '', title: tab.title || '' });
        respond({ ok: true });
      })
      .catch(() => respond({ ok: false }));
    return true;
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

/**
 * Every tab in the browser, metadata only. The app shows these so the user can
 * pick one to hand over; nothing here reads a page.
 */
async function listRealTabs(args = {}) {
  const tabs = await chrome.tabs.query({});
  // Handing a tab over is the moment to bring it to the front, so the user can
  // see what the agent is about to work on.
  if (args.focus && Number.isInteger(args.tab)) {
    try {
      await chrome.tabs.update(args.tab, { active: true });
      const target = tabs.find((t) => t.id === args.tab);
      if (target) await chrome.windows.update(target.windowId, { focused: true });
    } catch {}
  }
  return {
    windowId: agentWindowId,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || '',
      url: tab.url || '',
      active: Boolean(tab.active),
      pinned: Boolean(tab.pinned),
      audible: Boolean(tab.audible),
      agent: agentWindowId !== null && tab.windowId === agentWindowId,
    })),
  };
}

/** Remove the refs we stamped, so a stale attribute can never be clicked later. */
async function clearRefs(tabId) {
  try {
    const contexts = await ensureFrameContexts(tabId);
    for (const ctx of contexts) {
      if (ctx.contextId === null || ctx.contextId === undefined) continue;
      await cdp(tabId, 'Runtime.evaluate', {
        expression: "document.querySelectorAll('[data-ntapi-ref]').forEach((el) => el.removeAttribute('data-ntapi-ref'))",
        contextId: ctx.contextId,
        returnByValue: true,
      });
    }
  } catch {}
}

/** Drop every debugger session and every ref we left behind. */
async function detachEverything() {
  for (const tabId of [...attached]) await clearRefs(tabId);
  await detachAll();
  return { ok: true };
}

/* ----------------------------------------------------------- write commands */

/**
 * Resolve a target element and describe it in page coordinates.
 *
 * `selector` wins; then `text` (first visible element whose text contains it);
 * then explicit `x`/`y`. Whatever matched is scrolled into view so the caller
 * can dispatch a click at its centre.
 */
/**
 * Resolve a frame's isolated world. The main frame needs none — the tab's own
 * context is it. A named frame sends the command to where the element is.
 */
async function frameContextId(tabId, frameId) {
  if (!frameId) return null;
  try {
    const contexts = await ensureFrameContexts(tabId);
    const found = contexts.find((c) => c.cdpFrameId === frameId || c.frameId === frameId);
    return found ? found.contextId : null;
  } catch {
    return null;
  }
}

/** Evaluate in a named frame when one is given, else in the tab's main frame. */
async function evalInFrame(tabId, frameId, expression, extra) {
  const params = Object.assign({ expression, returnByValue: true }, extra || {});
  const contextId = await frameContextId(tabId, frameId);
  if (contextId !== null && contextId !== undefined) params.contextId = contextId;
  return cdp(tabId, 'Runtime.evaluate', params);
}

async function locate(tabId, args) {
  const expression = `(() => {
    const sel = ${JSON.stringify(args.selector || null)};
    const text = ${JSON.stringify(args.text || null)};
    let el = null;
    if (sel) el = document.querySelector(sel);
    else if (text) {
      const wanted = text.trim();
      const all = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=link],[role=tab],[contenteditable=true]'));
      el = all.find((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return (n.innerText || n.value || n.getAttribute('aria-label') || '').includes(wanted);
      }) || null;
    }
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return {
      found: true,
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      tag: (el.tagName || '').toLowerCase(),
      label: (el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 80),
    };
  })()`;
  const res = await evalInFrame(tabId, args.frameId, expression);
  return (res.result && res.result.value) || { found: false };
}

async function click(args) {
  const tabId = await resolveTab(args.tab);
  let x = args.x;
  let y = args.y;
  let label = '';
  if (typeof args.selector === 'string' || typeof args.text === 'string') {
    const spot = await locate(tabId, args);
    if (!spot.found) {
      throw Object.assign(new Error('Nothing on the page matched the target.'), { code: 'NO_ELEMENT' });
    }
    x = spot.x;
    y = spot.y;
    label = spot.label;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw Object.assign(new Error('Give a selector, text, or x/y coordinates.'), { code: 'BAD_ARGS' });
  }
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await settleAfterAction(tabId);
  return Object.assign({ clicked: label }, await tabSummary(tabId));
}

/** Focus an element, then insert text at the caret (keeps the page's handlers). */
async function focusAndInsert(tabId, selector, text, clearFirst, frameId) {
  const focusExpr = `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    ${clearFirst ? "if ('value' in el) { const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set; if (setter) setter.call(el, ''); else el.value = ''; } else if (el.isContentEditable) { el.textContent = ''; }" : ''}
    return true;
  })()`;
  const res = await evalInFrame(tabId, frameId, focusExpr);
  if (!(res.result && res.result.value)) {
    throw Object.assign(new Error(`No element matched ${selector}.`), { code: 'NO_ELEMENT' });
  }
  await cdp(tabId, 'Input.insertText', { text: String(text ?? '') });
  await evalInFrame(
    tabId,
    frameId,
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } })()`
  );
}

async function typeText(args) {
  if (typeof args.selector !== 'string' || !args.selector) {
    throw Object.assign(new Error('`selector` is required.'), { code: 'BAD_ARGS' });
  }
  const tabId = await resolveTab(args.tab);
  await focusAndInsert(tabId, args.selector, args.text, Boolean(args.clear), args.frameId);
  if (args.submit) await pressKey({ tab: tabId, key: 'Enter' });
  return tabSummary(tabId);
}

async function fillFields(args) {
  const fields = Array.isArray(args.fields) ? args.fields : [];
  if (!fields.length) throw Object.assign(new Error('`fields` is required.'), { code: 'BAD_ARGS' });
  const tabId = await resolveTab(args.tab);
  for (const field of fields) {
    if (!field || typeof field.selector !== 'string') continue;
    await focusAndInsert(tabId, field.selector, field.value, true, field.frameId);
  }
  return Object.assign({ filled: fields.length }, await tabSummary(tabId));
}

const KEY_CODES = {
  Enter: { windowsVirtualKeyCode: 13, key: 'Enter', text: '\r' },
  Tab: { windowsVirtualKeyCode: 9, key: 'Tab' },
  Escape: { windowsVirtualKeyCode: 27, key: 'Escape' },
  Backspace: { windowsVirtualKeyCode: 8, key: 'Backspace' },
  ArrowDown: { windowsVirtualKeyCode: 40, key: 'ArrowDown' },
  ArrowUp: { windowsVirtualKeyCode: 38, key: 'ArrowUp' },
};

async function pressKey(args) {
  const name = String(args.key || 'Enter');
  const spec = KEY_CODES[name];
  if (!spec) throw Object.assign(new Error(`Unsupported key: ${name}`), { code: 'BAD_ARGS' });
  const tabId = await resolveTab(args.tab);
  if (typeof args.selector === 'string' && args.selector) {
    await focusAndInsert(tabId, args.selector, '', false, args.frameId);
  }
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', ...spec });
  if (spec.text) await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'char', text: spec.text, ...spec });
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...spec });
  return tabSummary(tabId);
}

async function scrollPage(args) {
  const tabId = await resolveTab(args.tab);
  if (typeof args.selector === 'string' && args.selector) {
    await evalInFrame(
      tabId,
      args.frameId,
      `(() => { const el = document.querySelector(${JSON.stringify(args.selector)}); if (el) el.scrollIntoView({ block: 'center', inline: 'center' }); })()`
    );
    return tabSummary(tabId);
  }
  const dy = Number.isFinite(args.dy) ? args.dy : 600;
  await evalInFrame(tabId, args.frameId, `window.scrollBy({ top: ${dy}, behavior: 'instant' })`);
  return tabSummary(tabId);
}

async function waitFor(args) {
  const timeoutMs = Number.isInteger(args.timeoutMs) ? Math.max(200, args.timeoutMs) : 10000;
  const tabId = await resolveTab(args.tab);
  if (args.networkIdle) {
    await ensureNetwork(tabId);
    const startedAt = Date.now();
    let lastPing = startedAt;
    while (Date.now() - startedAt < timeoutMs && (inflight.get(tabId) || 0) > 0) {
      await sleep(100);
      // An MV3 worker is suspended when idle; a long wait keeps it awake.
      if (Date.now() - lastPing > 20000) {
        lastPing = Date.now();
        send({ type: 'ping' });
      }
    }
    return Object.assign(
      { waited: Date.now() - startedAt, idle: (inflight.get(tabId) || 0) === 0 },
      await tabSummary(tabId)
    );
  }
  const expression = `(() => {
    const sel = ${JSON.stringify(args.selector || null)};
    const text = ${JSON.stringify(args.text || null)};
    if (sel) return Boolean(document.querySelector(sel));
    if (text) return (document.body ? document.body.innerText : '').includes(text);
    return true;
  })()`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await evalInFrame(tabId, args.frameId, expression);
    if (res.result && res.result.value) return Object.assign({ waited: Date.now() - started }, await tabSummary(tabId));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Object.assign(new Error('The page never showed what was asked for.'), { code: 'NO_ELEMENT' });
}

async function evaluate(args) {
  if (typeof args.expression !== 'string' || !args.expression) {
    throw Object.assign(new Error('`expression` is required.'), { code: 'BAD_ARGS' });
  }
  const tabId = await resolveTab(args.tab);
  const res = await cdp(tabId, 'Runtime.evaluate', {
    expression: args.expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = res.result ? res.result.value : undefined;
  return Object.assign({ value: typeof value === 'string' ? value.slice(0, 8000) : value }, await tabSummary(tabId));
}

async function closeTab(args) {
  const tabId = await resolveTab(args.tab);
  const summary = await tabSummary(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {}
  attached.delete(tabId);
  await chrome.tabs.remove(tabId);
  return summary;
}
