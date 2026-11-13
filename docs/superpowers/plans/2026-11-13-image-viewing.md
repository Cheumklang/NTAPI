# Image Viewing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let vision-capable models see images through their own provider, and let the user see any image the conversation mentions as a thumbnail.

**Architecture:** The Coarena catalog exposes per-model `vision`; provider config declares `input: ['text','image']` accordingly, so pi's built-in `read` passes images. `look_at_image` returns an image block when the active model can see, else falls back to FreePi. Main exposes a path-validated `fs:readImage` data-URI IPC; the renderer extracts image paths from message text and paints thumbnails.

**Tech Stack:** Electron 38 main/preload/renderer (no bundler), Node 20 test scripts, pi coding agent SDK 1.2.

**Spec:** `docs/superpowers/specs/2026-11-13-image-viewing-design.md`

## Global Constraints

- Work from `app/` unless a path says otherwise; run tests with `node scripts/<name>.js`.
- No new npm dependencies. Node built-ins and Electron only.
- Preview paths must resolve inside the tab's workspace; never read arbitrary disk paths in the renderer.
- CSP is `img-src 'self' data:` — previews must be data URIs.
- FreePi models stay text-only.
- UI strings go in both `en` and `th` dictionaries when copy is added.
- Commit messages use conventional commits, one commit per task.

## Review Focus

- A relative path like `shots/a.png` and an absolute `C:\x\a.png` both preview.
- A path outside the workspace, a missing file, a 20 MB file, or a `.svg` must be ignored silently.
- Two messages referencing the same image must not break the second preview.
- `look_at_image` on a Coarena-only session with a non-vision model must explain itself, not throw.
- A FreePi session's `look_at_image` must keep using the backend endpoint unchanged.

---

### Task 1: Coarena vision capability

