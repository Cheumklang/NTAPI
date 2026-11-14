'use strict';

/**
 * The small window that covers the update gap.
 *
 * Updating replaces the running .exe, so the real app has to quit before the
 * installer can do its work. That leaves 20–60 seconds of nothing on screen,
 * and "nothing" reads as "it crashed, do I open it again?".
 *
 * This runs as a *separate* process (`NTAPI.exe --ntapi-splash`), so it survives
 * the main app quitting. It closes itself when the updated app starts (the app
 * kills it by pid), after six minutes if the install never finished, or when the
 * user clicks it.
 *
 * Never touches the single-instance lock: it asks for its own userData folder,
 * and main.js branches here before that lock is taken.
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, screen } = require('electron');

const SELF_CLOSE_MS = 6 * 60 * 1000;

function dataRoot() {
  return process.env.NTAPI_DATA_DIR || process.env.FREEPI_DATA_DIR || 'C:\\NTAPI';
}

/** The language the app is set to, read straight from prefs.json. */
function preferredLang() {
  try {
    const raw = fs.readFileSync(path.join(dataRoot(), 'prefs.json'), 'utf8');
    const lang = JSON.parse(raw)?.lang;
    return lang === 'th' ? 'th' : 'en';
  } catch {
    return 'en';
  }
}

/** Where the app looks for a leftover splash so it can close it on start. */
function pidFile() {
  return path.join(dataRoot(), 'update-splash.pid');
}

function run() {
  // Its own userData keeps this process out of the real app's instance lock.
  try {
    app.setPath('userData', path.join(app.getPath('temp'), 'ntapi-update-splash'));
  } catch {}

  // Must happen before `ready`, otherwise Electron throws and the whole splash
  // process dies before it draws anything — which is exactly the silent gap this
  // file exists to remove. A GPU crash while installing is not worth the risk.
  try {
    app.disableHardwareAcceleration();
  } catch {}

  app.whenReady().then(() => {
    let win;
    try {
      win = new BrowserWindow({
        width: 460,
        height: 190,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        backgroundColor: '#12131a',
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
    } catch {
      app.quit();
      return;
    }

    // Remember the pid so the updated app can close this window the moment it is
    // running, instead of leaving it floating over the user's desktop.
    try {
      fs.mkdirSync(path.dirname(pidFile()), { recursive: true });
      fs.writeFileSync(pidFile(), String(process.pid));
    } catch {}

    win.setMenu?.(null);
    win.loadFile(path.join(__dirname, 'renderer', 'update-splash.html'), {
      query: { lang: preferredLang() },
    });
    win.once('ready-to-show', () => {
      win.show();
      try {
        win.setAlwaysOnTop(true, 'screen-saver');
      } catch {}
      const area = screen.getPrimaryDisplay().workArea;
      win.setPosition(
        Math.round(area.x + (area.width - 460) / 2),
        Math.round(area.y + (area.height - 190) / 2)
      );
    });

    // Click or Esc closes it: the user is never stuck with a box they cannot move.
    win.on('closed', () => app.quit());
    ipcMain.handle('splash:close', () => app.quit());
    setTimeout(() => app.quit(), SELF_CLOSE_MS);
  });

  app.on('window-all-closed', () => app.quit());
}

module.exports = { run, pidFile, dataRoot, preferredLang };
