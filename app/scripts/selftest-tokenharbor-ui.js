/**
 * End-to-end check for the Token Harbor key flow in the real window.
 *
 * Start the app first, in a throwaway profile:
 *   cd app
 *   Start-Process -FilePath "node_modules\electron\dist\electron.exe" -ArgumentList ".","--remote-debugging-port=9222","--user-data-dir=$env:TEMP\freepi-th-profile"
 *
 * Then:
 *   $env:TOKENHARBOR_KEY = (Get-Content "$env:TEMP\opencode\tokenharbor-key.txt" -Raw).Trim()
 *   node scripts/selftest-tokenharbor-ui.js
 */
'use strict';

const PORT = 9222;
const KEY = String(process.env.TOKENHARBOR_KEY || '').trim();

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
  if (res.exceptionDetails) {
    const detail = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    throw new Error(detail);
  }
  return res.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(ws, expression, ok, timeoutMs = 25000) {
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
    console.error('Set TOKENHARBOR_KEY first (see the header of this file).');
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

  const tab = await evaluate(
    ws,
    `(async () => {
       const list = await window.freepi.listTabs();
       if (list && list.length) return list[0];
       const opened = await window.freepi.openTab({ cwd: ${JSON.stringify(process.cwd())} });
       window.applyTabState(opened.state);
       return { tabId: opened.tabId };
     })()`,
    true
  );

  const saved = await evaluate(ws, `window.freepi.tokenharborSetKey(${JSON.stringify(KEY)})`, true);

  const options = await waitFor(
    ws,
    `[...document.getElementById('modelSelect').options].map((o) => ({ value: o.value, label: o.textContent }))`,
    (list) => Array.isArray(list) && list.some((o) => String(o.value).startsWith('tokenharbor||'))
  );
  const option = (options || []).find((o) => String(o.value).startsWith('tokenharbor||'));
  const modelId = option ? String(option.value).split('||')[1] : '';

  await evaluate(
    ws,
    `window.freepi.setModel(${JSON.stringify(tab.tabId)}, 'tokenharbor', ${JSON.stringify(modelId)})`,
    true
  );
  await sleep(1200);

  const switched = await evaluate(
    ws,
    `(() => {
       const sel = document.getElementById('modelSelect');
       return {
         adHidden: document.getElementById('adSlot').hidden,
         meterShown: !document.getElementById('providerUsage').hidden,
         freePiHidden: document.getElementById('freePiUsage').hidden,
         provider: document.getElementById('providerName').textContent,
         meterLabel: document.getElementById('providerMeterLabel').textContent,
         meterText: document.getElementById('providerMeterText').textContent,
         selected: sel.value,
       };
     })()`
  );

  const cleared = await evaluate(ws, `window.freepi.tokenharborClearKey()`, true);
  await sleep(1800);

  const after = await evaluate(
    ws,
    `(() => {
       const sel = document.getElementById('modelSelect');
       const notice = document.getElementById('notice');
       return {
         options: [...sel.options].map((o) => o.value),
         selected: sel.value,
         notice: notice.hidden ? '' : notice.textContent,
       };
     })()`
  );

  const report = {
    applied: saved?.applied === 1,
    modelMissing: saved?.modelMissing === true,
    optionPresent: Boolean(option),
    label: option?.label || '',
    labelOk: /^Token Harbor .* DeepSeek V4\.1 Flash/.test(option?.label || ''),
    adHidden: switched.adHidden === true,
    meterShown: switched.meterShown === true,
    freePiHidden: switched.freePiHidden === true,
    providerName: switched.provider,
    providerOk: switched.provider === 'Token Harbor',
    meterLabel: switched.meterLabel,
    meterText: switched.meterText,
    meterOk: /weekly|สัปดาห์/i.test(switched.meterText || ''),
    selectedTokenHarbor: String(switched.selected).startsWith('tokenharbor||'),
    removed: (after.options || []).filter((v) => String(v).startsWith('tokenharbor||')).length === 0,
    switchedAway: !String(after.selected).startsWith('tokenharbor||'),
    noticeShown: /Token Harbor/i.test(after.notice || ''),
    consoleErrors,
  };

  console.log(JSON.stringify(report, null, 2));
  ws.close();

  const ok =
    report.applied &&
    report.optionPresent &&
    report.labelOk &&
    report.adHidden &&
    report.meterShown &&
    report.freePiHidden &&
    report.providerOk &&
    report.meterOk &&
    report.selectedTokenHarbor &&
    report.removed &&
    report.switchedAway &&
    report.noticeShown &&
    report.consoleErrors.length === 0;
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});
