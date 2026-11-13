# Zro Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add zro.moonmath.ai as a third provider with one DeepSeek model, its own encrypted key, Settings UI and model-dropdown entry.

**Architecture:** A static Zro client builds the provider config; `planProviders` gains a third boolean; the bridge registers it beside FreePi and Coarena. `coarena-key.js` becomes a generic `provider-key.js` used with `coarena.json` and `zro.json`.

**Tech Stack:** Electron 38 main/preload/renderer (no bundler), Node 20 test scripts, pi coding agent SDK 1.2.

**Spec:** `docs/superpowers/specs/2026-11-13-zro-provider-design.md`

## Global Constraints

- Work from `app/`; tests run with `node scripts/<name>.js`.
- No new npm dependencies.
- Provider id `zro`; base URL exactly `https://zro.moonmath.ai/v1`; display name `Zro`.
- Only `deepseek-v4.1-flash` is exposed. No GLM/Dolly/Abyss/auto.
- The key never enters git, logs, error strings, `prefs.json` or the renderer.
- Test keys come from `$env:ZRO_KEY`; never write a real key to a script.
- FreePi and Coarena behaviour must not change.
- Commit messages use conventional commits, one per task.

## Review Focus

- A wrong key is rejected before disk; an offline check saves it marked unverified.
- Removing the key while a tab runs Zro switches that tab to another model and says so.
- The Zro key file never appears in `prefs.json` or the session store.
- `@`/steer/image features keep working; the Zro model declares image input.
- Ads never fetch on a Zro turn and no `x-turn-id` is added.

---

### Task 1: Generic provider key store

**Files:**
- Rename: `app/src/coarena-key.js` → `app/src/provider-key.js`
- Rename: `app/scripts/selftest-coarena-key.js` → `app/scripts/selftest-provider-key.js`
- Modify: `app/src/main.js` (import and `createCoarenaKeyStore` call)

**Interfaces:**
- Produces: `createProviderKeyStore({ dir, safeStorage, fileName }) -> { path, status(), read(), save(raw), clear() }`; `FILE_NAME` export removed, the file name is the caller's.

- [x] **Step 1: Rename the module and make `fileName` a parameter**

`createCoarenaKeyStore({ dir, safeStorage })` becomes `createProviderKeyStore({ dir, safeStorage, fileName })` with `fileName` required; replace every `FILE_NAME` use with `fileName`. Keep every behaviour identical.

- [x] **Step 2: Parameterise the test**

`selftest-provider-key.js` imports `createProviderKeyStore` and runs its whole body for `coarena.json` and `zro.json` (a `for (const fileName of [...])` wrapper). Check `path.basename(store.path) === fileName`.

- [x] **Step 3: Update main.js**

`const { createProviderKeyStore } = require('./provider-key');` and
`const coarenaKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'coarena.json' });`

- [x] **Step 4: Run the tests**

