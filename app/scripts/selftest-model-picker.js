/**
 * Visual check of the grouped model picker in a throwaway app instance.
 * Launches its own Electron with a temp data dir; never touches a running app.
 * Run: node scripts/selftest-model-picker.js
 */
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const ELECTRON = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = 9333;
const OUT_DIR = path.join(APP_DIR, 'shots-model-picker');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  }
  return res.result.value;
}

async function waitFor(ws, expression, ok, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(ws, expression, true);
    if (ok(last)) return last;
    await sleep(400);
  }
  return last;
}

/** A catalog shaped exactly like handle.modelList, for the offline render. */
const FAKE_CATALOG = `
  (() => {
    const free = [
      { provider: 'free-pi', id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
      { provider: 'free-pi', id: 'deepseek-v4.1-pro', name: 'DeepSeek V4.1 Pro' },
      { provider: 'free-pi', id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B' },
      { provider: 'free-pi-defense', id: 'defense-guard-1', name: 'Defense Guard 1' },
    ];
    const coarena = [
      { provider: 'coarena', id: 'claude-fable-5', name: 'Claude Fable 5' },
      { provider: 'coarena', id: 'gemini-4-argon', name: 'Gemini 4 Argon' },
      { provider: 'coarena', id: 'kimi-k3-1-pro', name: 'Kimi K3.1 Pro' },
    ];
    const zro = [{ provider: 'zro', id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }];
    return { models: [...free, ...coarena, ...zro], model: free[0] };
  })()
`;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // The temp profile persists between runs; wipe it so a star left by an
  // earlier run cannot change what this run sees.
  fs.rmSync(path.join(os.tmpdir(), 'freepi-picker-test'), { recursive: true, force: true });

  const child = spawn(
    ELECTRON,
    [
      APP_DIR,
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${path.join(os.tmpdir(), 'freepi-picker-test')}`,
    ],
    { stdio: 'ignore', env: { ...process.env, NTAPI_DATA_DIR: path.join(OUT_DIR, 'data') } }
  );

  let ws = null;
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i += 1) {
      await sleep(600);
      try {
        const targets = await listTargets();
        page = targets.find((t) => t.type === 'page' && t.url.includes('index.html'));
      } catch {}
    }
    if (!page) throw new Error('app window never appeared');

    ws = await connect(page.webSocketDebuggerUrl);
    await rpc(ws, 'Runtime.enable');
    // A window that never got OS focus reports no activeElement, which would
    // make the search-focus assertion meaningless. Emulate focus instead.
    try {
      await rpc(ws, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      await rpc(ws, 'Page.bringToFront');
    } catch {}

    // The renderer must have booted and exposed the picker functions before the
    // offline catalog can be pushed through the real render path.
    await waitFor(
      ws,
      `typeof renderModelPicker === 'function' && Boolean(document.getElementById('modelPickerBtn'))`,
      (ok) => ok === true,
      20000
    );

    // No tab in a fresh profile means no catalog from main; feed the real
    // render function a catalog with FreePi + Coarena + Zro so the grouping,
    // logos, search and selection can be checked without any network call.
    const catalog = await evaluate(ws, FAKE_CATALOG, false);
    await evaluate(
      ws,
      `(() => {
         renderModelPicker(${JSON.stringify(catalog)});
         return true;
       })()`,
      true
    );
    await sleep(250);

    const trigger = await evaluate(
      ws,
      `(() => {
         const btn = document.getElementById('modelPickerBtn');
         return {
           disabled: btn.disabled,
           provider: document.getElementById('modelPickerProvider').textContent,
           name: document.getElementById('modelPickerName').textContent,
           logo: Boolean(document.querySelector('#modelPickerMark img')),
           logoOk: document.querySelector('#modelPickerMark img')?.complete !== false,
           hiddenSelect: document.getElementById('modelSelect').hidden,
           selectValue: document.getElementById('modelSelect').value,
         };
       })()`,
      true
    );

    await evaluate(ws, `document.getElementById('modelPickerBtn').click()`, true);
    await sleep(400);

    const open = await evaluate(
      ws,
      `(() => {
         const groups = [...document.querySelectorAll('.model-group')].map((g) => ({
           label: g.querySelector('.model-group-name')?.textContent || '',
           count: g.querySelectorAll('.model-option').length,
           logo: Boolean(g.querySelector('.model-group-mark img')),
           logoOk: g.querySelector('.model-group-mark img')?.complete !== false,
         }));
         const options = [...document.querySelectorAll('.model-option')].map((o) => ({
           value: o.dataset.value,
           name: o.querySelector('.model-option-name')?.textContent || '',
           selected: o.getAttribute('aria-selected') === 'true',
         }));
         return {
           menuHidden: document.getElementById('modelMenu').hidden,
           expanded: document.getElementById('modelPickerBtn').getAttribute('aria-expanded'),
           groups,
           optionCount: options.length,
           options,
           focused: document.activeElement?.id || '',
           searchPlaceholder: document.getElementById('modelSearch').placeholder,
         };
       })()`,
      true
    );

    // Star a model: it must appear in a Favorites folder on top and persist.
    await evaluate(
      ws,
      `(() => {
         const star = document.querySelector('.model-option[data-id="claude-fable-5"]')
           ?.closest('.model-row')?.querySelector('.model-star');
         star?.click();
         return true;
       })()`,
      true
    );
    await sleep(200);
    const favorite = await evaluate(
      ws,
      `(() => {
         const fav = [...document.querySelectorAll('.model-group')].find((g) => g.classList.contains('model-group-fav'));
         const row = document.querySelector('.model-option[data-id="claude-fable-5"]');
         return {
           favLabel: fav?.querySelector('.model-group-name')?.textContent || '',
           favCount: fav?.querySelectorAll('.model-option').length || 0,
           starOn: Boolean(row?.closest('.model-row')?.querySelector('.model-star.on')),
           stored: localStorage.getItem('ntapi.favoriteModels') || '',
         };
       })()`,
      true
    );

    // Hovering a row shows the provider bubble with its logo, not a native title.
    const tip = await evaluate(
      ws,
      `(() => {
         const row = document.querySelector('.model-option');
         row.dispatchEvent(new Event('pointerover', { bubbles: true }));
         const t = document.getElementById('modelTip');
         return { hidden: t.hidden, hasLogo: Boolean(t.querySelector('img')), text: t.textContent };
       })()`,
      true
    );

    const shotOpen = await rpc(ws, 'Page.captureScreenshot', { format: 'png' });
    const openPath = path.join(OUT_DIR, 'picker-open.png');
    fs.writeFileSync(openPath, Buffer.from(shotOpen.data, 'base64'));

    // Search narrows the flat list while keeping group headers truthful.
    await evaluate(
      ws,
      `(() => {
         const s = document.getElementById('modelSearch');
         s.value = 'zro';
         s.dispatchEvent(new Event('input', { bubbles: true }));
       })()`,
      true
    );
    await sleep(200);
    const filtered = await evaluate(
      ws,
      `(() => ({
         visible: [...document.querySelectorAll('.model-row')].filter((o) => !o.hidden).length,
         groupsVisible: [...document.querySelectorAll('.model-group')].filter((g) => !g.hidden).length,
         emptyHidden: document.getElementById('modelMenuEmpty').hidden,
       }))()`,
      true
    );

    await evaluate(
      ws,
      `(() => {
         const s = document.getElementById('modelSearch');
         s.value = 'zzzz';
         s.dispatchEvent(new Event('input', { bubbles: true }));
       })()`,
      true
    );
    await sleep(150);
    const noMatch = await evaluate(
      ws,
      `(() => ({
         visible: [...document.querySelectorAll('.model-row')].filter((o) => !o.hidden).length,
         emptyHidden: document.getElementById('modelMenuEmpty').hidden,
         emptyText: document.getElementById('modelMenuEmpty').textContent,
       }))()`,
      true
    );

    // Esc must close and hand focus back to the trigger.
    await evaluate(ws, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`, true);
    await sleep(200);
    const closed = await evaluate(
      ws,
      `(() => ({
         hidden: document.getElementById('modelMenu').hidden,
         focus: document.activeElement?.id || '',
         expanded: document.getElementById('modelPickerBtn').getAttribute('aria-expanded'),
       }))()`,
      true
    );

    // A paid model selected as current must badge the trigger as paid, not free.
    // `view.model` is only id/name; the plan lives on the catalog entry, so the
    // trigger has to look it up rather than read the bare model's missing plan.
    const paidCatalog = await evaluate(
      ws,
      `(() => ({
         models: [
           { provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', plan: 'paid', planNote: '$0.30/$1.20' },
         ],
         model: { provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' },
       }))()`,
      false
    );
    await evaluate(ws, `renderModelPicker(${JSON.stringify(paidCatalog)}); true`, true);
    await sleep(200);
    const paidBadge = await evaluate(
      ws,
      `(() => {
         const p = document.getElementById('modelPickerPlan');
         return { hidden: p.hidden, text: p.textContent, cls: p.className };
       })()`,
      true
    );

    const report = {
      trigger,
      menuOpen: open.menuHidden === false && open.expanded === 'true',
      searchFocused: open.focused === 'modelSearch',
      searchPlaceholder: open.searchPlaceholder,
      groups: open.groups,
      optionCount: open.optionCount,
      selectedMarks: open.options.filter((o) => o.selected).map((o) => o.value),
      favorite,
      tip,
      searchZro: filtered,
      searchNoMatch: noMatch,
      esc: closed,
      paidBadge,
      screenshots: [openPath],
    };
    console.log(JSON.stringify(report, null, 2));

    const ok =
      trigger.disabled === false &&
      trigger.provider === 'FreePi' &&
      trigger.logo === true &&
      trigger.hiddenSelect === true &&
      report.menuOpen &&
      report.searchFocused &&
      report.groups.length === 3 &&
      report.groups[0].label === 'Coarena' &&
      report.groups[1].label === 'FreePi' &&
      report.groups[1].count === 4 &&
      report.groups[2].label === 'Zro' &&
      report.groups.every((g) => g.logo) &&
      report.optionCount === 8 &&
      report.selectedMarks.length === 1 &&
      report.favorite.favLabel === 'Favorites' &&
      report.favorite.favCount === 1 &&
      report.favorite.starOn === true &&
      report.favorite.stored.includes('coarena||claude-fable-5') &&
      report.tip.hidden === false &&
      report.tip.hasLogo === true &&
      filtered.visible === 1 &&
      filtered.groupsVisible === 1 &&
      noMatch.visible === 0 &&
      noMatch.emptyHidden === false &&
      closed.hidden === true &&
      closed.expanded === 'false' &&
      closed.focus === 'modelPickerBtn' &&
      paidBadge.hidden === false &&
      paidBadge.cls.includes('paid') &&
      paidBadge.text === '$0.30/$1.20';
    process.exitCode = ok ? 0 : 1;
  } catch (err) {
    console.error('PICKER FAIL:', err.message);
    process.exitCode = 1;
  } finally {
    if (ws) try { ws.close(); } catch {}
    child.kill();
    await sleep(500);
    child.kill('SIGKILL');
  }
})().catch((err) => {
  console.error('PICKER FAIL:', err.message);
  process.exit(1);
});
