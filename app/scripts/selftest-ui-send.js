/**
 * Drive one real image message through the app's own UI (paste -> send -> answer)
 * over the DevTools protocol, so the check covers the same code path the user
 * takes. Prints the transcript result as JSON.
 *
 *   node scripts/selftest-ui-send.js [path-to-image]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PORT = 9222;

async function targets() {
  return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
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
      const msg = JSON.parse(ev.data);
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
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const image =
    process.argv[2] ||
    (() => {
      const candidates = [
        path.join('C:\\NTAPI', 'outputs', '.ntapi-attachments', 'image-2026-11-12T17-24-50-890Z-1.png'),
        path.join('C:\\Freepiai', 'outputs', '.freepi-attachments', 'image-2026-11-12T17-24-50-890Z-1.png'),
      ];
      return candidates.find((p) => fs.existsSync(p)) || candidates[0];
    })();
  const b64 = fs.readFileSync(image).toString('base64');

  const page = (await targets()).find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('app window not found — start it with --remote-debugging-port=9222');
  const ws = await connect(page.webSocketDebuggerUrl);
  await rpc(ws, 'Runtime.enable');

  // 0. work in a throwaway session so the check never touches a real chat
  const tab = await evaluate(
    ws,
    `api.openTab({ cwd: ${JSON.stringify(path.join(require('node:os').tmpdir(), 'freepi-ui-test'))} })
       .then((res) => { applyTabState(res.state); return { tabId: res.tabId, cwd: res.state.cwd }; })`,
    true
  );
  console.log('test tab:', JSON.stringify(tab));

  // 1. paste the file into the app exactly like Ctrl+V does
  const staged = await evaluate(
    ws,
    `(async () => {
       const bin = atob(${JSON.stringify(b64)});
       const bytes = new Uint8Array(bin.length);
       for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
       const file = new File([bytes], 'pasted.png', { type: 'image/png' });
       const dt = new DataTransfer();
       dt.items.add(file);
       const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
       document.getElementById('input').dispatchEvent(ev);
       for (let i = 0; i < 40; i++) {
         await new Promise((r) => setTimeout(r, 100));
         const thumbs = document.querySelectorAll('#attachments .attachment img');
         if (thumbs.length) return { thumbs: thumbs.length, hidden: document.getElementById('attachments').hidden };
       }
       return { thumbs: 0, hidden: document.getElementById('attachments').hidden };
     })()`,
    true
  );
  console.log('staged attachment:', JSON.stringify(staged));
  if (!staged.thumbs) throw new Error('the paste did not stage an image');

  // 2. type a question and press Enter (the real submit path)
  await evaluate(
    ws,
    `(() => {
       const input = document.getElementById('input');
       input.value = 'รูปนี้คืออะไร ตอบสั้นๆ ว่าเห็นอะไรในรูป';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
       return true;
     })()`
  );

  // 3. wait for the turn to settle
  let busy = true;
  const started = Date.now();
  while (Date.now() - started < 180000) {
    await sleep(1000);
    busy = await evaluate(ws, `!document.getElementById('stopBtn').hidden`);
    if (!busy) break;
  }

  const result = await evaluate(
    ws,
    `(() => {
       const bubbles = [...document.querySelectorAll('.msg.assistant .body')];
       const last = bubbles[bubbles.length - 1];
       return {
         settled: document.getElementById('stopBtn').hidden,
         seconds: 0,
         errorBanners: [...document.querySelectorAll('.error-banner')].map((d) => d.textContent.slice(0, 160)),
         tools: [...document.querySelectorAll('.tool .tool-name')].map((n) => n.textContent).slice(-6),
         lastAnswer: last ? last.textContent.slice(0, 700) : null,
       };
     })()`
  );
  result.seconds = Math.round((Date.now() - started) / 1000);
  console.log(JSON.stringify(result, null, 2));

  // 4. close the throwaway tab (its session file is removed by the caller)
  await evaluate(ws, `api.closeTab(${JSON.stringify(tab.tabId)}).then(() => true)`, true).catch(() => {});
  ws.close();
  process.exit(result.lastAnswer && result.lastAnswer.trim() ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});