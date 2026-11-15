'use strict';

/**
 * Boot the real window with the real preload and check that it actually works.
 *
 * `npm test` never parses the renderer (it has no DOM), so this is the only place
 * a typo in `app.js` or a bad selector shows up before an operator sees a blank
 * screen. IPC is stubbed here rather than through main.js: the point is the
 * window, not the network.
 *
 *   electron scripts/check-render.js
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');

/* --------------------------------- stubs ---------------------------------- */

const fakeFeed = {
  version: 1,
  updated: '2026-11-16T00:00:00.000Z',
  rotateSeconds: 15,
  slots: [
    {
      id: 'existing-one',
      enabled: true,
      url: 'https://example.com/',
      media: { type: 'image', file: 'media/existing-one.webp', alt: 'Existing' },
      text: { th: { label: 'ผู้สนับสนุน', title: 'สปอนเซอร์เดิม' }, en: { label: 'Sponsor', title: 'Existing' } },
    },
  ],
};

let published = null;

ipcMain.handle('cfg:get', () => ({
  owner: 'Cheumklang',
  repo: 'NTAPI-sponsor',
  branch: 'main',
  hasToken: true,
  tokenHint: 'ghp_abc\u2026wxyz',
  lastPublish: '',
}));
ipcMain.handle('cfg:save', (_e, raw) => ({ owner: raw.owner, repo: raw.repo, branch: raw.branch, hasToken: true, tokenHint: 'x', lastPublish: '' }));
ipcMain.handle('repo:check', () => ({ ok: true, canPush: true, fullName: 'Cheumklang/NTAPI-sponsor', private: false }));
ipcMain.handle('feed:load', () => ({ ok: true, feed: fakeFeed, sha: 'sha1' }));
ipcMain.handle('media:pick', () => ({ ok: false, canceled: true }));
ipcMain.handle('media:fetch', () => ({ ok: false, error: 'not used' }));
ipcMain.handle('publish', (_e, payload) => {
  published = payload;
  return { ok: true, done: ['media/a.webp', 'sponsor.json'], updated: 'now', slots: payload.slots.length };
});
ipcMain.handle('shell:open', () => ({ ok: true }));

/* -------------------------------- harness -------------------------------- */

const failures = [];
let checks = 0;
function expect(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await wait(60);
  }
  return null;
}

