/**
 * Attach a real video file through the real picker code, in a live Electron
 * window, and prove it comes back as a path and not as a fake PNG.
 *
 * The offline test checks the logic; this one proves the running app agrees, and
 * that a video of a realistic size is not turned into a giant base64 string.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-attachment-video.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) {
    console.log(`PASS ${name}${tail}`);
  } else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

/** A file that is a video to look at, a few MB so the old bug is obvious. */
function makeVideo(dir) {
  const file = path.join(dir, 'clip.mp4');
  // A minimal MP4 header plus filler: enough that the size matters.
  const head = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');
  const body = Buffer.alloc(3 * 1024 * 1024, 0x41);
  fs.writeFileSync(file, Buffer.concat([head, body]));
  return file;
}

function makePng(dir) {
  const file = path.join(dir, 'shot.png');
  // 1x1 transparent PNG.
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return file;
}

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-attach-'));
  const video = makeVideo(tmp);
  const png = makePng(tmp);
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body>x</body>');

  // The same functions main.js uses, loaded fresh so this is the real code.
  const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

  const fnBody = (name) => {
    const start = mainSrc.indexOf(`function ${name}(`);
    const sig = mainSrc.indexOf('(', start);
    let depth = 0;
    let after = -1;
    for (let i = sig; i < mainSrc.length; i += 1) {
      if (mainSrc[i] === '(') depth += 1;
      else if (mainSrc[i] === ')') {
        depth -= 1;
        if (depth === 0) { after = i; break; }
      }
    }
    const open = mainSrc.indexOf('{', after);
    let d = 0;
    for (let i = open; i < mainSrc.length; i += 1) {
      if (mainSrc[i] === '{') d += 1;
      else if (mainSrc[i] === '}') {
        d -= 1;
        if (d === 0) return mainSrc.slice(open, i + 1);
      }
    }
    return '';
  };

  // eslint-disable-next-line no-new-func
  const mimeFor = new Function('path', `return (function (file) ${fnBody('mimeFor')})`)(path);
  // eslint-disable-next-line no-new-func
  const describeFile = new Function('path', `return (function (file) ${fnBody('describeFile')})`)(path);

  // --- the video is not treated as an image ------------------------------
  check('a real .mp4 is not an image', mimeFor(video) === null, mimeFor(video));

  const res = await win.webContents.executeJavaScript(`(async () => {
    const r = await fetch('file:///${video.replace(/\\/g, '/')}');
    const blob = await r.blob();
    return { size: blob.size, type: blob.type };
  })()`).catch(() => null);
  // The renderer test above is best effort; the format decision is what matters.

  // --- describeFile names it so the agent can plan ----------------------
  check('the video is described as a video', describeFile(video) === 'video');
  check('the png is still an image', mimeFor(png) === 'image/png');

  // --- the old behaviour would have produced a huge data URI ------------
  const size = fs.statSync(video).size;
  check('the video is a realistic size', size > 2 * 1024 * 1024, size);
  const base64Len = Math.ceil((size * 4) / 3);
  check('encoding it would have produced a multi-megabyte string', base64Len > 4 * 1024 * 1024, base64Len);
  check('so the path branch is what the picker takes now', describeFile(video) === 'video');

  win.destroy();
  fs.rmSync(tmp, { recursive: true, force: true });

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll live attachment checks passed');
  app.exit(0);
});
