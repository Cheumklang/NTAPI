'use strict';
/**
 * How long drawing a conversation takes.
 *
 * The transcript is re-rendered on every animation frame of a streamed reply and
 * again every time a chat is opened, so the markdown path is the place the window
 * spends its time. This reports four numbers, all in ms:
 *
 *   frame     a 24 KB answer redrawn with one more character (a streaming frame)
 *   revisit   the same 24 KB answer drawn again (switching back to a chat)
 *   repaint   a 90-message conversation drawn from scratch, as a tab switch does
 *   stream    a 24 KB answer arriving 1 KB at a time, total for every frame
 *
 * Nothing here asserts; it reports. Run it before and after a change. Point
 * `MD_FILE` at another copy of markdown.js to compare two versions:
 *
 *   MD_FILE=/tmp/markdown-before.js electron --no-sandbox scripts/bench-markdown.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const MD_FILE = process.env.MD_FILE || path.join(RENDERER, 'markdown.js');
app.setPath('userData', path.join(app.getPath('temp'), 'freepi-perf-dom'));

const prose =
  'The transcript is rebuilt from the session on every repaint, and a long answer is a lot of markdown ' +
  'through the highlighter. Here is what that means for the window: typing stays responsive, but each ' +
  'frame pays for the whole answer. ';

const code = Array.from({ length: 18 }, (_, i) => `  const line${i} = value + ${i}; // comment`).join('\n');

function answer(bytes) {
  const unit = [
    '## Answer',
    '',
    prose.repeat(3),
    '',
    '| Check | Result |',
    '| --- | --- |',
    '| escaping | ok |',
    '| tables | ok |',
    '',
    '1. read the file',
    '2. patch the parser',
    '   - keep streaming safe',
    '3. run the tests',
    '',
    '```js',
    code,
    '```',
    '',
    prose.repeat(2),
    '',
  ].join('\n');
  let out = '';
  while (out.length < bytes) out += unit + '\n';
  return out;
}

const LONG = answer(24 * 1024);
const MSGS = Array.from({ length: 90 }, () => answer(2 * 1024));

function page() {
  return `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8" />
<link rel="stylesheet" href="file://${RENDERER.replace(/\\/g, '/')}/styles.css" />
<script src="file://${MD_FILE.replace(/\\/g, '/').replace(/\\/g, '/')}"></script>
<style>html,body{overflow:hidden}</style>
</head><body>
<div id="transcript" class="transcript"></div>
</body></html>`;
}

app.whenReady().then(async () => {
  const file = path.join(app.getPath('temp'), 'freepi-perf-dom.html');
  fs.writeFileSync(file, page(), 'utf8');
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false },
  });
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 500));

  const report = await win.webContents.executeJavaScript(`(() => {
    const LONG = ${JSON.stringify(LONG)};
    const MSGS = ${JSON.stringify(MSGS)};
    const transcript = document.getElementById('transcript');
    const time = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
    const best = (fn, runs) => { fn(); let b = Infinity; for (let i = 0; i < runs; i += 1) b = Math.min(b, time(fn)); return b; };

    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const body = document.createElement('div');
    body.className = 'body md';
    wrap.appendChild(body);
    transcript.appendChild(wrap);

    // A long answer redrawn with one more character each time: every frame
    // re-parses the whole reply and replaces the innerHTML, as streaming does.
    let n = 0;
    const grow = best(() => {
      n += 1;
      body.__fpHtml = '';
      FPMarkdown.renderInto(body, LONG + 'x'.repeat(n), { streaming: true });
    }, 12);

    // The same text drawn again — switching back to a chat that has not changed.
    const cached = best(() => {
      FPMarkdown.renderInto(body, LONG, { streaming: false });
    }, 12);

    // A repaint of a 90-message conversation, one bubble per message.
    const repaint = best(() => {
      transcript.innerHTML = '';
      for (const text of MSGS) {
        const w = document.createElement('div');
        w.className = 'msg assistant';
        const b = document.createElement('div');
        b.className = 'body md';
        w.appendChild(b);
        transcript.appendChild(w);
        FPMarkdown.renderInto(b, text, { streaming: false });
      }
    }, 3);

    // The streaming case: a 24 KB answer arriving 1 KB at a time.
    const stream = (() => {
      body.__fpHtml = '';
      FPMarkdown.renderInto(body, LONG.slice(0, 1024), { streaming: true });
      const t0 = performance.now();
      let frames = 0;
      for (let i = 2048; i <= LONG.length; i += 1024) {
        FPMarkdown.renderInto(body, LONG.slice(0, i), { streaming: true });
        frames += 1;
      }
      return { ms: performance.now() - t0, frames };
    })();

    return { grow_24kb_ms: Math.round(grow * 10) / 10, revisit_24kb_ms: Math.round(cached * 100) / 100, repaint_90_ms: Math.round(repaint), stream };
  })()`);

  console.log(JSON.stringify(report, null, 2));
  console.log(
    `24 KB answer: ${report.grow_24kb_ms} ms per streaming frame, ` +
      `${report.revisit_24kb_ms} ms on revisit\n` +
      `90 messages: ${report.repaint_90_ms} ms\n` +
      `24 KB streamed in ${report.stream.frames} frames: ${Math.round(report.stream.ms)} ms`
  );
  win.destroy();
  app.exit(0);
}).catch((e) => { console.error(e); app.exit(1); });
