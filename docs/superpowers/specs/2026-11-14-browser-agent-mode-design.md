# Browser agent mode — design

**Date:** 2026-11-14
**Status:** awaiting approval
**Builds on:** `2026-11-14-browser-control-design.md` (v0.3.0, shipped — does not replace it)

## Intent

The user watched opencode set up their Google Ads account end to end: it acted in
the browser they were already signed into, asked only when it hit something it
could not do, then picked up where it left off. That is the experience they want
in NTAPI.

v0.3.0's browser control cannot deliver it for two reasons:

1. **It drives its own window.** The extension creates a window titled
   *"NTAPI · Browser"* and can only see tabs it made itself. The user's real tabs
   are invisible to it.
2. **It perceives the page as one blob of text.** `browser_read` returns
   `document.body.innerText`; the model then has to guess a CSS selector for
   whatever it wants to click. On a heavy SPA this is where it flails. And every
   single state-changing step stops for an approval dialog — a 40-step flow means
   40 interruptions.

The user's words: *"อยากให้ทําได้แบบ opencode... เขาทําจนเสร็จ ads google ทํางานได้เลย
มีแค่บางขั้นตอนที่เขาทําไม่ได้ เขาก็จะมาบอกวิธีทําให้ผมทําแทนจนเสร็จแล้วไปขั้นตอนต่อไป"*

## Decisions already made with the user

| Decision | Choice | Why |
|---|---|---|
| Overall shape | **Approach ก** — no in-app browser pane; the agent drives a real tab and Chrome is brought to the front | Keeps the existing Google login; smallest safe change |
| How the agent perceives a page | **Structural DOM snapshot** (DevTools *Elements*-like), not screenshots | The user's call: *"น่าจะใช้วิธีการค้นหาตัวหนังสือเหมือนเรากดปุ่ม F12... ประหยัดกว่า"* — token-cheap and more precise than pixels |
| In-app browser pane (`WebContentsView`/`webview`) | **Rejected (ค)** | Electron's Chromium is a *different* browser from the user's Chrome: no Google session, and Google refuses sign-in from embedded browsers — it would not serve the Ads goal |
| View-only mirror pane (ข) | **Deferred** | Nice-to-have; not needed for the goal. Can be added later without changing this design |

## Goals

- The agent can list the user's **real** tabs and drive one the user **explicitly
  hands over** ("claim"). Never any other tab.
- The agent perceives a page as a compact, indexed, action-oriented snapshot, and
  acts on elements **by ref**, not by guessing selectors.
- The agent can see and act **inside cross-origin iframes** (Google Ads is full of
  them; `Runtime.evaluate` on the top frame cannot reach them today).
- The agent survives **dialogs and navigation** instead of hanging (Ads raises
  `confirm`/`alert`; today `Page.javascriptDialogOpening` is not handled at all).
- **Autonomy scoped to the claimed tab**: while a task is running, browser actions
  on that tab do not stop for an approval each time — but a live activity strip and
  a Stop button are always visible, and the mode expires on its own.
- When it is genuinely stuck, it **asks the user with context**, waits, then
  re-snapshots and continues.
- v0.3.0 behaviour is preserved: when nothing is claimed, everything works exactly
  as it does today.

## Non-goals

- No in-app embedded browser (see decision ค).
- No console/network inspection, no file upload/download, no visual diffing —
  phase 2 (both are useful for Ads debugging, neither is needed for the goal).
- No multiple claimed tabs at once in this batch (one claim, multiple later).
- No bypassing CAPTCHA, OTP, phone verification, or Google security challenges.
- No entering card numbers, no confirming payments, no deleting accounts.

## Anti-goals

These are the ways this would be a failure even if it technically works:

- The agent acts on a tab the user did not hand over. → Claims are explicit,
  listed in the UI, and released by closing the tab, changing domain, or turning
  the feature off.
- The user cannot tell what it is doing or cannot stop it instantly. → Activity
  strip + Stop button are part of the feature, not a follow-up.
