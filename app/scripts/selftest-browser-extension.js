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
    fileInputProbe: null,
    callFunctionAnswer: { tag: 'input', type: 'file' },
    domDocument: { root: { nodeId: 1, nodeName: '#document', children: [] } },
    chooserOnGesture: false,
    nodeId: 42,
    contextSeq: 0,
    contextFrames: {},
    allTabs: null,
  };

  const eventListeners = [];
  const messageListeners = [];
  const tabRemovedListeners = [];
  const windowRemovedListeners = [];
  const sockets = [];

  /** A WebSocket stand-in the test can drive by hand. */
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      sockets.push(this);
    }
    send(frame) {
      this.sent.push(String(frame));
    }
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose();
    }
  }
  FakeWebSocket.OPEN = 1;

  const record = (name, payload) => calls.push({ name, payload });

  const chrome = {
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
      setTitle: () => {},
    },
    storage: {
      local: { get: async () => ({ token: '123456' }), set: async () => {} },
      session: {
        get: async (key) => {
          const store = state.sessionStore || {};
          return store[key] === undefined ? {} : { [key]: store[key] };
        },
        set: async (obj) => {
          state.sessionStore = Object.assign(state.sessionStore || {}, obj);
          record('storage.session.set', obj);
        },
      },
    },
    alarms: { create: () => {}, onAlarm: { addListener: () => {} } },
    runtime: {
      onMessage: { addListener: (fn) => messageListeners.push(fn) },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
    windows: {
      get: async (id) => ({ id }),
      create: async (opts) => {
        record('windows.create', opts || {});
        return { id: 3, tabs: [{ id: 7 }] };
      },
      update: async (id, opts) => record('windows.update', { id, ...opts }),
      getAll: async () => state.allWindows || [{ id: 1 }],
      getLastFocused: async () => ({ id: (state.allWindows && state.allWindows[0] && state.allWindows[0].id) || 1 }),
      onRemoved: { addListener: (fn) => windowRemovedListeners.push(fn) },
    },
    // Chrome's tab grouping: the agent's own pages live in one collapsed group
    // in the user's window, so the fake has to remember which tab went in.
    tabGroups: {
      get: async (id) => {
        record('tabGroups.get', id);
        if ((state.groups || []).includes(id)) return { id };
        throw new Error('No tab group with that id.');
      },
      update: async (id, opts) => record('tabGroups.update', { id, ...opts }),
      move: async (id, opts) => record('tabGroups.move', { id, ...opts }),
    },
    tabs: {
      group: async ({ tabIds, groupId }) => {
        const id = Number.isInteger(groupId) ? groupId : 5;
        record('tabs.group', { tabIds, groupId: id });
        state.groups = [...new Set([...(state.groups || []), id])];
        for (const tid of tabIds) {
          for (const tab of state.allTabs || state.tabs) if (tab.id === tid) tab.groupId = id;
        }
        return id;
      },
      query: async (info) => (info && Number.isInteger(info.windowId) ? state.tabs : state.allTabs || state.tabs),
      get: async (id) => (state.allTabs || state.tabs).find((t) => t.id === id) || null,
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
      onRemoved: { addListener: (fn) => tabRemovedListeners.push(fn) },
    },
    debugger: {
      attach: async ({ tabId }) => {
        if (state.attachFails) throw new Error(state.attachFails === true ? 'attach failed' : String(state.attachFails));
        record('debugger.attach', tabId);
      },
      detach: async ({ tabId }) => record('debugger.detach', tabId),
      onEvent: { addListener: (fn) => eventListeners.push(fn) },
      sendCommand: async ({ tabId }, method, params) => {
        record('cdp', { tabId, method, params });
        if (method === 'Page.handleJavaScriptDialog') return {};
        if (method === 'Page.getFrameTree') return { frameTree: state.frameTree };
        if (method === 'Page.createIsolatedWorld') {
          state.contextSeq += 1;
          state.contextFrames[state.contextSeq] = params.frameId;
          return { executionContextId: state.contextSeq };
        }
        if (method === 'Runtime.evaluate') {
          if (params.contextId) {
            const frameId = state.contextFrames[params.contextId];
            if (String(params.expression || '').includes('scrollIntoView')) return { result: { value: state.evaluateAnswer } };
            if (String(params.expression || '').includes('input[type=file]')) {
              return { result: { value: state.fileInputProbe || { total: 0, hidden: 0 } } };
            }
            return { result: { value: state.snapshotNodes[frameId] || [] } };
          }
          if (state.evaluateOverride) return state.evaluateOverride;
          if (params.userGesture && state.chooserOnGesture && String(params.expression || '').includes('el.click()')) {
            setTimeout(() => {
              eventListeners.forEach((fn) =>
                fn({ tabId: 7 }, 'Page.fileChooserOpened', { backendNodeId: 77, mode: 'selectSingle' }),
              );
            }, 10);
            return { result: { value: true } };
          }
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
        if (method === 'Runtime.callFunctionOn') return { result: { value: state.callFunctionAnswer } };
        if (method === 'DOM.requestNode') return { nodeId: state.nodeId };
        if (method === 'DOM.setFileInputFiles') return {};
        if (method === 'DOM.getDocument') return state.domDocument;
        if (method === 'Page.setInterceptFileChooserDialog') return {};
        return {};
      },
    },
  };
  return {
    chrome,
    calls,
    state,
    sockets,
    FakeWebSocket,
    emitEvent: (source, method, params) => eventListeners.forEach((fn) => fn(source, method, params)),
    dispatchMessage: (msg) => {
      let reply = null;
      for (const fn of messageListeners) fn(msg, {}, (r) => { reply = r; });
      return reply;
    },
    dispatchTabRemoved: (tabId) => tabRemovedListeners.forEach((fn) => fn(tabId, {})),
  };
}

