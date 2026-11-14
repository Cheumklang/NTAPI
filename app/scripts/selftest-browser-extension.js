/**
 * Extension command router: the MV3 service worker's `handle(cmd, args)`.
 *
 * The worker is loaded into a sandbox with a fake `chrome` API, so every
 * command path is exercised without launching a browser.
 *
 * Run from app/:   node scripts/selftest-browser-extension.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/** Records every chrome.* call so assertions can read what the worker did. */
function makeChrome() {
  const calls = [];
  const state = {
    tabs: [
      { id: 7, windowId: 3, active: true, url: 'https://example.com', title: 'Example' },
    ],
    evaluateAnswer: { found: true, x: 100, y: 50, tag: 'button', label: 'Send' },
    innerText: 'Hello page',
    attachFails: false,
    frameTree: null,
    snapshotNodes: {},
    contextSeq: 0,
    contextFrames: {},
  };

  const record = (name, payload) => calls.push({ name, payload });

  const chrome = {
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
      setTitle: () => {},
    },
    storage: { local: { get: async () => ({ token: '123456' }), set: async () => {} } },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    runtime: {
      onMessage: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
    windows: {
      get: async (id) => ({ id }),
      create: async () => ({ id: 3, tabs: [{ id: 7 }] }),
      update: async () => {},
    },
    tabs: {
      query: async () => state.tabs,
      get: async (id) => state.tabs.find((t) => t.id === id) || null,
      create: async (opts) => {
        record('tabs.create', opts);
        return { id: 7 };
      },
      update: async (id, opts) => {
        record('tabs.update', { id, ...opts });
        return { id };
      },
      remove: async (id) => record('tabs.remove', id),
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    debugger: {
      attach: async ({ tabId }) => {
        if (state.attachFails) throw new Error(state.attachFails === true ? 'attach failed' : String(state.attachFails));
        record('debugger.attach', tabId);
      },
      detach: async ({ tabId }) => record('debugger.detach', tabId),
      sendCommand: async ({ tabId }, method, params) => {
        record('cdp', { tabId, method, params });
        if (method === 'Page.getFrameTree') return { frameTree: state.frameTree };
        if (method === 'Page.createIsolatedWorld') {
          state.contextSeq += 1;
          state.contextFrames[state.contextSeq] = params.frameId;
          return { executionContextId: state.contextSeq };
        }
        if (method === 'Runtime.evaluate') {
          if (params.contextId) {
            const frameId = state.contextFrames[params.contextId];
            return { result: { value: state.snapshotNodes[frameId] || [] } };
          }
          if (state.evaluateOverride) return state.evaluateOverride;
          const expr = params.expression || '';
          if (expr.includes('Boolean(document.querySelector')) return { result: { value: false } };
          if (expr.includes('scrollIntoView')) return { result: { value: state.evaluateAnswer } };
          if (expr.includes('.focus()')) return { result: { value: true } };
          if (expr.includes('innerText')) return { result: { value: state.innerText } };
          if (expr.includes('document.querySelector') && expr.includes('return true')) return { result: { value: false } };
          if (expr.includes('Boolean(document.querySelector')) return { result: { value: false } };
          return { result: { value: true } };
        }
        if (method === 'Page.captureScreenshot') return { data: 'AAAA' };
        return {};
      },
    },
  };
  return { chrome, calls, state };
}

function loadWorker() {
  const { chrome, calls, state } = makeChrome();
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'background.js'), 'utf8');
  const sandboxModule = { exports: {} };
  const context = vm.createContext({
    chrome,
    WebSocket: function FakeWS() {
      this.readyState = 3;
      this.close = () => {};
    },
    console,
    setTimeout,
    clearTimeout,
    module: sandboxModule,
    JSON,
  });
  vm.runInContext(source, context, { filename: 'background.js' });
  return { handle: sandboxModule.exports.handle, calls, state };
}

async function expectError(fn) {
  try {
    await fn();
    return '';
  } catch (err) {
    return err.code || 'ERROR';
  }
}

