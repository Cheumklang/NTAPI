'use strict';

/**
 * Prove a creative can actually be read by the window.
 *
 * `npm test` can check the plumbing — the file is downloaded, the name is
 * sanitised, the URL is built — but not the one thing that decides whether a
 * banner appears: whether Chromium is *allowed* to load `ntapi-sponsor://` from a
 * page with this app's Content-Security-Policy.
 *
 * That has three ways to go wrong and no runtime symptom other than a blank band:
 * the scheme was registered after startup (too late), the CSP does not name the
 * scheme, or the handler resolves a different file than the name asks for. So this
 * boots the real scheme and the real CSP, loads an image over it, and also asks
 * for a file outside the media folder to confirm it is refused.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-sponsor-media.js
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, net, protocol } = require('electron');

app.disableHardwareAcceleration();

const SCHEME = 'ntapi-sponsor';

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
]);

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

// A real 1x1 PNG, so "did it load" is answered by Chromium decoding it rather
// than by a request that merely returned 200.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF+7g0dAAAAAElFTkSuQmCC',
  'base64',
);

const MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-media-serve-'));
fs.writeFileSync(path.join(MEDIA_DIR, 'creative.png'), PNG_1PX);
fs.writeFileSync(path.join(os.tmpdir(), 'outside-secret.txt'), 'must never be served');

/** The same rule main.js uses: base name only, and only media extensions. */
function keyOf(raw) {
  const base = String(raw || '').split('/').pop() || '';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '');
  if (!safe || safe.startsWith('.')) return '';
  if (!/\.(webp|png|jpg|jpeg|gif|mp4|webm)$/i.test(safe)) return '';
  return safe;
}

/*
 * Registered inside whenReady, because `protocol.handle` needs a session and a
 * session needs a ready app — calling it at the top level throws.
 */
function serveMedia() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const key = keyOf(decodeURIComponent(url.pathname.split('/').pop() || ''));
      if (!key) return new Response('', { status: 400 });
      const target = path.join(MEDIA_DIR, key);
      if (!target.startsWith(MEDIA_DIR + path.sep)) return new Response('', { status: 400 });
      if (!fs.existsSync(target)) return new Response('', { status: 404 });
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('', { status: 404 });
    }
  });
}

/**
 * The page carries the app's own CSP line, copied rather than re-invented: the
 * check is worthless if the policy here is more permissive than the real one.
 */
const PAGE = path.join(MEDIA_DIR, 'page.html');
const CSP = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8')
  .match(/content="(default-src[^"]*)"/)[1];
fs.writeFileSync(
  PAGE,
  `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<img id="ok" src="${SCHEME}://media/creative.png">` +
    `<video id="v" src="${SCHEME}://media/nope.mp4"></video>`,
);

const CSP_CHECK = `(() => {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const text = meta ? meta.getAttribute('content') : '';
  return { img: /img-src[^;]*ntapi-sponsor:/.test(text), media: /media-src[^;]*ntapi-sponsor:/.test(text) };
})()`;

app
  .whenReady()
  .then(async () => {
    serveMedia();
    const win = new BrowserWindow({ show: false, width: 400, height: 300 });
    await win.loadFile(PAGE);
    await new Promise((r) => setTimeout(r, 600));

    const out = await win.webContents.executeJavaScript(`(() => {
      const img = document.getElementById('ok');
      return { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete };
    })()`);
    const csp = await win.webContents.executeJavaScript(CSP_CHECK);
    check('img-src allows ntapi-sponsor:', csp.img === true, csp);
    check('media-src allows ntapi-sponsor:', csp.media === true, csp);
    check('a creative decodes in the window', out.complete && out.w === 1 && out.h === 1, out);

    // The handler must refuse anything that is not a media file in its own folder,
    // whatever the page (or a feed) asks for.
    const bad = await win.webContents.executeJavaScript(`(async () => {
      const tries = [
        '${SCHEME}://media/../outside-secret.txt',
        '${SCHEME}://media/../../prefs.json',
        '${SCHEME}://media/creative.exe',
        '${SCHEME}://media/missing.png'
      ];
      const codes = [];
      for (const url of tries) {
        try {
          const res = await fetch(url);
          codes.push(res.status);
        } catch {
          codes.push('blocked');
        }
      }
      return codes;
    })()`);
    check('paths outside the media folder are refused', bad[0] !== 200 && bad[1] !== 200, bad);
    check('a non-media extension is refused', bad[2] !== 200, bad);
    check('a missing creative answers 404, not an error dialog', bad[3] === 404 || bad[3] === 'blocked', bad);

    win.destroy();
    fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
    fs.rmSync(path.join(os.tmpdir(), 'outside-secret.txt'), { force: true });

    if (failures) {
      console.error(`\n${failures} check(s) FAILED`);
      process.exitCode = 1;
    } else {
      console.log('\nPASS: creative media is served over its own scheme');
    }
    app.quit();
  })
  .catch((err) => {
    console.error('harness error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
    app.quit();
  });
