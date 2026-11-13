# Steer + @skill Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Send a message into a running turn (Enter = steer, Ctrl+Enter = queue), and make `@caveman`-style mentions actually invoke the installed skill.

**Architecture:** A pure `promptOptionsFor()` decides the SDK's `streamingBehavior`; main passes it to `session.prompt`. The renderer keeps its queue only for Ctrl+Enter. `@skill` resolution is a pure helper in `provider-ui.js` applied at send time; the mention menu gains correct key ordering and renders skills before the file scan.

**Tech Stack:** Electron 38 main/preload/renderer (no bundler), Node 20 test scripts, pi coding agent SDK 1.2.

**Spec:** `docs/superpowers/specs/2026-11-13-steer-and-skill-mentions-design.md`

## Global Constraints

- Work from `app/` unless a path says otherwise; run tests with `node scripts/<name>.js`.
- No new npm dependencies. Node built-ins and Electron only.
- pi expands `/skill:name` only at the **start** of a prompt.
- `streamingBehavior` is `'steer'` or `'followUp'`; streaming without one throws.
- Ctrl+Enter while idle sends immediately; it must not leave a queue that never drains.
- UI strings go in both `en` and `th` dictionaries in `src/renderer/app.js`.
- Any element that sets `display:flex` and can be `hidden` also needs a `[hidden] { display: none; }` rule.
- Commit messages use conventional commits, one commit per task.
- The Coarena key is test input from `$env:COARENA_KEY`; never write a literal key to source, tests, or commits.

## Review Focus

- A steer sent while the model is only writing text (no tools) must still be delivered, not swallowed.
- Two quick steers in a row must both reach the model in order.
- Ctrl+Enter when idle must send, not queue forever.
- `@caveman` typed and sent with Enter must invoke the skill even if the menu was never opened.
- A bare `@src/app.js` or an unknown `@name` must remain literal text (no accidental `/skill:` rewrite).

---

### Task 1: `@skill` resolver

**Files:**
- Modify: `app/src/renderer/provider-ui.js`
- Modify: `app/scripts/selftest-provider-ui.js`

**Interfaces:**
- Consumes: nothing.
- Produces on `globalThis.FPProvider`: `resolveSkillMention(text, skills) -> string` where `skills` is `[{ name, description? }]`. Signature: `(text: string, skills: Array<{name: string}> | null) => string`.

- [x] **Step 1: Add the failing checks** to `scripts/selftest-provider-ui.js`:

```js
const skills = [{ name: 'caveman' }, { name: 'brainstorming' }];
check('leading @skill resolves', UI.resolveSkillMention('@caveman hello', skills) === '/skill:caveman hello');
check('bare @skill resolves', UI.resolveSkillMention('@caveman', skills) === '/skill:caveman');
check('case-insensitive name', UI.resolveSkillMention('@Caveman x', skills) === '/skill:caveman x');
check('prefix match is not a skill', UI.resolveSkillMention('@cavemanx', skills) === '@cavemanx');
check('file mention untouched', UI.resolveSkillMention('@src/app.js', skills) === '@src/app.js');
check('mid-sentence mention untouched', UI.resolveSkillMention('hello @caveman', skills) === 'hello @caveman');
check('unknown skill untouched', UI.resolveSkillMention('@nope hi', skills) === '@nope hi');
check('no skills loaded is safe', UI.resolveSkillMention('@caveman hi', null) === '@caveman hi');
```

- [x] **Step 2: Run it and see the new checks fail**

Run: `node scripts/selftest-provider-ui.js`
Expected: `TypeError: UI.resolveSkillMention is not a function`.

- [x] **Step 3: Implement `resolveSkillMention`** in `provider-ui.js`

Rules: match `/^@([A-Za-z0-9._-]+)(?=$|\s)/`; look the captured name up case-insensitively in `skills`; on a hit return `/skill:${skill.name}` + the original remainder (including the leading space when present); otherwise return `text` unchanged. Never touch a name that contains `/` (those are file mentions).

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-provider-ui.js`
Expected: all checks pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/renderer/provider-ui.js app/scripts/selftest-provider-ui.js
git commit -m "feat(renderer): resolve @skill mentions to /skill commands"
```

---

### Task 2: Streaming behaviour helper

