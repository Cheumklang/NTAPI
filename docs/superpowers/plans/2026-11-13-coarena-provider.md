# Coarena provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the desktop app talk to Coarena's OpenAI-compatible API alongside FreePi, with a key stored through Electron's safeStorage, provider-aware ads and usage, and a session that can run on either provider.

**Architecture:** Two providers are registered in one pi session. A pure `planProviders()` decides which providers, default model, ads and FreePi-backed tools exist; the bridge consumes it. Coarena models come from `GET /api/v1/models` with a verified static fallback. The key lives in `<DATA_ROOT>/coarena.json` (safeStorage/DPAPI) and is never returned to the renderer. Ads stay FreePi-only and follow the active model's provider.

**Tech Stack:** Electron 38 (main/preload/renderer, no bundler), Node 20+ test scripts (`node scripts/...`), pi coding agent SDK 1.2 (`@earendil-works/pi-coding-agent`).

**Spec:** `docs/superpowers/specs/2026-11-13-coarena-provider-design.md`

## Global Constraints

- Work from `app/` unless a path says otherwise; run tests with `node scripts/<name>.js`.
- No new npm dependencies. Node built-ins and Electron only.
- Coarena base URL is exactly `https://coarena.ai/api/v1`; provider id is `coarena`; UI label is `Coarena`.
- FreePi provider ids stay `free-pi` and `free-pi-defense`; their default model stays `deepseek-v4.1-flash` when available.
- The Coarena key must never be committed, logged, written to `prefs.json`, or returned to the renderer. No literal `coa_…` value in source or tests; tests use `coa_test_000000000000`.
- UI strings go in both `en` and `th` dictionaries in `src/renderer/app.js`.
- Any element that sets `display:flex` and can be `hidden` also needs a `[hidden] { display: none; }` rule (see commit `cb06f8b`).
- Commit messages use conventional commits, one commit per task.

## Review Focus

- A saved key that is revoked or wrong at send time must produce the Coarena key message, not a raw JSON wall.
- FreePi auth failing at startup while a Coarena key exists must still open a session that chats.
- Switching Coarena → FreePi mid-session must restore the ad and never send `x-turn-id` on a Coarena request.
- Removing the key while a tab is on a Coarena model must not leave a stuck tab.
- A Coarena 429 that exhausts the SDK's three retries must show one clear message, not stacked errors.

---

### Task 1: Session provider plan

**Files:**
- Create: `app/src/provider-plan.js`
- Test: `app/scripts/selftest-provider-plan.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `planProviders({ hasFreePiAuth, coarenaKey, freePiModels, coarenaModels }) -> { freePi: boolean, coarena: boolean, ads: boolean, freePiTools: boolean, defaultProvider: 'free-pi'|'coarena'|null, defaultModel: string|null, available: boolean }`; constants `FREE_PI_PROVIDER`, `COARENA_PROVIDER`, `PREFERRED_FREE_PI_MODEL = 'deepseek-v4.1-flash'`, `FREE_PI_TOOL_NAMES = ['web_search','docs_lookup','generate_image','free_pi_usage','look_at_image']`.

- [ ] **Step 1: Write the failing test**

Create `app/scripts/selftest-provider-plan.js` in the style of `selftest-provider-errors.js` (`check(name, ok, detail)`), with these cases:

```js
const { planProviders, PREFERRED_FREE_PI_MODEL, FREE_PI_TOOL_NAMES } = require('../src/provider-plan');
const pi = [{ id: PREFERRED_FREE_PI_MODEL, name: 'DeepSeek' }, { id: 'other', name: 'Other' }];
const co = [{ id: 'claude-fable-5', name: 'Claude Fable 5' }];

const both = planProviders({ hasFreePiAuth: true, coarenaKey: 'k', freePiModels: pi, coarenaModels: co });
check('both providers registered', both.freePi && both.coarena);
check('free-pi stays the default', both.defaultProvider === 'free-pi' && both.defaultModel === PREFERRED_FREE_PI_MODEL);
check('ads only with free-pi', both.ads === true);
check('free-pi tools only with free-pi', both.freePiTools === true && FREE_PI_TOOL_NAMES.length === 5);

const coOnly = planProviders({ hasFreePiAuth: false, coarenaKey: 'k', freePiModels: pi, coarenaModels: co });
check('coarena-only works', coOnly.available && coOnly.coarena && !coOnly.freePi);
check('coarena-only defaults to coarena', coOnly.defaultProvider === 'coarena' && coOnly.defaultModel === 'claude-fable-5');
check('no ads and no free-pi tools', coOnly.ads === false && coOnly.freePiTools === false);

