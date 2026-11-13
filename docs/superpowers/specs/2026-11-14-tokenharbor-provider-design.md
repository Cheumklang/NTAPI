# Token Harbor provider — design

**Date:** 2026-11-14
**Status:** implemented (same keyed-provider pattern as Zro and NVIDIA)

## Intent

Add tokenharbor.ai as a fifth provider so the free DeepSeek V4.1 Flash route can be
used without a card. The user supplied a `thk_live_…` key and will test it.

## What the API is

- Base URL `https://tokenharbor.ai/v1`, OpenAI-compatible chat completions.
- Free route id: `deepseek-v4.1-flash:free` — $0.00, 1,048,576 context,
  128,000 max output, text + image.
- Free allowance is value-based on a rolling 7-day window (size not published),
  60 requests/minute and 1,800/hour per account.
- Two prerequisites live in the dashboard, not in the API: the account email must
  be verified, and free models must be switched on explicitly.

## Approach

Static candidate list intersected with `GET /v1/models`, exactly as NVIDIA. A
free route that rotates out disappears from the dropdown; an account that has not
enabled free models resolves to an empty catalog and the provider stays hidden.

## Design

- `src/tokenharbor.js`: provider id `tokenharbor`, label `Token Harbor`,
  `deepseek-v4.1-flash:free` as the only candidate, vision on, zero costs.
- `planProviders` gains `tokenharborKey` / `tokenharborModels`; priority last.
- Bridge: `createFreePiSession({ ..., tokenharborKey })`,
  `applyTokenHarborKey(…)`, entries merged after NVIDIA's.
- Main: `tokenharbor.json` key store, IPC `tokenharbor:status/setKey/clearKey`,
  `settings:get` carries it, key pushed into every open tab.
- UI: Settings group with a link to the dashboard; meter label `Free tier`,
  text `weekly allowance · DeepSeek V4.1 Flash`; no ads.
- Errors: 401 bad key, 403 with `email_verification_required` or disabled free
  models, 402 allowance used up, 429 rate limit, 413 body too large.

## Tests

`selftest-tokenharbor.js` (config, catalog intersection, key check),
plan/UI/error cases, `selftest-tokenharbor-live.js`, `selftest-tokenharbor-ui.js`.
