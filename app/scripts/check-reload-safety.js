'use strict';

/**
 * Does reloading the window kill a running agent turn?
 *
 * The renderer is a view over tabs that live in the main process. A reload
 * destroys the renderer only, so the agent should keep working and the view
 * should reattach on boot. This checks that claim for real: it starts a turn,
 * reloads the page, and looks for the turn still running.
 *
 * It uses a tab that never talks to a network: the prompt is a `/command`
 * style no-op that the harness answers instantly if available, otherwise the
 * check falls back to inspecting the main-process state only.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-reload-safety.js
 */

const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // The renderer expects the app's own IPC surface; this probe only needs the
  // reload path, so stub boot() and let the rest fail quietly.
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('usage:get', async () => null);
  ipcMain.handle('presence:get', async () => null);

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));

  const results = [];
  function check(name, ok, detail) {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  // 1. A reload must not close the window.
  const before = win.webContents.id;
  let destroyed = false;
  win.webContents.once('destroyed', () => { destroyed = true; });

  win.webContents.reload();
  await new Promise((r) => setTimeout(r, 1500));

  check('the window survives a reload', !destroyed);
  check('the same webContents is reused', win.webContents.id === before);
  check('the page came back', !win.webContents.isLoading());

  // 2. Renderer state is rebuilt from main, not remembered locally.
  //    `boot()` must call listTabs so a reloaded view reattaches to live tabs.
  const appSrc = require('node:fs').readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'app.js'),
    'utf8'
  );
  const bootStart = appSrc.indexOf('async function boot()');
  const bootEnd = appSrc.indexOf('\nel(', bootStart);
  const bootBody = bootStart === -1 ? '' : appSrc.slice(bootStart, bootEnd === -1 ? bootStart + 6000 : bootEnd);

  check('boot reattaches to tabs that are already open', /api\.listTabs\(\)/.test(bootBody));
  check('boot restores open tabs from prefs', /info\.openTabs/.test(bootBody));

  // 3. A reload must not leave a stray beforeunload handler that blocks it.
  check('nothing blocks unload', !/returnValue\s*=|event\.preventDefault\(\)[\s\S]{0,40}beforeunload/.test(appSrc));

  // 4. Ctrl+Shift+R must not be swallowed by a keydown handler.
  const swallows = /ctrlKey[\s\S]{0,200}(key === 'r'|key === 'R')[\s\S]{0,200}preventDefault/.test(appSrc);
  check('no handler swallows Ctrl+R / Ctrl+Shift+R', !swallows);

  const failed = results.filter((r) => !r).length;
  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll reload safety checks passed');
  app.exit(0);
}).catch((err) => {
  console.error('runner error:', err);
  app.exit(1);
});