const emptyCoarena = planProviders({ hasFreePiAuth: true, coarenaKey: 'k', freePiModels: pi, coarenaModels: [] });
check('empty catalog is not a provider', emptyCoarena.coarena === false);

const none = planProviders({ hasFreePiAuth: false, coarenaKey: null, freePiModels: [], coarenaModels: [] });
check('nothing available', none.available === false && none.defaultProvider === null && none.defaultModel === null);
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/selftest-provider-plan.js`
Expected: `Error: Cannot find module '../src/provider-plan'`.

- [ ] **Step 3: Implement `src/provider-plan.js`**

Rules: register FreePi only when `hasFreePiAuth` and `freePiModels.length`; register Coarena only when `coarenaKey` and `coarenaModels.length`; `ads` and `freePiTools` mirror FreePi; default provider is FreePi when registered, else Coarena, else `null`; default model is `PREFERRED_FREE_PI_MODEL` when present in the FreePi list, otherwise the first model of the chosen provider.

- [ ] **Step 4: Run the test**

Run: `node scripts/selftest-provider-plan.js`
Expected: every line `PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/provider-plan.js app/scripts/selftest-provider-plan.js
git commit -m "feat(provider): plan which providers a session can register"
```

---

### Task 2: Coarena API client

**Files:**
- Create: `app/src/coarena.js`
- Test: `app/scripts/selftest-coarena.js`

**Interfaces:**
- Consumes: nothing (fetch injected).
- Produces:
  - `COARENA_PROVIDER = 'coarena'`, `COARENA_BASE_URL = 'https://coarena.ai/api/v1'`
  - `FALLBACK_MODELS: { id, name }[]` with exactly `claude-fable-5`, `deepseek-v4-1-flash-1017`, `gemini-4-argon`, `kimi-k3-1-pro`, `grok-4-7`
  - `fetchCoarenaModels({ fetchImpl, now, force }) -> { models: [{ id, name, contextWindow, maxTokens }], source: 'live'|'cache'|'fallback', error?: string }`, 10-minute memory cache
  - `coarenaProviderConfig({ apiKey, models }) -> ProviderConfig`
  - `coarenaModelEntries(models) -> [{ provider: 'coarena', id, name }]`
  - `readCoarenaKeyInfo(key, { fetchImpl }) -> { ok: true, info } | { ok: false, status, error, code, offline? }` where `info` is `{ label, prefix, isFreeTier, expiresAt, limits: { requestsPerMinute, concurrency, usdPerDay, maxOutputTokens }, usageToday: { requests, costUsd, resetsAt } }`
  - `resetCoarenaModelCache()` for tests.

- [ ] **Step 1: Write the failing test**

`app/scripts/selftest-coarena.js` uses a fake fetch response helper:

```js
const fake = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const modelsPayload = { data: [{ id: 'm1', display_name: 'Model One', context_length: 64000, max_tokens: 4096 }] };
```

Assertions:
- `fetchCoarenaModels({ fetchImpl: fake(200, modelsPayload), force: true })` → `source === 'live'`, one model with `name === 'Model One'`, `contextWindow === 64000`, `maxTokens === 4096`.
- A second call with a fetch that throws returns `source === 'cache'` and the same model, without calling the network.
- After `resetCoarenaModelCache()`, a throwing fetch returns `source === 'fallback'`, five ids, and the first id is `claude-fable-5`.
- `coarenaProviderConfig({ apiKey: 'coa_test_000000000000', models })` → `name === 'Coarena'`, `baseUrl === 'https://coarena.ai/api/v1'`, `api === 'openai-completions'`, `apiKey` set, one model with `input: ['text']`, `reasoning: true`, `contextWindow === 64000`, zero costs.
- `readCoarenaKeyInfo` with `fake(200, { data: { label: 'main', prefix: 'coa_1234', is_free_tier: true, limits: { requests_per_minute_key: 30, concurrency: 2 }, usage_today: { requests: 4, cost_usd: 0.01 } } })` → `ok`, `limits.requestsPerMinute === 30`, `usageToday.requests === 4`.
- The same call with `fake(401, { error: { code: 'invalid_api_key', message: 'bad key' } })` → `ok === false`, `status === 401`, `code === 'invalid_api_key'`.
- A throwing fetch → `ok === false` and `offline === true`.

- [ ] **Step 2: Run it and watch it fail**

Run: `node scripts/selftest-coarena.js`
Expected: `Cannot find module '../src/coarena'`.

- [ ] **Step 3: Implement `src/coarena.js`**

Normalization rules: `name = display_name || id`; `contextWindow = context_length || 128000`; `maxTokens = max_completion_tokens || max_tokens || 16384`. Cache is a module-level `{ at, models }`; `force` bypasses it. Every HTTP call uses `AbortSignal.timeout(8000)` when the injected fetch is the global one (skip the option when a fake fetch is injected). `coarenaProviderConfig` sets `compat: { supportsDeveloperRole: false }`, `input: ['text']`, `reasoning: true`, and zero cost fields. Never include the key in an error string.

- [ ] **Step 4: Run the test**

Run: `node scripts/selftest-coarena.js`
Expected: all checks `PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/coarena.js app/scripts/selftest-coarena.js
git commit -m "feat(coarena): model catalog, provider config and key metadata"
```

---

### Task 3: Coarena key store

**Files:**
- Create: `app/src/coarena-key.js`
- Test: `app/scripts/selftest-coarena-key.js`

**Interfaces:**
- Consumes: an injected `safeStorage` with `isEncryptionAvailable()`, `encryptString(string) -> Buffer`, `decryptString(Buffer) -> string`.
- Produces: `createCoarenaKeyStore({ dir, safeStorage }) -> { path, status(), read(), save(raw), clear() }`; `status()` returns `{ configured, readable, encrypted, hint, error? }`.

- [ ] **Step 1: Write the failing test**

Use `fs.mkdtempSync(path.join(os.tmpdir(), 'coarena-key-'))` for `dir`. Fake storage:

```js
const fakeSafe = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`enc:${s}`), decryptString: (b) => b.toString().slice(4) };
```

Assertions:
- Empty store → `status()` is `{ configured: false, readable: false, encrypted: false, hint: null }`.
- `save('coa_test_000000000000')` then `read()` returns the same string; `status()` has `configured: true, readable: true, encrypted: true, hint: '0000'`; the on-disk JSON does not contain the raw key.
- Recreate the store with a safeStorage whose `decryptString` throws → `status()` is `configured: true, readable: false, encrypted: true, hint: null`; `read()` returns `null`.
- `isEncryptionAvailable: () => false` → save writes `encrypted: false`, `read()` still returns the key, and `status().encrypted === false`.
- `clear()` removes the file and `status().configured === false`.
- `save('   ')` throws `Error('empty key')`.

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/selftest-coarena-key.js`
Expected: `Cannot find module '../src/coarena-key'`.

