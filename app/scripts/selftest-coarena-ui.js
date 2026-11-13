/**
 * End-to-end check of the Coarena flow through the real window.
 *
 * Start the app first, in a throwaway profile:
 *   cd app
 *   Start-Process -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList ".","--remote-debugging-port=9222","--user-data-dir=$env:TEMP\freepi-coarena-test"
 *
 * Then, from app/:
 *   $env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
 *   node scripts/selftest-coarena-ui.js
 *
 * Prints one JSON report; exits non-zero unless every flag is true.
 */
'use strict';

const PORT = 9222;
const KEY = String(process.env.COARENA_KEY || '').trim();

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

async function waitFor(ws, expression, ok, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression, true);
    if (ok(last)) return last;
    await sleep(300);
  }
  return last;
}

(async () => {
  if (!KEY) {
    console.error('Set COARENA_KEY first (see the header of this file).');
    process.exit(2);
  }

  const targets = await listTargets();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('no app page target — is Electron running with --remote-debugging-port=9222?');
  const ws = await connect(page.webSocketDebuggerUrl);

  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await rpc(ws, 'Runtime.enable');

  // One tab must exist for live registration and the dropdown to have a home.
  const tab = await evaluate(
    ws,
    `(async () => {
       const list = await window.freepi.listTabs();
       if (list && list.length) return list[0];
       const opened = await window.freepi.openTab({ cwd: ${JSON.stringify(process.cwd())} });
       return { tabId: opened.tabId };
     })()`,
    true
  );
  const tabId = tab.tabId;

  const saved = await evaluate(ws, `window.freepi.coarenaSetKey(${JSON.stringify(KEY)})`, true);

  const options = await waitFor(
    ws,
    `[...document.getElementById('modelSelect').options].map((o) => ({ value: o.value, label: o.textContent }))`,
    (list) => Array.isArray(list) && list.some((o) => o.value.startsWith('coarena||'))
  );
  const coarenaOptions = (options || []).filter((o) => o.value.startsWith('coarena||'));
  const first = coarenaOptions[0];

  if (!first) {
    console.log(JSON.stringify({ saved, options, consoleErrors }, null, 2));
    throw new Error('no Coarena models appeared in the dropdown');
  }

  await evaluate(ws, `window.freepi.setModel(${JSON.stringify(tabId)}, 'coarena', ${JSON.stringify(first.value.split('||')[1])})`, true);
  await sleep(1200);

  const switched = await evaluate(
    ws,
    `(() => {
       const sel = document.getElementById('modelSelect');
       return {
         adHidden: document.getElementById('adSlot').hidden,
         meterShown: !document.getElementById('providerUsage').hidden,
         freePiHidden: document.getElementById('freePiUsage').hidden,
         meterText: document.getElementById('providerMeterText').textContent,
         selected: sel.value,
         selectedLabel: sel.options[sel.selectedIndex]?.textContent || '',
       };
     })()`
  );

  const cleared = await evaluate(ws, `window.freepi.coarenaClearKey()`, true);
  await sleep(1500);

  const after = await evaluate(
    ws,
    `(() => {
       const sel = document.getElementById('modelSelect');
       const options = [...sel.options].map((o) => o.value);
       const notice = document.getElementById('notice');
       return {
         options,
         selected: sel.value,
         notice: notice.hidden ? '' : notice.textContent,
       };
     })()`
  );

  const report = {
    applied: saved?.applied === 1,
    coarenaCount: coarenaOptions.length,
    labelPrefix: Boolean(first && first.label.startsWith('Coarena · ')),
    adHidden: switched.adHidden === true,
    meterShown: switched.meterShown === true,
    freePiHidden: switched.freePiHidden === true,
    meterText: switched.meterText,
    meterHasLimit: /\/min/.test(switched.meterText || ''),
    selectedCoarena: String(switched.selected).startsWith('coarena||'),
    removedCount: (after.options || []).filter((v) => v.startsWith('coarena||')).length,
    switchedAway: !String(after.selected).startsWith('coarena||'),
    noticeShown: /Coarena/i.test(after.notice || ''),
    consoleErrors,
  };

  console.log(JSON.stringify(report, null, 2));
  ws.close();

  const ok =
    report.applied &&
    report.coarenaCount > 0 &&
    report.labelPrefix &&
    report.adHidden &&
    report.meterShown &&
    report.freePiHidden &&
    report.meterHasLimit &&
    report.selectedCoarena &&
    report.removedCount === 0 &&
    report.switchedAway &&
    report.noticeShown &&
    report.consoleErrors.length === 0;
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});
