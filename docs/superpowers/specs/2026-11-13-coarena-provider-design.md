# Coarena as a second provider

Date: 2026-11-13
Status: awaiting approval
Owner: app user (Chanathip)

## Intent

The app currently speaks to one backend: FreePi.AI. The user also has a
Coarena account and wants to use the free models behind
`https://coarena.ai/api/v1` from the same window, with the same session,
without learning a new tool. Both providers must actually work: sending a
message must produce a streamed reply, tool calls must run, and switching
providers must be a dropdown change, not a restart.

The user also decided that Coarena should stand on its own: if FreePi
auth is unavailable, a configured Coarena key is still enough to open a
session and chat.

## What exists today

- `app/src/freepi-bridge.js` registers the `free-pi` provider (and
  `free-pi-defense`) with `baseUrl`, `apiKey` (the FreePi JWT),
  `api: 'openai-completions'`, and a models array built from FreePi's
  `/client-version` catalog.
- A global `before_provider_headers` hook overwrites `Authorization` with
  the FreePi JWT for **every** provider. The extension event carries only
  `headers`, not the provider, so today a second provider cannot keep its
  own key.
- `openai-completions` in the pi SDK already turns a provider's `apiKey`
  into `Authorization: Bearer …` (pi-ai `openai-completions.js:35-40`,
  `:543`), so the global hook is redundant for auth.
- Ads (free-pi only) are driven per user turn by the
  `freepi-desktop-ads` extension; the ad is fetched in `before_agent_start`
  and the turn id is attached in `before_provider_headers`.
- `modelList` is `[{provider, id, name}]`, the dropdown renders `name`
  only, and `setModel(provider, id)` already accepts any registered
  provider/model pair.
- The Settings dialog (`#settingsOverlay`) has groups for output folders,
  ads, account and system paths; `settings:get` supplies the data.
- Preferences live in `<DATA_ROOT>/prefs.json`; the renderer can only set
  an allowlist of keys through `prefs:set`.
- `createFreePiSession` hard-fails at `resolveAuth()` when no FreePi
  credentials exist (`freepi-bridge.js:492-493`), so today Coarena could
  never be used without FreePi.
- The pi SDK exposes `registerProvider` and `unregisterProvider` with
  immediate effect after load (`types.d.ts:1358-1373`).

## Coarena facts verified against the live API

- Models: `GET https://coarena.ai/api/v1/models` (public, no key) returns
  18 models, all `tools: true`, `reasoning_text: true`,
  `context_length: 128000`, `max_tokens: 16384`, zero list price.
- Chat: `POST /api/v1/chat/completions` streams SSE, emits
  `reasoning_content`, and returns proper `tool_calls` chunks.
- Key check: `GET https://coarena.ai/api/v1/key` returns key metadata for
  a valid key and `401 invalid_api_key` otherwise. It reports
  `requests_per_minute_key/account/model = 30`, `concurrency = 2`,
  `usd_per_day = 5`, `max_output_tokens = 16384`, plus
  `usage_today.requests` / `cost_usd`. This is a better validator than
  `/models`, which is public and cannot reject a bad key.
- Feedback: `POST /api/v1/feedback` takes
  `{ request_id, rating: "up"|"down"|null }`; `request_id` is the
  assistant message id (`responseId` in pi-ai). The owner declined a
  rating UI, so nothing here uses it.

## Goals

1. Register Coarena as a second provider (`coarena`) in every session.
2. Let the user store, replace and remove a Coarena API key from Settings,
   and apply the change to open tabs without a restart.
3. Show Coarena models in the same model dropdown as FreePi models, with a
   visible provider label, and allow switching between them mid-session.
4. Keep the two auth schemes separate: FreePi keeps its JWT, Coarena uses
   the user's `coa_…` key.
5. Make ads and the free-pi usage panel follow the active model's
   provider instead of always assuming FreePi.
6. Let a session open with only Coarena when FreePi auth is unavailable.
7. Surface Coarena-specific errors (bad key, rate limit) in Thai and
   English.

## Non-goals

- A Coarena "rate this reply" UI (feedback endpoint). The owner declined
  it on 2026-11-13.
- Coarena vision input. Its models advertise `vision: true`, but the app
  writes attachments to disk and lets the agent read them; keep
  `input: ['text']` for parity and revisit later.
- Coarena billing or spend management. The status panel may show the
  endpoint's own usage numbers, nothing more.
- Migrating the app off FreePi or renaming the product.

## Anti-goals

- The Coarena key must never be committed, logged, or written to
  `prefs.json` in cleartext.
- Adding Coarena must not break FreePi: a user with no Coarena key must
  see exactly today's app.
- No provider-aware hacks based on URL sniffing inside the HTTP layer.

## Approaches considered

**A. Dual provider (chosen).** Register both providers in one pi session;
merge their model lists; gate auth and ads per provider. Trade-off: more
touch points (bridge, main, preload, renderer, settings), but switching is
instant and the conversation survives.