- [ ] **Step 3: Implement `src/coarena-key.js`**

File is `<dir>/coarena.json`, shape `{ v: 1, encrypted, key }`, mode `0o600`. A malformed JSON file reports `configured: true, readable: false, error: 'corrupt'`; a DPAPI failure reports `error: 'undecryptable'`. `save` creates the directory, writes atomically (temp file + rename), and returns `status()`. `clear` unlinks and ignores `ENOENT`.

- [ ] **Step 4: Run the test**

Run: `node scripts/selftest-coarena-key.js`
Expected: all checks `PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/coarena-key.js app/scripts/selftest-coarena-key.js
git commit -m "feat(coarena): store the API key with safeStorage"
```

---

### Task 4: Provider error hints

**Files:**
- Modify: `app/src/provider-errors.js`
- Modify: `app/scripts/selftest-provider-errors.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `friendlyProviderError(raw, { provider } = {})` — same return shape `{ text, code }`, with an optional second argument. Existing one-argument calls are unchanged.

- [ ] **Step 1: Add the failing checks**

Append to `selftest-provider-errors.js`:

```js
const badKey = friendlyProviderError('401: {"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}}', { provider: 'coarena' });
check('coarena bad key names Settings', /API key/i.test(badKey.text) && /Settings/i.test(badKey.text));
check('coarena bad key keeps status', badKey.text.includes('HTTP 401'));

const limited = friendlyProviderError('429: {"error":{"message":"rate limited","code":"rate_limit_exceeded"}}', { provider: 'coarena' });
check('coarena rate limit names the limit', /30 requests per minute/i.test(limited.text));

const offline = friendlyProviderError('fetch failed', { provider: 'coarena' });
check('coarena network failure names Coarena', /Coarena/.test(offline.text) && /connection/i.test(offline.text));

