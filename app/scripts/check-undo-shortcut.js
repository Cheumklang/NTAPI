#!/usr/bin/env node
/*
 * Ctrl+Z belongs to the text field, not to the program.
 *
 * The composer is where people type, and Ctrl+Z is the shortcut every Windows text
 * field honours. Binding it to "undo the last message and the work that followed it"
 * made an ordinary typo fix destructive: one wrong press rolled back a whole turn —
 * sometimes while a turn was still running. This test presses the key the way a
 * person would and asserts nothing outside the text changed.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let pass = 0;
let fail = 0;
const calls = [];
function check(name, ok, detail) {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

setTimeout(() => {
  console.log('FAIL the test did not finish in 90s');
  app.exit(1);
}, 90000);

app.whenReady().then(async () => {
  const stub = async () => ({});
  for (const ch of [
    'app:boot', 'win:state', 'tab:list', 'session:list', 'settings:get', 'sponsor:get',
    'budget:get', 'mcp:list', 'account:status', 'app:openDoc',
  ]) {
    ipcMain.handle(ch, ch === 'app:boot'
      ? async () => ({ prefs: {}, openTabs: [], version: '0.0.0' })
      : stub);
  }
  // Every route to the destructive action passes through these two.
  ipcMain.handle('agent:undo', async () => {
    calls.push('undo');
    return { ok: true, entryId: 'e1' };
  });
  ipcMain.handle('agent:redo', async () => {
    calls.push('redo');
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

  // Wrapped in a function: the page's own script declares `el` at top level, and a
  // second top-level `const el` here would throw before the test ever starts.
  const type = async (text) => {
    await win.webContents.executeJavaScript(`
      (() => {
        const box = document.getElementById('input');
        box.focus();
        box.value = ${JSON.stringify(text)};
        box.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `);
  };
  // Synthetic KeyboardEvents rather than native input: the point is which handler
  // claims the key, and a real key press needs a focused OS window the test machine
  // may not have.
  const pressKey = async (key, { shift = false } = {}) => {
    await win.webContents.executeJavaScript(`
      document.getElementById('input').dispatchEvent(new KeyboardEvent('keydown', {
        key: ${JSON.stringify(key)}, ctrlKey: true, shiftKey: ${shift}, bubbles: true,
      }));
      true;
    `);
    await new Promise((r) => setTimeout(r, 150));
  };
  const pressCtrlZ = async () => pressKey('z');
  const pressCtrlShiftZ = async () => pressKey('z', { shift: true });
  const composer = () => win.webContents.executeJavaScript("document.getElementById('input').value");

  // 1. Empty composer: the old binding fired here. Nothing may happen now.
  await type('');
  await pressCtrlZ();
  check('Ctrl+Z on an empty composer does not undo a message', calls.length === 0, calls);

  // 2. Text in the composer: the key must reach the text field, not the app.
  await type('hello world');
  await pressCtrlZ();
  check('Ctrl+Z in a filled composer does not undo a message', calls.length === 0, calls);
  const after = await composer();
  check('the composer still holds what was typed', after === 'hello world', after);

  // 3. Shift+Ctrl+Z had the same problem in the other direction.
  await pressCtrlShiftZ();
  check('Ctrl+Shift+Z does not redo a message', calls.length === 0, calls);

  // 4. The action itself is still there, on the button and in the palette.
  const state = await win.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('undoBtn');
      return {
        exists: Boolean(btn),
        title: (btn?.title || ''),
        palette: typeof window.openPalette === 'function' || Boolean(document.getElementById('palette')),
      };
    })()
  `);
  check('the undo button is still in the composer', state.exists === true);
  check('its tooltip no longer advertises a shortcut', !/ctrl\+z/i.test(state.title), state.title);
  check('the palette is still there as the discoverable route', state.palette === true);

  const source = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  check('no global Ctrl+Z binding is left in the renderer', !/key === 'z'/.test(source));
  const html = require('node:fs').readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  check('no label advertises Ctrl+Z', !/Ctrl\+Z/i.test(html));
  const hints = (source.match(/hint: 'Ctrl\+Z'/g) || []).length;
  check('the palette does not show Ctrl+Z as the hint', hints === 0, hints);

  win.destroy();
  console.log(`\n${fail ? `${fail} check(s) failed` : `${pass} checks passed`}`);
  app.exit(fail ? 1 : 0);
});