async function main() {
  const { handle, calls, state } = loadWorker();
  const cdpCalls = (method) => calls.filter((c) => c.name === 'cdp' && c.payload.method === method);

  // --- unknown command ---
  check('unknown command is UNSUPPORTED', (await expectError(() => handle('nope', {}))) === 'UNSUPPORTED');

  // --- tabs ---
  const tabs = await handle('tabs', {});
  check('tabs lists the agent window', tabs.tabs.length === 1 && tabs.tabs[0].url === 'https://example.com');

  // --- read ---
  state.innerText = 'A'.repeat(100);
  const page = await handle('read', { maxChars: 40 });
  check('read clamps to maxChars', page.text.length === 40, `len=${page.text.length}`);
  state.innerText = 'Hello page';

  // --- screenshot ---
  const shot = await handle('screenshot', {});
  check('screenshot returns base64 png', shot.data === 'AAAA' && shot.mimeType === 'image/png');

  // --- open ---
  const opened = await handle('open', { url: 'https://example.org' });
  check('open creates a tab in the agent window', calls.some((c) => c.name === 'tabs.create' && c.payload.url === 'https://example.org'));
  check('open reports the tab', opened.tabId === 7);

  // --- click by text ---
  await handle('click', { text: 'Send' });
  const pressed = cdpCalls('Input.dispatchMouseEvent').filter((c) => c.payload.params.type === 'mousePressed');
  check('click dispatches a mouse press at the located point', pressed.length === 1 && pressed[0].payload.params.x === 100);

  // --- click with no match ---
  state.evaluateAnswer = { found: false };
  check('click with no match is NO_ELEMENT', (await expectError(() => handle('click', { selector: '#x' }))) === 'NO_ELEMENT');
  state.evaluateAnswer = { found: true, x: 10, y: 10, label: 'ok' };

  // --- type ---
  await handle('type', { selector: '#q', text: 'hello' });
  const inserted = cdpCalls('Input.insertText');
  check('type inserts text', inserted.length === 1 && inserted[0].payload.params.text === 'hello');

  // --- fill ---
  await handle('fill', { fields: [{ selector: '#a', value: '1' }, { selector: '#b', value: '2' }] });
  check('fill inserts every field', cdpCalls('Input.insertText').length === 3);
  const changes = cdpCalls('Runtime.evaluate').filter((c) => String(c.payload.params.expression).includes("new Event('change'"));
  check('fill fires change events', changes.length >= 2);

  // --- key ---
  await handle('key', { key: 'Enter' });
  check('key sends Enter', cdpCalls('Input.dispatchKeyEvent').some((c) => c.payload.params.key === 'Enter'));
  check('unsupported key is BAD_ARGS', (await expectError(() => handle('key', { key: 'F13' }))) === 'BAD_ARGS');

  // --- scroll ---
  await handle('scroll', { dy: 300 });
  check('scroll runs scrollBy', cdpCalls('Runtime.evaluate').some((c) => String(c.payload.params.expression).includes('scrollBy')));

  // --- wait times out ---
  check('wait with no match is NO_ELEMENT', (await expectError(() => handle('wait', { selector: '#nope', timeoutMs: 250 }))) === 'NO_ELEMENT');

  // --- eval ---
  state.evaluateOverride = { result: { value: 'Example' } };
  const evaluated = await handle('eval', { expression: 'document.title' });
  check('eval returns the value', evaluated.value === 'Example');
  check('eval requires an expression', (await expectError(() => handle('eval', {}))) === 'BAD_ARGS');
  state.evaluateOverride = null;

  // --- close ---
  await handle('close', { tab: 7 });
  check('close detaches before removing', calls.some((c) => c.name === 'debugger.detach' && c.payload === 7));
  check('close removes the tab', calls.some((c) => c.name === 'tabs.remove' && c.payload === 7));

  // --- snapshot: frames, refs, one collector run per frame ---
  state.frameTree = {
    frame: { id: 'MAIN', url: 'https://a.example' },
    childFrames: [{ frame: { id: 'F2', url: 'https://b.example' } }],
  };
  state.snapshotNodes = {
    MAIN: [{ ref: 'e1', tag: 'button', text: 'Go' }],
    F2: [{ ref: 'e1', tag: 'button', text: 'Save' }],
  };
  const snap = await handle('snapshot', { tab: 7 });
  check('snapshot returns every frame', snap.frames.length === 2, JSON.stringify(snap.frames));
  check('the main frame is reported without a prefix', snap.frames[0].frameId === '' && snap.frames[1].frameId === 'F2');
  check('snapshot tags nodes with their frame', snap.nodes.filter((n) => n.frameId === 'F2').length === 1);
  check('the collector runs once per frame with its own context', cdpCalls('Runtime.evaluate').filter((c) => c.payload.params.contextId).length === 2);
  check('the collector clears old refs as it runs', String(cdpCalls('Runtime.evaluate').find((c) => c.payload.params.contextId).payload.params.expression).includes('removeAttribute'));
  check('out-of-process iframes are auto-attached', cdpCalls('Target.setAutoAttach').length === 1);

  // --- a debugger Chrome is already holding ---
  state.attachFails = 'Another debugger is already attached to the tab with id: 8';
  check('a busy debugger is DEBUGGER_BUSY', (await expectError(() => handle('snapshot', { tab: 8 }))) === 'DEBUGGER_BUSY');
  state.attachFails = false;
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