- It becomes slower or more expensive than today. → The snapshot is hard-capped
  in nodes and characters; screenshots stop being the default channel.
- It silently starts doing something the user would consider irreversible. →
  A fixed blocklist (money, delete, account settings) always asks, even in
  autopilot.

## Constraints

- **Chrome 136+ blocks `--remote-debugging-port` on the default profile**, so the
  companion MV3 extension + `chrome.debugger` remains the only transport that
  keeps existing logins. Repeating v1's rejected approaches (A/B/C there) is
  pointless.
- **`chrome.debugger` paints the yellow "started debugging this browser" bar on
  whatever tab we attach to.** Today that is our own window; after this change it
  appears on a tab the user is looking at. The UI must say so before claiming.
- **MV3 service workers are suspended when idle.** Long `wait`/`networkIdle`
  loops must keep the worker alive (WebSocket traffic already resets the idle
  timer on modern Chrome; add an explicit keep-alive ping during long waits).
- **Cross-origin frames need frame-scoped contexts**: `Page.getFrameTree` +
  `Page.createIsolatedWorld` per frame, plus `Target.setAutoAttach`
  (`flatten: true`) for out-of-process iframes. `executionContextId` identifies
  the frame for `Runtime.evaluate`.
- **The extension cannot reach local file paths** for uploads without
  `DOM.setFileInputFiles` — hence upload is phase 2, not now.
- No bundler. Renderer talks to main over IPC only (CSP `connect-src 'self'`), the
  WebSocket lives in **main**. Tests are plain `scripts/selftest-*.js` run by
  `npm test`; there is no DOM, so DOM logic must be testable as pure functions.