function loadWorker() {
  const { chrome, calls, state, emitEvent, sockets, FakeWebSocket, dispatchMessage, dispatchTabRemoved } = makeChrome();
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'background.js'), 'utf8');
  const sandboxModule = { exports: {} };
  const context = vm.createContext({
    chrome,
    WebSocket: FakeWebSocket,
    console,
    setTimeout,
    clearTimeout,
    module: sandboxModule,
    JSON,
    URL,
  });
  vm.runInContext(source, context, { filename: 'background.js' });
  return { handle: sandboxModule.exports.handle, calls, state, emitEvent, sockets, dispatchMessage, dispatchTabRemoved };
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
  const { handle, calls, state, emitEvent, sockets, dispatchMessage, dispatchTabRemoved } = loadWorker();
  const cdpCalls = (method) => calls.filter((c) => c.name === 'cdp' && c.payload.method === method);

  // --- unknown command ---
  check('unknown command is UNSUPPORTED', (await expectError(() => handle('nope', {}))) === 'UNSUPPORTED');

  // --- tabs ---
  const tabs = await handle('tabs', {});
  check('tabs lists the window the user is looking at', tabs.tabs.length === 1 && tabs.tabs[0].url === 'https://example.com');

  // --- no stray about:blank windows ---
  // The MV3 worker is torn down after a few idle seconds, so a listing that
  // arrives with no window in memory used to open a fresh about:blank one.
  const lister = loadWorker();
  const listed = await lister.handle('tabs', {});
  check(
    'listing tabs never opens a window',
    lister.calls.every((c) => c.name !== 'windows.create'),
    `windows.create=${lister.calls.filter((c) => c.name === 'windows.create').length}`
  );
  check('listing tabs still finds the user window', listed.tabs.length === 1);

  const saver = loadWorker();
  await saver.handle('open', { url: 'https://a.example' });
  check('opening a page puts the tab in the agent group', (saver.state.sessionStore || {}).agentGroupId === 5);
  check(
    'the group is collapsed with a name the user can find',
    saver.calls.some((c) => c.name === 'tabGroups.update' && c.payload.collapsed === true && c.payload.title === 'NTAPI')
  );
  await saver.handle('open', { url: 'https://b.example' });
  check(
    'no window is ever created for the agent',
    saver.calls.filter((c) => c.name === 'windows.create').length === 0,
    `windows.create=${saver.calls.filter((c) => c.name === 'windows.create').length}`
  );
  check(
    'the second tab joins the same group',
    saver.calls.filter((c) => c.name === 'tabs.group' && c.payload.groupId === 5).length === 2
  );
  check(
    'the group is taken to the far left, after any pinned tabs',
    saver.calls.some((c) => c.name === 'tabGroups.move' && c.payload.index === 0),
    JSON.stringify(saver.calls.filter((c) => c.name === 'tabGroups.move'))
  );


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
  check('open creates a tab in the user window', calls.some((c) => c.name === 'tabs.create' && c.payload.url === 'https://example.org'));
  check('open files that tab under the agent group', calls.some((c) => c.name === 'tabs.group' && c.payload.tabIds.includes(7)));
  check('open reports the tab', opened.tabId === 7);

  // The bug this replaced: a handed-over tab was ignored and a new window built.
  const handed = await handle('open', { url: 'https://example.org/next', tab: 7 });
  check(
    'open with a tab in hand navigates it instead of opening another',
    calls.filter((c) => c.name === 'tabs.create').length === 1 &&
      calls.some((c) => c.name === 'tabs.update' && c.payload.id === 7 && c.payload.url === 'https://example.org/next')
  );
  check('and reports that tab', handed.tabId === 7);
  // --- closing several agent tabs, and refusing the user's ---
  const batch = await handle('close', { tabs: [7] });
  check('close accepts a list of agent tabs', Array.isArray(batch.closed) && batch.closed.length === 1);
  check('closing a list removes the tab', calls.some((c) => c.name === 'tabs.remove' && c.payload === 7));
  state.allTabs = [
    { id: 3, windowId: 1, active: true, url: 'https://user.example', title: 'Mine' },
    { id: 8, windowId: 1, active: false, groupId: 5, url: 'https://a.example', title: 'Agent A' },
  ];
  const mixed = await handle('close', { tabs: [3, 8] });
  check('a user tab in the list is refused, the agent tab still closes',
    mixed.closed.length === 1 && mixed.closed[0].tabId === 8 && mixed.refused.join(',') === '3');
  const onlyUser = await expectError(() => handle('close', { tabs: [3] }));
  check('closing only user tabs is NOT_OWNED', onlyUser === 'NOT_OWNED', onlyUser);

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
  const collectorCalls = cdpCalls('Runtime.evaluate').filter(
    (c) => c.payload.params.contextId && !String(c.payload.params.expression || '').includes('input[type=file]'),
  );
  check('the collector runs once per frame with its own context', collectorCalls.length === 2);
  check('the collector clears old refs as it runs', String(cdpCalls('Runtime.evaluate').find((c) => c.payload.params.contextId).payload.params.expression).includes('removeAttribute'));
  check('out-of-process iframes are auto-attached', cdpCalls('Target.setAutoAttach').length === 1);

  // --- a debugger Chrome is already holding ---
  state.attachFails = 'Another debugger is already attached to the tab with id: 8';
  check('a busy debugger is DEBUGGER_BUSY', (await expectError(() => handle('snapshot', { tab: 8 }))) === 'DEBUGGER_BUSY');
  state.attachFails = false;

  // --- a page dialog must be reported, never hung on ---
  emitEvent({ tabId: 7 }, 'Page.javascriptDialogOpening', { type: 'confirm', message: 'Delete campaign?', defaultPrompt: '' });
  const clicked = await handle('click', { selector: '#x' });
  check('an open dialog is reported on the result', Boolean(clicked.dialog) && clicked.dialog.message === 'Delete campaign?');

  const answered = await handle('dialog', { accept: true });
  check('dialog answers via CDP', answered.handled === true, JSON.stringify(answered));
  check('Page.handleJavaScriptDialog was asked to accept', cdpCalls('Page.handleJavaScriptDialog')[0].payload.params.accept === true);
  check('answering clears the report', (await handle('snapshot', { tab: 7 })).dialog === undefined);

  emitEvent({ tabId: 7 }, 'Page.javascriptDialogOpening', { type: 'beforeunload', message: '' });
  check('beforeunload is dismissed, not accepted', cdpCalls('Page.handleJavaScriptDialog').some((c) => c.payload.params.accept === false));
  check('beforeunload is never buffered for the agent', (await handle('snapshot', { tab: 7 })).dialog === undefined);

  // --- networkIdle tracks real inflight requests ---
  emitEvent({ tabId: 7 }, 'Network.requestWillBeSent', { requestId: 'r1' });
  const busy = await handle('wait', { networkIdle: true, timeoutMs: 250 });
  check('networkIdle gives up while a request is in flight', busy.waited >= 200, `waited=${busy.waited}`);
  check('networkIdle says it never went idle', busy.idle === false);

  emitEvent({ tabId: 7 }, 'Network.loadingFinished', { requestId: 'r1' });
  const settled = await handle('wait', { networkIdle: true, timeoutMs: 500 });
  check('networkIdle returns once nothing is inflight', settled.waited <= 200 && settled.idle === true, `waited=${settled.waited}`);

  // --- acting on a ref that lives in a subframe ---
  state.evaluateAnswer = { found: true, x: 12, y: 34, tag: 'button', label: 'Save' };
  await handle('click', { tab: 7, selector: '[data-ntapi-ref="e1"]', frameId: 'F2' });
  const framed = cdpCalls('Runtime.evaluate').filter((c) => String(c.payload.params.expression).includes('scrollIntoView'));
  const lastFramed = framed[framed.length - 1];
  check('a framed click evaluates inside the named frame', Boolean(lastFramed) && state.contextFrames[lastFramed.payload.params.contextId] === 'F2');
  const framedPress = cdpCalls('Input.dispatchMouseEvent').filter((c) => c.payload.params.type === 'mousePressed');
  check('a framed click presses at the located point', framedPress[framedPress.length - 1].payload.params.x === 12);

  // --- the app is shown every real tab, and may claim one ---
  state.allTabs = [
    { id: 3, windowId: 1, active: true, pinned: false, audible: false, url: 'https://ads.google.com/aw', title: 'Google Ads' },
    // groupId 5: the agent's own group from the open calls above.
    { id: 7, windowId: 3, active: true, pinned: false, audible: false, groupId: 5, url: 'https://example.com', title: 'Example' },
  ];
  const real = await handle('tabs-real', {});
  check('real tabs include the user window', real.tabs.some((t) => t.id === 3 && t.title === 'Google Ads'));
  check('real tabs carry no page content', !('text' in real.tabs[0]) && !('html' in real.tabs[0]) && !('nodes' in real.tabs[0]));
  check('tabs in the agent group are flagged', real.tabs.find((t) => t.id === 7).agent === true);
  check('the user window tabs are not flagged', real.tabs.find((t) => t.id === 3).agent === false);

  await handle('tabs-real', { focus: true, tab: 3 });
  check('handing a tab over brings it to the front', calls.some((c) => c.name === 'tabs.update' && c.payload.id === 3 && c.payload.active === true));
  check('and focuses the window it lives in', calls.some((c) => c.name === 'windows.update' && c.payload.id === 1 && c.payload.focused === true));

  const ws = sockets[sockets.length - 1];
  ws.readyState = 1;
  if (ws.onopen) ws.onopen();
  ws.onmessage({ data: JSON.stringify({ type: 'hello', ok: true }) });
  ws.sent.length = 0;
  dispatchMessage({ type: 'claim-here', tabId: 3 });
  await new Promise((r) => setTimeout(r, 0));
  const claimFrame = ws.sent.map((s) => JSON.parse(s)).find((f) => f.event === 'claim');
  check('the popup hands a tab over to the app', Boolean(claimFrame) && claimFrame.tabId === 3, JSON.stringify(ws.sent));
  check('the hand-over carries the tab url and title', claimFrame.url === 'https://ads.google.com/aw' && claimFrame.title === 'Google Ads');

  ws.sent.length = 0;
  dispatchMessage({ type: 'claim-here', tabId: 999 });
  await new Promise((r) => setTimeout(r, 0));
  check('handing over an unknown tab sends nothing', !ws.sent.some((s) => JSON.parse(s).event === 'claim'));

  const status = dispatchMessage({ type: 'status' });
  check('the popup can ask whether it is connected', status && status.connected === true);

  const refStrips = () =>
    cdpCalls('Runtime.evaluate').filter((c) => c.payload.params.contextId && String(c.payload.params.expression).includes('removeAttribute')).length;
  const stripsBefore = refStrips();
  const detached = await handle('detachAll', {});
  check('detachAll reports ok', detached.ok === true);
  check('detachAll strips the refs it stamped', refStrips() > stripsBefore, `${stripsBefore} -> ${refStrips()}`);
  check('detachAll detaches every attached tab', calls.some((c) => c.name === 'debugger.detach'));

  // --- the app must hear about the two things that end a hand-over run ---
  const frames = () => ws.sent.map((s) => JSON.parse(s));
  // --- upload: a hidden input needs no ref and no selector ---
  // Facebook keeps an `input type=file` hidden, and a page can never set it
  // itself — which is why uploading used to be reported as impossible.
  const uploader = loadWorker();
  uploader.state.domDocument = {
    root: {
      nodeId: 1,
      nodeName: '#document',
      children: [{ nodeId: 9, nodeName: 'INPUT', backendNodeId: 42, attributes: ['type', 'file'] }],
    },
  };
  const uploaded = await uploader.handle('upload', { files: ['C:\\clips\\a.mp4'] });
  const setFiles = uploader.calls.filter((c) => c.name === 'cdp' && c.payload.method === 'DOM.setFileInputFiles');
  check('an upload needs only files, not a selector', setFiles.length === 1 && uploaded.via === 'input', JSON.stringify(uploaded));
  check('the file goes to the input the page is hiding', setFiles[0] && setFiles[0].payload.params.backendNodeId === 42);

  // Facebook keeps the input inside a shadow root, where querySelector never
  // reaches it — the pierce walk is what finds it.
  const shadowed = loadWorker();
  shadowed.state.domDocument = {
    root: {
      nodeId: 1,
      nodeName: '#document',
      children: [
        {
          nodeId: 5,
          nodeName: 'DIV',
          shadowRoots: [
            {
              nodeId: 6,
              nodeName: '#shadow-root',
              children: [{ nodeId: 7, nodeName: 'INPUT', backendNodeId: 55, attributes: ['type', 'file'] }],
            },
          ],
        },
      ],
    },
  };
  await shadowed.handle('upload', { files: ['C:\\clips\\a.mp4'] });
  check(
    'a file input inside a shadow root is still found',
    shadowed.calls.some(
      (c) => c.name === 'cdp' && c.payload.method === 'DOM.setFileInputFiles' && c.payload.params.backendNodeId === 55,
    ),
  );

  // The click that opens the picker has to carry a user gesture, or the page's
  // own `showPicker()` is refused by Chrome.
  const gestured = loadWorker();
  gestured.state.chooserOnGesture = true;
  const gestureUpload = await gestured.handle('upload', { files: ['C:\\clips\\a.mp4'], text: 'Upload' });
  check('a picker that only opens inside a user gesture is still answered', gestureUpload.via === 'file-chooser', JSON.stringify(gestureUpload));
  check(
    'the gesture press is what opened it',
    gestured.calls.some(
      (c) => c.name === 'cdp' && c.payload.method === 'Runtime.evaluate' && c.payload.params.userGesture === true,
    ),
  );

  // --- upload: the page builds its input on click (TikTok) ---
  const chooser = loadWorker();
  chooser.state.callFunctionAnswer = { tag: 'div', type: '' };
  const started = chooser.handle('upload', { files: ['C:\\clips\\a.mp4'], text: 'Upload' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  chooser.emitEvent({ tabId: 7 }, 'Page.fileChooserOpened', { backendNodeId: 77, mode: 'selectSingle' });
  const chosen = await started;
  check('the picker a click opens is answered by the bridge', chosen.via === 'file-chooser', JSON.stringify(chosen));
  check(
    'the intercepted picker receives the file',
    chooser.calls.some(
      (c) => c.name === 'cdp' && c.payload.method === 'DOM.setFileInputFiles' && c.payload.params.backendNodeId === 77,
    ),
  );
  check(
    'interception is switched off again',
    chooser.calls.some(
      (c) => c.name === 'cdp' && c.payload.method === 'Page.setInterceptFileChooserDialog' && c.payload.params.enabled === false,
    ),
  );

  // --- upload: a page with nothing to click says what to do ---
  const stuck = loadWorker();
  stuck.state.callFunctionAnswer = { tag: 'div', type: '' };
  check('no input and no button is NO_FILE_INPUT', (await expectError(() => stuck.handle('upload', { files: ['C:\\a.mp4'] }))) === 'NO_FILE_INPUT');

  // --- snapshot: the hidden input is reported ---
  const prober = loadWorker();
  prober.state.frameTree = { frame: { id: 'MAIN', url: 'https://www.facebook.com' } };
  prober.state.snapshotNodes = { MAIN: [{ ref: 'e1', tag: 'a', text: 'Home' }] };
  prober.state.fileInputProbe = { total: 2, hidden: 1 };
  const probed = await prober.handle('snapshot', {});
  check(
    'a snapshot says how many hidden file inputs the page has',
    probed.fileInputs && probed.fileInputs.total === 2 && probed.fileInputs.hidden === 1,
    JSON.stringify(probed.fileInputs),
  );

  ws.sent.length = 0;
  dispatchTabRemoved(3);
  check('closing a tab is reported to the app', frames().some((f) => f.event === 'tabClosed' && f.tabId === 3), JSON.stringify(ws.sent));

  ws.sent.length = 0;
  emitEvent({ tabId: 7 }, 'Page.frameNavigated', { frame: { id: 'MAIN', url: 'https://ads.google.com/aw/campaigns' } });
  check('the tab navigating is reported with its url', frames().some((f) => f.event === 'navigate' && f.url === 'https://ads.google.com/aw/campaigns'));
  emitEvent({ tabId: 7 }, 'Page.frameNavigated', { frame: { id: 'F2', parentId: 'MAIN', url: 'https://b.example/x' } });
  check('a subframe navigating is not the tab navigating', frames().filter((f) => f.event === 'navigate').length === 1);
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
