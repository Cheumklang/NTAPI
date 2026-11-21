# Browser Agent Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the NTAPI agent see a web page as an indexed structure (not a text blob), act on elements by stable refs, work inside a tab the user explicitly hands over, and run a whole task there without an approval per step — while the user watches and can stop it.

**Architecture:** The existing MV3 companion extension + loopback WebSocket + `chrome.debugger` transport is kept unchanged. Two things are added: (1) the extension returns *raw DOM facts* and the app turns them into a compact ref-indexed snapshot (so all the interpretation lives in testable pure modules in `app/src/`), and (2) a claim/autopilot layer in the main process decides which tab the agent may touch and whether an action needs approval. No in-app browser, no screenshots as the primary channel.

**Tech Stack:** Node 20 (Electron 38 main process), Chrome MV3 service worker, Chrome DevTools Protocol via `chrome.debugger`, plain CommonJS, no bundler. Tests are plain Node scripts run by `app/scripts/run-unit-tests.js`.

**Spec:** `docs/superpowers/specs/2026-11-14-browser-agent-mode-design.md`

## Global Constraints

- **Never `git commit`, `push`, tag, or bump a version without asking the user first.** The user drives the repo with GitHub Desktop. Commit messages are one line, in Thai. Version bumps (`app/package.json`) happen only when the user says so.
- **Never read or touch `C:\Program Files\NTAPI\`.** Test from source only: `cd app && npm start`.
- Every new `app/scripts/selftest-*.js` must be added to the `TESTS` array in `app/scripts/run-unit-tests.js`, or `npm test` silently skips it.
- Run tests with `cd app && npm test` (offline: no network, no API keys, no Electron window).
- No bundler. The renderer talks to main over IPC only (CSP `connect-src 'self'`). The WebSocket server stays in the **main** process.
- `manifest.json` permissions stay as they are (`debugger`, `tabs`, `scripting`, `storage`, `alarms`, `windows`, `<all_urls>`) — nothing here needs a new one.
- Chrome only. Do not add Firefox/Safari branches.
- Every user-visible string needs a matching entry in **both** maps in `app/src/renderer/app.js` (EN and TH).
- Snapshot budgets (fixed by the spec): `maxNodes = 300`, `maxNameChars = 120`, `maxChars = 12000`; the app-side ref table keeps up to `maxTableNodes = 1500` collected nodes so `browser_find` can search beyond what the model was shown.
- Audit lines are JSONL appended to `<DATA_ROOT>/browser-audit.log`, truncated at 5 MB (`AUDIT_MAX_BYTES`), and must cover **every** browser command, read and write.
- `browser_eval`, and anything whose target label matches `pay|purchase|delete|remove account|ยืนยันการชำระ|ลบบัญชี`, always asks for approval, even in autopilot.

## Review Focus

Inputs and conditions the spec implies but no task's happy path covers. Each has a test in the task that owns the code.

1. **The tab is closed, navigated away, or the claim is released while a task runs.** Every browser tool must fail with a named error (`NOT_CLAIMED` / `NO_TAB`), autopilot must stop, and the activity strip must say so — never a silent no-op.
2. **A ref from another tab, or from before a navigation, is used.** It must be refused with `STALE_REF` and must never be resolved to whatever now sits at that position.
3. **The page writes its own `data-ntapi-ref` attributes, or leaves ours behind.** A stale/forged ref must not become a click on the wrong element; our attributes are removed on every snapshot.
4. **A page with nothing interactive (blank tab, PDF viewer, canvas app).** The snapshot must return a clear empty result promptly, not hang or crash the agent loop.
5. **Very long labels and non-ASCII labels (Thai, emoji).** Truncation must cut cleanly (no split surrogate pair) and stay within `maxNameChars`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/src/browser-snapshot.js` *(new)* | Pure: raw DOM facts → roles, names, namespaced refs, budgeted text, ref table, `find` |
| `app/src/browser-claims.js` *(new)* | Pure: registrable domain (eTLD+1) + the single-tab claim store |
| `app/src/browser-autopilot.js` *(new)* | Pure: autopilot state machine, expiry rules, always-ask list |
| `app/browser-extension/background.js` *(modify)* | Raw DOM collection, frame contexts, dialogs, navigation settling, real-tab listing |
| `app/src/browser-bridge.js` *(modify)* | New commands in the catalogue, per-command audit, tab-id gating |
| `app/src/freepi-bridge.js` *(modify)* | New tools, `ref` params, ref→selector translation, snapshot table cache, auto-snapshot |
| `app/src/main.js` *(modify)* | Claim + autopilot state, new IPC, activity events |
| `app/src/preload.js` *(modify)* | The new IPC surface |
| `app/src/renderer/{index.html,app.js,styles.css}` *(modify)* | Tabs list, claim/release, autopilot toggle, activity strip |
| `app/browser-extension/popup.{html,js}` *(modify)* | "ใช้แท็บที่เปิดอยู่" |
| `app/scripts/selftest-browser-{snapshot,claims,autopilot}.js` *(new)* and `selftest-browser-{bridge,extension,tools}.js` *(modify)* | Tests |