Run: `node scripts/selftest-provider-key.js`
Expected: all checks pass for both file names, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/provider-key.js app/scripts/selftest-provider-key.js app/src/main.js
git rm app/src/coarena-key.js app/scripts/selftest-coarena-key.js
git commit -m "refactor(keys): share one safeStorage key store across providers"
```

---

### Task 2: Zro client

**Files:**
- Create: `app/src/zro.js`
- Test: `app/scripts/selftest-zro.js`

**Interfaces:**
- Produces: `ZRO_PROVIDER`, `ZRO_BASE_URL`, `ZRO_MODELS`, `zroProviderConfig({ apiKey }) -> ProviderConfig`, `zroModelEntries() -> [{ provider, id, name }]`, `checkZroKey(key, { fetchImpl }) -> { ok: true } | { ok: false, status, error, offline? }`.

- [x] **Step 1: Write the failing test**

Assertions:
- `ZRO_BASE_URL === 'https://zro.moonmath.ai/v1'`, `ZRO_PROVIDER === 'zro'`.
- `ZRO_MODELS` has one entry with `id === 'deepseek-v4.1-flash'`, `contextWindow === 1000000`, `maxTokens === 65536`.
- `zroProviderConfig({ apiKey: 'sk-test' })` → `name 'Zro'`, base URL, `api 'openai-completions'`, `apiKey`, one model with `input.join(',') === 'text,image'`, `reasoning === true`, zero costs.
- `zroModelEntries()[0]` is `{ provider: 'zro', id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }`.
- `checkZroKey('sk-test', { fetchImpl: fake(200, { data: [] }) })` → `ok === true`.
- `fake(401, …)` → `ok === false`, `status === 401`.
- throwing fetch → `ok === false`, `offline === true`.
- blank key → `ok === false` without calling fetch.

- [x] **Step 2: Run it and watch it fail**

Run: `node scripts/selftest-zro.js`
Expected: `Cannot find module '../src/zro'`.

- [x] **Step 3: Implement `src/zro.js`**

Mirror `src/coarena.js` style. `checkZroKey` sends `Authorization: Bearer <key>` to `/models`, uses `AbortSignal.timeout(8000)` only for the global fetch, never includes the key in an error, and treats network errors as `offline: true`.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-zro.js`
Expected: all pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/zro.js app/scripts/selftest-zro.js
git commit -m "feat(zro): DeepSeek-only provider config and key check"
```

---

### Task 3: Provider plan gains Zro

**Files:**
- Modify: `app/src/provider-plan.js`
- Modify: `app/scripts/selftest-provider-plan.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `planProviders({ hasFreePiAuth, coarenaKey, zroKey, freePiModels, coarenaModels, zroModels })` returns `zro: boolean` too; default priority FreePi → Coarena → Zro.

- [x] **Step 1: Add failing checks**

```js
const zro = [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }];
const zroOnly = planProviders({ hasFreePiAuth: false, coarenaKey: null, zroKey: 'k', freePiModels: [], coarenaModels: [], zroModels: zro });
check('zro-only registers', zroOnly.zro && zroOnly.available && !zroOnly.freePi && !zroOnly.coarena);
check('zro-only default', zroOnly.defaultProvider === 'zro' && zroOnly.defaultModel === 'deepseek-v4.1-flash');
const zroWithoutKey = planProviders({ hasFreePiAuth: false, coarenaKey: null, zroKey: null, freePiModels: [], coarenaModels: [], zroModels: zro });
check('no key means no zro', zroWithoutKey.zro === false);
const coarenaWins = planProviders({ hasFreePiAuth: false, coarenaKey: 'k', zroKey: 'k', freePiModels: [], coarenaModels: co, zroModels: zro });
check('coarena outranks zro', coarenaWins.defaultProvider === 'coarena');
```

- [x] **Step 2: Run and see them fail**

Run: `node scripts/selftest-provider-plan.js`
Expected: `zro` undefined / default wrong.

- [x] **Step 3: Implement**

Add `zroKey`, `zroModels`, the `zro` boolean and the priority chain. Keep `freePiTools` and `ads` tied to FreePi only.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-provider-plan.js`
Expected: all pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/provider-plan.js app/scripts/selftest-provider-plan.js
git commit -m "feat(plan): allow a Zro provider beside FreePi and Coarena"
```

---

### Task 4: Bridge registers Zro

**Files:**
- Modify: `app/src/freepi-bridge.js`
- Create: `app/scripts/selftest-zro-live.js`

**Interfaces:**
- Produces: `createFreePiSession({ ..., zroKey = null })`; `handle.applyZroKey(nextKey) -> { ok, models }`; merged `handle.modelList`.

- [x] **Step 1: Write the failing live test**

Mirror `selftest-coarena-live.js` with `resolveFreePiAuth: async () => null` and `zroKey: process.env.ZRO_KEY`. Assert:
- `handle.session.model?.provider === 'zro'`
- `handle.modelList.some((m) => m.provider === 'zro')`
- `(await handle.rotateAd()) === false`
- one prompt `Reply with the single word OK.` settles, no assistant error, answer matches `/OK/i`
- `await handle.applyZroKey(null)` leaves no Zro entries.

- [x] **Step 2: Run and watch it fail**

```powershell
$env:ZRO_KEY = (Get-Content "$env:TEMP\opencode\zro-key.txt" -Raw).Trim(); node scripts/selftest-zro-live.js
```
Expected: session throws "No AI provider available" or lists no Zro model.

