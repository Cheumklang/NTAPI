/**
 * End-to-end check for @skill mentions in the real window.
 *
 * Start the app first, in a throwaway profile:
 *   cd app
 *   Start-Process -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList ".","--remote-debugging-port=9222","--user-data-dir=$env:TEMP\freepi-mention-profile"
 *
 * Then:  node scripts/selftest-mention-ui.js
 */
'use strict';

const PORT = 9222;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const targets = await listTargets();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('no app page target — is Electron running with --remote-debugging-port=9222?');
  const ws = await connect(page.webSocketDebuggerUrl);

  await evaluate(
    ws,
    `(async () => {
       const list = await window.freepi.listTabs();
       if (list && list.length) {
         window.applyTabState(await window.freepi.getTabState(list[0].tabId));
         return true;
       }
       const opened = await window.freepi.openTab({ cwd: ${JSON.stringify(process.cwd())} });
       window.applyTabState(opened.state);
       return true;
     })()`,
    true
  );

  const before = await evaluate(ws, `document.querySelectorAll('#transcript .msg.user').length`);

  await evaluate(
    ws,
    `(() => {
       const input = document.getElementById('input');
       input.value = '@caveman';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       return true;
     })()`
  );

  let menu = null;
  for (let i = 0; i < 40; i += 1) {
    menu = await evaluate(
      ws,
      `(() => {
         const m = document.getElementById('fileMenu');
         return {
           hidden: m.hidden,
           names: [...m.querySelectorAll('.file-name')].map((n) => n.textContent),
           active: m.querySelector('.slash-item.active .file-name')?.textContent || '',
         };
       })()`
    );
    if (!menu.hidden && menu.names.includes('caveman')) break;
    await sleep(250);
  }

  // Skills are listed first; put the selection on `caveman` explicitly, then
  // press Enter the way a person would.
  await evaluate(
    ws,
    `(() => {
       const input = document.getElementById('input');
       const active = () => document.querySelector('#fileMenu .slash-item.active .file-name')?.textContent;
       for (let i = 0; i < 8 && active() !== 'caveman'; i += 1) {
         input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
       }
       input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
       return true;
     })()`
  );
  await sleep(300);

  const after = await evaluate(
    ws,
    `(async () => {
       const input = document.getElementById('input');
       const typed = input.value;
       const skills = await window.freepi.listSkills();
       // Clear the composer so the throwaway profile does not leave a draft.
       input.value = '';
       input.dispatchEvent(new Event('input', { bubbles: true }));
       return {
         typed,
         sentCount: document.querySelectorAll('#transcript .msg.user').length,
         resolved: window.FPProvider.resolveSkillMention('@caveman say hi', skills),
       };
     })()`,
    true
  );

  const report = {
    menuShown: Boolean(menu && !menu.hidden),
    menuHasCaveman: Boolean(menu && menu.names.includes('caveman')),
    inserted: String(after.typed).startsWith('/skill:caveman'),
    nothingSent: after.sentCount === before,
    resolved: after.resolved,
    resolvedOk: after.resolved === '/skill:caveman say hi',
  };

  console.log(JSON.stringify(report, null, 2));
  ws.close();

  const ok =
    report.menuShown && report.menuHasCaveman && report.inserted && report.nothingSent && report.resolvedOk;
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});