Phase A (Tasks 1–4) makes the agent perceive and act reliably **inside its own window** and ships on its own. Phase B (Tasks 5–12) adds the real-tab hand-over and autonomy.

---

# Phase A — perception

### Task 1: Snapshot interpretation module

**Files:**
- Create: `app/src/browser-snapshot.js`
- Test: `app/scripts/selftest-browser-snapshot.js`
- Modify: `app/scripts/run-unit-tests.js` (add the test to `TESTS`)

**Interfaces:**
- Consumes: nothing.
- Produces: the raw node shape every later task uses — `{ ref, frameId, tag, type, roleAttr, ariaLabel, labelText, text, value, disabled, href, depth }` — and
  `roleOf(node) -> string`, `nameOf(node, maxChars) -> string`,
  `namespaceRef(frameId, ref) -> string`, `parseRef(ref) -> { frameId, ref }`,
  `formatSnapshot(raw, opts) -> { text, table, shown, total, truncated }`,
  `findInTable(table, { text, selector, max }) -> { matches: [{ref, role, name}], count }`.

- [ ] **Step 1: Write the failing test**

```js
const { roleOf, nameOf, namespaceRef, parseRef, formatSnapshot, findInTable } = require('../src/browser-snapshot');

check('input[type=email] is a textbox', roleOf({ tag: 'input', type: 'email' }) === 'textbox');
check('input[type=checkbox] is a checkbox', roleOf({ tag: 'input', type: 'checkbox' }) === 'checkbox');
check('select is a combobox', roleOf({ tag: 'select' }) === 'combobox');
check('role=tab wins over the tag', roleOf({ tag: 'div', roleAttr: 'tab' }) === 'tab');
check('h2 is a heading', roleOf({ tag: 'h2' }) === 'heading');

check('aria-label wins', nameOf({ ariaLabel: 'Search', text: 'ignored' }) === 'Search');
check('label text is used next', nameOf({ labelText: 'Campaign name' }) === 'Campaign name');
check('placeholder is used for an empty input', nameOf({ tag: 'input', placeholder: 'Email' }) === 'Email');
check('name is truncated to maxNameChars', nameOf({ ariaLabel: 'ก'.repeat(400) }, 120).length === 120);
check('truncation keeps whole characters', !/[\uD800-\uDBFF]$/.test(nameOf({ ariaLabel: '😀'.repeat(200) }, 5)));

check('refs round-trip through a frame', (() => {
  const n = namespaceRef('F2', 'e7');
  return n === 'F2:e7' && parseRef(n).frameId === 'F2' && parseRef(n).ref === 'e7';
})());
check('a main-frame ref has no prefix', namespaceRef('', 'e7') === 'e7' && parseRef('e7').frameId === '');

// formatting + budget
const raw = { frames: [{ frameId: '', url: 'https://ads.google.com/x' }], nodes: [ /* … 400 nodes … */ ] };
const out = formatSnapshot(raw, {});
check('text shows at most maxNodes nodes', out.shown === 300);
check('the table keeps every node for find', out.table.size === 400);
check('the text says it was truncated', /truncated/i.test(out.text));
check('the char cap wins when it is smaller', formatSnapshot(raw, { maxChars: 200 }).text.length <= 200);
check('an empty page formats to a clear message', /no interactive elements/i.test(formatSnapshot({ frames: [], nodes: [] }, {}).text));

// find
const table = formatSnapshot(raw, {}).table;
check('find by text matches by substring, case-insensitively', findInTable(table, { text: 'continue' }).count >= 1);
check('find respects max', findInTable(table, { text: 'e' }, ).matches.length <= 20);
check('find on an empty query returns nothing', findInTable(table, {}).count === 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && node scripts/selftest-browser-snapshot.js`
Expected: FAIL — `Cannot find module '../src/browser-snapshot'`.

- [ ] **Step 3: Implement `app/src/browser-snapshot.js`**

Pure CommonJS, no `require` of anything but `node:util` if needed. `roleOf` maps tag+type+`role` attribute to one of `button, link, textbox, combobox, checkbox, radio, tab, menuitem, option, heading, label, summary, contenteditable, other`. `nameOf` tries `ariaLabel → labelText → placeholder → value → text`, trims, and cuts at `maxChars` without splitting a surrogate pair. `formatSnapshot` namespaces refs, computes role/name per node, builds `table` (a `Map` keyed by namespaced ref) over **all** nodes up to `maxTableNodes`, renders `text` from the first `maxNodes` with indentation by `depth` and a `frame <id> <url>` header per frame, applies `maxNameChars` and `maxChars`, and appends a truncation notice when either cap bit. Lines look like:

