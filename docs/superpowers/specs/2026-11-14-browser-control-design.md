# Browser control — design

**Date:** 2026-11-14
**Status:** awaiting approval

## Intent

The agent can search the web and fetch docs, but it cannot *act* on a page: log
into the site the user is already signed into, fill a form, click through a flow,
or check what a page actually renders. opencode ships this through a Chrome
extension ("browse") that hands the agent the user's real browser. We want the
same capability inside NTAPI, without asking the user to log in anywhere again.

The user's constraints, in their words:

- Use the real Chrome they are already logged into — no re-login.
- The agent may click, type and fill forms, but every state-changing action asks
  first (the existing approval system is fine).
- It should be able to work in the background; the user can open a view to watch
  when they want.
- Ship an install/toggle button in the app, next to the language chip, that turns
  the feature on and off.

## Goals

- Drive the user's **existing Chrome profile** (all current cookies/sessions) via
  a small companion extension; no second login, no new browser install.
- Tools for: list/focus tabs, open URL, read page text, screenshot, click, type,
  fill fields, press a key, scroll, wait for a selector, evaluate JS.
- Approval: read-only actions run freely; state-changing actions go through the
  existing approval dialog, with the existing "remember this tool" behaviour.
- Background operation (dedicated, minimisable Chrome window) plus a "watch"
  action that brings the tab to the front.
- A toolbar chip next to `#langBtn` that enables/disables the whole feature and,
  on first use, explains how to load the extension.
- Loopback-only transport, pinned extension identity, and an audit log.

## Non-goals (v1)

- Firefox, Safari, or Edge-specific work (Chromium/Chrome only).
- Driving Chrome over raw CDP on the default profile — Chrome 136+ blocks it.
- Bundling Playwright or any browser binary.
- Multiple agents driving separate browsers at once.
- Recording/replaying flows, visual diffing, or a page-object DSL.
- Reading cookies, saved passwords, or localStorage in bulk.

## Constraints

- **Chrome 136+ ignores `--remote-debugging-port` on the default user-data dir.**
  A plain CDP attach to the user's normal profile therefore cannot work; the only
  way to keep existing logins is a Chrome extension using `chrome.debugger`.
- Chrome cannot silently install an extension. First-run must be "load unpacked"
  by the user (Developer mode), so the chip opens instructions + the folder.
- MV3 service workers are suspended; the bridge must reconnect and use `alarms`.
- The app has no bundler and CSP `connect-src 'self'`; the renderer talks to the
  main process over IPC only. The WebSocket lives in the **main** process.
- The app already ships node_modules; `ws` is present transitively and will be
  added as an explicit dependency.
- Extension files cannot live inside `app.asar`; they ship via `extraResources`.
- `shell.openExternal` is restricted to http(s)/mailto, so `chrome://extensions`
  is copied to the clipboard rather than opened.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| A | Embedded Electron browser (`BrowserWindow`/`WebContentsView`) driven by the agent | Rejected for this request: no access to the user's existing logins, which is the whole point. Still a good future option for throwaway pages. |
| B | Raw CDP attach to the user's Chrome (`--remote-debugging-port`) | Rejected: blocked on the default profile from Chrome 136; needs a copied profile and a special launch. |
| C | Copy the Chrome profile to a separate `--user-data-dir` and drive it over CDP | Rejected: App-Bound Encryption makes copied cookies unreliable on Windows, doubles disk, and goes stale. |
| E | **Companion MV3 extension using `chrome.debugger` + `chrome.tabs`/`chrome.scripting`, bridged to the app over a loopback WebSocket** | **Chosen.** Same model as opencode's `browse`, keeps existing logins, works on current Chrome, no browser download. |

## Design

### Components

```
app/browser-extension/            MV3, unpacked, shipped via extraResources
  manifest.json                   pinned "key" -> stable extension id
  background.js                   WS client + command router (chrome.debugger)
  popup.html / popup.js           pairing code entry, connection status
  icons/
app/src/browser-bridge.js         main process: WS server, pairing, gating, audit
app/src/freepi-bridge.js          registers browser_* tools, guarded list
app/src/main.js                   lifecycle: start/stop, prefs, IPC
app/src/renderer/{index.html,app.js,styles.css}   #browserBtn chip + dialogs
app/scripts/selftest-browser-bridge.js            offline tests
```

### Transport and identity

- `browser-bridge.js` starts a WebSocket server on `127.0.0.1:51789` (fixed port,
  loopback only) when the feature is enabled.
- `manifest.json` carries a committed `key`, so the unpacked extension always has
  the same id. The server rejects any handshake whose `Origin` is not
  `chrome-extension://<that id>`.
- Pairing: the app generates a 6-digit code (stored in prefs), shows it in the
  install dialog, and the extension popup asks for it once. The extension stores
  it in `chrome.storage.local` and sends `{type:'hello', token, version}` on
  connect. A wrong token closes the socket and surfaces "pairing needed".
- The extension reconnects with backoff and on `chrome.alarms` (30 s) so a
  suspended service worker comes back.

### Protocol

One JSON object per frame, request/response by id, plus unsolicited events:

