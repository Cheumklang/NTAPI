# Browser Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the NTAPI agent drive the user's existing Chrome (current logins, no re-auth) through a companion MV3 extension, with approval-gated write actions and an on/off chip in the app.

**Architecture:** The app's main process runs a loopback WebSocket server (`src/browser-bridge.js`). A companion Chrome extension (`app/browser-extension/`) connects to it, pairs with a 6-digit code, and executes CDP commands via `chrome.debugger`. `freepi-bridge.js` registers `browser_*` tools that forward to the server; write tools join the existing `guardedTools` approval path. The renderer gets a `#browserBtn` chip next to `#langBtn`.

**Tech Stack:** Electron 38 (main process), Node `ws@8.23.0`, Chrome MV3 service worker, vanilla renderer JS/CSS.

**Spec:** `docs/superpowers/specs/2026-11-14-browser-control-design.md`

## Global Constraints

- Chrome/Chromium only. Never use raw CDP on the default profile (Chrome 136+ blocks it); always go through `chrome.debugger` inside the extension.
- No Playwright, no bundled browser binary. The only new dependency is `ws` (already present transitively).
- WebSocket binds `127.0.0.1` only. Default port `51789`; tests use `port: 0` and read the assigned port.
- Pinned extension id: `fnbhakfiojndenlkelamkfljofdojlba` (manifest `key` below).
- Feature is **off by default**; nothing listens until the user enables the chip.
- Renderer stays vanilla and CSP-safe: no remote code, IPC only (`connect-src 'self'`).
- Extension ships outside `app.asar` via `extraResources` to `resources/browser-extension`.
- Read tools never prompt: `browser_tabs`, `browser_read`, `browser_screenshot`, `browser_wait`, `browser_scroll`.
- Write tools always prompt: `browser_open`, `browser_goto`, `browser_click`, `browser_type`, `browser_fill`, `browser_key`, `browser_eval`, `browser_close`.
- Audit log: `<DATA_ROOT>/browser-audit.log`, JSONL, truncated at 5 MB on start.
- Pairing token lives in `prefs.json` as `browserBridge.token` (6 digits); never logged.

## Manifest key (committed verbatim)

`key` value for `browser-extension/manifest.json`:

```text
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAkqqduhj/Qybyd5kmm3lisKAugj8rftLmBEfaF/TkYgUkZcvq61p+S/K59SpVmu/wciERVxrbL9ZRvvpmoiawg8prtdeCOf9zsld3A1wWbAuyxgdGnAtOUsmVAqj0Fu0eU6VZ5cmDONsg+mpiRq2RQrAvS3IwI2rj0CwZZkelS9N8zQBo4OS0iFzzHlPrkvZqHLonheJ2h7b6LzHY+xhpiNzpb/Qpza426eIpEOT0YXrKIQaB3BDyD9gtcBUDUykMdsFB1UJAPwuDgxCzpINkWYKW3zBb7oMWdCjrOBIRpkZgEeGrZgKRIZ8aGHQDSKENUL085GFDF2Zop2wVdMZogwIDAQAB
```

Derived id: `fnbhakfiojndenlkelamkfljofdojlba`.

## Review Focus

- A tool call in flight when the user turns the chip off: it must reject promptly with `DISABLED`, never hang.
- Chrome closed mid-command: `call()` rejects with `NOT_CONNECTED` within the timeout, chip flips to "waiting", no stuck spinner.
- Extension service worker suspended and revived: status returns to `connected`, stale in-flight requests fail cleanly instead of resolving with a wrong id.
- Feature turned off while a tab is attached to the debugger: extension detaches and the yellow infobar does not linger.
- `browser_screenshot` called by a text-only model: returns a saved path + text, never an image block the model cannot read.

---

### Task 1: Protocol and tool catalogue (pure)

**Files:**
- Create: `app/src/browser-bridge.js`
- Create: `app/scripts/selftest-browser-bridge.js`
- Modify: `app/scripts/run-unit-tests.js` (add `'selftest-browser-bridge.js'` to `TESTS`, alphabetical before `selftest-empty-answer.js`)

**Interfaces:**
- Produces: `PROTOCOL_VERSION = 1`, `DEFAULT_PORT = 51789`, `EXTENSION_ID`, `CHROME_EXTENSIONS_URL = 'chrome://extensions'`, `BROWSER_TOOLS`, `browserToolNames()`, `browserGuardedTools()`, `isBrowserTool(name)`, `parseFrame(raw)`, `makeRequest(id, cmd, args)`, `isAllowedOrigin(origin, extensionId)`.