```
frame main   https://ads.google.com/aw/campaigns
  e1 [link] "Campaigns"
  e9 [button] "Continue"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && node scripts/selftest-browser-snapshot.js`
Expected: PASS lines only, exit 0.

- [ ] **Step 5: Add to the runner and run the whole suite**

Add `'selftest-browser-snapshot.js'` to `TESTS` in `app/scripts/run-unit-tests.js`. Run: `cd app && npm test`. Expected: `PASS: all <n> offline test scripts passed`.

- [ ] **Step 6: Commit — ask first**

Show the diff and ask the user. Suggested message: `feat: โมดูลแปลงโครงสร้างหน้าเว็บเป็น snapshot แบบมี ref`

---

### Task 2: Extension raw DOM collection and frame contexts

**Files:**
- Modify: `app/browser-extension/background.js` (add the `snapshot` command, its collector, frame contexts)
- Test: `app/scripts/selftest-browser-extension.js` (extend)

**Interfaces:**
- Consumes: nothing from Task 1 (the extension returns raw facts; Task 1 interprets them).
- Produces: `handle('snapshot', { tab }) -> { tabId, url, title, frames: [{ frameId, url }], nodes: [RawNode], truncated: boolean }`, where `RawNode` is the `{ ref, frameId, tag, type, roleAttr, ariaLabel, labelText, placeholder, text, value, disabled, href, depth }` shape from Task 1. Errors: `NO_TAB`, `DEBUGGER_BUSY`.

- [ ] **Step 1: Write the failing test**

In `selftest-browser-extension.js`, teach `makeChrome()` to answer the new CDP methods (`Page.enable`, `Page.getFrameTree`, `Page.createIsolatedWorld`, `Target.setAutoAttach`) and let a test set `state.frameTree` and `state.snapshotNodes`. Then:

```js
state.frameTree = { frame: { id: 'MAIN', url: 'https://a.example' }, childFrames: [{ frame: { id: 'F2', url: 'https://b.example' } }] };
state.snapshotNodes = { MAIN: [{ ref: 'e1', tag: 'button', text: 'Go' }], F2: [{ ref: 'e1', tag: 'button', text: 'Save' }] };
const snap = await handle('snapshot', { tab: 7 });
check('snapshot returns every frame', snap.frames.length === 2);
check('snapshot tags nodes with their frame', snap.nodes.filter((n) => n.frameId === 'F2').length === 1);
check('the collector runs once per frame with its own context', cdpCalls('Runtime.evaluate').filter((c) => c.payload.params.contextId).length === 2);
check('out-of-process iframes are auto-attached', cdpCalls('Target.setAutoAttach').length === 1);

state.attachFails = 'Already attached';
check('a busy debugger is DEBUGGER_BUSY', (await expectError(() => handle('snapshot', { tab: 7 }))) === 'DEBUGGER_BUSY');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: FAIL — `snapshot` is `UNSUPPORTED`.

- [ ] **Step 3: Implement in `background.js`**

Add a `collectorSource()` returning the string injected by `Runtime.evaluate` (one expression, self-contained, must run in an **isolated world**). It walks `document`, keeps interactive and landmark elements that are visible (non-zero box, not `hidden`/`display:none`/`visibility:hidden`/`opacity:0`), stamps each with `data-ntapi-ref="eN"`, and returns the raw facts. Add `ensureFrameContexts(tabId)` (`Page.enable` → `Page.getFrameTree` → `Page.createIsolatedWorld` per frame → keep `executionContextId`, plus `Target.setAutoAttach { autoAttach: true, flatten: true }`). Add the `snapshot` command: clear old `data-ntapi-ref` attributes in every frame first, run the collector per frame with its `contextId`, and merge results. Map an `attach` failure whose message matches `/another debugger|already attached/i` to code `DEBUGGER_BUSY`; retry `attach` once after a `detach` before giving up.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: ส่วนขยายเก็บโครงสร้างหน้าและเจาะ iframe ข้ามโดเมนได้`

---

### Task 3: Navigation settling and JS dialogs

**Files:**
- Modify: `app/browser-extension/background.js`
- Test: `app/scripts/selftest-browser-extension.js` (extend)

**Interfaces:**
- Consumes: the frame contexts from Task 2.
- Produces: a new command `dialog { tab, accept, promptText? } -> { handled: boolean, type, message }`; a `dialog` field on **every** command result when a dialog is open (`{ type, message, defaultPrompt }`); `wait { networkIdle: true, timeoutMs }`.

- [ ] **Step 1: Write the failing test**

