#!/usr/bin/env node
/*
 * Draw the token panel with sample figures and capture it, so the layout can be
 * looked at without clicking through a real conversation.
 *
 * This is a development aid, not a test: it always exits 0 and writes
 * `shots/token-panel-preview.png`. Run from app/:
 *
 *   npx electron scripts/shot-status-tokens.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { usageTotals } = require(path.join(__dirname, '..', 'src', 'usage-totals.js'));

const OUT = path.join(__dirname, '..', '..', 'shots', 'token-panel-preview.png');

/*
 * Sample figures built through the real accounting, not typed in by hand: a
 * preview that computes its own numbers keeps showing what the app will show.
 * Five turns of a chat that grows, so the comparison has something to say.
 */
const TURNS = [
  [900, 610, 12000],
  [820, 430, 16000],
  [1240, 780, 21000],
  [1100, 690, 24000],
  [2418, 5321, 96412],
];
const SAMPLE = usageTotals(
  TURNS.flatMap(([input, output, cacheRead]) => [
    { role: 'user' },
    {
      role: 'assistant',
      usage: { input, output, cacheRead, cacheWrite: 0, reasoning: 0, cost: { total: 0, totalFromProvider: false } },
    },
  ]),
  { free: true },
);

app.whenReady().then(async () => {
  ipcMain.handle('settings:get', async () => ({}));
  ipcMain.handle('budget:get', async () => null);
  ipcMain.handle('mcp:list', async () => []);
  ipcMain.handle('app:boot', async () => ({
    prefs: { termsAccepted: '2026-11-17', guideDone: true, lang: 'th' },
    openTabs: [],
    lastCwd: null,
    version: '0.5.15',
    lang: 'th',
  }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('presence:get', async () => ({ online: 1 }));
  ipcMain.handle('fx:usdThb', async () => ({ rate: 36.2, at: Date.now() }));

  const win = new BrowserWindow({
    show: true,
    width: 900,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  await win.webContents.executeJavaScript(`
    applyTabState({
      tabId: 'preview',
      cwd: 'C:/demo',
      name: 'demo',
      messages: [],
      usage: ${JSON.stringify(SAMPLE)},
    });
    document.getElementById('statusPill').click();
    true;
  `);
  await new Promise((r) => setTimeout(r, 600));

  const box = await win.webContents.executeJavaScript(`
    (() => {
      const r = document.getElementById('statusPopover').getBoundingClientRect();
      return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    })()
  `);
  const image = await win.capturePage({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, image.toPNG());
  console.log(`${OUT} ${box.width}x${box.height}`);
  app.exit(0);
});