const freePiOffline = friendlyProviderError('fetch failed');
check('one-argument calls unchanged', /fetch failed/.test(freePiOffline.text));
```

- [ ] **Step 2: Run it and see the new checks fail**

Run: `node scripts/selftest-provider-errors.js`
Expected: FAIL on the four new checks, the old ones still pass.

- [ ] **Step 3: Implement the hints**

Add `ERROR_HINTS` entries for `invalid_api_key`, `rate_limit`, `rate_limit_exceeded`, `insufficient_quota`. Copy: bad key = "Coarena rejected this API key — open Settings, replace it, then retry."; limits = "Coarena allows 30 requests per minute. Wait a moment and try again."; quota = "Coarena has no quota left today — it resets at UTC midnight." Add the optional `{ provider }` parameter; when `provider === 'coarena'` and the raw text looks like a network failure (`fetch failed`, `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `socket hang up`, `network error`), use "Could not reach Coarena — check your connection and retry." Keep the HTTP suffix behaviour.

- [ ] **Step 4: Run both error tests**

Run: `node scripts/selftest-provider-errors.js`
Expected: all checks `PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/provider-errors.js app/scripts/selftest-provider-errors.js
git commit -m "feat(errors): explain Coarena key and rate-limit failures"
```

---

### Task 5: Renderer provider helpers

**Files:**
- Create: `app/src/renderer/provider-ui.js`
- Modify: `app/src/renderer/index.html:313` (add the script before `app.js`)
- Test: `app/scripts/selftest-provider-ui.js`

**Interfaces:**
- Consumes: nothing.
- Produces on `globalThis.FPProvider` (and `window`): `providerLabel(provider) -> 'FreePi'|'Coarena'|string`, `isFreePiProvider(provider) -> boolean`, `modelOptionLabel({provider, id, name}) -> string`, `providerChrome(model) -> { showAds, showCoarenaMeter }`, `coarenaMeterText(info) -> string`.

- [ ] **Step 1: Write the failing test**

```js
require('../src/renderer/provider-ui.js');
const UI = globalThis.FPProvider;
check('free-pi label', UI.providerLabel('free-pi') === 'FreePi' && UI.providerLabel('free-pi-defense') === 'FreePi');
check('coarena label', UI.providerLabel('coarena') === 'Coarena');
check('option label', UI.modelOptionLabel({ provider: 'coarena', id: 'x', name: 'Claude Fable 5' }) === 'Coarena · Claude Fable 5');
check('option falls back to id', UI.modelOptionLabel({ provider: 'coarena', id: 'x' }) === 'Coarena · x');
const co = UI.providerChrome({ provider: 'coarena' });
check('coarena hides ads', co.showAds === false && co.showCoarenaMeter === true);
const fp = UI.providerChrome({ provider: 'free-pi' });
check('free-pi shows ads', fp.showAds === true && fp.showCoarenaMeter === false);
check('meter text', UI.coarenaMeterText({ limits: { requestsPerMinute: 30, concurrency: 2 }, usageToday: { requests: 4 } }) === '30/min · 2 at once · 4 today');
check('meter empty without info', UI.coarenaMeterText(null) === '');
```

- [ ] **Step 2: Run it and see it fail**

Run: `node scripts/selftest-provider-ui.js`
Expected: `Cannot find module '../src/renderer/provider-ui.js'`.

- [ ] **Step 3: Implement `provider-ui.js`**

Use the same classic-script pattern as `markdown.js`:

```js
(function (root) { /* ... */ root.FPProvider = {...}; })(typeof window !== 'undefined' ? window : globalThis);
```

`providerChrome(model)` returns `{ showAds: true, showCoarenaMeter: false }` for `free-pi`/`free-pi-defense`, `{ showAds: false, showCoarenaMeter: true }` for `coarena`, and `{ showAds: false, showCoarenaMeter: false }` for anything else.

- [ ] **Step 4: Add the script tag and run the test**

In `index.html`, add `<script src="provider-ui.js"></script>` immediately before `<script src="app.js"></script>`.