```js
// a page dialog is buffered and reported instead of hanging
state.dialog = { type: 'confirm', message: 'Delete campaign?', defaultPrompt: '' };
const clicked = await handle('click', { selector: '#x' });
check('an open dialog is reported on the result', clicked.dialog && clicked.dialog.message === 'Delete campaign?');

const answered = await handle('dialog', { accept: true });
check('dialog answers via CDP', answered.handled === true);
check('Page.handleJavaScriptDialog was asked to accept', cdpCalls('Page.handleJavaScriptDialog')[0].payload.params.accept === true);

state.dialog = { type: 'beforeunload', message: '' };
await handle('snapshot', {});
check('beforeunload is dismissed, not accepted', cdpCalls('Page.handleJavaScriptDialog').some((c) => c.payload.params.accept === false));

state.inflight = 0;
const settled = await handle('wait', { networkIdle: true, timeoutMs: 300 });
check('networkIdle returns when nothing is inflight', Boolean(settled.waited) || settled.waited === 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: FAIL on the three new checks.

- [ ] **Step 3: Implement in `background.js`**

Subscribe `Page.javascriptDialogOpening` / `Page.javascriptDialogClosed` on each attached tab; buffer the open dialog and attach it to the next command result. Auto-answer `beforeunload` with `accept: false`. Add the `dialog` command (`Page.handleJavaScriptDialog { accept, promptText }`). Add a `waitForNavigation(tabId)` helper (`Page.frameNavigated` for the main frame + `Page.loadEventFired`, with timeout and a `document.readyState` fallback) and use it after `open`/`goto`/a click that navigates. Add `Network.enable` + a bounded inflight counter for `wait { networkIdle: true }`, with a keep-alive ping on the socket every 20 s while waiting.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit — ask first**

Suggested message: `fix: จัดการ dialog ของหน้าเว็บและรอ navigate หลังคลิก`

---

### Task 4: `browser_snapshot` / `browser_find` tools and ref targeting

**Files:**
- Modify: `app/src/browser-bridge.js` (command catalogue + audit), `app/src/freepi-bridge.js` (tools + specs)
- Test: `app/scripts/selftest-browser-tools.js`, `app/scripts/selftest-browser-bridge.js` (extend both)

**Interfaces:**
- Consumes: `formatSnapshot` / `findInTable` / `parseRef` (Task 1), the `snapshot` command (Task 2).
- Produces: tools `browser_snapshot { tab?, maxNodes? }` (read) and `browser_find { text?, selector?, max? }` (read, app-side only — no bridge command); every existing target-accepting tool gains `ref`; `browser-bridge.js` gains `STALE_REF` and audit-for-every-command.

- [ ] **Step 1: Write the failing test**

In `selftest-browser-tools.js`:

```js
check('browser_snapshot never asks', isGuardedTool('browser_snapshot') === false);
check('browser_find never asks', isGuardedTool('browser_find') === false);
check('browser_dialog needs approval', isGuardedTool('browser_dialog') === true);
check('browser_claim needs approval', isGuardedTool('browser_claim') === true);
check('every tool still has exactly one spec', /* names() === specs().map(s=>s.name).sort() */ true);
check('ref is an accepted parameter', refParams().includes('browser_click') && refParams().includes('browser_type'));
```

In `selftest-browser-bridge.js`:

```js
check('every command is audited, not just writes', auditLineCountFor('read') === 1);
check('an unknown tab id is refused', (await expectCode(() => bridge.call('read', { tab: 424242 }))) === 'NO_TAB');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && node scripts/selftest-browser-tools.js && node scripts/selftest-browser-bridge.js`
Expected: FAIL on the new checks (and the existing "thirteen browser tools" count will need updating).

- [ ] **Step 3: Implement**

- `browser-bridge.js`: add `browser_snapshot: { write: false, cmd: 'snapshot' }` and `browser_dialog: { write: true, cmd: 'dialog' }` to `BROWSER_TOOLS`; move the audit write out of the `pending` resolve/reject callbacks so **every** command is logged with `tabId`, `url`, `ref`, `selector`, `ok`.
- `freepi-bridge.js`: add `BROWSER_TOOL_DOCS` entries for `browser_snapshot` (says plainly: take this before acting, act by `ref`) and `browser_find`; add `ref: { type: 'string' }` to `browser_click`, `browser_type`, `browser_fill`, `browser_key`, `browser_wait`, `browser_scroll`; keep a `Map<tabId, table>` updated from every `snapshot` result; translate a `ref` to `{ frameId, ref }` with `parseRef` and fail with `STALE_REF` when it is not in the table; implement `browser_find` by searching that table with `findInTable`; after any state-changing browser action, take a fresh snapshot and append its `text` to the tool result so the model sees the consequence without an extra round-trip.

- [ ] **Step 4: Run both tests, then the suite**

Run: `cd app && node scripts/selftest-browser-tools.js && node scripts/selftest-browser-bridge.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: tool อ่านโครงสร้างหน้าและชี้เป้าด้วย ref`

---

# Phase B — hand-over and autonomy

### Task 5: Claim store and registrable-domain check

**Files:**
- Create: `app/src/browser-claims.js`
- Test: `app/scripts/selftest-browser-claims.js`
- Modify: `app/scripts/run-unit-tests.js`

**Interfaces:**
- Produces: `registrableDomain(host) -> string`, `sameSite(urlA, urlB) -> boolean`, `createClaims({ now }) -> { claim({tabId,url,title}), release(), get(), isClaimed(tabId), leavesSite(url) }`.

- [ ] **Step 1: Write the failing test**

```js
check('plain host', registrableDomain('ads.google.com') === 'google.com');
check('subdomains collapse', registrableDomain('a.b.google.com') === 'google.com');
check('two-part suffix is respected', registrableDomain('shop.co.th') === 'shop.co.th');
check('subdomain of a two-part suffix collapses', registrableDomain('a.b.co.th') === 'b.co.th');
check('localhost stays itself', registrableDomain('localhost') === 'localhost');
check('an IP stays itself', registrableDomain('127.0.0.1') === '127.0.0.1');

