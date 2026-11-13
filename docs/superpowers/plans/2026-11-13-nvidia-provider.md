# NVIDIA NIM provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add NVIDIA NIM as a fourth provider with one DeepSeek V4 Flash model, its own encrypted key, Settings UI and model-dropdown entry.

**Architecture:** `src/nvidia.js` holds the static candidate catalog and the `/v1/models` check; a resolver intersects the two so a retired endpoint disappears. `planProviders` gains a fourth boolean, the bridge registers it beside FreePi, Coarena and Zro, and the renderer reuses the existing keyed-provider meter.

**Tech Stack:** Electron 38 main/preload/renderer (no bundler), Node 20 test scripts, pi coding agent SDK 1.2.

**Spec:** `docs/superpowers/specs/2026-11-13-nvidia-provider-design.md`

## Global Constraints

- Work from `app/`; tests run with `node scripts/<name>.js`.
- No new npm dependencies.
- Provider id `nvidia`; display name `NVIDIA`; base URL exactly `https://integrate.api.nvidia.com/v1`.
- Only DeepSeek Flash is exposed. No V4 Pro, GLM, Nemotron or other NVIDIA models.
- Model config is text-only (`input: ['text']`), `contextWindow: 1048576`, `maxTokens: 16384`.
- The key never enters git, logs, error strings, `prefs.json` or the renderer.
- Test keys come from `$env:NVIDIA_KEY`; never write a real key to a script.
- FreePi, Coarena and Zro behaviour must not change.
- Commit messages use conventional commits, one per task.

## Review Focus

- `/v1/models` is reachable but lists no DeepSeek Flash id: the provider must hide rather than offer a dead model.
- NVIDIA returns 429 below 40 RPM with no `Retry-After`: the hint must say "shared capacity, retry", never "quota exhausted".
- The key is removed while a tab runs an NVIDIA model: that tab moves to a remaining provider and says so.
- An image is attached while NVIDIA is the active model: nothing may send the image, because the endpoint is text-only.
- A retired model id returns 404: the message must name the model and point at the dropdown, not look like a network failure.

---

### Task 1: NVIDIA client and catalog resolution

**Files:**
- Create: `app/src/nvidia.js`
- Test: `app/scripts/selftest-nvidia.js`

**Interfaces:**
- Produces: `NVIDIA_PROVIDER`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL_CANDIDATES`, `nvidiaProviderConfig({ apiKey, models }) -> ProviderConfig`, `nvidiaModelEntries(models) -> [{ provider, id, name }]`, `checkNvidiaKey(key, { fetchImpl }) -> { ok: true, status, ids } | { ok: false, status, error, offline? }`, `resolveNvidiaModels(key, { fetchImpl }) -> Promise<Array<{id, name}>>`.

- [x] **Step 1: Write the failing test**

Assertions in `selftest-nvidia.js`:

- `NVIDIA_PROVIDER === 'nvidia'`, base URL exact.
- `NVIDIA_MODEL_CANDIDATES` is non-empty, every entry has `contextWindow === 1048576` and `maxTokens === 16384`, and every id starts with `deepseek-ai/deepseek-v4`.
- `nvidiaProviderConfig({ apiKey: 'nvapi-test', models: [first candidate] })` → `name 'NVIDIA'`, base URL, `api 'openai-completions'`, `apiKey`, `models.length === 1`, `models[0].input.join(',') === 'text'`, `reasoning === true`, zero cost.
- `nvidiaModelEntries([...])` tags each entry with `provider: 'nvidia'`.
- `checkNvidiaKey` with a fake 200 returning `{data: [{id: 'deepseek-ai/deepseek-v4-flash-0731'}]}` → `ok === true` and `ids` contains that id.
- fake 401 → `ok === false`, `status === 401`, and `error` does not contain the key.
- throwing fetch → `offline === true`.
- blank key → `ok === false`, no fetch call.
- `resolveNvidiaModels` keeps only candidates present in `ids` (fake lists two of three → two entries).
- `resolveNvidiaModels` with all candidates missing from a live list → `[]`.
- `resolveNvidiaModels` offline → first candidate, so a flaky network does not hide the provider.
- `resolveNvidiaModels(null)` → `[]` with no fetch.

- [x] **Step 2: Run it and watch it fail**

Run: `node scripts/selftest-nvidia.js`
Expected: `Cannot find module '../src/nvidia'`.

- [x] **Step 3: Implement `src/nvidia.js`**

Mirror `src/zro.js` style. `checkNvidiaKey` calls `${NVIDIA_BASE_URL}/models` with `Authorization: Bearer <key>`, `AbortSignal.timeout(8000)` only for the global fetch, parses `body.data.map((m) => m.id)`, and returns `ids: []` when the body has no array. `resolveNvidiaModels` returns `[]` for a blank key, returns the candidates whose id is in `ids` when `ok`, returns `[NVIDIA_MODEL_CANDIDATES[0]]` when `offline`, and `[]` when online with no match.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-nvidia.js`
Expected: all pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/nvidia.js app/scripts/selftest-nvidia.js
git commit -m "feat(nvidia): DeepSeek Flash config and live catalog check"
```

---

### Task 2: Provider plan gains NVIDIA

**Files:**
- Modify: `app/src/provider-plan.js`
- Modify: `app/scripts/selftest-provider-plan.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `planProviders({ ..., nvidiaKey, nvidiaModels })` returns `nvidia: boolean`; `NVIDIA_PROVIDER` export; priority FreePi → Coarena → Zro → NVIDIA.