**Files:**
- Create: `app/src/prompt-mode.js`
- Test: `app/scripts/selftest-prompt-mode.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `promptOptionsFor(isStreaming, mode) -> { streamingBehavior: 'steer'|'followUp' } | undefined`.
  `mode` is `'steer' | 'followUp' | undefined`; idle always returns `undefined`; unknown modes default to `'steer'`.

- [x] **Step 1: Write the failing test**

```js
const { promptOptionsFor } = require('../src/prompt-mode');
check('idle ignores mode', promptOptionsFor(false, 'steer') === undefined);
check('steer while streaming', promptOptionsFor(true, 'steer').streamingBehavior === 'steer');
check('follow-up while streaming', promptOptionsFor(true, 'followUp').streamingBehavior === 'followUp');
check('missing mode defaults to steer', promptOptionsFor(true, undefined).streamingBehavior === 'steer');
check('unknown mode defaults to steer', promptOptionsFor(true, 'nonsense').streamingBehavior === 'steer');
```

Use the same `check(name, ok, detail)` / exit-code style as `selftest-provider-errors.js`.

- [x] **Step 2: Run it to verify it fails**

Run: `node scripts/selftest-prompt-mode.js`
Expected: `Cannot find module '../src/prompt-mode'`.

- [x] **Step 3: Implement `src/prompt-mode.js`**

```js
function promptOptionsFor(isStreaming, mode) {
  if (!isStreaming) return undefined;
  return { streamingBehavior: mode === 'followUp' ? 'followUp' : 'steer' };
}
```

Export it. Document why idle returns undefined (SDK rejects the option).

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-prompt-mode.js`
Expected: all checks pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/prompt-mode.js app/scripts/selftest-prompt-mode.js
git commit -m "feat(prompt): choose the SDK streaming behaviour"
```

---

### Task 3: Steer through main and preload

**Files:**
- Modify: `app/src/main.js` (`prompt:send` handler)
- Modify: `app/src/preload.js` (`sendPrompt`)
- Test: covered by Task 2's helper and Task 5's live test.

**Interfaces:**
- Consumes: `promptOptionsFor` from Task 2.
- Produces: IPC `prompt:send { tabId, text, images, mode } -> { ok: true, mode }`; preload `sendPrompt(tabId, text, images, mode)`.

- [x] **Step 1: Wire the handler**

In `prompt:send`, after building `promptText`:

```js
const mode = passedMode === 'followUp' ? 'followUp' : 'steer';
const options = promptOptionsFor(Boolean(tab.handle.session.isStreaming), passedMode);
const run = tab.handle.session.prompt(promptText, options);
```

Destructure `mode: passedMode` from the IPC payload. Keep the existing `run.catch` cleanup. Return `{ ok: true, mode: options?.streamingBehavior || null }`.

- [x] **Step 2: Widen the preload call**

`sendPrompt: (tabId, text, images, mode) => ipcRenderer.invoke('prompt:send', { tabId, text, images, mode })`.

- [x] **Step 3: Syntax check**

Run: `node --check src/main.js; node --check src/preload.js`
Expected: no output, exit 0.

- [x] **Step 4: Commit**

```bash
git add app/src/main.js app/src/preload.js
git commit -m "feat(main): send steer or follow-up prompts into a running turn"
```

---

### Task 4: Composer behaviour (steer, queue, @ menu)

**Files:**
- Modify: `app/src/renderer/app.js` (strings, `submit()`, the two `input` keydown listeners, `updateFileMenu`, `loadSkills`)
- Modify: `app/src/renderer/styles.css` only if the queue bar needs no change (expected: no change).

**Interfaces:**
- Consumes: `FPProvider.resolveSkillMention` (Task 1), `api.sendPrompt(..., mode)` (Task 3).
- Produces: UI only.

- [x] **Step 1: Add strings** to both dictionaries: `steerSent` = `Sent into the running turn.` / `ส่งเข้าเทิร์นที่กำลังทำงานแล้ว`, and `steerHint` = `Agent is working — Enter sends into the turn, Ctrl+Enter queues` / `เอเจนต์กำลังทำงาน — Enter ส่งเข้าเทิร์น, Ctrl+Enter เข้าคิว`. Replace `placeholderBusy` usages with `steerHint` (keep the old key if referenced elsewhere).

- [x] **Step 2: Resolve the skill before sending**

Add:

```js
async function resolveForSend(text) {
  if (!text.startsWith('@')) return text;
  const skills = await loadSkills().catch(() => []);
  return FPProvider.resolveSkillMention(text, skills);
}
```

In `submit()`, after the `/clear` branch, `const outgoing = await resolveForSend(text);` and use `outgoing` for the bubble text, the `view.messages.push`, and `api.sendPrompt`.

- [x] **Step 3: Steer instead of queue on Enter**

Replace the busy branch in `submit()`:

```js
if (view.busy) {
  const outgoing = await resolveForSend(text);
  renderUserMessage(outgoing, pendingImages);
  view.messages.push({ kind: 'user', text: outgoing, images: pendingImages.slice() });
  const images = pendingImages.slice();
  pendingImages = [];
  renderAttachments();
  input.value = '';
  autoGrow();
  try {
    await api.sendPrompt(view.tabId, outgoing, images, 'steer');
    showNotice(t('steerSent'), 2600);
  } catch (err) {
    showNotice(errorText(err));
  }
  return;
}
```

Keep `setBusy` untouched: the tab is already busy.

- [x] **Step 4: Ctrl+Enter semantics**

In the first keydown listener's Ctrl+Enter branch: when `view.busy` queue as today; when idle, call `submit()` instead of queueing. Ensure the branch runs after the `/clear` and Enter branches and does not double-send.

- [x] **Step 5: Fix key ordering for the `@` menu**

In the **first** `input` keydown listener (registered near the composer callbacks), handle `fileMenuState.open` before `slashState.open`: ArrowUp/Down move, Tab/Enter `applyFileMention(fileMenuState.items[fileMenuState.index])`, Escape hides, each with `preventDefault`/`stopPropagation`/return. Delete the duplicate menu branches from the later `wiring: compose` listener, keeping only its `!shell` branch.

- [x] **Step 6: Render skills before files**

In `updateFileMenu`, after the skills query resolves, set `fileMenuState.items` to the skills and call `renderFileMenu()` when the list is non-empty; then await `api.listFiles` and re-render with `[...skills, ...files]` only if the token is unchanged. Do not hide the menu while skills are visible.

- [x] **Step 7: Cache skills for 60 s**

`loadSkills()` returns cached results younger than 60 s; track `skillsAt` and a single in-flight promise so two keystrokes cannot double-load. Keep the startup warm-up call.

- [x] **Step 8: Syntax + UI render check**

Run: `node --check src/renderer/app.js`
Run: `node_modules/electron/dist/electron.exe scripts/selftest-ui-render.js`
Expected: "ui render checks passed".

- [x] **Step 9: Commit**

```bash
git add app/src/renderer/app.js app/src/renderer/styles.css
git commit -m "feat(composer): steer into the running turn and invoke @skills"
```

---

### Task 5: End-to-end verification

**Files:**
- Create: `app/scripts/selftest-mention-ui.js`
- Create: `app/scripts/selftest-steer-live.js`

**Interfaces:**
- Consumes: the running app on port 9222 (mention test); `COARENA_KEY` (steer test).
- Produces: pass/fail JSON reports.

- [x] **Step 1: Mention UI check** (CDP, adapt `selftest-coarena-ui.js` helpers)

Open a tab, set `input.value = '@caveman'`, dispatch `input`, wait for `#fileMenu` to show a row whose name is `caveman`, press `ArrowDown` then `Enter` via `Input.dispatchKeyEvent`, assert `input.value.startsWith('/skill:caveman')` and that nothing was sent. Then set `input.value = '@caveman say hi'` and assert the send-time resolver (call `FPProvider.resolveSkillMention` in the page) returns `/skill:caveman say hi`.