check('ads/payments/business are one site', sameSite('https://ads.google.com/aw', 'https://payments.google.com/pay'));
check('an unrelated host is not', !sameSite('https://ads.google.com', 'https://evil.example'));

const c = createClaims({});
check('nothing is claimed at first', c.get() === null && c.isClaimed(7) === false);
c.claim({ tabId: 7, url: 'https://ads.google.com/aw', title: 'Google Ads' });
check('the claim is recorded with its domain', c.get().domain === 'google.com' && c.isClaimed(7));
check('crossing within the site is allowed', c.leavesSite('https://payments.google.com/pay') === false);
check('leaving the site is flagged', c.leavesSite('https://evil.example/x') === true);
check('only one claim at a time', (() => { c.claim({ tabId: 8, url: 'https://x.example' }); return c.get().tabId === 8; })());
check('release clears it', (c.release(), c.get() === null));
check('a bad url is refused', (() => { try { c.claim({ tabId: 9, url: 'not a url' }); return false; } catch { return true; } })());
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && node scripts/selftest-browser-claims.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/src/browser-claims.js`**

Pure. A small `SUFFIXES` list covering the two-label public suffixes that matter (`co.th or.th ac.th go.th in.th net.th org.th co.uk org.uk ac.uk co.jp com.br com.cn co.in co.kr com.sg com.hk com.tw com.au`). `registrableDomain` lowercases, strips a leading `www.`? — **no**, keep it literal; use `new URL()` for `sameSite`/`leavesSite` and a bare host string for `registrableDomain`. IPs and single-label hosts return themselves.

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && node scripts/selftest-browser-claims.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Add to the runner**

Run: `cd app && npm test`. Expected: all pass.

- [ ] **Step 6: Commit — ask first**

Suggested message: `feat: ที่เก็บแท็บที่ผู้ใช้อมอบให้ AI พร้อมเช็กโดเมนหลัก`

---

### Task 6: Autopilot state machine and the always-ask list

**Files:**
- Create: `app/src/browser-autopilot.js`
- Test: `app/scripts/selftest-browser-autopilot.js`
- Modify: `app/scripts/run-unit-tests.js`

**Interfaces:**
- Produces: `isAlwaysAsk(label) -> boolean`, `createAutopilot({ now }) -> { grant({tabId,domain}), stop(reason), state(), noteAction(), noteFailure(), shouldExpire(event), allows({tool, tabId, label}) }`, with constants `IDLE_MS = 300000`, `MAX_FAILURES = 3`.

- [ ] **Step 1: Write the failing test**

```js
check('a pay button always asks', isAlwaysAsk('Pay now') && isAlwaysAsk('ยืนยันการชำระ'));
check('an ordinary button does not', !isAlwaysAsk('Continue') && !isAlwaysAsk('บันทึก'));

let clock = 1000;
const a = createAutopilot({ now: () => clock });
check('off until granted', a.state().on === false && a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === false);
a.grant({ tabId: 7, domain: 'google.com' });
check('granted for the claimed tab', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === true);
check('another tab is not covered', a.allows({ tool: 'browser_click', tabId: 8, label: 'Continue' }).allowed === false);
check('eval always asks', a.allows({ tool: 'browser_eval', tabId: 7, label: '' }).allowed === false);
check('bash is never covered', a.allows({ tool: 'bash', tabId: 7, label: '' }).allowed === false);
check('a pay label always asks', a.allows({ tool: 'browser_click', tabId: 7, label: 'Pay now' }).allowed === false);