Run: `node scripts/selftest-provider-ui.js`
Expected: all checks `PASS`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/provider-ui.js app/src/renderer/index.html app/scripts/selftest-provider-ui.js
git commit -m "feat(renderer): provider labels and chrome rules"
```

---

### Task 6: Bridge — two providers, optional FreePi, live key swap

**Files:**
- Modify: `app/src/freepi-bridge.js` (session bootstrap `437-560`, ads extension `380-413`, settings `978-1035`, returns `1037-1157`)
- Test: `app/scripts/selftest-coarena-live.js` (new, opt-in network test)

**Interfaces:**
- Consumes: Task 1 (`planProviders`, `PREFERRED_FREE_PI_MODEL`, `FREE_PI_TOOL_NAMES`), Task 2 (`COARENA_PROVIDER`, `coarenaProviderConfig`, `coarenaModelEntries`, `fetchCoarenaModels`).
- Produces: `createFreePiSession({ ..., coarenaKey = null, resolveFreePiAuth = resolveAuth }) -> handle` with:
  - `handle.modelList` merged (`free-pi`, `free-pi-defense`, `coarena`)
  - `handle.applyCoarenaKey(nextKey) -> { ok, models }`
  - `handle.modelFallback -> { from: { provider, id }, to: { provider, id, name } } | null`
  - `handle.rotateAd()` returns `false` when ads are disabled.

- [ ] **Step 1: Write the failing live test**

`selftest-coarena-live.js` reads the key from `process.env.COARENA_KEY`, fails fast with a clear message when it is absent, and otherwise:

```js
const handle = await bridge.createFreePiSession({
  cwd, sdk,
  sessionManager: sdk.SessionManager.create(cwd, tmpSessions),
  coarenaKey: key,
  resolveFreePiAuth: async () => null,
  skillsAgentDir: tmpSkills,
  imagesDir: tmpImages,
  downloadsDir: tmpDownloads,
});
check('standalone session uses coarena', handle.session.model?.provider === 'coarena');
check('coarena models listed', handle.modelList.some((m) => m.provider === 'coarena'));
check('no ads for coarena', handle.rotateAd() === false);
```

Then subscribe to `message_end`, prompt "Reply with the single word OK", wait up to 90 s for `agent_settled`, and assert an assistant message with `stopReason !== 'error'` and text containing `OK`. Finally call `handle.applyCoarenaKey(null)` and assert no `coarena` entries remain in `handle.modelList`.

- [ ] **Step 2: Run it and see it fail**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim(); node scripts/selftest-coarena-live.js
```

Expected: FAIL — the session still throws `no free-pi credentials available`.

- [ ] **Step 3: Rework `createFreePiSession` bootstrap**

- Add the two options above.
- Replace the hard `resolveAuth` failure with a try/catch that leaves `auth = null` and logs `free-pi auth unavailable: <message>`.
- Fetch the FreePi catalog only when `auth` exists; fetch `fetchCoarenaModels()` only when `coarenaKey` exists.
- Call `planProviders(...)`; throw `new Error('No AI provider available — sign in to FreePi or add a Coarena key in Settings.')` only when `!plan.available`.
- Create the ads client only when `plan.ads`; otherwise use a stub with `extension: null`, `prefetchLaunchAd: async () => false`, `rotateAd: async () => false`, `startTurn() {}`, `currentTurnId: () => null`.
- In `providerExtension.factory`, keep a module-local `piApi` reference, register FreePi only when `plan.freePi`, register Coarena only when `plan.coarena`, and delete the unconditional `event.headers.Authorization` hook entirely.
- In the ads extension, prefix-handler `x-turn-id` only when `ctx.getModel()?.provider` is `free-pi` or `free-pi-defense`. In `before_agent_start`, return early unless the active provider is FreePi.
- `settingsManager`: `defaultProvider`/`defaultModel` come from `plan`; `defaultTools` and the `createAgentSessionFromServices({ tools })` list append `FREE_PI_TOOL_NAMES` only when `plan.freePiTools`.
- `extensionFactories`: include `ads.extension` only when `plan.ads`, and `visionExtension`/`extraToolsExtension` only when `plan.freePiTools`.
- Build `freePiEntries` from the FreePi + defense models and `modelList = [...freePiEntries, ...coarenaModelEntries(coarenaModels)]`.
- After the session exists, compute `modelFallback`: take the last assistant message with `provider` and `model`; if that pair is not in `modelList`, return `{ from: { provider, id: model }, to: session.model ? { provider, id, name } : null }`; otherwise `null`.
- Implement `applyCoarenaKey(nextKey)`: call `piApi.unregisterProvider(COARENA_PROVIDER)` inside a try/catch, then when `nextKey` is set fetch models with `{ force: true }`, register the provider, and rebuild `modelList`; when it is `null`, keep only `freePiEntries`. Return `{ ok: true, models: modelList }`.
- Keep `setModel`, `thinking`, `undo`, `redo`, `compact`, `exportHtml`, `bash`, stats and todos unchanged.