- [x] **Step 2: Live steer check**

```js
const handle = await bridge.createFreePiSession({ cwd, sdk, coarenaKey: key, resolveFreePiAuth: async () => null, ... });
await handle.session.prompt('Count slowly from 1 to 60, one number per line, no tools.');
// wait for the first assistant delta, then:
await handle.session.prompt('Stop counting and reply with exactly: STEERED', { streamingBehavior: 'steer' });
// wait for agent_settled
```

Assert: settled once, final text contains `STEERED`, `session.messages` has exactly two user messages, and `handle.rotateAd()` stays `false` (no ad for Coarena).

- [x] **Step 3: Run both**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
node scripts/selftest-steer-live.js
# start Electron with --remote-debugging-port=9222 in a temp profile, then:
node scripts/selftest-mention-ui.js
```

Expected: both exit 0.

- [x] **Step 4: Run the full local suite**

`selftest-provider-ui`, `selftest-prompt-mode`, `selftest-provider-plan`, `selftest-coarena`, `selftest-coarena-key`, `selftest-provider-errors`, `selftest-markdown`, `selftest-session-paths`, `selftest-ui-render`.
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add app/scripts/selftest-mention-ui.js app/scripts/selftest-steer-live.js
git commit -m "test(composer): verify steer delivery and @skill insertion"
```

---

## Self-review notes

- Spec coverage: steer (Tasks 2–4), Ctrl+Enter idle send (Task 4 step 4), menu ordering + skills-first render + TTL (Task 4 steps 5–7), bare-@ resolution (Tasks 1, 4), tests (Tasks 1, 5).
- The ad/turn-id path is untouched; steering stays inside the existing run.
- No task changes the queue bar markup, so `[hidden]` rules stay valid.