clock += IDLE_MS + 1;
check('idle expiry fires', a.shouldExpire({ type: 'tick' }).reason === 'idle');
a.grant({ tabId: 7, domain: 'google.com' });
check('closing the tab expires it', a.shouldExpire({ type: 'tabClosed', tabId: 7 }).reason === 'tabClosed');
a.grant({ tabId: 7, domain: 'google.com' });
check('leaving the site expires it', a.shouldExpire({ type: 'navigate', url: 'https://evil.example' }).reason === 'leftSite');
a.grant({ tabId: 7, domain: 'google.com' });
check('staying on the site does not', a.shouldExpire({ type: 'navigate', url: 'https://payments.google.com' }) === null);
a.noteFailure(); a.noteFailure();
check('two failures are tolerated', a.state().on === true);
a.noteFailure();
check('the third failure stops it', a.state().on === false && a.state().reason === 'failures');
check('a stopped autopilot covers nothing', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === false);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && node scripts/selftest-browser-autopilot.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `app/src/browser-autopilot.js`**

Pure, injectable clock. `allows` returns `{ allowed, reason }` where reason is one of `'autopilot'`, `'off'`, `'otherTab'`, `'guardedTool'`, `'alwaysAsk'`. `ALWAYS_ASK` is the regex from the spec. `noteAction` resets the idle clock; `noteFailure` increments and stops at `MAX_FAILURES`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && node scripts/selftest-browser-autopilot.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Add to the runner**

Run: `cd app && npm test`. Expected: all pass.

- [ ] **Step 6: Commit — ask first**

Suggested message: `feat: โหมดมอบงานพร้อมกฎหมดอายุและรายการที่ต้องถามเสมอ`

---

### Task 7: Bridge gating — claims, tab ids, activity

**Files:**
- Modify: `app/src/browser-bridge.js`
- Test: `app/scripts/selftest-browser-bridge.js` (extend)

**Interfaces:**
- Consumes: `createClaims` (Task 5), `createAutopilot` (Task 6).
- Produces: `browserBridge.setClaims(claims)`, `.setAutopilot(autopilot)`, `.targetFor(argsTab) -> tabId | null`, `.onActivity(fn)`.

- [ ] **Step 1: Write the failing test**

```js
const claims = createClaims({});
const bridge = createBrowserBridge({ /* fake socket that echoes results */ });
bridge.setClaims(claims);
check('with no claim and no tab, the call is refused', (await expectCode(() => bridge.call('read', {}))) === 'NOT_CLAIMED');
claims.claim({ tabId: 7, url: 'https://ads.google.com' });
check('a claimed tab is used when none is given', (await bridge.call('read', {})).tabId === 7);
check('another tab id is refused', (await expectCode(() => bridge.call('read', { tab: 99 }))) === 'NOT_CLAIMED');
check('reads on an unclaimed tab are refused too', (await expectCode(() => bridge.call('snapshot', { tab: 99 })))  === 'NOT_CLAIMED');

claims.release();
check('releasing the claim refuses the next call', (await expectCode(() => bridge.call('read', {}))) === 'NOT_CLAIMED');

const seen = [];
bridge.onActivity((a) => seen.push(a));
claims.claim({ tabId: 7, url: 'https://ads.google.com' });
await bridge.call('click', { ref: 'e1' });
check('activity is emitted with the host', seen[0].host === 'ads.google.com' && seen[0].cmd === 'click');
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: FAIL on the new checks.

- [ ] **Step 3: Implement in `browser-bridge.js`**

Add the claim/autopilot accessors and `targetFor`. Change `call()` so an explicit `tab` argument is only honoured when it is the claimed tab; otherwise reject with `NOT_CLAIMED`. (The existing own-window behaviour stays reachable: when no claim exists, the extension's default-tab resolution is still available to tasks that do not pass a tab — keep that path behind `claims.get() === null` so Phase A is unaffected.) Emit an activity record per command: `{ ts, cmd, tabId, host, ref, selector, ok }`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && node scripts/selftest-browser-bridge.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: บริดจ์กันไม่ให้แตะแท็บที่ยังไม่ได้มอบ`

---

### Task 8: Extension — real tabs, claim handshake, ref cleanup

**Files:**
- Modify: `app/browser-extension/background.js`
- Test: `app/scripts/selftest-browser-extension.js` (extend)

**Interfaces:**
- Consumes: `snapshot` (Task 2), `dialog` (Task 3).
- Produces: `handle('tabs-real', {}) -> { tabs: [{id, windowId, title, url, active, pinned, audible}] }`; an unsolicited `{ event: 'claim', tabId, url, title }` frame; `handle('detachAll', {}) -> { ok: true }`.

- [ ] **Step 1: Write the failing test**