- [ ] **Step 4: Re-run the live test**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim(); node scripts/selftest-coarena-live.js
```

Expected: all checks `PASS`, one assistant reply containing `OK`, exit code 0.

- [ ] **Step 5: Check the FreePi path and the no-provider path**

Run: `node scripts/selftest-session.js` with no image.
Expected: an assistant answer; this proves removing the Authorization hook did not break FreePi.

Run the live test with `$env:COARENA_KEY=''` and `resolveFreePiAuth: async () => null` temporarily forced by the test's `--no-providers` flag.
Expected: the clear "No AI provider available" error, no stack trace.

- [ ] **Step 6: Commit**

```bash
git add app/src/freepi-bridge.js app/scripts/selftest-coarena-live.js
git commit -m "feat(bridge): register Coarena beside free-pi and allow either provider"
```

---

### Task 7: Main process and preload wiring

**Files:**
- Modify: `app/src/main.js` (imports `1-11`, `attachTab` `711-782`, `tab:activate` `1148-1166`, `model:set` `1404-1409`, `ads:rotate` `1660-1685`, `settings:get` `1028-1165`)
- Modify: `app/preload.js` (settings block `28-33`)
- Test: `app/scripts/selftest-coarena-ui.js` (created in Task 9; this task only wires the IPC)

**Interfaces:**
- Consumes: Task 3 (`createCoarenaKeyStore`), Task 2 (`readCoarenaKeyInfo`).
- Produces IPC: `coarena:status -> status`, `coarena:setKey { key } -> { ok, status?, error?, unverified?, applied? }`, `coarena:clearKey -> { ok, status, applied }`; `settings:get` gains `coarena: status` where status also has `info` and `infoError`.

- [ ] **Step 1: Wire the key store and session option**

- Import `safeStorage` from `electron` and add `const { createCoarenaKeyStore } = require('./coarena-key'); const { readCoarenaKeyInfo } = require('./coarena');`.
- Create `const coarenaKeys = createCoarenaKeyStore({ dir: DATA_ROOT, safeStorage });` after `DATA_ROOT` exists.
- In `attachTab`, pass `coarenaKey: coarenaKeys.read()` and `resolveFreePiAuth` unchanged (default).

- [ ] **Step 2: Add status and key IPC**

Implement `async function coarenaStatus()` (cache `info` for 60 s):

- `status = coarenaKeys.status()`.
- When `!configured || !readable`, return `{ ...status, info: null }`.
- Otherwise `readCoarenaKeyInfo(coarenaKeys.read())`; return `{ ...status, info: info.ok ? info.info : null, infoError: info.ok ? null : info.error }`.
- `coarena:setKey`: trim, reject empty; call `readCoarenaKeyInfo(raw)`; reject when `!ok && !offline` with `{ ok: false, status, error }`; save, call `applyKeyToTabs(raw)`, return `{ ok: true, status: await coarenaStatus(), unverified: Boolean(offline), applied }`.
- `coarena:clearKey`: `coarenaKeys.clear()`, `applyKeyToTabs(null)`, return status.
- `applyKeyToTabs(key)`: for every tab call `handle.applyCoarenaKey(key)`; when `key` is null and the tab's current model provider is `coarena`, switch to the first FreePi entry in `handle.modelList` (or the first model) with `setModel`, then send `agent:notice` with "Coarena key removed — switched to <provider>/<id>."; always send `agent:history` with `tabState(tabId)`; count successes.
- Add `coarena: status` to the `settings:get` return object using `await coarenaStatus()`.

- [ ] **Step 3: Make ads and model fallback provider-aware**

- Add `function tabIsFreePi(tab) { return /^free-pi/.test(tab?.handle?.session?.model?.provider || ''); }`.
- `ads:rotate`: return `{ ok: false, reason: 'provider' }` when `!tabIsFreePi(tab)`.
- `tab:activate`: when `!tabIsFreePi(tab)`, send `ads:show` with `ad: null`; otherwise keep the current ad logic.
- `model:set`: after `sendTab('model:changed')`, send `ads:show` with `{ ad: tabIsFreePi(tab) ? tab.ad : null }` and `rotateAd()` once when switching to FreePi and no ad is cached.
- `tabState`: include `modelFallback: tab.handle.modelFallback || null`.

- [ ] **Step 4: Expose the IPC in preload**

```js
coarenaStatus: () => ipcRenderer.invoke('coarena:status'),
coarenaSetKey: (key) => ipcRenderer.invoke('coarena:setKey', { key }),
coarenaClearKey: () => ipcRenderer.invoke('coarena:clearKey'),
```

- [ ] **Step 5: Smoke-check the process starts**

Run: `npm start` from `app/`; switch models in the dropdown; close the app.
Expected: the app boots without an uncaught exception, and the session list still loads. (The full UI check is Task 9.)

- [ ] **Step 6: Commit**

```bash
git add app/src/main.js app/preload.js
git commit -m "feat(main): expose Coarena key status and keep ads on free-pi models"
```

---

### Task 8: Renderer UI

**Files:**
- Modify: `app/src/renderer/index.html` (usage block `70-87`, settings dialog `229-272`)
- Modify: `app/src/renderer/app.js` (strings `35-312`, `renderActiveTab` `668-696`, `applyTabState` `766-793`, `openSettings` `1040-1049`, `renderSettings` `1066`, confirm handler `1532-1553`, ad handlers `2573-2645`)
- Modify: `app/src/renderer/styles.css` (usage block near `230`)

**Interfaces:**
- Consumes: `window.freepi.coarenaStatus/coarenaSetKey/coarenaClearKey`, `globalThis.FPProvider`, `state.modelFallback`.
- Produces: UI only.

- [ ] **Step 1: Add the markup**

- Wrap the free-pi-specific usage nodes (`usage-bar-wrap`, the five `usage-row`s, `ctx-bar`) in `<div id="freePiUsage">`.
- After it, add:

```html
<div id="coarenaUsage" hidden>
  <div class="usage-row"><span data-i18n="provider">Provider</span><span class="mono">Coarena</span></div>
  <div class="usage-row"><span data-i18n="coarenaLimits">Limits</span><span id="coarenaMeterText" class="mono">—</span></div>
