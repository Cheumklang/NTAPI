'use strict';

/**
 * NTAPI ADS — publish a sponsor to the public repo that every NTAPI reads.
 *
 * The app is a thin, deliberate shell around three operations: read the current
 * `sponsor.json`, upload media, write the config back. All the shape logic lives
 * in `feed.js`/`github.js`/`media.js` so it can be tested without a window; this
 * file only owns the things a test cannot own — the filesystem, the dialog, the
 * network, and the window itself.
 *
 * Why an app and not a script: the operator here is the person selling the slot,
 * not a developer. They have a poster from a sponsor at unknown dimensions, and
 * the one rule that matters is that whatever they send looks the same in the
 * sidebar as everything else. A window can show that before it is published.
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const feedLib = require('./feed');
const gh = require('./github');
const cfgLib = require('./config');
const mediaLib = require('./media');

let win = null;

/* ------------------------------ local config ------------------------------ */

/**
 * Settings live in userData, not next to the code: the token can write to the
 * public sponsor repo, so it must never be inside a folder that gets published,
 * zipped into an installer, or committed by accident.
 */
function configPath() {
  return path.join(app.getPath('userData'), 'ads-config.json');
}

function readConfig() {
  try {
    return cfgLib.normalizeConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8')));
  } catch {
    return cfgLib.normalizeConfig(null);
  }
}

function writeConfig(next) {
  const dir = path.dirname(configPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

/* -------------------------------- helpers -------------------------------- */

async function apiFetch(config, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...gh.headers(config.token), ...(init.headers || {}) },
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text, body: gh.safeJson(text) };
}

/**
 * A sponsor sends a link more often than a file. Fetch it here, under a byte
 * ceiling, so neither the window nor the canvas ever touches a remote host.
 */
