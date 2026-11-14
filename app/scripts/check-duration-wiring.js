'use strict';

/**
 * Prove the real renderer bundle reports Thai durations, not milliseconds.
 *
 * app.js needs the preload API and will throw when loaded bare; that is fine —
 * duration.js runs first and is what this checks. The point is to catch the
 * case where the script tag is missing or ordered after app.js, which silently
 * degrades every tool card back to "9150 ms".
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-duration-wiring.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  win.webContents.on('did-fail-load', (e, code, desc, url) => console.log('[fail]', code, desc, url));
  win.webContents.on('preload-error', (e, f, err) => console.log('[preload]', f, err.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  const probe = await win.webContents.executeJavaScript(`
    ({
      fpduration: typeof globalThis.FPDuration,
      fperrors: typeof globalThis.FPErrorMessages,
      md: typeof globalThis.MD,
      provider: typeof globalThis.FPProvider,
      keys: Object.getOwnPropertyNames(globalThis).filter((k) => /^(FP|MD)/.test(k)),
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || null,
    })
  `);
  console.log('probe:', probe);

  const out = await win.webContents.executeJavaScript(`
    ({
      loaded: typeof globalThis.FPDuration,
      errors: typeof globalThis.FPErrorMessages,
      scripts: [...document.scripts].map((s) => s.src.split('/').pop()),
      ms: globalThis.FPDuration ? globalThis.FPDuration.formatDuration(9150, 'th') : null,
      short: globalThis.FPDuration ? globalThis.FPDuration.formatDuration(86, 'th') : null,
      notice: globalThis.FPErrorMessages
        ? globalThis.FPErrorMessages.messageFor('notice.switched', 'th', { from: 'A', to: 'B' })
        : null,
      long: globalThis.FPDuration ? globalThis.FPDuration.formatDuration(1154000, 'th') : null,
      en: globalThis.FPDuration ? globalThis.FPDuration.formatDuration(9150, 'en') : null,
    })
  `);
  console.log(out);

  const ok =
    out.loaded === 'object' &&
    out.ms === '9.2 วินาที' &&
    out.short === '86 มิลลิวินาที' &&
    out.long === '19 นาที 14 วินาที' &&
    out.en === '9.2 sec' &&
    typeof out.notice === 'string' &&
    /[฀-๿]/.test(out.notice);
  console.log(
    ok
      ? 'PASS: the renderer formats durations and failures in Thai'
      : 'FAIL: the shared modules are not wired into the renderer'
  );
  app.exit(ok ? 0 : 1);
});