- [ ] **Step 1: Write the failing test**

Create `app/scripts/selftest-browser-bridge.js` using the repo harness (`check(name, ok, detail)`, `process.exit(failed ? 1 : 0)`):

```js
const b = require('../src/browser-bridge');
check('catalogue has 13 tools', b.browserToolNames().length === 13);
check('write tools are guarded', b.browserGuardedTools().includes('browser_click'));
check('read tools are not guarded', !b.browserGuardedTools().includes('browser_read'));
check('unknown name rejected', b.isBrowserTool('browser_nope') === false);
check('origin pinned', b.isAllowedOrigin('chrome-extension://' + b.EXTENSION_ID, b.EXTENSION_ID) === true);
check('foreign origin rejected', b.isAllowedOrigin('chrome-extension://evil', b.EXTENSION_ID) === false);
check('parse request', b.parseFrame(JSON.stringify({ id: 1, cmd: 'read', args: { maxChars: 10 } })).cmd === 'read');
check('parse bad json', b.parseFrame('{oops') === null);
check('parse missing id', b.parseFrame(JSON.stringify({ cmd: 'read' })) === null);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: `Cannot find module '../src/browser-bridge'`

- [ ] **Step 3: Implement the pure module**

In `app/src/browser-bridge.js`, export the constants above. `BROWSER_TOOLS` maps each tool name to `{ write: boolean, cmd: string }` with the exact names from Global Constraints and cmds `tabs|read|screenshot|wait|scroll|open|goto|click|type|fill|key|eval|close`. `parseFrame` returns the parsed object only when it is a non-null object with a positive integer `id` and a non-empty string `cmd`; otherwise `null`. `isAllowedOrigin` requires exact `chrome-extension://<extensionId>`.

- [ ] **Step 4: Run the test and the whole suite**

Run: `cd app && node scripts/selftest-browser-bridge.js && node scripts/run-unit-tests.js`
Expected: PASS lines, then `PASS: all 19 offline test scripts passed`

- [ ] **Step 5: Commit**

```bash
git add app/src/browser-bridge.js app/scripts/selftest-browser-bridge.js app/scripts/run-unit-tests.js
git commit -m "feat(browser): protocol and tool catalogue"
```

---

### Task 2: WebSocket server, pairing, audit

**Files:**
- Modify: `app/src/browser-bridge.js`
- Modify: `app/scripts/selftest-browser-bridge.js`

**Interfaces:**
- Produces: `createBrowserBridge({ port = DEFAULT_PORT, extensionId, token, auditPath, log })` → `{ start(), stop(), status(), call(), setToken(), onStatus() }`.
  - `start()` resolves `{ port }` (the real port; supports `port: 0`).
  - `status()` → `{ enabled, connected, port, paired }`.
  - `onStatus(fn)` returns an unsubscribe function.
- Consumes: `ws` (`require('ws')`), `node:fs`, `node:path`.

- [ ] **Step 1: Write the failing test**

Append to `app/scripts/selftest-browser-bridge.js` (wrap in `async function main()` and `main().then(() => process.exit(failed ? 1 : 0))`):

```js
const WebSocket = require('ws');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

async function connect(port, origin, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.send(JSON.stringify({ type: 'hello', token, version: 1 }));
  const reply = await new Promise((res) => ws.once('message', (d) => res(JSON.parse(d))));
  return { ws, reply };
}
```

Assertions: (a) wrong origin → socket closed, `status().connected === false`; (b) right origin wrong token → `reply.ok === false`; (c) right origin right token → `reply.ok === true` and `status().connected === true`; (d) audit file gets one line after a command (Task 3) — for now assert the file exists after start.

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: FAIL (`createBrowserBridge is not a function`)

- [ ] **Step 3: Implement the server**

- `new WebSocketServer({ host: '127.0.0.1', port })`; on `connection(ws, req)` reject when `!isAllowedOrigin(req.headers.origin, extensionId)` with `ws.close(1008)`.
- First frame must be `{type:'hello', token}`; compare with `token`, reply `{type:'hello', ok:true}` or `{type:'hello', ok:false}` + close. Mark `connected`, emit status.
- On `close`/`error`, clear the socket and emit status.
- `start()` writes nothing to prefs; it only listens. `stop()` closes the server and all sockets.
- `status()` returns the four fields; `enabled` is `true` once `start()` resolved.
- Truncate `auditPath` to empty when `fs.statSync` size > 5 MB, at `start()`.