</div>
```

- In `#settingsOverlay`, before the account group, add a group with `id="coarenaKeyInput"` (`type="password"`, `autocomplete="off"`, placeholder `coa_…`), `id="coarenaSave"`, `id="coarenaRemove"`, `id="coarenaStatus"` (class `settings-hint`), and `id="coarenaGetKey"`.
- CSS: `#freePiUsage { display: contents; } #freePiUsage[hidden] { display: none; }`.

- [ ] **Step 2: Add both language blocks**

Add the keys `provider`, `coarenaSection`, `coarenaKeyLabel`, `coarenaSave`, `coarenaRemove`, `coarenaRemoveTitle`, `coarenaRemoveSub`, `coarenaConfigured`, `coarenaUnreadable`, `coarenaNotConfigured`, `coarenaEncrypted`, `coarenaPlaintext`, `coarenaLimits`, `coarenaGetKey`, `coarenaSaved`, `coarenaUnverified`, `coarenaSaveFailed`, `coarenaRemoved`, `coarenaModelSwitched` to `STRINGS.en` and `STRINGS.th`. Suggested English: `Coarena`, `API key`, `Save`, `Remove`, `Remove the Coarena key?`, `Coarena models disappear from the model list. Running turns keep their current model until they finish.`, `Configured · encrypted`, `This key was saved on another machine and cannot be read here — enter it again.`, `No key yet — Coarena models stay hidden.`, `encrypted`, `stored without encryption`, `Limits`, `Get a key at coarena.ai`, `Coarena key saved.`, `Coarena could not be reached — the key was saved unverified.`, `Could not save the key:`, `Coarena key removed.`, `The saved model is unavailable — switched to`.

- [ ] **Step 3: Render the dropdown and chrome**

- `renderActiveTab`: `opt.textContent = FPProvider.modelOptionLabel(m);`.
- Add `function syncProviderChrome(view)` that reads `FPProvider.providerChrome(view?.model)`, hides `#freePiUsage`/shows `#coarenaUsage` from `showCoarenaMeter`, sets `adSlot.hidden = true` when `!showAds` and the slot has no ad, and calls `paintCoarenaMeter()`.
- Call it at the end of `renderActiveTab` and inside `applyTabState`.
- `api.onModelChanged`: update `view.model`, call `syncProviderChrome(view)`, and when the new provider is FreePi request `api.rotateAd({ tabId: activeTabId, auto: true })`.
- `api.onAd`: ignore ads while the active view's model is not FreePi (`renderAd(null)` is not needed; simply return).
- `applyTabState`: when `state.modelFallback` and the view has not shown it, call `showNotice(t('coarenaModelSwitched') + ' ' + state.modelFallback.to.provider + '/' + state.modelFallback.to.id)` and set a `fallbackNotified` flag on the view.

- [ ] **Step 4: Render and save the key**