**B. Engine switch.** Pick one provider in Settings, recreate the session.
Trade-off: much less code, but you cannot move an existing conversation to
the other provider without starting over.

**C. Config-only.** Write Coarena into pi's `models.json`. Trade-off:
fastest, but no key UI or safe storage, ads/usage still assume FreePi, and
the user edits JSON by hand.

A wins because the request is "use both in this app", not "replace one".

## Design

### 1. Provider registration

Add a provider config builder next to `buildProviderConfig`:

```
coarenaProviderConfig({ apiKey, models }) => {
  name: 'coarena',
  baseUrl: 'https://coarena.ai/api/v1',
  apiKey,
  api: 'openai-completions',
  compat: { supportsDeveloperRole: false },
  models: models.map(m => ({
    id: m.id,
    name: m.display_name || m.id,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.context_length || 128000,
    maxTokens: m.max_tokens || 16384,
  })),
}
```

`supportsDeveloperRole: false` matches the existing FreePi config and is
the safer choice for an OpenAI-compatible proxy; verification includes a
system-prompt turn. Registered in `providerExtension.factory` only when a
key is configured.

Model catalog: `GET /api/v1/models`, cached in memory for 10 minutes; on
failure fall back to five ids that exist in the live catalog:
`claude-fable-5`, `deepseek-v4-1-flash-1017`, `gemini-4-argon`,
`kimi-k3-1-pro`, `grok-4-7`.

### 2. Session bootstrap with either provider

`createFreePiSession` becomes provider-optional:

1. Try `resolveAuth()`; on failure set `auth = null` and log it instead of
   throwing.
2. If `auth` exists, fetch the FreePi catalog and build `free-pi` /
   `free-pi-defense` registrations plus the ads client.
3. If a Coarena key is readable, fetch its catalog and register
   `coarena`.
4. If neither provider is available, throw one clear error naming both
   (Settings for Coarena, sign-in for FreePi).
5. Default model: FreePi's preferred model when available, otherwise the
   first Coarena model. `settingsManager.defaultProvider` /
   `defaultModel` follow the same rule.
6. FreePi-only tools (`web_search`, `docs_lookup`, `generate_image`,
   `free_pi_usage`, `look_at_image`) and the ads extension are only
   registered when `auth` exists. Local tools, approvals, todos, MCP,
   codemode and tool search are unchanged.
7. `free_pi_usage` is not registered in a Coarena-only session, so the
   model is never told about a tool that cannot run.
8. Handle methods that need FreePi (`rotateAd`, backend-backed tools)
   become no-ops or are guarded when `auth` is null.

Consequence: in a Coarena-only session, image attachments written by the
composer cannot be inspected because `look_at_image` is absent. The
composer still attaches them; the reply may say it cannot see the image.
This is acceptable for the standalone fallback and is reported in the
session notice.

### 3. Auth: remove the global override

Delete the unconditional
`event.headers.Authorization = 'Bearer <free-pi JWT>'` hook. Per-provider
`apiKey` is the single source of auth. Verify with a live FreePi turn
before shipping; if the SDK does not apply it, set the header only when
`ctx.getModel()?.provider` is a free-pi provider — never for `coarena`.

The ad extension keeps `x-turn-id`, but only for FreePi providers:

```
const provider = ctx.getModel()?.provider;
if (provider === 'free-pi' || provider === 'free-pi-defense') {
  event.headers['x-turn-id'] = turnId;
}
```

### 4. Key storage

New module `app/src/coarena-key.js`:

- File: `<DATA_ROOT>/coarena.json`, mode `0600` where the OS honours it.
- Shape: `{ v: 1, encrypted: true, key: '<base64>' }`, or
  `{ v: 1, encrypted: false, key: '<plain>' }` when Electron's
  `safeStorage.isEncryptionAvailable()` is false. The second form is a
  documented fallback; the UI warns when it is in use.
- API: `readKey()`, `saveKey(raw)`, `clearKey()`, `status()`.
  `status()` returns `{ configured, readable, encrypted, hint }` where
  `hint` is the last four characters, never the key.
- A key copied from another Windows machine cannot be decrypted by DPAPI:
  `status()` reports `configured: true, readable: false`, the Settings
  group asks the user to enter it again, and saving overwrites the file.
  The file is never deleted silently.
- Validation on save: `GET /api/v1/key` with the candidate key. `401`
  rejects the save with a readable message. If Coarena is unreachable,
  store the key anyway and mark it "unverified — could not reach
  Coarena"; the first chat reveals a bad key.
- Key metadata (limits and `usage_today`) is fetched with the same call
  and cached for the Settings panel; failures fall back to "limits
  unavailable".
- IPC: `coarena:status`, `coarena:setKey`, `coarena:clearKey` in
  `main.js`, exposed through `preload.js`. The renderer never receives the
  raw key.