- [ ] **Step 4: Run the test**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: all PASS, including origin/token cases.

- [ ] **Step 5: Commit**

```bash
git add app/src/browser-bridge.js app/scripts/selftest-browser-bridge.js
git commit -m "feat(browser): loopback ws server with pairing"
```

---

### Task 3: Request/response `call()` with timeout and audit

**Files:**
- Modify: `app/src/browser-bridge.js`
- Modify: `app/scripts/selftest-browser-bridge.js`

**Interfaces:**
- Produces: `call(cmd, args, { timeoutMs = 15000 } = {})` → `Promise<object>`; rejects `Error` with `.code` in `DISABLED | NOT_CONNECTED | TIMEOUT | EXTENSION_ERROR`.
- `close()` on the server rejects all pending calls with `NOT_CONNECTED`.

- [ ] **Step 1: Write the failing test**

A fake extension replies to `{id, cmd}` with `{id, ok:true, result:{done:true}}`; assert `await bridge.call('read', {})` deep-equals `{done:true}`. Then `bridge.stop()` and assert `call` rejects with `.code === 'DISABLED'`. Then start, connect, never reply, assert `.code === 'TIMEOUT'` with `timeoutMs: 50`.

- [ ] **Step 2: Run and confirm failure**

Expected: FAIL (call not a function)

- [ ] **Step 3: Implement**

- `call` increments `seq`, writes `makeRequest(seq, cmd, args)`, stores `{resolve, reject, timer}` in a `Map`.
- On message: parse; if `id` matches a pending entry, clear it and resolve `ok ? result : reject(EXTENSION_ERROR with error.message)`.
- Unmatched/`id=0` frames are ignored.
- On timeout, delete the entry and reject `TIMEOUT`.
- After a successful write command (`BROWSER_TOOLS[cmd].write`) append one JSONL audit line `{ts, cmd, url: args.url ?? null, selector: args.selector ?? null, ok}`.
- `stop()` rejects all pending with `DISABLED`.

- [ ] **Step 4: Run the test**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: PASS for resolve, DISABLED, TIMEOUT.

- [ ] **Step 5: Commit**

```bash
git add app/src/browser-bridge.js app/scripts/selftest-browser-bridge.js
git commit -m "feat(browser): request/response with timeout and audit"
```

---

### Task 4: Extension skeleton and pairing popup

**Files:**
- Create: `app/browser-extension/manifest.json`
- Create: `app/browser-extension/background.js`
- Create: `app/browser-extension/popup.html`
- Create: `app/browser-extension/popup.js`
- Create: `app/browser-extension/icons/{16,48,128}.png`

**Interfaces:**
- Produces: one shared constant `PORT = 51789` in `background.js`; popup writes `chrome.storage.local.token` and calls `chrome.runtime.sendMessage({type:'reconnect'})`.

- [ ] **Step 1: Write `manifest.json`**

Use manifest_version 3, name `NTAPI Browser Bridge`, version `0.1.0`, the exact `key` from this plan, permissions `["debugger","tabs","scripting","storage","alarms","windows"]`, `host_permissions ["<all_urls>"]`, service worker `background.js`, action popup `popup.html`, and the three icons.

- [ ] **Step 2: Write `background.js`**

- On load and on `chrome.alarms` (period 0.5 min): `connect()`.
- `connect()` reads `{token}`; if none, set badge `?` and stop. Opens `ws://127.0.0.1:51789`, sends `{type:'hello',token,version:1}`.
- On `{type:'hello', ok:true}` set badge green (`#2e9e5b`) and clear alarm jitter; on failure set badge red.
- On `close`, detach every tab in `attached` (so the yellow debugger infobar does not linger) and schedule reconnect in 2 s.
- `chrome.runtime.onMessage` handles `{type:'reconnect'}` and `{type:'detach-all'}` (detach every tab in `attached` set).

- [ ] **Step 3: Write `popup.html` / `popup.js`**

A 6-digit input, Connect button, status line. On Connect: save `token`, send `reconnect`, render status from the last badge message.

- [ ] **Step 4: Add placeholder icons**

Generate 16/48/128 px PNGs (a simple circle) with the repo's own tooling; commit them.

- [ ] **Step 5: Manual verification**

