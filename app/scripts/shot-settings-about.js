'use strict';

/**
 * Screenshot the Settings > About panel, for eyeballing layout only.
 *
 * Not part of the test suite: it renders one frame to a PNG so the update block
 * can be looked at after a styling change. Run from app/:
 *   node_modules/electron/dist/electron.exe scripts/shot-settings-about.js [out.png] [lang]
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

const out = process.argv[2] || path.join(__dirname, '.shot-about.png');
const language = process.argv[3] || 'th';

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: true,
      x: 40,
      y: 40,
      width: 1120,
      height: 900,
      webPreferences: {
        preload: path.join(__dirname, '..', 'src', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 700));

    await win.webContents.executeJavaScript(`(async () => {
      lang = '${language}';
      applyLanguage();
      // openSettings() talks to the main process, which this harness does not have,
      // so the dialog is forced open afterwards instead of being clicked twice.
      try { await openSettings(); } catch {}
      const dlg = document.querySelector('.settings-dialog');
      const overlay = dlg && dlg.closest('.overlay');
      if (overlay) overlay.hidden = false;
      showSettingsSection('about');
      return !!(dlg && overlay);
    })()`);
    await new Promise((r) => setTimeout(r, 400));
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('settingsTabAbout').click();
      // A version number and a status line, so the card is seen with its content.
      document.getElementById('updateVersion').textContent = '0.5.2';
      document.getElementById('updateStatus').textContent =
        lang === 'th' ? 'ตรวจสอบอัปเดตเมื่อคุณกดเท่านั้น' : 'Updates are only checked when you ask.';
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 400));

    const panel = await win.webContents.executeJavaScript(
      "JSON.stringify(document.getElementById('settingsPanelAbout').getBoundingClientRect())",
    );
    console.log('panel', panel);

    const img = await win.capturePage();
    fs.writeFileSync(out, img.toPNG());
    console.log('wrote', out, fs.statSync(out).size, 'bytes');
    win.destroy();
    app.quit();
  })
  .catch((err) => {
    console.error('shot failed:', err && err.stack ? err.stack : err);
    app.exit(1);
  });
