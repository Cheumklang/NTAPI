# Zro provider — design

**Date:** 2026-11-13
**Status:** approved

## Intent

Add https://zro.moonmath.ai as a third provider beside FreePi and Coarena, with
only its DeepSeek model exposed. The account is on Zro's Free tier, and the user
does not want paid-only models in the picker.

## What the API actually is

- Base URL `https://zro.moonmath.ai/v1`, OpenAI-compatible chat completions.
- `GET /v1/models` returns aliases only: `deepseek-v4.1-flash`,
  `zro/deepseek-v4.1-flash`, `deepseek-v4-flash-0731`, `zro/deepseek-v4-flash-0731`.
- `deepseek-v4.1-flash`: 1M context, 64K max output, text + image, reasoning
  levels `none|low|high|max` (default high). Responses carry `reasoning_content`.
- A live completion with the new `freepi-desktop` key returned `OK`.
- Free tier rule: only the newest key on the account runs; older keys pause.
- No documented limits or usage endpoint, so there is no Zro usage meter.

## Goals

- `zro` appears in the model dropdown as `Zro · DeepSeek V4.1 Flash`.
- One stored key per machine, encrypted with safeStorage, never shown to the
  renderer or written to `prefs.json`.
- The key can be added, replaced and removed from Settings while tabs are open.
- A wrong key is rejected before saving; an offline check saves it as unverified.
- Errors explain themselves: bad key, out of credit, rate limit.
- Images work: the model declares image input, so `read` and `look_at_image`
  already behave correctly.

## Non-goals

- Paid Zro models (GLM, Dolly, Abyss) or the `auto` router.
- A second usage meter; Zro has no limits endpoint.
- A plugin system for arbitrary providers (deferred until a third keyed provider
  is actually needed).

## Constraints

- Provider id `zro`; label `Zro`; base URL exactly `https://zro.moonmath.ai/v1`.
- The model catalog is static: one entry, `deepseek-v4.1-flash`.
- The key never enters git, a log line, an error string, or the renderer.
- Existing FreePi and Coarena behaviour must not change.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Third explicit provider, mirroring Coarena, with a shared key-store module | **Chosen.** Smallest change that keeps shipped code stable. |
| 2 | Generic keyed-provider descriptor driving IPC, bridge and Settings in a loop | Deferred: a real refactor of working Coarena code; do it when a third keyed provider arrives. |
| 3 | Reuse Coarena's key file for Zro | Rejected: one bad key would break both providers and rotation would blur. |

## Design

### Key store

`src/coarena-key.js` becomes `src/provider-key.js`:
`createProviderKeyStore({ dir, safeStorage, fileName })`. Same behaviour, same
`{ path, status, read, save, clear }`. Coarena uses `coarena.json`; Zro uses
`zro.json`. The existing test becomes `selftest-provider-key.js` and runs its
cases for both file names.

### Zro client

`src/zro.js`:
- `ZRO_PROVIDER = 'zro'`, `ZRO_BASE_URL = 'https://zro.moonmath.ai/v1'`
- `ZRO_MODELS = [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', contextWindow: 1000000, maxTokens: 65536, vision: true }]`
- `zroProviderConfig({ apiKey })` → `{ name: 'Zro', baseUrl, api: 'openai-completions', apiKey, models: [...] }` with `input: ['text','image']`, `reasoning: true`, `compat.supportsDeveloperRole: false`, zero cost fields.
- `zroModelEntries()` → `[{ provider: 'zro', id, name }]`
- `checkZroKey(key, { fetchImpl })` → `GET /v1/models`; `{ ok, offline? }`; 401 → invalid key; anything else non-2xx → HTTP error. Never echoes the key.

### Provider plan

`planProviders` gains `zroKey` / `zroModels` and a `zro` boolean. Registration
needs a key **and** a non-empty catalog. Default priority stays
FreePi → Coarena → Zro.

### Bridge

- `createFreePiSession({ ..., zroKey = null })`.
- Register `zro` when planned; `modelList` merges its entries after Coarena's.
- `applyZroKey(nextKey)` mirrors `applyCoarenaKey`: unregister, refetch nothing
  (catalog is static), register, rebuild `modelList`.
- No ads and no FreePi-tool changes; the turn header already only goes to FreePi.

### Main, preload, renderer

- IPC `zro:status`, `zro:setKey`, `zro:clearKey`; `settings:get` gains `zro`.
- Validation is `checkZroKey`; offline saves unverified, `applied` counts tabs.
- Preload: `zroStatus/zroSetKey/zroClearKey`.
- Settings gets a Zro group with the same shape as Coarena's key group.
- `providerChrome` returns `{ showAds, meter }` where meter is
  `'coarena' | 'zro' | null`; the meter block is renamed `providerUsage` with a
  dynamic provider name. Coarena shows limits, Zro shows `DeepSeek V4.1 Flash`.
- Error hints: `provider === 'zro'` — 401 names Settings, 402/insufficient
  balance says the Zro balance is empty, 429 says rate limited.

## Tests

- `selftest-provider-key.js`: both file names, corrupt, undecryptable, plaintext,
  clear, blank key.
- `selftest-zro.js`: config shape, single model, image input, key check 200/401/offline.
- `selftest-provider-plan.js`: Zro-only, Zro beside Coarena, default priority.
- `selftest-provider-ui.js`: Zro label and meter shape.
- `selftest-zro-live.js`: one real completion with `$env:ZRO_KEY`.
- `selftest-zro-ui.js` (CDP): save key, dropdown shows `Zro · DeepSeek V4.1 Flash`,
  meter shows the model, remove key restores the previous state.

## What is left to the builder

- Exact meter copy for Zro and whether to show the key alias.
- Whether Zro should be the default when it is the only keyed provider.
- Error copy for an empty balance until a real 402 is seen.