- Add `let coarenaStatus = null;`.
- `async function paintCoarenaMeter()`: if `coarenaStatus?.info`, set `#coarenaMeterText` to `FPProvider.coarenaMeterText(coarenaStatus.info)`; otherwise `—`.
- `async function refreshCoarenaStatus()`: `coarenaStatus = await api.coarenaStatus()`, then update `#coarenaStatus` text and the Remove button's disabled state.
- Call `refreshCoarenaStatus()` and `paintCoarenaMeter()` once after boot (next to `loadProfile()`), and from `openSettings` before `renderSettings()`.
- `#coarenaSave` click: read the input, trim, disable the button, call `api.coarenaSetKey(key)`, re-enable; on `ok` clear the input, set `coarenaStatus = res.status`, refresh the settings text and the meter, and `showNotice(res.unverified ? t('coarenaUnverified') : t('coarenaSaved'))`; on failure `showNotice(t('coarenaSaveFailed') + ' ' + (res.error || ''))`.
- `#coarenaRemove` click: `showConfirmDialog({ kind: 'coarenaRemove', title: t('coarenaRemoveTitle'), sub: t('coarenaRemoveSub'), action: t('coarenaRemove') })`; in the confirm handler add a branch before `delete` that calls `api.coarenaClearKey()`, updates `coarenaStatus`, refreshes the UI and shows `t('coarenaRemoved')`.
- `#coarenaGetKey` click: `api.openExternal('https://coarena.ai/developers')`.

- [ ] **Step 5: Check both languages and no hidden regressions**

Run: `node_modules/electron/dist/electron.exe scripts/selftest-ui-render.js`
Expected: "ui render checks passed".

Switch the UI to TH and back; the Coarena group strings change and no English leaks into the Thai dialog.

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/index.html app/src/renderer/app.js app/src/renderer/styles.css
git commit -m "feat(renderer): Coarena settings, model labels and usage meter"
```

---

### Task 9: End-to-end UI verification

**Files:**
- Create: `app/scripts/selftest-coarena-ui.js`
- Modify: `docs/superpowers/specs/2026-11-13-coarena-provider-design.md` (only if a decision changed)

**Interfaces:**
- Consumes: the running app with `--remote-debugging-port=9222`, the key from `COARENA_KEY`.
- Produces: a pass/fail JSON report.

- [ ] **Step 1: Start the app with debugging**

```powershell
cd app
Start-Process -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList ".","--remote-debugging-port=9222","--user-data-dir=$env:TEMP\freepi-coarena-test"
```

- [ ] **Step 2: Write the CDP check**

Adapt the helpers from `selftest-ui.js` and evaluate in the page:

```js
await window.freepi.coarenaSetKey(KEY);           // KEY injected from process.env in the script
const sel = document.getElementById('modelSelect');
const hasCoarena = [...sel.options].some((o) => o.value.startsWith('coarena||'));
await window.freepi.setModel(/* active tabId */, 'coarena', firstCoarenaId);
// after the model:changed event settles:
document.getElementById('adSlot').hidden === true
document.getElementById('coarenaUsage').hidden === false
document.getElementById('freePiUsage').hidden === true
```

Then call `window.freepi.coarenaClearKey()` and assert the Coarena options are gone and a notice was shown.

Print `{ hasCoarena, adHidden, meterShown, freePiHidden, removedOk }` and exit non-zero unless every flag is true.

- [ ] **Step 3: Run the UI check**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim(); node scripts/selftest-coarena-ui.js
```

Expected: every flag true, exit code 0. Stop the Electron process afterwards and delete `$env:TEMP\freepi-coarena-test`.

- [ ] **Step 4: Run the full local suite**

```powershell
node scripts/selftest-provider-plan.js
node scripts/selftest-coarena.js
node scripts/selftest-coarena-key.js
node scripts/selftest-provider-errors.js
node scripts/selftest-provider-ui.js
node scripts/selftest-markdown.js
node_modules\electron\dist\electron.exe scripts\selftest-ui-render.js
```

Expected: all pass.

- [ ] **Step 5: Prove no key leaked**

Run: `git grep -n "coa_"` from the repo root.
Expected: no matches in tracked files (the design doc uses `coa_…` with an ellipsis; a test uses `coa_test_…`; neither is a real key).

- [ ] **Step 6: Commit**

```bash
git add app/scripts/selftest-coarena-ui.js
git commit -m "test(coarena): verify the settings flow through the real window"
```

---

## Self-review notes

- Spec coverage: provider registration (Task 6), key UI (Tasks 3, 7, 8), merged models (Tasks 1, 6, 8), ads and usage (Tasks 5–8), standalone Coarena (Tasks 1, 6), errors (Task 4), verification (Tasks 6, 9).
- The rating UI is deliberately absent (owner declined).
- No task changes the pending retry feature.