**Files:**
- Modify: `app/src/coarena.js`
- Modify: `app/scripts/selftest-coarena.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `normalizeModel` output gains `vision: boolean`; `coarenaProviderConfig` model entries use `input: ['text','image']` when `vision`, else `['text']`.

- [x] **Step 1: Add failing checks** to `selftest-coarena.js`

```js
const visionPayload = { data: [
  { id: 'v1', display_name: 'Vision One', context_length: 128000, max_tokens: 8192, capabilities: { vision: true } },
  { id: 't1', display_name: 'Text One', context_length: 128000, max_tokens: 8192, capabilities: { vision: false } },
] };
resetCoarenaModelCache();
const vres = await fetchCoarenaModels({ fetchImpl: fake(200, visionPayload), force: true });
check('vision flag is kept', vres.models[0].vision === true && vres.models[1].vision === false);
const vcfg = coarenaProviderConfig({ apiKey: KEY, models: vres.models });
check('vision model accepts images', vcfg.models[0].input.join(',') === 'text,image');
check('text-only model refuses images', vcfg.models[1].input.join(',') === 'text');
```

- [x] **Step 2: Run it to see the checks fail**

Run: `node scripts/selftest-coarena.js`
Expected: FAIL — `vision` undefined and `input` is `text`.

- [x] **Step 3: Implement**

In `normalizeModel`: `vision: Boolean(raw?.capabilities?.vision)`. In `fallbackCatalog`: `vision: true` for every entry (the verified ids are all vision models). In `coarenaProviderConfig`: `input: m.vision === false ? ['text'] : ['text', 'image']`.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-coarena.js`
Expected: all checks pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/coarena.js app/scripts/selftest-coarena.js
git commit -m "feat(coarena): declare vision on models that accept images"
```

---

### Task 2: Provider-aware `look_at_image`

**Files:**
- Modify: `app/src/freepi-bridge.js` (`visionExtension`, around line 865)
- Create: `app/scripts/selftest-image-live.js`

**Interfaces:**
- Consumes: `ctx.getModel()` from the SDK tool context; `auth` and `baseUrl` already in scope.
- Produces: tool result `{ content: [{ type: 'image', data, mimeType }, { type: 'text', text }] }` when the active model accepts images; unchanged FreePi behaviour otherwise.

- [x] **Step 1: Write the failing live test**

`selftest-image-live.js` mirrors `selftest-coarena-live.js` (SDK resolver, temp dirs, `resolveFreePiAuth: async () => null`). It writes a 1×1 red PNG from the base64 constant `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==` to `<workspace>/red.png`, creates the session with the Coarena key, then:

```js
check('model declares image input', handle.session.model?.input?.includes('image'));
let answer = ''; let tools = []; let errors = [];
handle.session.subscribe((e) => {
  if (e.type === 'tool_execution_start') tools.push(e.toolName);
  if (e.type === 'message_end' && e.message?.role === 'assistant') {
    if (e.message.stopReason === 'error') errors.push(e.message.errorMessage);
    else answer = (e.message.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  }
});
await handle.session.prompt('Call look_at_image on red.png with the question "What is the dominant color? One word."');
// wait for agent_settled (90 s)
check('look_at_image ran', tools.includes('look_at_image'));
check('no tool error', errors.length === 0, errors.join(' | '));
check('model saw the image', /red/i.test(answer), answer);
```

- [x] **Step 2: Run it and watch it fail**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim(); node scripts/selftest-image-live.js
```
Expected: FAIL — the vision request returns a FreePi auth/429 error.

- [x] **Step 3: Implement the branch**

Rename the execute parameters to `async execute(_id, params, _signal, _onUpdate, ctx)`. After reading `buf` and computing `mediaType`:

```js
const model = ctx?.getModel?.();
if (model?.input?.includes('image')) {
  return {
    content: [
      { type: 'image', data: buf.toString('base64'), mimeType: mediaType },
      { type: 'text', text: `Image attached. Answer this yourself: ${params?.question || 'Describe it.'}` },
    ],
  };
}
if (!auth) {
  return { content: [{ type: 'text', text: 'This model cannot see images. Switch to a Coarena model that supports vision, or connect FreePi.' }] };
}
```

Leave the existing FreePi fetch loop below that guard untouched. Update the tool `description` to say the image may be returned directly.

- [x] **Step 4: Re-run the live test**

Expected: all checks pass; the answer mentions red.

- [x] **Step 5: Commit**

```bash
git add app/src/freepi-bridge.js app/scripts/selftest-image-live.js
git commit -m "feat(vision): show images to models that can see them"
```

---

### Task 3: Image path extraction

**Files:**
- Modify: `app/src/renderer/provider-ui.js`
- Modify: `app/scripts/selftest-provider-ui.js`

**Interfaces:**
- Produces: `extractImagePaths(text) -> string[]` — deduped, order-preserving, max 3, image extensions only, no URLs/data URIs.

- [x] **Step 1: Add failing checks**

```js
check('absolute windows path', UI.extractImagePaths('see C:\\work\\shots\\a.png now').join() === 'C:\\work\\shots\\a.png');
check('relative path with folders', UI.extractImagePaths('rendered shots/ui-render.png.').join() === 'shots/ui-render.png');
check('quoted path', UI.extractImagePaths('path "shots/b.webp" here').join() === 'shots/b.webp');
check('urls ignored', UI.extractImagePaths('https://x.test/a.png').length === 0);
check('data uri ignored', UI.extractImagePaths('data:image/png;base64,AAAA').length === 0);
check('non-image ignored', UI.extractImagePaths('read shots/a.svg now').length === 0);
check('dedupe keeps order', UI.extractImagePaths('a.png b.jpg a.png').join() === 'a.png,b.jpg');
check('caps at three', UI.extractImagePaths('a.png b.jpg c.gif d.webp').length === 3);
```

- [x] **Step 2: Run it to see it fail**

Run: `node scripts/selftest-provider-ui.js`
Expected: `UI.extractImagePaths is not a function`.

- [x] **Step 3: Implement**

Regex over `/((?:[A-Za-z]:[\\/]|\/)?[\w.@() -]*[\w)-]\.(?:png|jpe?g|webp|gif))\b/gi`, then filter out candidates that start with `http`, `data:`, or contain `://`; strip leading/trailing quotes, commas and periods; dedupe; slice(0, 3). Keep it dependency-free and CSP-safe like the rest of the file.

- [x] **Step 4: Run the test**

Run: `node scripts/selftest-provider-ui.js`
Expected: all checks pass, exit 0.

- [x] **Step 5: Commit**

```bash
git add app/src/renderer/provider-ui.js app/scripts/selftest-provider-ui.js
git commit -m "feat(renderer): find image paths in message text"
```

---

### Task 4: Preview IPC and thumbnails

**Files:**
- Modify: `app/src/main.js` (imports/handlers near `fs:listFiles` or `settings:reveal`)
- Modify: `app/src/preload.js`
- Modify: `app/src/renderer/app.js` (message rendering, styles)
- Modify: `app/src/renderer/styles.css`
- Create: `app/scripts/selftest-image-ui.js`

**Interfaces:**
- Consumes: `FPProvider.extractImagePaths`.
- Produces: IPC `fs:readImage { cwd, path }`, `fs:openPath { cwd, path }`; preload `readImage(cwd, path)`, `openPath(cwd, path)`.

- [x] **Step 1: Add the IPC**

```js
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function resolveInside(cwd, target) {
  const root = path.resolve(cwd || '');
  const abs = path.resolve(root, String(target || ''));
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

ipcMain.handle('fs:readImage', async (_e, { cwd, path: target } = {}) => {
  const abs = resolveInside(cwd, target);
  if (!abs) return { ok: false };
  const ext = path.extname(abs).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return { ok: false };
  try {
    const stat = await fs.promises.stat(abs);
    if (!stat.isFile() || stat.size > IMAGE_MAX_BYTES) return { ok: false };
    const buf = await fs.promises.readFile(abs);
    const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png';
    return { ok: true, path: abs, mimeType: mime, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('fs:openPath', async (_e, { cwd, path: target } = {}) => {
  const abs = resolveInside(cwd, target);
  if (!abs) return { ok: false };
  const error = await shell.openPath(abs);
  return error ? { ok: false, error } : { ok: true };
});
```

`resolveInside` rejects an empty `cwd` rather than treating it as the process dir.

- [x] **Step 2: Expose both in preload**

```js
readImage: (cwd, p) => ipcRenderer.invoke('fs:readImage', { cwd, path: p }),
openPath: (cwd, p) => ipcRenderer.invoke('fs:openPath', { cwd, path: p }),
```

- [x] **Step 3: Render thumbnails**

In `app.js`:

```js
async function appendImagePreviews(container, text, cwd) {
  if (!container || !cwd || !text) return;
  const paths = FPProvider.extractImagePaths(text).slice(0, 3);
  if (!paths.length) return;
  const strip = document.createElement('div');
  strip.className = 'msg-images';
  for (const rel of paths) {
    const res = await api.readImage(cwd, rel).catch(() => null);
    if (!res?.ok) continue;
    const im = document.createElement('img');
    im.src = res.dataUri;
    im.alt = rel;
    im.title = rel;
    im.addEventListener('click', () => api.openPath(cwd, rel).catch(() => {}));
    strip.appendChild(im);
  }
  if (strip.children.length) container.appendChild(strip);
}
```

Call it: after an assistant message's body is rendered (only when `m.kind === 'assistant'` and `m.text`), and after a tool card's text is set. Never for `m.kind === 'user'` with attachments.

- [x] **Step 4: Style**

```css
.msg-images { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.msg-images img { max-width: 260px; max-height: 180px; object-fit: cover; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
```

- [x] **Step 5: CDP check**

`selftest-image-ui.js` (adapt `selftest-mention-ui.js`): open a tab, then in the page

```js
const box = document.createElement('div');
document.getElementById('transcript').appendChild(box);
await appendImagePreviews(box, 'see shots/ui-render.png', <app cwd>);
return { images: box.querySelectorAll('img').length, src: box.querySelector('img')?.src.slice(0, 22), opened: await window.freepi.readImage(<cwd>, 'shots/ui-render.png') };
```

Assert 1 image, `src` starts `data:image/`, `readImage.ok` true; then assert `readImage(cwd, '../secret.png')` is `{ ok: false }`.

- [x] **Step 6: Run the UI check and the render test**

Run the Electron UI script, then `node_modules/electron/dist/electron.exe scripts/selftest-ui-render.js`.
Expected: both pass.

- [x] **Step 7: Commit**

```bash
git add app/src/main.js app/src/preload.js app/src/renderer/app.js app/src/renderer/styles.css app/scripts/selftest-image-ui.js
git commit -m "feat(ui): preview images mentioned in the conversation"
```

---

### Task 5: Full verification

- [x] **Step 1: Local suite**

`selftest-provider-ui`, `selftest-provider-plan`, `selftest-coarena`, `selftest-coarena-key`, `selftest-provider-errors`, `selftest-prompt-mode`, `selftest-markdown`, `selftest-session-paths`, `selftest-ui-render`.
Expected: all pass.

- [x] **Step 2: Live checks**

```powershell
$env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
node scripts/selftest-image-live.js
node scripts/selftest-steer-live.js
```
Expected: both pass.

- [x] **Step 3: FreePi path unchanged**

Run `node scripts/selftest-ads.js` far enough to see the turn header, and `node scripts/selftest-session.js` (may still hit the account's hourly ceiling; report that, do not fix).
Expected: tool still registers, no regression from the new branch.

- [x] **Step 4: Commit any remaining doc updates**

```bash
git add docs/superpowers/plans/2026-11-13-image-viewing.md
git commit -m "docs(plan): image viewing implementation"
```

---

## Self-review notes

- Spec coverage: vision capability (Task 1), `look_at_image` (Task 2), path extraction (Task 3), preview IPC + UI (Task 4), verification (Task 5).
- FreePi models stay text-only: Task 1 only touches Coarena config.
- Path safety: one `resolveInside` helper used by both IPC handlers.
- Preview failures are silent by construction (every branch returns `{ ok:false }`).
