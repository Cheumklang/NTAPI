#!/usr/bin/env node
/*
 * About has to be able to open the legal documents from inside the program.
 *
 * The offline test proves the files and the wiring exist; this one proves the
 * buttons are on screen and that pressing one asks the main process for the right
 * document. The IPC is stubbed, so nothing opens on the machine running the test.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const opened = [];
let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('settings:get', async () => ({}));
  ipcMain.handle('budget:get', async () => null);
  ipcMain.handle('mcp:list', async () => []);
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0.0.0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('app:openDoc', async (_e, name) => {
    opened.push(String(name));
    return { ok: true };
  });

  const win = new BrowserWindow({
    show: true,
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));

  // The overlay is what a person actually opens, so the test opens it the same
  // way — and in two steps, because the dialog is built asynchronously: the
  // section tabs are not ready in the same turn as the button that opens it.
  await win.webContents.executeJavaScript(`
    document.getElementById('settingsBtn')?.click();
    true;
  `);
  await new Promise((r) => setTimeout(r, 900));
  await win.webContents.executeJavaScript(`
    document.getElementById('settingsTabAbout')?.click();
    true;
  `);
  await new Promise((r) => setTimeout(r, 500));

  const state = await win.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll('.about-legal-links .link-btn')];
      return {
        labels: buttons.map((b) => b.textContent.trim()),
        docs: buttons.map((b) => b.dataset.doc),
        visible: buttons.map((b) => b.getBoundingClientRect().width > 0),
        copyright: (document.getElementById('aboutCopyright')?.textContent || '').trim(),
        focusable: buttons.every((b) => b.tagName === 'BUTTON' && !b.disabled),
      };
    })()
  `);

  const wanted = ['TERMS.md', 'PRIVACY.md', 'LICENSE', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md'];
  check('every legal document has a button in About', wanted.every((d) => state.docs.includes(d)), state.docs);
  check('each button is on screen, not hidden', state.visible.every(Boolean), state.visible);
  check('each button is a real, enabled button', state.focusable === true);
  check('each button is named in words, not a file name', state.labels.every((l) => l.length > 3 && !/\.md$/.test(l)), state.labels);
  check('the copyright line is shown', /© 2026/.test(state.copyright), state.copyright);

  // Press every button: the main process must be asked for that same document.
  for (const doc of wanted) {
    await win.webContents.executeJavaScript(`
      document.querySelector('.about-legal-links .link-btn[data-doc="${doc}"]').click();
      true;
    `);
  }
  await new Promise((r) => setTimeout(r, 300));
  check('pressing a button asks for that document', wanted.every((d) => opened.includes(d)), opened);
  check('no button asks for anything else', opened.every((d) => wanted.includes(d)), opened);

  console.log(`\n${fail ? `${fail} check(s) failed` : `${pass} checks passed`}`);
  app.exit(fail ? 1 : 0);
});