```js
state.allTabs = [
  { id: 3, windowId: 1, active: true, pinned: false, audible: false, url: 'https://ads.google.com/aw', title: 'Google Ads' },
  { id: 7, windowId: 3, active: true, pinned: false, audible: false, url: 'https://example.com', title: 'Example' },
];
const real = await handle('tabs-real', {});
check('real tabs include the user window', real.tabs.some((t) => t.id === 3 && t.title === 'Google Ads'));
check('real tabs carry no page content', !('text' in real.tabs[0]) && !('html' in real.tabs[0]));
check('the agent window tabs are flagged', real.tabs.find((t) => t.id === 7).agent === true);
check('detachAll detaches everything attached', (await handle('detachAll', {})).ok === true && cdpCalls('detach').length >= 1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: FAIL — `tabs-real` is `UNSUPPORTED`.

- [ ] **Step 3: Implement in `background.js`**

`tabs-real` queries `chrome.tabs.query({})`, marks tabs belonging to `agentWindowId` with `agent: true`, and returns metadata only (never page text). Add the popup handshake: the popup sends `{ type: 'claim-here' }`; the worker resolves the tab it was opened over and sends `{ event: 'claim', tabId, url, title }` to the app. Also clear `data-ntapi-ref` attributes in all frames on `detachAll` and when a snapshot is superseded.

- [ ] **Step 4: Run to verify it passes**

Run: `cd app && node scripts/selftest-browser-extension.js`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: ส่วนขยายโชว์แท็บจริงและรับการมอบแท็บ`

---

### Task 9: Main process state and IPC

**Files:**
- Modify: `app/src/main.js`, `app/src/preload.js`
- Test: `app/scripts/selftest-browser-tools.js` is unaffected; verify by hand with `cd app && npm start`.

**Interfaces:**
- Consumes: `createClaims` (5), `createAutopilot` (6), bridge gating (7), `tabs-real` + claim event (8).
- Produces: IPC `browser:tabs` → `{ tabs }`, `browser:claim { tabId }` → `{ ok, claim }`, `browser:release` → `{ ok }`, `browser:autopilot { on }` → `{ ok, state }`; events `browser:activity { line }`, `browser:claimState { claim }`, `browser:autopilotState { state }`; preload names `browserTabs`, `browserClaim`, `browserRelease`, `browserAutopilot`, `onBrowserActivity`, `onBrowserClaimState`, `onBrowserAutopilotState`.

- [ ] **Step 1: Wire the state**

In `main.js`: create one `claims` and one `autopilot` instance next to `browserBridge`, hand them to the bridge, and register the handlers. On a `claim` frame from the extension, or on `browser:claim`, set the claim, bring Chrome forward (`browserBridge.call('tabs-real', {})` then focus the claimed tab), and push `browser:claimState`. Run a 60 s tick that calls `autopilot.shouldExpire({ type: 'tick' })` and stops it when it fires, pushing `browser:autopilotState`. Persist nothing but the enabled flag — a claim is never restored across restarts.

- [ ] **Step 2: Enforce the always-ask list and gate browser writes**

Where the approval decision is made for a browser tool (the `pi.on('tool_call')` handler in `freepi-bridge.js` and the `approval:*` handlers in `main.js`), consult `autopilot.allows(...)`: when it allows, skip the dialog; otherwise keep today's dialog. Join the `browser_dialog` command to the guarded list. Make sure `browser_eval` is never allowed by autopilot.

- [ ] **Step 3: Verify by hand**

Run: `cd app && npm start`, enable browser control, pair the extension, and confirm: the chip dialog lists real tabs; the agent's `browser_claim` opens an approval dialog showing the tab title and domain; after claiming, `browser_snapshot` works on that tab and clicking a navy/receipt-style element is refused. Close the tab and confirm the claim state clears in the UI.

- [ ] **Step 4: Run the suite**

Run: `cd app && npm test`. Expected: all pass.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: สถานะการมอบแท็บและโหมดมอบงานในโปรเซสหลัก`

---

### Task 10: Renderer — tabs list, autopilot toggle, activity strip

**Files:**
- Modify: `app/src/renderer/index.html`, `app/src/renderer/app.js`, `app/src/renderer/styles.css`
- Test: manual (`npm start`) plus `app/scripts/selftest-model-picker.js`-style boot smoke is not required for these controls; the design already defers DOM tests here.

**Interfaces:**
- Consumes: the preload names from Task 9.
- Produces: `#browserTabs` (list), `#browserClaimBtn` / `#browserReleaseBtn`, `#autopilotToggle`, `#autopilotCountdown`, `#activityStrip`, `#activityStop`.

- [ ] **Step 1: Add the markup**

Inside the existing `#browserOverlay` dialog: a tabs section (rows of `title` + hostname, the claimed one highlighted, a per-row *ใช้แท็บนี้*), a *ปล่อยแท็บ* button, an autopilot switch with a countdown, and a line explaining the yellow Chrome debugger bar and that dismissing it stops the agent. Above the composer: `#activityStrip` (hidden when empty) with the last actions and `#activityStop`.

- [ ] **Step 2: Add the strings**

Add EN and TH entries for every new label in both maps in `app.js` — including the yellow-bar warning and the autopilot expiry reasons (`idle`, `tabClosed`, `leftSite`, `failures`, `stopped`).