- `prefs.json`, `sessions/`, and `browser-audit.log` live under `DATA_ROOT`
  (`C:\NTAPI\` in the installed build).

## Design

### 1. Tab claim (who the agent may touch)

The extension gains the ability to enumerate **real** tabs:

```
tabs-real -> { tabs: [{ id, windowId, title, url, active, pinned, audible }] }
```

Metadata only — never page content. Two ways a tab gets claimed:

1. **The user**, from the extension popup: a "ใช้แท็บที่เปิดอยู่" button sends
   `{ event: 'claim', tabId, url }` for the tab it was opened over.
2. **The agent**, via a new guarded tool `browser_claim` — it asks to work in a
   tab, and the existing approval dialog shows the title + domain. This is how
   *"ขอทํางานในแท็บนี้"* reaches the user.

Claim state lives in the **main process** (`browserBridge` claims map) and is
mirrored to `prefs.browserBridge.claim = { tabId, url, title, claimedAt }` so a
restart can re-validate (the tab may be gone). Rules:

- One claim at a time in this batch.
- The claim is released by: the user ("ปล่อยแท็บ"), the tab closing, the claim's
  domain changing, turning the feature off, or app quit.
- Tools with no `tab` argument target the **claimed tab**; with no claim they fall
  back to today's *"NTAPI · Browser"* window. So v0.3.0 behaviour is untouched.

### 2. `browser_snapshot` — the primary way the agent sees a page

A collector injected with `Runtime.evaluate` walks the DOM and returns a compact,
indexed tree of the things that can be acted on:

```
frame main   https://ads.google.com/aw/campaigns
  #1 [nav]
    e1 [link] "Campaigns"
    e2 [link] "Ad groups"
  #2 [form] "New campaign"
    e7  [textbox]  "Campaign name"  value=""
    e8  [combobox] "Bidding strategy" value="Maximize clicks"
    e9  [button]   "Continue"
frame f3     https://…/editor  (cross-origin iframe)
  e20 [button] "Save"
  e21 [textbox] "Headline 1" value=""
```

- **What is kept:** interactive elements (`a`, `button`, `input`, `select`,
  `textarea`, `summary`, `[role=button|link|tab|checkbox|menuitem|combobox]`,
  `[onclick]`, `[contenteditable]`), plus textual landmarks (`h1`–`h3`, `label`,
  `[role=heading]`, `[aria-label]`), plus anything a `text`/`selector` filter asks
  for. Invisible nodes (zero box, `hidden`, `display:none`, `visibility:hidden`,
  `opacity:0`) are dropped.
- **Each kept node gets a ref.** The collector writes `data-ntapi-ref="eN"` onto
  the element and returns `{ ref, role, name, value, disabled, href, frameId }`.
  Actions resolve a ref by re-querying `[data-ntapi-ref="eN"]`. Refs are cleared
  on every new snapshot and invalidated on navigation; using a stale ref returns
  `STALE_REF` with "take a snapshot again" rather than clicking the wrong thing.
- **Hard budget.** `maxNodes` (default 300) and `maxNameChars` (default 120), plus
  a `maxChars` cap on the serialized text. Over budget, the tree is truncated with
  an explicit notice and a hint to use `browser_find`.
- **Every action tool accepts `ref`** as the preferred target. `selector`, `text`,
  and `x`/`y` all stay, so nothing that works today breaks.
- **`browser_find { text | selector, max }`** — the targeted, cheap lookup: returns
  matching refs plus a little surrounding text. This is the "กด F12 แล้วค้นหา"
  primitive, and the escape hatch when a snapshot was truncated.
- `browser_read` stays for when the model wants prose rather than a structure.

### 3. Frames

- On attach: `Page.enable` → `Page.getFrameTree` → for each frame
  `Page.createIsolatedWorld { frameId }`, keeping the `executionContextId`.
  The collector runs once per frame with its own context.
- `Target.setAutoAttach { autoAttach: true, flatten: true, waitForDebuggerOnStart: false }`
  so out-of-process (cross-site) iframes are caught too.
- A ref encodes its frame, so `click`/`type`/`fill`/`key`/`scroll` know which
  context to act in and where to dispatch input events.

### 4. Navigation, dialogs, waiting

The three things that make "จนเสร็จ" possible instead of a hang:

- **Dialogs.** Subscribe `Page.javascriptDialogOpening`. Surface it to the agent as
  a tool result / event (`{ type, message, defaultPrompt }`) and answer it only via
  an explicit guarded `browser_dialog { accept, promptText }`. `beforeunload` is
  dismissed unless the agent asks otherwise. Today an open dialog freezes the tab
  and the agent never finds out.
- **Navigation.** After any action that can navigate, wait for the main frame's
  `Page.frameNavigated` + `Page.loadEventFired` (timeout), then look at
  `document.readyState` — and hand the model a fresh snapshot automatically.
- **Settling.** `browser_wait` gains a `networkIdle` option (bounded inflight count
  from `Network.enable`) for UIs that paint before they are ready.

### 5. Autonomy: hand-over mode ("มอบงาน")

Because there is no browser pane, transparency has to come from the app:

- New state `browserBridge.autopilot = { tabId, domain, until }`. Turned on from the
  chip dialog, or granted by the approval dialog with **"อนุญาตจนจบงาน"**.
- While on: browser write tools aimed at the **claimed tab** skip the approval
  dialog. `bash`/`edit`/`write` and `browser_eval` still ask, always.
- A fixed **always-ask list** stays outside autopilot: any action whose target
  label matches a small regex (`pay|purchase|delete|remove account|ยืนยันการชําระ|ลบบัญชี`).
  *Mechanism:* the tool call carries only a ref, so main keeps a
  `tabId -> (ref -> {role, name})` map built from the last `browser_snapshot`
  result (results already flow through `browserBridge.call`, so main can cache
  them without a new channel). A ref with no cached label is treated as
  **unsafe** and asks.
- Auto-expiry: tab closed · **the page leaves the claim's registrable domain** ·
  5 minutes with no browser action · 3 consecutive tool failures · feature off ·
  Stop pressed. A plain "any domain change" rule was rejected — a Google Ads run
  legitimately crosses `ads.google.com` → `payments.google.com` →
  `business.google.com`, which are all one registrable domain. See Q1 below.
- **Activity strip** above the composer: the last N browser actions live
  (`e9 [button] "Continue" ✓`), a link to focus the tab, and a **หยุด** button.
- On hand-over, the real Chrome window is brought to the front
  (`windows.update { focused: true }` + `tabs.update { active: true }` — both
  already exist in the extension's `tabs`/`focus` path).
- **Audit grows to every browser command**, read and write: `{ ts, cmd, tabId,
  url, ref, selector, ok }` appended to `<DATA_ROOT>/browser-audit.log`, still
  truncated at 5 MB. (Today only writes are logged, which is why the file is empty.)

### 6. Stuck → ask → resume

- `ask_user` already blocks for an answer; this reuses it.
- The bridge attaches the latest snapshot (and a screenshot when the active model
  accepts images) to the question, and the dialog gains **"ไปที่แท็บ"** so the user
  can perform the manual step themselves.
- After an answer, main emits `browser:resume`; the agent's prompt gets updated so
  it takes a fresh `browser_snapshot` before acting again. Without this the model
  keeps working from the stale snapshot it was stuck on.

### 6b. Relationship to the existing approval controls

There are now three overlapping ways to stop being asked, and they must not be
confused:

| Control | Scope | Lifetime |
|---|---|---|
| *"จํา tool นี้ไว้"* (`approval:respond {rememberAll}` → `allowedTools`) | one tool name, e.g. `browser_click` | until app restart / reset |
| *"ไม่ถามแล้ว"* (`allowEverything`) | **every** tool, including `bash`/`edit`/`write` | until app restart / reset |
| **Autopilot** (new) | browser writes on **the claimed tab** | auto-expires (see above) |

Autopilot sits beside them, not instead of them; it is the only one scoped to a
tab. The always-ask list (money/delete) wins over **all three**.

### 7. UI (`renderer`)

- `#browserBtn` dialog gains a **Tabs** section: real tabs (title + domain), the
  claimed one highlighted, "ใช้แท็บนี้" / "ปล่อย"; an autopilot toggle with a
  countdown; and the existing install/watch controls.
- Chip dot states: `off` · `waiting` · `connected` · `claimed` · `autopilot`
  (pulsing). The yellow debugger banner is explained in the claim confirmation.
- Status events already flow to the renderer via `browser:status`; claims and
  autopilot reuse it.

### 8. Files touched

```
app/browser-extension/manifest.json   (no new permission: debugger/tabs/scripting/
                                       storage/alarms/windows already present)
app/browser-extension/background.js   tabs-real, claim, snapshot collector,
                                      frame contexts, dialog handling, autopilot ack
app/browser-extension/popup.{html,js} "ใช้แท็บที่เปิดอยู่"
app/src/browser-bridge.js             new cmds, claim store, full audit, STALE_REF
app/src/freepi-bridge.js              browser_snapshot / browser_find /
                                      browser_claim / browser_dialog; ref params; docs
app/src/main.js                       claims + autopilot state, IPC
                                      (browser:tabs/claim/release/autopilot),
                                      activity events, always-ask list
app/src/preload.js                    the new IPC surface
app/src/renderer/{index.html,app.js,styles.css}  tabs list, autopilot, activity strip
app/scripts/selftest-browser-*.js     prompt-param parsing, ref namespacing, claim
                                      gating, autopilot expiry, audit shape
```

### 8b. Error paths the builder must handle

- **DevTools already open on the claimed tab.** `chrome.debugger.attach` fails
  with *"Another debugger is already attached to the tab"*. This is likely while
  debugging Ads. Surface a named error (`DEBUGGER_BUSY`) and a UI hint: close
  DevTools on that tab, or claim a different one. Also treat an attach that fails
  because the tab is gone (`NO_TAB`).
- **Extension service worker suspended mid-wait.** Long `wait`/`networkIdle`
  loops send a keep-alive ping on the socket.
- **User takes the tab back.** If the user navigates or closes the claimed tab,
  the next command returns `NOT_CLAIMED` and the activity strip says so instead
  of failing silently.
- **User dismisses the yellow debugger infobar.** Chrome's
  *"… started debugging this browser"* bar has a Cancel/× that **detaches the
  debugger**. It is the only visible trace of a snapshot (nothing else on screen
  changes — no DevTools panel opens). The claim confirmation and the activity
  strip must say so, and a detached debugger must surface as `DEBUGGER_BUSY` with
  a one-click re-attach, not as a silent hang.
- **Tab exists but the debugger banner was dismissed / Chrome updated.** A failed
  `cdp()` must detach and re-attach once before giving up.

## Approaches considered (recorded for the plan)

| # | Approach | Verdict |
|---|---|---|
| ก | No pane; agent drives a real claimed tab; DOM snapshot as the perception channel | **Chosen.** Keeps logins, smallest safe change, matches what opencode actually did for the user |
| ข | Add a view-only mirror pane fed by screenshots of the real tab | Deferred. Nice for watching; not needed for the goal; adds a capture loop and cost |
| ค | Add a real in-app browser (`WebContentsView`) the agent drives | Rejected. A different Chromium from the user's Chrome: no Google session, and Google refuses sign-in from embedded browsers — it cannot serve the Ads goal |

## Tests

Offline (`npm test`, no Chrome, no network):

- Snapshot serializer over a fixture DOM string: visible/invisible filtering, role
  naming, ref assignment, node/char budget truncation, cross-frame namespacing.
- Ref resolution: a stale or unknown ref returns `STALE_REF`, never a click.
- Claim gating: a write tool aimed at an **unclaimed** tab is refused; reads still
  work; the fallback NTAPI window path is unchanged when nothing is claimed.
- Autopilot: expiry on domain change / tab close / timeout / failure streak; the
  always-ask list is never bypassed.
- `isGuardedTool` classification for `browser_snapshot`, `browser_find`,
  `browser_claim`, `browser_dialog`.
- Audit line shape for both reads and writes.

Manual smoke (the user runs it, once the code exists): pair → claim a real tab that
contains an iframe → `browser_snapshot` shows both frames → `browser_find` locates
a control → `browser_click {ref}` works → with autopilot on, no dialog per step →
trigger a `confirm()` and confirm the agent sees and answers it → `ask_user` with a
snapshot attached → Stop button halts the run.

## Decisions settled with the user

**Q1 — a run may cross domains on its own: settled (b), trust the task.**
Autopilot is scoped to the **claimed tab**, not to a hostname, so a Google Ads run
moves across `ads.` / `payments.` / `business.google.com` without re-asking. Two
guardrails were added, both general rather than Google-specific:

1. Every activity-strip line shows the hostname, so the user always sees where the
   agent is.
2. A **hard stop** fires when a navigation leaves the claim's **registrable domain
   (eTLD+1)** — with a small built-in suffix list (`co.th`, `co.uk`, `com.au`, …) so
   that `a.b.co.th` and `c.co.th` count as one domain. `google.com` → `google.com`
   never trips it; `google.com` → an unrelated host does. This is the one place
   the design is deliberately more conservative than "trust the task", and it is
   the author's call, not the user's.

**Q2 — always-ask set: settled as proposed.** Any action whose target label matches
`pay|purchase|delete|remove account|ยืนยันการชำระ|ลบบัญชี`, plus every
`browser_eval`, stays behind an approval dialog even in autopilot. A ref with no
cached label is also treated as unsafe.

## What is left to the builder

- Exact snapshot text format (`e1 [button] "X"` vs JSON lines) and the budget
  numbers — start from the defaults above and tune against a real Ads page.
- Whether a claim survives an app restart or is always re-requested.
- Badge/icon and wording (EN/TH) for a claimed tab and for the yellow-banner notice.
- Whether autopilot is granted per-tab or per-task, and the exact always-ask regex.
- Whether `browser_screenshot` stays model-facing at all once snapshots land, or
  becomes user-facing only.