Load unpacked from `app/browser-extension`, open the popup, enter the code shown by the app once Task 8 lands; for now, run a throwaway Node bridge (`createBrowserBridge({port:51789, token:'123456', ...}).start()`) and confirm the badge turns green and `status().connected` is true.

- [ ] **Step 6: Commit**

```bash
git add app/browser-extension
git commit -m "feat(browser): mv3 extension skeleton and pairing"
```

---

### Task 5: Extension read commands

**Files:**
- Modify: `app/browser-extension/background.js`

**Interfaces:**
- Produces: `handle(cmd, args)` dispatching `tabs|open|goto|read|screenshot`.
- `ensureWindow()` creates/reuses a window titled `NTAPI · Browser`; `ensureTab(tabId?)` attaches the debugger and tracks it in `attached`.

- [ ] **Step 1: Implement `tabs`**

`chrome.tabs.query({})` filtered to the NTAPI window; return `[{id,title,url,active}]`; `args.focus` → `chrome.tabs.update(id,{active:true})` + `chrome.windows.update(winId,{focused:true})`.

- [ ] **Step 2: Implement `open` / `goto`**

`open`: `chrome.tabs.create({url, windowId})`; `goto`: `chrome.tabs.update(tabId,{url})`. Both wait for `Page.loadEventFired` with a 20 s timeout, then return `{url, title}`.

- [ ] **Step 3: Implement `read`**

`Runtime.evaluate` with `document.querySelector(selector)?.innerText ?? document.body.innerText`, clamped to `maxChars` (default 8000). Return `{url,title,text}`.

- [ ] **Step 4: Implement `screenshot`**

`Page.captureScreenshot({format:'png', captureBeyondViewport: Boolean(args.fullPage)})`; return `{data: base64, mimeType:'image/png'}`.

- [ ] **Step 5: Manual verification**

With the bridge running, call `bridge.call('open',{url:'https://example.com'})`, then `read`, then `screenshot`; confirm a tab appears in the NTAPI window and the results match the page.

- [ ] **Step 6: Commit**

```bash
git add app/browser-extension/background.js
git commit -m "feat(browser): read-side extension commands"
```

---

### Task 6: Extension write commands

**Files:**
- Modify: `app/browser-extension/background.js`

**Interfaces:**
- Produces: dispatch arms for `click|type|fill|key|scroll|wait|eval|close`. Every arm resolves with `{url,title}` unless stated.

- [ ] **Step 1: Implement `click`**

Resolve by `selector`, else by `text` (first visible element whose `innerText` contains it), else `x`/`y`. Scroll into view, read `getBoundingClientRect`, dispatch `Input.dispatchMouseEvent` `mousePressed`+`mouseReleased` at the centre.

- [ ] **Step 2: Implement `type` / `fill`**

Focus the element; for `fill`, clear via the native value setter; insert text with `Input.insertText`; dispatch `input` and `change`. `type` with `submit:true` presses Enter.

- [ ] **Step 3: Implement `key`, `scroll`, `wait`, `eval`, `close`**

`key` → `Input.dispatchKeyEvent`; `scroll` → `window.scrollBy({top: dy})` via evaluate; `wait` → poll selector/text every 100 ms up to `timeoutMs` (default 10000), reject `NO_ELEMENT`; `eval` → `Runtime.evaluate({expression, awaitPromise:true, returnByValue:true})`; `close` → detach then `chrome.tabs.remove`.

- [ ] **Step 4: Manual verification**

Against a test form page: `click` a button, `type` into an input, `fill` two fields, `wait` for a result element, `eval` `document.title`, `close` the tab; confirm the debugger infobar disappears after close.

- [ ] **Step 5: Commit**

```bash
git add app/browser-extension/background.js
git commit -m "feat(browser): write-side extension commands"
```

---

### Task 7: Register `browser_*` tools and guard the write ones

**Files:**
- Modify: `app/src/freepi-bridge.js`
- Create: `app/scripts/selftest-browser-tools.js`
- Modify: `app/scripts/run-unit-tests.js`

**Interfaces:**
- Consumes: `createBrowserBridge` instance passed as `browserBridge`.
- Produces: `createFreePiSession({ ..., browserBridge = null, guardedTools = [...defaults, ...browserGuardedTools()] })`; a `browserExtension` registered unconditionally when `browserBridge` is non-null.

- [ ] **Step 1: Write the failing test**