- [ ] **Step 3: Wire the behaviour**

Subscribe to the three events; render the strip from `browser:activity` with the hostname on every line; show the claim state on the chip (`off | waiting | connected | claimed | autopilot`, autopilot pulsing); `#activityStop` calls `browserAutopilot({ on: false })` and disables the strip immediately without waiting for the reply.

- [ ] **Step 4: Verify by hand**

Run: `cd app && npm start`. Check with the keyboard only: Tab reaches the chip, Enter opens the dialog, the tab list is reachable, Escape closes, and the strip's Stop button is focusable while a run is active. Check `prefers-reduced-motion` stops the autopilot pulse.

- [ ] **Step 5: Commit — ask first**

Suggested message: `feat: แผงเลือกแท็บ แถบกิจกรรมสด และปุ่มหยุด`

---

### Task 11: Extension popup — hand a tab over

**Files:**
- Modify: `app/browser-extension/popup.html`, `app/browser-extension/popup.js`

**Interfaces:**
- Consumes: the `claim-here` message from Task 8.
- Produces: a *ใช้แท็บที่เปิดอยู่* button that claims the tab the popup was opened over, and a status line that says which tab is claimed.

- [ ] **Step 1: Add the button and its handler**

`chrome.tabs.query({ active: true, currentWindow: true })` → send `{ type: 'claim-here', tabId }` → show `ใช้แท็บนี้แล้ว — AI จะทำงานในแท็บนี้` or the app's refusal.

- [ ] **Step 2: Verify by hand**

Load unpacked, pair, open the popup over a normal tab, press the button, and confirm the app's chip dialog moves to `claimed` and shows that tab's host.

- [ ] **Step 3: Commit — ask first**

Suggested message: `feat: ปุ่มมอบแท็บปัจจุบันจากป๊อปอัปส่วนขยาย`

---

### Task 12: Ask → resume, and the project's memory files

**Files:**
- Modify: `app/src/freepi-bridge.js` (prompt rules), `app/src/main.js` (`browser:resume`), `.AGENT/HANDOFF.md`, `.AGENT/LOG.md`

**Interfaces:**
- Consumes: everything above.
- Produces: prompt text telling the agent to take a fresh `browser_snapshot` after an `ask_user` answer; a `browser:resume` event emitted after any `ask_user` reply while a claim is active.

- [ ] **Step 1: Add the prompt rules**

Extend the tool prompt/`promptSnippet` text: take a snapshot before acting; act by `ref`; re-snapshot after a navigation or a failed ref; when stuck, call `ask_user` with what it expected and where it is, then snapshot again before continuing.

- [ ] **Step 2: Emit resume**

In the `ask_user` reply path, when a claim is active, send `browser:resume` to the renderer and clear the stale snapshot table for that tab so the next ref must come from a fresh snapshot.

- [ ] **Step 3: Full manual smoke — the acceptance test**

Pair → claim a real tab on a page with an iframe → `browser_snapshot` shows both frames → `browser_find` locates a control → `browser_click {ref}` works → with autopilot on, no dialog per step → trigger a `confirm()` and confirm the agent sees and answers it → `ask_user` with a snapshot attached → Stop halts the run → close the tab and confirm every tool now fails with `NOT_CLAIMED`.

- [ ] **Step 4: Update the memory files**

`.AGENT/HANDOFF.md`: move this work into "กำลังทำ/ค้าง", note what shipped and what is deferred (console/network, file upload, multiple claims), and set the date. Append one dated section to `.AGENT/LOG.md` with the files touched, the test result, and the commit hash once the user has committed.

- [ ] **Step 5: Ask the user about the version**

Report how many uncommitted changes exist and ask whether to bump the version. Do not bump it.

---

## Self-Review

**Spec coverage.** Tab claim → Tasks 5, 7, 8, 9, 11. Snapshot + refs + `find` → Tasks 1, 2, 4. Frames → Task 2. Dialogs/navigation/settling → Task 3. Autopilot + activity strip + always-ask → Tasks 6, 9, 10. Ask → resume → Task 12. UI → Tasks 10, 11. Audit on every command → Task 4. Error paths (`DEBUGGER_BUSY`, `STALE_REF`, `NOT_CLAIMED`, `NO_TAB`, attach retry, yellow bar) → Tasks 2, 3, 4, 7, 10. Everything in the spec has an owning task; nothing in the plan is outside the spec.

**Deferred by the spec, so absent here:** console/network inspection, file upload, multiple simultaneous claims, the mirror pane.

**Note for the executor:** Task 4 changes a count asserted in `selftest-browser-tools.js` ("thirteen browser tools"); update it in the same step. `browser_find` and `browser_claim` are app-side and deliberately have **no** bridge command, so they must not be added to `BROWSER_TOOLS` in `browser-bridge.js` — adding them there would break the "each spec maps to a distinct command" test and would try to send them to Chrome.