- [x] **Step 1: Add failing checks**

```js
const nv = [{ id: 'deepseek-ai/deepseek-v4-flash-0731', name: 'DeepSeek V4 Flash' }];
const nvOnly = planProviders({ hasFreePiAuth: false, coarenaKey: null, zroKey: null, nvidiaKey: 'k', freePiModels: [], coarenaModels: [], zroModels: [], nvidiaModels: nv });
check('nvidia-only registers', nvOnly.nvidia && nvOnly.available && !nvOnly.zro);
check('nvidia-only default', nvOnly.defaultProvider === 'nvidia' && nvOnly.defaultModel === nv[0].id);
const nvNoKey = planProviders({ hasFreePiAuth: false, coarenaKey: null, zroKey: null, nvidiaKey: null, freePiModels: [], coarenaModels: [], zroModels: [], nvidiaModels: nv });
check('no key means no nvidia', nvNoKey.nvidia === false);
const zroWins = planProviders({ hasFreePiAuth: false, coarenaKey: null, zroKey: 'k', nvidiaKey: 'k', freePiModels: [], coarenaModels: [], zroModels: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }], nvidiaModels: nv });
check('zro outranks nvidia', zroWins.defaultProvider === 'zro' && zroWins.nvidia === true);
```

- [x] **Step 2: Run and see them fail**

Run: `node scripts/selftest-provider-plan.js`
Expected: `nvidia` undefined / default wrong.

- [x] **Step 3: Implement**

Add `NVIDIA_PROVIDER = 'nvidia'`, the `nvidiaKey` / `nvidiaModels` inputs, the `nvidia` boolean after `zro`, a fourth `else if` branch, and `nvidia` in the returned object and `available`. Keep `ads` and `freePiTools` tied to FreePi only.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-provider-plan.js`
Expected: all pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/provider-plan.js app/scripts/selftest-provider-plan.js
git commit -m "feat(plan): allow an NVIDIA provider beside the other three"
```

---

### Task 3: Bridge registers NVIDIA

**Files:**
- Modify: `app/src/freepi-bridge.js`
- Create: `app/scripts/selftest-nvidia-live.js`

**Interfaces:**
- Consumes: Task 1 signatures, Task 2 `NVIDIA_PROVIDER`.
- Produces: `createFreePiSession({ ..., nvidiaKey = null })`; `handle.applyNvidiaKey(nextKey) -> Promise<{ ok, models }>`; merged `handle.modelList`.