async function main() {
  const win = new BrowserWindow({
    width: 1040,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(root, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    // 3 = error. Warnings are noise from Chromium's own deprecations.
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => errors.push(`render-process-gone: ${details.reason}`));

  await win.loadFile(path.join(root, 'src', 'renderer', 'index.html'));
  await wait(400);

  const js = (code) => win.webContents.executeJavaScript(code, true);

  expect('no console errors on boot', errors.length === 0, errors.join(' | '));

  const bridge = await js('({ hasAds: Boolean(window.ads), hasRules: Boolean(window.adsRules), frame: window.adsRules && window.adsRules.frame })');
  expect('preload exposes window.ads', bridge.hasAds);
  expect('preload exposes window.adsRules', bridge.hasRules);
  expect('bridge frame is 2:1 at 536x268', bridge.frame && bridge.frame.w === 536 && bridge.frame.h === 268);

  // A published slot must paint, because "โหลดจาก repo" is how an operator
  // starts from what is already live.
  const boot = await js(`({
    slots: document.querySelectorAll('.slot').length,
    title: document.getElementById('frameTitle').textContent,
    hasImg: Boolean(document.querySelector('#frameMedia img')),
    repoName: document.getElementById('repoName').textContent
  })`);
  expect('boot loads the feed from the repo', boot.slots === 1, `slots=${boot.slots}`);
  expect('preview shows the published title', boot.title === 'สปอนเซอร์เดิม', boot.title);
  expect('preview renders the published image', boot.hasImg);
  expect('repo pill shows owner/repo', boot.repoName === 'Cheumklang/NTAPI-sponsor', boot.repoName);

  const geometry = await js(`(() => {
    const media = document.getElementById('frameMedia').getBoundingClientRect();
    return { w: Math.round(media.width), h: Math.round(media.height) };
  })()`);
  expect('preview media box is the real sidebar width', geometry.w === 268, `w=${geometry.w}`);
  expect('preview media box is 2:1', Math.abs(geometry.w / geometry.h - 2) < 0.02, `w=${geometry.w} h=${geometry.h}`);

  // ---- add a slot, then type into it.
  await js(`document.getElementById('btnAddSlot').click()`);
  await wait(120);
  const added = await js(`document.querySelectorAll('.slot').length`);
  expect('add slot appends a card', added === 2, `slots=${added}`);

  // Field order inside a card: 0 = id, 1 = url (row one), 2 = title TH,
  // 3 = title EN (row two), 4 = the media link box. The preview shows Thai, so
  // the typing checks have to use index 2.
  await js(`(() => {
    const card = document.querySelectorAll('.slot')[1];
    const inputs = card.querySelectorAll('input[type="text"]');
    inputs[2].value = 'ทดสอบชื่อใหม่';
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(120);
  const typed = await js(`document.getElementById('frameTitle').textContent`);
  expect('typing a title repaints the preview', typed === 'ทดสอบชื่อใหม่', typed);

  // A long title must be cut by the bridge's own clamp, in Thai.
  await js(`(() => {
    const card = document.querySelectorAll('.slot')[1];
    const inputs = card.querySelectorAll('input[type="text"]');
    inputs[2].value = 'ก'.repeat(300);
    inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(120);
  const clamped = await js(`document.getElementById('frameTitle').textContent`);
  expect('long title is clamped to 80 code points', [...clamped].length === 80, `len=${[...clamped].length}`);
  expect('clamped title ends with an ellipsis', clamped.endsWith('\u2026'));

  // ---- drop an image on the window: the whole crop path runs for real.
  const dropped = await js(`(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 900;            // tall on purpose: must be centre-cropped
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(0, 0, 600, 900);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'poster.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return true;
  })()`);
  expect('drop event dispatched', dropped === true);

  const afterDrop = await waitFor(async () => {
    const out = await js(`(() => {
      const card = document.querySelectorAll('.slot')[1];
      const img = card && card.querySelector('.drop img');
      const note = card && card.querySelector('.media-note');
      return { hasImg: Boolean(img), src: img ? img.src.slice(0, 20) : '', note: note ? note.textContent : '' };
    })()`);
    return out.hasImg ? out : null;
  });
  expect('dropped image paints in the slot', Boolean(afterDrop), 'no img after drop');
  if (afterDrop) {
    expect('crop is re-encoded as WebP', afterDrop.src.startsWith('data:image/webp'), afterDrop.src);
    expect('note reports the canonical size', afterDrop.note.includes('1072×536'), afterDrop.note);
  }

  const previewAfter = await js(`document.getElementById('frameTitle').textContent`);
  expect('preview still follows the selected slot', previewAfter.startsWith('ก'), previewAfter.slice(0, 12));

  // ---- publish must send the cropped bytes, not the original file.
  // The slot needs a click-through first: a sponsor with no link is refused.
  await js(`(() => {
    const card = document.querySelectorAll('.slot')[1];
    const inputs = card.querySelectorAll('input[type="text"]');
    inputs[1].value = 'https://example.com/offer';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await wait(120);
  await js(`document.getElementById('btnPublish').click()`);
  const sent = await waitFor(async () => (published ? published : null), 8000);
  expect('publish reached main', Boolean(sent), sent ? '' : 'validation refused the payload');
  if (sent) {
    const slot = sent.slots.find((s) => s.id && s.id !== 'existing-one');
    expect('publish includes the existing slot untouched', Boolean(sent.slots.find((s) => s.id === 'existing-one' && s.media.file)));
    expect('publish sends cropped image bytes', Boolean(slot && slot.media.base64 && slot.media.base64.length > 100));
    expect('publish never sends the browser File object', Boolean(slot && slot.media.file === undefined));
    expect('publish carries the rotate interval', sent.rotateSeconds === 15, String(sent.rotateSeconds));
  }

  expect('no console errors after interactions', errors.length === 0, errors.join(' | '));

  // Leave a screenshot for a human to glance at.
  const shot = await win.webContents.capturePage();
  const outFile = path.join(root, 'shots', 'ads-window.png');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, shot.toPNG());
  console.log(`screenshot: ${path.relative(root, outFile)}`);

  win.destroy();

  if (failures.length) {
    console.error(`\n${failures.length}/${checks} checks FAILED`);
    for (const line of failures) console.error(` - ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: ${checks}/${checks} window checks`);
  }
  app.quit();
}

app.whenReady().then(() =>
  main().catch((err) => {
    console.error('harness error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
    app.quit();
  }),
);