- Saving or removing a key calls a new per-tab
  `applyCoarenaKey(keyOrNull)` on every open session, which calls
  `unregisterProvider('coarena')` then re-registers with the new key, and
  refreshes `modelList`. Main pushes the updated state to the renderer
  (existing `tab:state` payload). If the current model belonged to
  Coarena and the key is removed, the tab switches to the default FreePi
  model and shows a notice; if FreePi is also unavailable, the tab shows
  the error and leaves the composer disabled until a provider exists.

The key passed in the original request is treated as leaked: rotate it at
Coarena before daily use. The repo must contain no literal `coa_…` string;
this document deliberately does not include one.

### 5. Models, dropdown and switching

`modelList` gains the Coarena entries after the free-pi ones:

```
{ provider: 'coarena', id, name }
```

The dropdown label becomes `providerLabel(m.provider) + ' · ' + m.name`,
where `providerLabel` is `FreePi` / `Coarena` (`free-pi-defense` keeps
`FreePi`). Existing `value = provider + '||' + id` and the change handler
are unchanged; `setModel` already resolves pairs from
`modelRuntime.getAvailable()`.

When a Coarena model is selected, the app:
- hides the ad slot and stops the auto-rotate timer;
- replaces the free-pi usage rows with a compact Coarena line
  (`free tier · N requests today · M/min limit`) when metadata is
  available;
- keeps the same composer, tools and approval flow. FreePi-backed tools
  remain available when FreePi auth exists; they are simply not part of
  Coarena's own quota.

Switching back restores the ad behaviour and usage panel.

On tab resume, if the saved model's provider is unavailable (key removed
or FreePi signed out), the app switches to an available default and shows
a notice naming the old and new model. No silent fallback.

### 6. Ads

`createAdsClient` remains FreePi-only:

- `before_agent_start`: return early when the active provider is not a
  free-pi provider.
- `prefetchLaunchAd` at session start: only when the default model
  belongs to free-pi.
- Renderer: `adSlot.hidden = activeProvider !== free-pi` and the existing
  auto-rotate loop skips while hidden.

No Coarena request ever carries `x-turn-id`.

### 7. Settings UI

New group in `#settingsOverlay`, above "Your account":

```
Coarena
[ password input: coa_…            ] [Save]
Configured — encrypted · key ending 961bc   [Remove]
30 requests/min · 2 concurrent · N used today
[Get a key at coarena.ai]
```

- `settings:get` gains `coarena: { configured, readable, encrypted,
  hint, limits }`.
- Save disables the button while validating, then shows success or the
  API error.
- Remove asks for confirmation using the existing confirm dialog, then
  refreshes open tabs through `applyCoarenaKey(null)`.
- All strings are added to both `EN` and `TH` dictionaries in `app.js`.
- When no key is configured the group explains that Coarena models stay
  hidden until a key is saved.

### 8. Errors

Extend `app/src/provider-errors.js`:

- Coarena `401` / `invalid_api_key`: "Coarena API key is invalid or
  revoked — update it in Settings."
- `429` / `rate_limit`: "Coarena allows 30 requests per minute. Wait a
  moment and try again." The pi SDK retries 429s up to three times by
  default; keep that (it is the SDK's normal behaviour and mirrors
  FreePi), and show this message only when the retries are exhausted.
- Network failure to `coarena.ai`: name the provider in the message so it
  is not confused with FreePi being down.

## Decisions made (builder check outcomes)

- Key changes apply immediately to open tabs via
  `registerProvider`/`unregisterProvider`.
- A session works with either provider; FreePi-only features are absent
  in a Coarena-only session.
- FreePi-backed tools stay available during Coarena turns when FreePi
  auth exists, because image attachments depend on `look_at_image`.
- Save-time validation uses `/api/v1/key`, not `/models`.
- SDK 429 retries are accepted; no session-wide retry override.
- Undecryptable keys are reported, not deleted or treated as absent.
- Reasoning stays opt-in; `reasoning: true` only means deltas render when
  the model sends them.
- Fallback catalog uses ids verified in the live list.
- No rating UI in this change.

## Verification

1. `npm start` with no Coarena key: dropdown identical to today, ads and
   usage behave as before.
2. Save a valid key in Settings: status shows "encrypted" and the limits,
   and the model dropdown updates in the already-open tab.
3. Send a prompt on `coarena/deepseek-v4-1-flash-1017`: streamed reply,
   reasoning block, a tool call executes, ad slot stays hidden.
4. Switch to a FreePi model in the same session: reply works and the ad
   returns for the next turn.
5. Remove the key while a tab is on a Coarena model: it switches to the
   FreePi default with a notice.
6. Restart the app: key status persists; the raw key is never shown.
7. Save a bogus key: save is rejected by `/api/v1/key`.
8. Simulate FreePi auth failure (bad credentials file, offline): the app
   still opens a Coarena session and chats, with FreePi tools absent.
9. `git grep -n "coa_"` returns nothing outside this document's wording.
10. `scripts/selftest-ui-render.js` still passes; settings dialog opens in
    both languages.