- [x] **Step 1: Write the failing live test**

Mirror `selftest-zro-live.js` with `resolveFreePiAuth: async () => null` and `nvidiaKey: process.env.NVIDIA_KEY`. Assert:

- `handle.session.model?.provider === 'nvidia'`
- `handle.modelList.some((m) => m.provider === 'nvidia')`
- no FreePi entries, `(await handle.rotateAd()) === false`
- one prompt `Reply with the single word OK.` settles with no assistant error and an answer matching `/OK/i`
- `await handle.applyNvidiaKey(null)` leaves no NVIDIA entries.

- [x] **Step 2: Run and watch it fail**

```powershell
$env:NVIDIA_KEY = (Get-Content "$env:TEMP\opencode\nvidia-key.txt" -Raw).Trim(); node scripts/selftest-nvidia-live.js
```
Expected: session throws "No AI provider available" or lists no NVIDIA model.

- [x] **Step 3: Implement**

- Import `NVIDIA_PROVIDER` from `provider-plan`, and `resolveNvidiaModels`, `nvidiaProviderConfig`, `nvidiaModelEntries` from `nvidia`.
- Add `nvidiaKey = null` and `activeNvidiaKey`.
- `const nvidiaModels = activeNvidiaKey ? await resolveNvidiaModels(activeNvidiaKey) : [];`
- Pass `nvidiaKey: activeNvidiaKey, nvidiaModels` into `planProviders`; extend the log line.
- Register when `plan.nvidia`; append entries after `zroEntries` everywhere the list is rebuilt (initial build, `applyCoarenaKey`, `applyZroKey`).
- `applyNvidiaKey(nextKey)` unregisters, resolves the catalog again, registers and rebuilds; null clears entries.
- Export `applyNvidiaKey`.

- [ ] **Step 4: Run the live test**

Expected: all checks pass, answer `OK`.

- [x] **Step 5: Commit**

```bash
git add app/src/freepi-bridge.js app/scripts/selftest-nvidia-live.js
git commit -m "feat(bridge): register NVIDIA as a fourth provider"
```

---

### Task 4: Key settings, model label and meter

**Files:**
- Modify: `app/src/main.js`, `app/src/preload.js`
- Modify: `app/src/renderer/provider-ui.js`, `app/src/renderer/index.html`, `app/src/renderer/app.js`
- Modify: `app/scripts/selftest-provider-ui.js`
- Create: `app/scripts/selftest-nvidia-ui.js`

**Interfaces:**
- Consumes: Task 1 `checkNvidiaKey`; Task 3 `applyNvidiaKey`.
- Produces: IPC `nvidia:status/setKey/clearKey`; preload `nvidiaStatus/nvidiaSetKey/nvidiaClearKey`; `providerChrome(model) -> { showAds, meter: 'coarena'|'zro'|'nvidia'|null }`; `providerLabel('nvidia') === 'NVIDIA'`.

- [x] **Step 1: Main and preload**

`const nvidiaKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'nvidia.json' });`. Handlers mirror `zro:status/setKey/clearKey`, with `checkNvidiaKey` for validation; when the check succeeds but `ids` holds no DeepSeek Flash id, save the key and return `{ ok: true, modelMissing: true }` so Settings can say the endpoint is gone. `settings:get` gains `nvidia`; `attachTab` passes `nvidiaKey`; `applyNvidiaKeyToTabs(key)` uses the shared `applyKeyToTabs({ provider: 'nvidia', label: 'NVIDIA', apply })`.

- [x] **Step 2: Provider UI**

`NVIDIA_PROVIDER = 'nvidia'`; `providerLabel` returns `'NVIDIA'`; `providerChrome` returns `{ showAds: false, meter: 'nvidia' }`; no bundled logo (the group uses the `N` initial).

- [x] **Step 3: Markup and renderer**