- [x] **Step 3: Implement**

- Import `ZRO_PROVIDER`, `zroProviderConfig`, `zroModelEntries` and plan with `zroKey`.
- Register `zro` in `providerExtension.factory` when `plan.zro`.
- Append `zroModelEntries()` to `modelList` (after Coarena).
- `applyZroKey(nextKey)` mirrors `applyCoarenaKey`, using the static catalog.
- The stub ads client already covers a Zro-only session.

- [x] **Step 4: Run the live test**

Expected: all checks pass, answer `OK`.

- [x] **Step 5: Commit**

```bash
git add app/src/freepi-bridge.js app/scripts/selftest-zro-live.js
git commit -m "feat(bridge): register Zro as a third provider"
```

---

### Task 5: Main, preload, settings and meter

**Files:**
- Modify: `app/src/main.js`, `app/src/preload.js`
- Modify: `app/src/renderer/provider-ui.js`, `app/src/renderer/index.html`, `app/src/renderer/app.js`, `app/src/renderer/styles.css`
- Modify: `app/scripts/selftest-provider-ui.js`
- Create: `app/scripts/selftest-zro-ui.js`

**Interfaces:**
- Produces: IPC `zro:status/setKey/clearKey`; preload `zroStatus/zroSetKey/zroClearKey`; `providerChrome(model) -> { showAds, meter: 'coarena'|'zro'|null }`.

- [x] **Step 1: Main**

Create `const zroKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'zro.json' });`. Add `zroStatus()` (no remote info), `zro:setKey` (validate with `checkZroKey`; offline → unverified), `zro:clearKey`, `applyZroKeyToTabs(key)` mirroring `applyKeyToTabs`, and `zro` in `settings:get`. Pass `zroKey: zroKeys.read()` in `attachTab`.

- [x] **Step 2: Preload**

`zroStatus`, `zroSetKey`, `zroClearKey`.

- [x] **Step 3: Provider UI**

`providerLabel('zro') === 'Zro'`. `providerChrome` returns `{ showAds: false, meter: 'zro' }` for Zro, `{ showAds: false, meter: 'coarena' }` for Coarena, `{ showAds: true, meter: null }` for FreePi, `{ showAds: false, meter: null }` otherwise. Update existing checks to the new shape.

- [x] **Step 4: Markup and renderer**

Rename `#coarenaUsage` to `#providerUsage`, add `#providerName` and keep `#coarenaMeterText` as `#providerMeterText`. Settings gets a Zro group (`zroKeyInput`, `zroSave`, `zroRemove`, `zroStatus`, `zroGetKey` → https://zro.moonmath.ai/api-keys). Strings in `en`/`th`. `syncProviderChrome` sets the provider name and meter text: Coarena → limits line; Zro → `DeepSeek V4.1 Flash`. Save/remove handlers mirror Coarena's.

- [x] **Step 5: Tests**

`selftest-provider-ui.js` covers the new chrome shape. `selftest-zro-ui.js` (CDP) saves `$env:ZRO_KEY`, asserts the dropdown has `zro||deepseek-v4.1-flash` labelled `Zro · DeepSeek V4.1 Flash`, switches to it, asserts the meter shows the model and ads are hidden, then removes the key and asserts the option is gone.

- [x] **Step 6: Run everything**

Local suite + `selftest-zro-live.js` + the two CDP scripts + `selftest-ui-render.js`.
Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add app/src/main.js app/src/preload.js app/src/renderer/provider-ui.js app/src/renderer/index.html app/src/renderer/app.js app/src/renderer/styles.css app/scripts/selftest-provider-ui.js app/scripts/selftest-zro-ui.js
git commit -m "feat(zro): key settings, model label and provider meter"
```

---

## Self-review notes

- Spec coverage: key store (Task 1), client (Task 2), plan (Task 3), bridge (Task 4), UI/IPC (Task 5), live and CDP tests (Tasks 4–5).
- Only DeepSeek is exposed; the static catalog makes that impossible to drift.
- Ads, FreePi tools and `x-turn-id` are untouched.