`selftest-browser-tools.js` imports `{ BROWSER_TOOLS, browserGuardedTools }` and asserts: 13 tool names; each `browser_*` name maps to a distinct cmd; `browser_eval` is guarded; `browser_screenshot` is not. Also assert `isGuardedTool('browser_click') === true` and `isGuardedTool('browser_read') === false` using the exported `isGuardedTool` from `freepi-bridge.js` with `guardedTools` = the new default.

- [ ] **Step 2: Run and confirm failure**

Run: `cd app && node scripts/selftest-browser-tools.js`
Expected: FAIL (`isGuardedTool` default lacks browser tools)

- [ ] **Step 3: Implement tool registration**

For each `BROWSER_TOOLS` entry register a tool named exactly as the key. Parameters per tool: `tab` (integer, optional); `open/goto` add `url` (string, required); `read` adds `selector`, `maxChars`; `click` adds `selector`, `text`, `x`, `y`; `type` adds `selector`, `text`, `submit`; `fill` adds `fields` (array of `{selector, value}`); `key` adds `key`; `scroll` adds `dy`; `wait` adds `selector`, `text`, `timeoutMs`; `eval` adds `expression` (required); `close`/`tabs` add nothing else. `execute` calls `browserBridge.call(cmd, args, { timeoutMs: cmd === 'screenshot' ? 30000 : 15000 })`.

- [ ] **Step 4: Map results to content**

Text result: `` `${result.title || ''}\n${result.url || ''}\n${summary}` ``. For `screenshot`, when `ctx.getModel()?.input?.includes('image')` return `[{type:'image',data,mimeType},{type:'text',text:'Screenshot attached.'}]`; otherwise write the PNG to `<imagesDir>/screenshot-<rand>.png` and return the path text. On error, return `{content:[{type:'text',text:`Browser error (${err.code}): ${err.message}`}], details:{ok:false}}`.

- [ ] **Step 5: Add to guards and run tests**

Extend the default `guardedTools` with `browserGuardedTools()`, and add `'selftest-browser-tools.js'` to `TESTS`. Run `cd app && npm test`; expect all 20 scripts PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/freepi-bridge.js app/scripts/selftest-browser-tools.js app/scripts/run-unit-tests.js
git commit -m "feat(browser): register tools behind the approval gate"
```

---

### Task 8: Main-process lifecycle, prefs, IPC

**Files:**
- Modify: `app/src/main.js`
- Modify: `app/src/preload.js`

**Interfaces:**
- Produces IPC: `browser:status` → `{enabled,connected,port,paired,installed}`; `browser:toggle {enabled}` → same status; `browser:watch` → `void`; `browser:installInfo` → `{folder, chromeUrl, code}`; `browser:openFolder` → `{ok}`.
- Produces preload: `browserStatus()`, `browserToggle(enabled)`, `browserWatch()`, `browserInstallInfo()`, `browserOpenFolder()`, `onBrowserStatus(cb)`.

- [ ] **Step 1: Create the bridge instance**

Import `{ createBrowserBridge, EXTENSION_ID, DEFAULT_PORT }` from `./browser-bridge`. After `DATA_ROOT` is defined: `const browserBridge = createBrowserBridge({ extensionId: EXTENSION_ID, token: ensureBrowserToken(), auditPath: path.join(DATA_ROOT,'browser-audit.log'), log: (l) => console.log('[browser]', l) })` where `ensureBrowserToken()` reads `readPrefs().browserBridge.token` or generates six digits and writes it. `browserBridge.onStatus((s) => broadcast('browser:status', s))` (broadcast to all windows).

- [ ] **Step 2: Boot behaviour**

On `app.whenReady()`, when `readPrefs().browserBridge?.enabled` is true, call `browserBridge.start()`.

- [ ] **Step 3: IPC handlers**

Implement the five handlers. `browser:installInfo.folder` = `app.isPackaged ? path.join(process.resourcesPath,'browser-extension') : path.join(__dirname,'..','browser-extension')`; `chromeUrl` = `chrome://extensions`; `code` = the token. `browser:openFolder` → `shell.openPath(folder)`. `browser:watch` → `browserBridge.call('tabs',{focus:true})`. `browser:toggle` starts/stops and writes `browserBridge.enabled`.

- [ ] **Step 4: Extend `prefs:set`**

Allow `patch.browserBridge.enabled` (boolean) only; never accept a token from the renderer.

- [ ] **Step 5: Pass the bridge into sessions**

In `attachTab`, add `browserBridge` to the `createFreePiSession` options.

- [ ] **Step 6: Preload + verify**

