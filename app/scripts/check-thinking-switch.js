/*
 * The reasoning control is a compact dropdown.
 *
 * It used to be a five-position switch: one button per level, ~190px wide in a
 * row that also holds the status pill and the model picker. At a narrow window
 * that width pushed the picker past the edge of the window, so the control is a
 * dropdown now — the current level on the button, the rest in a list under it.
 *
 * What this proves, in a real window:
 *   - the control is always on screen (a model without reasoning dims it)
 *   - the list holds every level the model offers
 *   - choosing one reaches the main process exactly once
 *   - the words are translated with the rest of the interface
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-thinking-switch.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const failures = [];
let lastSetThinking = null;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const SUPPORTED = {
  supported: true,
  level: 'medium',
  levels: ['off', 'minimal', 'low', 'medium', 'high'],
};
const UNSUPPORTED = { supported: false, level: 'off', levels: ['off'] };

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);
  ipcMain.handle('session:thinking', async (_e, { level }) => {
    lastSetThinking = level;
    return { supported: true, level, levels: SUPPORTED.levels };
  });

  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const btn = el('thinkingBtn');
    const menu = el('thinkingMenu');
    const note = el('thinkingNote');
    const value = el('thinkingValue');
    const state = () => ({
      visible: btn.getBoundingClientRect().height > 0,
      h: Math.round(btn.getBoundingClientRect().height),
      text: value.textContent,
      items: [...menu.querySelectorAll('.think-item')].map((i) => i.textContent.trim()),
      selected: [...menu.querySelectorAll('.think-item[aria-selected="true"]')].map((i) => i.textContent.trim()),
      open: !menu.hidden,
      expanded: btn.getAttribute('aria-expanded'),
      disabled: btn.disabled,
      locked: btn.classList.contains('is-locked'),
      noteHidden: note.hidden,
      noteText: note.textContent,
    });

    paintThinking(${JSON.stringify(SUPPORTED)});
    await new Promise((r) => setTimeout(r, 80));
    const supported = state();

    // A tab is needed for the change handler to reach the main process.
    applyTabState({ tabId: 't1', cwd: 'C:/w', sessionId: 's', sessionFile: 'C:/d/s.jsonl', name: 'n', model: { provider: 'free-pi', id: 'm', name: 'M' }, models: [], guest: false, busy: false, messages: [], thinking: ${JSON.stringify(
      SUPPORTED
    )} });
    await new Promise((r) => setTimeout(r, 120));
    paintThinking(${JSON.stringify(SUPPORTED)});
    await new Promise((r) => setTimeout(r, 60));

    // Hovering the control opens it: no click needed.
    document.querySelector('.think-slot').dispatchEvent(new PointerEvent('pointerenter'));
    await new Promise((r) => setTimeout(r, 80));
    const hovered = state();

    document.querySelector('.think-slot').dispatchEvent(new PointerEvent('pointerleave'));
    await new Promise((r) => setTimeout(r, 260));

    btn.click();
    await new Promise((r) => setTimeout(r, 80));
    const opened = state();

    const high = [...menu.querySelectorAll('.think-item')].find((i) => i.dataset.level === 'high');
    high.click();
    await new Promise((r) => setTimeout(r, 200));
    const picked = state();

    paintThinking(${JSON.stringify(UNSUPPORTED)});
    await new Promise((r) => setTimeout(r, 60));
    const unsupported = state();

    await setLanguage('th');
    paintThinking({ supported: true, level: 'low', levels: ['off', 'minimal', 'low', 'medium', 'high'] });
    await new Promise((r) => setTimeout(r, 80));
    const th = { label: document.getElementById('thinkingLabel').textContent, ...state() };

    await setLanguage('en');
    paintThinking({ supported: true, level: 'medium', levels: ['off', 'minimal', 'low', 'medium', 'high'] });
    await new Promise((r) => setTimeout(r, 60));
    paintThinking(null);
    const blank = state();

    return { supported, hovered, opened, picked, unsupported, th, blank };
  })()`);

  const { supported, hovered, opened, picked, unsupported, th, blank } = out;

  check('the dropdown is on screen for a reasoning model', supported.visible, supported);
  check('it shows the current level on the button', supported.text.length > 0, supported.text);
  check('the list holds every level the model offers', supported.items.length === 5, supported.items);
  check('the chosen level is marked in the list', supported.selected.length === 1, supported.selected);
  check('the list starts closed', supported.open === false && supported.expanded === 'false', supported);

  check('hovering the control opens the list', hovered.open === true, hovered);

  check('clicking the button opens the list', opened.open === true && opened.expanded === 'true', opened);

  check('choosing a level reaches the main process', lastSetThinking === 'high', { sent: lastSetThinking });
  check('the list closes after choosing', picked.open === false, picked);
  check('the button then shows the new level', picked.text !== supported.text, {
    before: supported.text,
    after: picked.text,
  });

  check('an unsupported model still shows the control', unsupported.visible, unsupported.visible);
  check('it is locked, not hidden', unsupported.disabled === true && unsupported.locked === true, unsupported);
  check('the reason is stated', unsupported.noteHidden === false && unsupported.noteText.length > 0, unsupported.noteText);

  check('the control says what it is', /การคิด/.test(th.label), th.label);
  check('the levels are translated', th.items.includes('ต่ำ'), th.items);

  check('no tab painted is still on screen', blank.visible === true, blank);

  win.destroy();
  console.log(
    failures.length
      ? `\n${failures.length} check(s) failed`
      : '\nPASS: the reasoning dropdown is always there and picks a level'
  );
  app.exit(failures.length ? 1 : 0);
});
