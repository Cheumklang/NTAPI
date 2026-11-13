/**
 * One-off CDP driver: check the running FreePi window from outside.
 * Prints JSON so a failure is obvious instead of "looks fine".
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
    ws.addEventListener('error', (e) => reject(new Error(`ws error: ${e.message || 'unknown'}`)));
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
  const res = await rpc(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result.value;
}

(async () => {
  const targets = await listTargets();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
  if (!page) throw new Error('no app page target');
  const ws = await connect(page.webSocketDebuggerUrl);

  const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  await rpc(ws, 'Runtime.enable');

  const preload = await evaluate(
    ws,
    `({ onAd: typeof window.freepi?.onAd, openAd: typeof window.freepi?.openAd, sendPrompt: typeof window.freepi?.sendPrompt })`
  );

  // Wait for the restored session(s) to fetch their ad.
  let ad = null;
  for (let i = 0; i < 40; i += 1) {
    ad = await evaluate(
      ws,
      `(() => { const s = document.getElementById('adSlot'); if (!s || s.hidden) return null;
        return { headline: s.querySelector('.ad-headline').textContent,
                 body: s.querySelector('.ad-text').textContent,
                 cta: s.querySelector('.ad-cta').textContent }; })()`
    );
    if (ad) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  const state = await evaluate(
    ws,
    `({
      tabs: document.querySelectorAll('#sessionList .session-item').length,
      title: document.getElementById('sessionTitle').value,
      errorBanners: [...document.querySelectorAll('.error-banner')].map((d) => d.textContent.slice(0, 120)),
      busy: !document.getElementById('stopBtn').hidden,
      status: document.getElementById('statusHint').textContent,
      sidebarSessions: document.querySelectorAll('#sessionList .session-item').length,
    })`
  );

  // Live render checks that do not spend credits.
  const render = await evaluate(
    ws,
    `(() => {
       renderAd({ ad_id: 'x', click_url: 'https://example.com', creative: { headline: 'Test headline', body: 'Test body', cta: 'Try' } });
       const s = document.getElementById('adSlot');
       const shown = { hidden: s.hidden, headline: s.querySelector('.ad-headline').textContent };
       s.hidden = true;
       return shown;
     })()`
  );

  // The ad click-through must refuse anything that is not https.
  const guard = await evaluate(ws, `window.freepi.openAd('javascript:alert(1)')`, true);

  console.log(JSON.stringify({ preload, ad, state, render, guard, consoleErrors }, null, 2));
  ws.close();
  process.exit(ad && guard && guard.ok === false ? 0 : 1);
})().catch((err) => {
  console.error('DRIVER FAIL:', err.message);
  process.exit(1);
});