Add the six methods. Run `cd app && npm test` and `npx electron .`; with the chip still absent, call `window.api.browserStatus()` from DevTools and expect `{enabled:false,...}`.

- [ ] **Step 7: Commit**

```bash
git add app/src/main.js app/src/preload.js
git commit -m "feat(browser): lifecycle, prefs and ipc"
```

---

### Task 9: Renderer chip, dialog, copy

**Files:**
- Modify: `app/src/renderer/index.html`
- Modify: `app/src/renderer/app.js`
- Modify: `app/src/renderer/styles.css`

**Interfaces:**
- Consumes: the preload methods from Task 8.
- Produces: `#browserBtn` (class `chip-btn`), `#browserDialog` markup, `refreshBrowserChip()`, `openBrowserDialog()`.

- [ ] **Step 1: Add markup**

After `<button id="langBtn" …>`, add `<button id="browserBtn" class="chip-btn" title="Browser control" aria-label="Browser control"><span class="dot"></span></button>` and the dialog markup (hidden) with: title, status text, pair code, buttons `#browserOpenFolder`, `#browserCopyUrl`, `#browserWatch`, `#browserToggle`.

- [ ] **Step 2: Add strings**

Add `browserTitle`, `browserOff`, `browserWaiting`, `browserConnected`, `browserInstallTitle`, `browserInstallSteps`, `browserOpenFolder`, `browserCopyExtensions`, `browserPairCode`, `browserWatch`, `browserDisconnect`, `browserConnect` to both `STRINGS.en` and `STRINGS.th`.

- [ ] **Step 3: Wire the chip**

`refreshBrowserChip()` maps status → dot class (`off`, `waiting`, `on`) and title text; call it on boot and on `api.onBrowserStatus`. Click toggles: if `enabled` → `browserToggle(false)`; else `browserToggle(true)` then `openBrowserDialog()` when not connected after 3 s. Dialog buttons call the IPC and copy `chrome://extensions` via `navigator.clipboard`.

- [ ] **Step 4: Style**

`.chip-btn .dot` 8 px circle; `.dot.off` grey, `.dot.waiting` amber, `.dot.on` green; the dialog reuses the existing modal classes.

- [ ] **Step 5: Manual verification**

Open the app: chip shows grey. Click → dialog with folder button, code, steps. Load the extension, pair, chip turns green. Click `ดูสิ่งที่ AI ทํา` → Chrome window focuses. Click the chip again → grey and `browserStatus().connected` false.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/index.html app/src/renderer/app.js app/src/renderer/styles.css
git commit -m "feat(browser): toolbar chip and install dialog"
```

---

### Task 10: Packaging

**Files:**
- Modify: `app/package.json`

**Interfaces:**
- Produces: `build.extraResources` entry; `dependencies.ws`.

- [ ] **Step 1: Add the dependency**

Run: `cd app && npm install ws@8.23.0 --save-exact`
Expected: `package.json` lists `"ws": "8.23.0"`; lockfile updated.

- [ ] **Step 2: Ship the extension outside asar**

Add to `build`:

```json
"extraResources": [{ "from": "browser-extension", "to": "browser-extension" }]
```

- [ ] **Step 3: Verify the artifact**

Run: `cd app && npm run dist`
Expected: build succeeds; `../dist/win-unpacked/resources/browser-extension/manifest.json` exists.

- [ ] **Step 4: Commit**

```bash
git add app/package.json app/package-lock.json
git commit -m "build(browser): ship extension via extraResources"
```

---

### Task 11: End-to-end smoke and handoff notes

**Files:**
- Modify: `.AGENT/HANDOFF.md`
- Modify: `.AGENT/STATE.md`

- [ ] **Step 1: Run the full offline suite**

Run: `cd app && npm test`
Expected: `PASS: all 20 offline test scripts passed`.

- [ ] **Step 2: Manual end-to-end**

Load unpacked → pair → ask the agent to “open example.com and read the heading” (read tools, no prompt) → ask it to “click the More information link” (approval prompt appears) → approve → confirm navigation → turn the chip off → confirm a browser tool now returns the disabled error.

- [ ] **Step 3: Record what was verified**

Add a short section to `.AGENT/HANDOFF.md` and `.AGENT/STATE.md`: extension id, port, pairing flow, the two known UX costs (debugger infobar, broad permissions), and that the feature is off by default.

- [ ] **Step 4: Commit**

```bash
git add .AGENT/HANDOFF.md .AGENT/STATE.md
git commit -m "docs: browser control handoff"
```