# Image viewing — design

**Date:** 2026-11-13
**Status:** approved

## Intent

The app treats every model as text-only, so it can neither show the user the
images the agent produces nor let the agent inspect its own output.

Two failures, one cause:

1. `look_at_image` always posts to FreePi's `/tools/vision`. On a Coarena turn
   that call carries a FreePi JWT and dies with `429 hourly_ceiling`, so the
   agent cannot check the PNG it just rendered.
2. The transcript only renders images the **user** attached (data URIs). A file
   the agent writes is just a path inside a tool card.

## Goals

- A model that accepts images (`input: ["text","image"]`) receives the actual
  image when it reads or looks at one.
- `look_at_image` works without FreePi when the active model is a Coarena vision
  model; when nothing can see images, it says so instead of showing a 429 wall.
- The user sees a thumbnail of any image the conversation refers to, and can
  click it to open the file in the OS viewer.

## Non-goals

- An image gallery, zoom UI, or editing.
- Rendering video or PDF previews.
- Sending images to providers that do not declare vision support.

## Constraints

- pi's built-in `read` returns an image block for image files, and models
  declared with `input: ["text","image"]` see it. Images are resized by pi
  (`inputLimits.images.resize`, ~2000 px / 4.5 MiB by default).
- Tool results accept `(TextContent | ImageContent)[]`; extension tools get
  `ctx.getModel()` so they can branch on the active model.
- The live Coarena catalog reports `capabilities.vision: true` for all 18
  models, including `deepseek-v4-1-flash-1017`.
- CSP is `img-src 'self' data:`, so previews must arrive as data URIs from main.
- Preview paths must resolve inside the tab's workspace; the renderer never
  reads arbitrary disk paths.
- A missing file, an oversized file, or a non-image extension is ignored, not an
  error toast.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Declare Coarena vision models image-capable, let `read` feed images; make `look_at_image` return the image block when the model can see, else keep FreePi | **Chosen.** No extra API calls, uses the model the user already picked. |
| 2 | Add a second Coarena vision model just for `look_at_image` | Rejected: extra cost and a second model's opinion for no benefit. |
| 3 | Render previews by opening files with `file://` URLs | Rejected: blocked by CSP and leaks absolute paths into the DOM. |
| 4 | Preview via an IPC data-URI read, path-validated in main | **Chosen.** Works under the existing CSP and keeps the disk boundary in main. |

## Design

### Provider capability

- `src/coarena.js` normalises `vision: Boolean(raw.capabilities?.vision)` into
  each catalog model; `FALLBACK_MODELS` default to `vision: true`.
- `coarenaProviderConfig` emits `input: ['text','image']` when `vision` is true,
  `['text']` otherwise.
- No change for FreePi: its models stay text-only, and FreePi sessions keep the
  backend vision tool.

### `look_at_image`

Inside `execute(_id, params, _signal, _onUpdate, ctx)`:

1. Resolve and read the file exactly as today (must stay inside `cwd`).
2. If `ctx.getModel()?.input?.includes('image')` → return
   `{ content: [{ type: 'image', data: base64, mimeType }, { type: 'text', text: 'Image attached. Answer this yourself: <question>' }] }`.
3. Else if FreePi auth exists → current `/tools/vision` call, unchanged.
4. Else → text result: “This model cannot see images. Switch to a Coarena model
   that supports vision, or connect FreePi.”

The tool description is rewritten so the model knows the image may arrive
directly.

### Preview IPC

- `fs:readImage { cwd, path } -> { ok, dataUri, mimeType, path } | { ok: false }`
  - Resolves `path` against `cwd`; rejects anything outside it.
  - Extension whitelist: png, jpg, jpeg, webp, gif.
  - Size cap 8 MiB before base64.
- `fs:openPath { cwd, path }` → `shell.openPath`, same validation.
- Preload gains `readImage(cwd, path)` and `openPath(cwd, path)`.

### `extractImagePaths(text)`

Pure helper in `src/renderer/provider-ui.js`:
- Finds absolute Windows/POSIX paths and relative paths ending in an image
  extension, stopping at whitespace, quotes, brackets and trailing punctuation.
- Skips `http(s)://` URLs and data URIs.
- Dedupes, preserves order.

### Transcript previews

- `appendImagePreviews(container, text, cwd)` in `app.js`: extract up to 3 paths,
  call `api.readImage(cwd, p)` for each, append `<figure class="msg-images">`
  with `<img>` and a caption of the relative path. Click → `api.openPath`.
- Called for assistant text bubbles and tool result cards after their text is
  rendered, and skipped when the message already shows user attachments.
- CSS: `max-width: 260px; max-height: 180px; object-fit: cover;` with a subtle
  border and a pointer cursor; `[hidden]` not needed (the figure is only added
  when an image resolves).

## Tests

- `selftest-provider-ui.js`: `extractImagePaths` cases — absolute path, quoted
  path, relative path, URL ignored, data URI ignored, non-image ignored,
  trailing comma/period stripped, dedupe.
- `selftest-coarena.js`: catalog maps `vision`, provider config emits
  `['text','image']` for vision models and `['text']` otherwise.
- `selftest-image-live.js` (Coarena key): write a small PNG, assert
  `handle.session.model.input` includes `image`, prompt `read` on the file and
  assert a normal reply with no `look_at_image` error.
- `selftest-image-ui.js` (CDP): call `appendImagePreviews` with
  `shots/ui-render.png` against the app cwd and assert an `<img>` with a data
  URI appears and the IPC returns `ok`.

## What is left to the builder

- Exact thumbnail size and whether the caption shows the full relative path.
- The size cap (8 MiB) and preview count (3) if they prove wrong in use.
- Whether tool cards should preview images before their text has finished
  streaming (default: after).
