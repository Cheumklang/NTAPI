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
  if (typeof value.cmd !== 'string' || !value.cmd) return null;
  return value;
}

function makeRequest(id, cmd, args) {
  return { id, cmd, args: args && typeof args === 'object' ? args : {} };
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
};