```jsonc
// app -> extension
{ "id": 12, "cmd": "click", "args": { "selector": "#submit" } }
// extension -> app
{ "id": 12, "ok": true, "result": { "url": "...", "title": "..." } }
{ "id": 12, "ok": false, "error": { "code": "NO_ELEMENT", "message": "..." } }
// extension -> app events
{ "event": "status", "connected": true, "tabs": 2 }
```

Command names mirror the tools (`open`, `goto`, `tabs`, `read`, `screenshot`,
`click`, `type`, `fill`, `key`, `scroll`, `wait`, `eval`, `focus`, `close`).

### Extension command router

- Owns a dedicated Chrome window titled **"NTAPI · Browser"** (created on demand,
  `focused: false`), and puts agent tabs in it (optionally a tab group "NTAPI").
- Attaches `chrome.debugger` to the target tab on first command and detaches when
  the tab closes or the feature is turned off. One debugger per tab.
- `open`/`goto` → `chrome.tabs.create/update`, then `Page.enable`, `Page.navigate`,
  wait for `Page.loadEventFired` (with timeout).
- `read` → `Runtime.evaluate` returning `document.body.innerText` (optionally
  scoped by selector), truncated to `maxChars`.
- `screenshot` → `Page.captureScreenshot` (`captureBeyondViewport` for full page);
  works on background tabs.
- `click` → resolve the element (`selector`, or text match, or coordinates),
  scroll into view, then `Input.dispatchMouseEvent` press/release.
- `type`/`fill` → focus, clear, set value via the native setter, dispatch
  `input` + `change`; `type` can submit with Enter.
- `wait` → poll `Runtime.evaluate` for selector/text up to `timeoutMs`.
- `eval` → `Runtime.evaluate` with `awaitPromise` (always approval-gated).

### Tools (`freepi-bridge.js`)

Read-only (never prompt): `browser_tabs`, `browser_read`, `browser_screenshot`,
`browser_wait`, `browser_scroll`.
State-changing (prompt): `browser_open`, `browser_goto`, `browser_click`,
`browser_type`, `browser_fill`, `browser_key`, `browser_eval`, `browser_close`.

- Add the state-changing names to `guardedTools` so `isGuardedTool()` routes them
  through `askApproval()` (the existing overlay + "remember this tool").
- Every tool takes an optional `tab` id (from `browser_tabs`); omitted means the
  last tab the agent used in the NTAPI window.
- Each tool returns a text result (`url`, `title`, and a short summary) and, for
  `screenshot`, an `ImageContent` block when the active model accepts images,
  else the saved PNG path under the workspace `images/` folder.
- When the feature is disabled or the extension is not connected, every tool
  returns a clear, actionable error instead of hanging.

### In-app chip and install flow

- `#browserBtn` sits in the brand row beside `#langBtn` and `#settingsBtn`
  (`index.html`), using the existing `chip-btn` style. It shows a globe/spider
  icon plus a state dot.
- States: `off` → `on, waiting for extension` → `on, connected`. Click toggles
  the feature; the state is stored in `prefs.json` as
  `browserBridge: { enabled, port, token }`.
- First enable with no connection after ~3 s opens a small dialog:
  1. "เปิดโฟลเดอร์ส่วนขยาย" → `shell.openPath(<resources>/browser-extension)`.
  2. "คัดลอก chrome://extensions" → clipboard.
  3. The 6-digit pairing code.
  4. Steps: Developer mode → Load unpacked → pick the folder → paste the code.
- When connected, the dialog instead offers "ดูสิ่งที่ AI ทำ" (focus the NTAPI
  browser window) and "ตัดการเชื่อมต่อ".
- Turning the chip off stops the server, asks the extension to detach, and makes
  the tools return the disabled error. Tool registration is static (pi has no
  unregister), so gating happens at execute time.

### Approval and audit

- Reuses `askApproval`/`approval:*` exactly as shell tools do; no new dialog.
- `browser-bridge.js` appends JSONL to `<DATA_ROOT>/browser-audit.log`:
  `{ ts, cmd, url, selector, allowed }`. Rotation is out of scope for v1; the log
  is truncated at 5 MB on start.

### Security

- Loopback bind, origin pinned to the extension id, pairing token required.
- Feature off by default; nothing listens until the user enables it.
- No cookie/password/localStorage extraction; `eval` is always prompted.
- Debugger attaches only to tabs the agent created in the NTAPI window.

## Tests

- `scripts/selftest-browser-bridge.js` (offline, no Chrome):
  - protocol frame validation and id round-trip,
  - origin/token rejection,
  - `isGuardedTool` classification for every new tool,
  - disabled-feature error path,
  - audit line shape.
- Manual smoke: load unpacked → pair → open a page → read → screenshot → click a
  link → confirm the approval dialog → turn the chip off and confirm tools fail
  cleanly.

## What is left to the builder

- Exact icon, English/Thai strings, and the chip's placement spacing.
- Whether `screenshot` returns an image block or just a path (depends on model
  input support at call time).
- Port number, pairing code length, and audit retention if they prove awkward.
- Whether the NTAPI window is reused across tabs or one window per agent turn.