# NVIDIA NIM provider — design

**Date:** 2026-11-13
**Status:** awaiting approval

## Intent

The user wants one more free DeepSeek lane beside FreePi, Coarena and Zro, because
NVIDIA's free tier allows far more requests. They already have an NVIDIA API key
and will test it themselves once the provider ships.

Scope they chose: **DeepSeek V4 Flash only**; NVIDIA trial terms (no production
use, prompts may be used to improve models) are acceptable.

## What the API actually is

- Base URL `https://integrate.api.nvidia.com/v1`, OpenAI chat completions.
- Model ids seen in the catalog: `deepseek-ai/deepseek-v4.1-flash`,
  `deepseek-ai/deepseek-v4-flash-0731`, `deepseek-ai/deepseek-v4-flash`,
  `deepseek-ai/deepseek-v4-pro`.
- 1,048,576-token context; `max_tokens` capped at **16,384** per request
  (not 64K); `reasoning_effort` = `none | high | max`.
- Text in, text out. No vision on this endpoint, so image questions need another
  provider.
- Free tier: ~40 requests/minute, 10,000 requests/day, no card. Shared capacity;
  NVIDIA can return 429 below the published rate and sends no `Retry-After`.
- Free endpoints are retired without much notice (v4-flash's is already marked
  "Deprecated" on some pages), so the catalog cannot be trusted forever.

## Goals

- `nvidia` appears in the model dropdown as `NVIDIA · DeepSeek V4 Flash`.
- One key per machine, encrypted with safeStorage, never in the renderer or
  in `prefs.json`.
- A wrong key is rejected before saving; offline saves it as unverified.
- A retired model id produces a readable error and can be dropped without a
  restart.
- The meter shows the free-tier shape (40/min · 10,000/day) instead of a usage
  number NVIDIA does not publish.

## Non-goals

- V4 Pro, GLM, Nemotron or any other NVIDIA-hosted model.
- Vision: NVIDIA's endpoint is text-only.
- A paid NVIDIA plan; the trial terms stay as they are.

## Approaches

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Static DeepSeek catalog, intersected with `/v1/models` when a key is present | **Chosen.** Same shape as Zro, and a retired id disappears instead of failing a turn. |
| 2 | Fetch the whole NVIDIA catalog dynamically | Rejected: exposes ~100 models, most of them unrelated, and the list churns. |
| 3 | Hard-code one id with no verification | Rejected: free endpoints get retired, which would brick the provider with no in-app fix. |

## Design

### `src/nvidia.js`

- `NVIDIA_PROVIDER = 'nvidia'`, `NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'`
- `NVIDIA_MODEL_CANDIDATES` — the DeepSeek Flash ids above, in preference order,
  each with `name: 'DeepSeek V4 Flash'`, `contextWindow: 1048576`,
  `maxTokens: 16384`, `vision: false`.
- `nvidiaProviderConfig({ apiKey, models })` → OpenAI-completions provider,
  `input: ['text']`, `reasoning: true`, zero cost fields,
  `compat: { supportsDeveloperRole: false }`.
- `nvidiaModelEntries(models)` → `[{ provider, id, name }]`.
- `checkNvidiaKey(key, { fetchImpl })` → `GET /v1/models`; returns
  `{ ok, offline? }` plus the ids that exist, so the caller can intersect.
  Never echoes the key.

### Catalog resolution

`resolveNvidiaModels(key)` calls `checkNvidiaKey`, keeps the candidate ids that
the live list contains, and falls back to the first candidate when the call is
offline. No key, no catalog, no provider.

### Plan, bridge, main

- `planProviders` gains `nvidiaKey` / `nvidiaModels` and an `nvidia` boolean;
  default priority FreePi → Coarena → Zro → NVIDIA.
- Bridge: `createFreePiSession({ ..., nvidiaKey })`, register when planned,
  merge entries after Zro's, `applyNvidiaKey(nextKey)` mirrors `applyZroKey`
  but re-runs the catalog intersection on a new key.
- `main.js`: `nvidiaKeys` store on `nvidia.json`, IPC
  `nvidia:status/setKey/clearKey`, `nvidia` in `settings:get`, key pushed into
  every open tab. Removing the key moves a tab on an NVIDIA model to a provider
  that is left, with a notice.

### UI

- Settings group `NVIDIA` with key input, Save, Remove, status line and a link
  to `https://build.nvidia.com/settings/api-keys`, in `en` and `th`.
- Meter: label `Free tier`, text `40/min · 10,000/day`; provider name `NVIDIA`.
- `providerChrome` returns `{ showAds: false, meter: 'nvidia' }`.

### Errors

`provider === 'nvidia'`: 401 → replace the key in Settings; 402/403 → trial
access ended; 429 → shared capacity, retry in a moment; 404 → the model was
retired, pick another model. Network failure names NVIDIA.

## Tests

- `selftest-nvidia.js`: config shape, text-only input, 16K output, catalog
  intersection (present / absent / offline), key check 200/401/offline/blank.
- `selftest-provider-plan.js`: NVIDIA-only, beside Zro, priority order.
- `selftest-provider-ui.js`: label and meter.
- `selftest-provider-errors.js`: the four NVIDIA hints.
- `selftest-nvidia-live.js`: real completion with `$env:NVIDIA_KEY`.
- `selftest-nvidia-ui.js` (CDP): save key → dropdown → switch → meter → remove.

## What is left to the builder

- Whether the meter copy should name the key alias; NVIDIA publishes none.
- Whether a retired model should auto-switch to the next candidate instead of
  only explaining the 404.