Settings group `NVIDIA` with `nvidiaKeyInput`, `nvidiaSave`, `nvidiaRemove`, `nvidiaStatus`, `nvidiaGetKey` → `https://build.nvidia.com/settings/api-keys`. Strings in `en`/`th` mirror the Zro group, plus `nvidiaFreeTier: 'Free tier'` / `'โควตาฟรี'` and `nvidiaLimits: '40/min · 10,000/day'`. `paintProviderMeter` shows label `Free tier` and that static limits line for `meter === 'nvidia'`. Save/remove handlers mirror Zro's, including the remove confirmation branch `nvidiaRemove`.

- [x] **Step 4: Tests**

`selftest-provider-ui.js` adds the label and chrome cases. `selftest-nvidia-ui.js` (CDP) saves `$env:NVIDIA_KEY`, asserts the option `nvidia||<id>` is labelled `NVIDIA · DeepSeek V4 Flash`, switches to it, asserts the meter shows `Free tier` and `40/min · 10,000/day`, hides ads and the FreePi meter, then removes the key and asserts the option is gone.

- [ ] **Step 5: Run everything**

Local suite + `selftest-nvidia-live.js` + the CDP scripts + `selftest-ui-render.js`.
Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add app/src/main.js app/src/preload.js app/src/renderer/provider-ui.js app/src/renderer/index.html app/src/renderer/app.js app/scripts/selftest-provider-ui.js app/scripts/selftest-nvidia-ui.js
git commit -m "feat(nvidia): key settings, model label and free-tier meter"
```

---

### Task 5: NVIDIA error hints

**Files:**
- Modify: `app/src/provider-errors.js`
- Modify: `app/scripts/selftest-provider-errors.js`

**Interfaces:**
- Consumes: `friendlyProviderError(raw, { provider })`, already wired in `main.js`.
- Produces: `NVIDIA_HINTS` export.

- [x] **Step 1: Add failing checks**

```js
const nvBad = friendlyProviderError('401: {"error":{"message":"Unauthorized"}}', { provider: 'nvidia' });
check('nvidia bad key names Settings', /NVIDIA/.test(nvBad.text) && /Settings/.test(nvBad.text));
const nvTrial = friendlyProviderError('403: {"error":{"message":"forbidden"}}', { provider: 'nvidia' });
check('nvidia trial end is explained', /trial/i.test(nvTrial.text));
const nvBusy = friendlyProviderError('429: {"error":{"message":"Too Many Requests"}}', { provider: 'nvidia' });
check('nvidia 429 is shared capacity, not quota', /shared capacity/i.test(nvBusy.text) && !/quota/i.test(nvBusy.text));
const nvRetired = friendlyProviderError('404: {"error":{"message":"Function not found"}}', { provider: 'nvidia' });
check('nvidia retired model points at the dropdown', /retired/i.test(nvRetired.text) && /model/i.test(nvRetired.text));
const nvOffline = friendlyProviderError('fetch failed', { provider: 'nvidia' });
check('nvidia network failure names NVIDIA', /NVIDIA/.test(nvOffline.text) && /connection/i.test(nvOffline.text));
```

- [x] **Step 2: Run and see them fail**

Run: `node scripts/selftest-provider-errors.js`
Expected: NVIDIA hints fall through to the raw message.

- [x] **Step 3: Implement**

Add `NVIDIA_HINTS` with the four copy lines the tests match, plus a `provider === 'nvidia'` branch handling `401`, `403`, `429`, `404` and `looksLikeNetworkFailure`. Keep the existing branches untouched.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-provider-errors.js`
Expected: all pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/provider-errors.js app/scripts/selftest-provider-errors.js
git commit -m "feat(errors): explain NVIDIA key, trial, capacity and retired models"
```

---

## Self-review notes

- Spec coverage: client + catalog (Task 1), plan (Task 2), bridge (Task 3), key/IPC/UI/meter (Task 4), errors (Task 5). Vision limitation is enforced by the text-only input in Task 1 and covered in Review Focus.
- The 16K output cap and 1M context are pinned in Task 1's test, so a later edit cannot silently copy Zro's 64K.
- Nothing touches FreePi ads, `x-turn-id` or the image pruning already in place.