async function downloadMedia(url) {
  if (!mediaLib.mediaUrlAllowed(url)) return { ok: false, error: 'ลิงก์ไม่ถูกต้อง (ต้องเป็น https และเป็นไฟล์รูป/วิดีโอ)' };
  const controller = new AbortController();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, error: `ดาวน์โหลดไม่สำเร็จ (HTTP ${res.status})` };
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared > mediaLib.MAX_DOWNLOAD_BYTES) {
      controller.abort();
      return { ok: false, error: 'ไฟล์ใหญ่เกินกำหนด' };
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      // The header is a claim; the stream is the truth.
      if (total > mediaLib.MAX_DOWNLOAD_BYTES) {
        controller.abort();
        return { ok: false, error: 'ไฟล์ใหญ่เกินกำหนด' };
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'media');
    return { ok: true, name, bytes: bytes.length, base64: bytes.toString('base64') };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** `media/x.webp` + base64, or null when the slot arrived already published. */
function mediaUpload(slot) {
  const media = (slot && slot.media) || {};
  if (typeof media.base64 === 'string' && media.base64) {
    return { path: feedLib.fileFor(slot.id, 'image', 'webp'), base64: media.base64 };
  }
  if (media.type !== 'video') return null;

  // A video is never re-encoded here (no ffmpeg in this app on purpose), so the
  // bytes are whatever the sponsor sent. It may arrive as a file on disk or as a
  // link we already downloaded, hence the two sources.
  const fromDisk =
    typeof media.sourcePath === 'string' && media.sourcePath
      ? (() => {
          const ext = mediaLib.extOf(media.sourcePath);
          if (!feedLib.VIDEO_EXT.includes(ext)) return null;
          try {
            const stat = fs.statSync(media.sourcePath);
            if (stat.size > feedLib.MAX_VIDEO_BYTES) return null;
            return { ext, base64: fs.readFileSync(media.sourcePath).toString('base64') };
          } catch {
            return null;
          }
        })()
      : null;

  const fromLink =
    typeof media.sourceBase64 === 'string' && media.sourceBase64
      ? (() => {
          const ext = mediaLib.extOf(media.sourceName || '');
          if (!feedLib.VIDEO_EXT.includes(ext)) return null;
          return { ext, base64: media.sourceBase64 };
        })()
      : null;

  const found = fromDisk || fromLink;
  if (!found) return null;
  return { path: feedLib.fileFor(slot.id, 'video', found.ext), base64: found.base64 };
}

function posterUpload(slot) {
  const media = (slot && slot.media) || {};
  if (media.type !== 'video') return null;
  if (typeof media.posterBase64 !== 'string' || !media.posterBase64) return null;
  return { path: feedLib.posterFor(slot.id), base64: media.posterBase64 };
}
/** Turns the window's draft slots into the exact file NTAPI will read. */
function feedFromDraft(payload) {
  const slots = Array.isArray(payload && payload.slots) ? payload.slots : [];
  const prepared = [];
  const uploads = [];

  for (const slot of slots) {
    const media = (slot && slot.media) || {};
    const current = { ...slot, media: { ...media } };

    const up = mediaUpload(slot);
    if (up) {
      uploads.push(up);
      current.media.file = up.path;
      delete current.media.base64;
      delete current.media.sourcePath;
      delete current.media.sourceBase64;
      delete current.media.sourceName;
    }
    const poster = posterUpload(slot);
    if (poster) {
      uploads.push(poster);
      current.media.poster = poster.path;
      delete current.media.posterBase64;
    }
    if (!current.media.file) continue;
    prepared.push(current);
  }

  const built = feedLib.buildFeed(
    prepared.map((slot) => ({ ...slot, rotateSeconds: payload && payload.rotateSeconds })),
  );
  return { feed: built, uploads };
}

/* --------------------------------- window -------------------------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 900,
    minHeight: 680,
    show: false,
    backgroundColor: '#12141a',
    title: 'NTAPI ADS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // The window never navigates: everything external opens in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => {
    win = null;
  });
}

/* ---------------------------------- IPC ---------------------------------- */

ipcMain.handle('cfg:get', () => cfgLib.maskConfig(readConfig()));

ipcMain.handle('cfg:save', (_e, raw) => {
  const current = readConfig();
  const next = cfgLib.normalizeConfig({
    owner: raw && raw.owner,
    repo: raw && raw.repo,
    branch: raw && raw.branch,
    // An empty box means "keep the token I already saved" — otherwise pressing
    // save to fix a typo in the repo name would silently delete the credential.
    token: raw && typeof raw.token === 'string' && raw.token.trim() ? raw.token : current.token,
    lastPublish: current.lastPublish,
  });
  writeConfig(next);
  return cfgLib.maskConfig(next);
});

/** Checks the two things a publish needs: the repo exists and we may push. */
ipcMain.handle('repo:check', async () => {
  const config = readConfig();
  if (!cfgLib.tokenLooksReal(config.token)) return { ok: false, error: 'ยังไม่ได้ใส่ token ที่ถูกต้อง' };
  try {
    const res = await apiFetch(config, gh.repoUrl(config));
    if (!res.ok) return { ok: false, error: gh.describe(res.status, res.text) };
    const body = res.body || {};
    const canPush = Boolean(body.permissions && body.permissions.push);
    return {
      ok: true,
      canPush,
      fullName: body.full_name || `${config.owner}/${config.repo}`,
      private: Boolean(body.private),
      htmlUrl: body.html_url || '',
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('feed:load', async () => {
  const config = readConfig();
  if (!cfgLib.tokenLooksReal(config.token)) return { ok: false, error: 'ยังไม่ได้ใส่ token ที่ถูกต้อง' };
  try {
    const res = await apiFetch(config, gh.contentsUrl(config, 'sponsor.json'));
    const parsed = gh.parseContents(res.status, res.text);
    if (parsed.error) return { ok: false, error: parsed.error };
    if (!parsed.exists) return { ok: true, feed: null, sha: '', note: 'ยังไม่มี sponsor.json ใน repo' };
    let raw = null;
    try {
      raw = JSON.parse(parsed.text);
    } catch {
      return { ok: false, error: 'sponsor.json ใน repo อ่านไม่ได้ (JSON พัง)' };
    }
    return { ok: true, feed: feedLib.readFeed(raw), sha: parsed.sha };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('media:pick', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'เลือกรูปหรือวิดีโอ',
    properties: ['openFile'],
    filters: [
      { name: 'รูป/วิดีโอ', extensions: [...feedLib.IMAGE_EXT, ...feedLib.VIDEO_EXT] },
      { name: 'ทั้งหมด', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  const filePath = res.filePaths[0];
  try {
    const stat = fs.statSync(filePath);
    // A sponsor video is small; refuse an obvious mismatch before reading it into
    // memory twice (once here, once into a data URL).
    if (stat.size > mediaLib.MAX_DOWNLOAD_BYTES) return { ok: false, error: 'ไฟล์ใหญ่เกินกำหนด' };
    const bytes = fs.readFileSync(filePath);
    return {
      ok: true,
      name: path.basename(filePath),
      path: filePath,
      bytes: stat.size,
      base64: bytes.toString('base64'),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('media:fetch', async (_e, url) => downloadMedia(String(url || '')));

ipcMain.handle('publish', async (_e, payload) => {
  const config = readConfig();
  if (!cfgLib.tokenLooksReal(config.token)) return { ok: false, error: 'ยังไม่ได้ใส่ token ที่ถูกต้อง' };
  const { feed, uploads } = feedFromDraft(payload);
  if (!feed) return { ok: false, error: 'ไม่มีสล็อตที่ใช้ได้ (ต้องมีอย่างน้อย 1 ราย)' };

  const plan = gh.publishPlan(feed, uploads);
  const done = [];
  for (const step of plan) {
    try {
      const head = await apiFetch(config, gh.contentsUrl(config, step.path));
      const existing = gh.parseContents(head.status, head.text);
      const body = gh.putPayload({
        base64: step.base64,
        sha: existing.sha,
        branch: config.branch,
        message: step.kind === 'config' ? 'sponsor: เผยแพร่สปอนเซอร์' : `sponsor: มีเดีย ${step.path}`,
      });
      const res = await apiFetch(config, gh.contentsUrl(config, step.path), {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false, error: gh.describe(res.status, res.text), done };
      done.push(step.path);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), done };
    }
  }

  const stamp = new Date().toISOString();
  writeConfig({ ...config, lastPublish: stamp });
  return { ok: true, done, updated: feed.updated, slots: feed.slots.length };
});

ipcMain.handle('shell:open', (_e, url) => {
  const value = String(url || '');
  if (!/^https:\/\//i.test(value)) return { ok: false };
  shell.openExternal(value);
  return { ok: true };
});

/* -------------------------------- lifecycle ------------------------------- */

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});