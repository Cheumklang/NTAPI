/**
 * End-to-end check for image previews in the real window.
 *
 * Start the app first, in a throwaway profile:
 *   cd app
 *   Start-Process -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList ".","--remote-debugging-port=9222","--user-data-dir=$env:TEMP\freepi-image-profile"
 *
 * Then:  node scripts/selftest-image-ui.js
 */
'use strict';

const path = require('node:path');
const PORT = 9222;
const REPO = path.resolve(process.cwd(), '..');

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error('ws error')));
  });
}

let id = 0;
function rpc(ws, method, params = {}) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.id !== msgId) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

async function evaluate(ws, expression, awaitPromise = false) {
  const res = await rpc(ws, 'Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
}

(async () => {
  const targets = await listTargets();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('no app page target — is Electron running with --remote-debugging-port=9222?');
  const ws = await connect(page.webSocketDebuggerUrl);

  const result = await evaluate(
    ws,
    `(async () => {
       const cwd = ${JSON.stringify(REPO)};
       const opened = await window.freepi.openTab({ cwd });
       window.applyTabState(opened.state);

       const box = document.createElement('div');
       document.getElementById('transcript').appendChild(box);
       await appendImagePreviews(box, 'rendered shots/ui-render.png for review', cwd);

       const img = box.querySelector('img');
       const good = await window.freepi.readImage(cwd, 'shots/ui-render.png');
       const absolute = await window.freepi.readImage(cwd, cwd + '\\\\shots\\\\ui-render.png');
       const outside = await window.freepi.readImage(cwd, '..\\\\secret.png');
       const missing = await window.freepi.readImage(cwd, 'shots/nope.png');
       const svg = await window.freepi.readImage(cwd, 'shots/logo.svg');

       return {
         images: box.querySelectorAll('img').length,
         src: img ? img.src.slice(0, 22) : '',
         title: img ? img.title : '',
         good: Boolean(good && good.ok),
         absolute: Boolean(absolute && absolute.ok),
         outside: Boolean(outside && outside.ok),
         missing: Boolean(missing && missing.ok),
         svg: Boolean(svg && svg.ok),
       };
     })()`,
    true
  );

  const report = {
    rendered: result.images === 1,
    dataUri: result.src === 'data:image/png;base64,',
    titled: result.title === 'shots/ui-render.png',
    readOk: result.good,
    absoluteOk: result.absolute,
    outsideRefused: result.outside === false,
    missingRefused: result.missing === false,
    svgRefused: result.svg === false,
  };

  console.log(JSON.stringify({ ...report, raw: result }, null, 2));
  ws.close();
  process.exit(Object.values(report).every(Boolean) ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});
