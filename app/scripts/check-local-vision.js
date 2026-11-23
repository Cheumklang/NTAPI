'use strict';

/**
 * The picture control and the local model's card, in the real window.
 *
 * What is checked: the control says where a picture goes, offers exactly three
 * routes, refuses "this machine" until the model is installed, remembers the
 * choice, and the tile carries a tick only while the local server is actually
 * running. Two screenshots (dark, light) show the menu as drawn.
 *
 * Run: electron scripts/check-local-vision.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

/** What the stubbed main process says about the local model, per run. */
let llama = { phase: 'idle', enabled: true, installed: false, running: false, port: null, model: 'm.gguf', progress: null, error: null };
const switchCalls = [];
let visionMode = 'model';
const savedModes = [];

const emptyKey = { configured: false, readable: false, encrypted: false, hint: null };

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0.0.0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);
  ipcMain.handle('providers:key-health', async () => []);
  ipcMain.handle('llamacpp:status', async () => llama);
  ipcMain.handle('llamacpp:setup', async () => ({ ok: true, status: llama }));
  // The one switch: it answers with the status the card then paints.
  ipcMain.handle('llamacpp:setEnabled', async (_e, { enabled } = {}) => {
    switchCalls.push(enabled !== false);
    llama = { ...llama, enabled: enabled !== false, running: enabled !== false && llama.installed };
    return { ok: true, status: llama };
  });
  ipcMain.handle('llamacpp:cancel', async () => llama);
  ipcMain.handle('vision:get', async () => visionMode);
  ipcMain.handle('vision:set', async (_e, { mode } = {}) => {
    visionMode = mode;
    savedModes.push(mode);
    return { ok: true, mode };
  });
  ipcMain.handle('settings:get', async () => ({
    dataRoot: '/tmp',
    coarena: emptyKey,
    zro: emptyKey,
    nvidia: emptyKey,
    tokenharbor: emptyKey,
    llm7: emptyKey,
    deepseek: emptyKey,
    anthropic: emptyKey,
    google: emptyKey,
    zai: emptyKey,
    openrouter: emptyKey,
    cloudflare: emptyKey,
    visionMode,
    llamacpp: llama,
  }));

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    x: 40,
    y: 40,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  const indexFile = path.join(__dirname, '..', 'src', 'renderer', 'index.html');

  const load = async () => {
    await win.loadFile(indexFile);
    await new Promise((r) => setTimeout(r, 700));
  };

  const read = () =>
    win.webContents.executeJavaScript(`(() => {
      const btn = el('visionBtn');
      const menu = el('visionMenu');
      if (!btn || !menu) return { missing: true };
      setVisionMenu(true);
      const rows = [...menu.querySelectorAll('.vision-item')].map((r) => ({
        mode: r.dataset.mode,
        name: r.querySelector('.vision-item-name')?.textContent.trim() || '',
        hint: r.querySelector('.vision-item-hint')?.textContent.trim() || '',
        disabled: r.disabled,
        checked: r.getAttribute('aria-checked'),
        height: Math.round(r.getBoundingClientRect().height),
        hintSize: parseFloat(getComputedStyle(r.querySelector('.vision-item-hint')).fontSize),
      }));
      const tile = document.querySelector('.provider-tile[data-provider="llamacpp"]');
      return {
        value: el('visionValue')?.textContent.trim() || '',
        expanded: btn.getAttribute('aria-expanded'),
        rows,
        menuRect: (() => { const r = menu.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
        tileTick: tile ? getComputedStyle(tile.querySelector('.provider-tile-tick')).display !== 'none' : null,
        tileName: tile ? tile.querySelector('.provider-tile-name').textContent.trim() : null,
      };
    })()`);

  // --- not installed -----------------------------------------------------
  await load();
  const fresh = await read();
  check('the picture control is on screen', !fresh.missing, fresh);
  check('it starts on the model route', fresh.value.length > 0 && fresh.rows.length === 3, fresh.value);
  check('three routes only: model, machine, off', JSON.stringify(fresh.rows.map((r) => r.mode)) === JSON.stringify(['model', 'local', 'off']), fresh.rows.map((r) => r.mode));
  const localRow = fresh.rows.find((r) => r.mode === 'local');
  check('the machine route is refused until installed', localRow.disabled === true, localRow);
  check('it says why instead of failing later', /install/i.test(localRow.hint), localRow.hint);
  check('every route carries its price', fresh.rows.every((r) => r.hint.length > 10), fresh.rows.map((r) => r.hint));
  check('the current route is marked chosen', fresh.rows.filter((r) => r.checked === 'true').length === 1, fresh.rows.map((r) => r.checked));
  check('the menu is wide enough for the hints', fresh.menuRect.w >= 240, fresh.menuRect);
  check('hint text stays small but legible', fresh.rows[0].hintSize >= 10.5, fresh.rows[0].hintSize);
  check('the local tile is named', fresh.tileName === 'llama.cpp', fresh.tileName);
  check('an uninstalled local model has no tick', fresh.tileTick === false, fresh.tileTick);

  // Choosing a route persists it.
  await win.webContents.executeJavaScript(`document.querySelector('.vision-item[data-mode="off"]').click(); true`);
  await new Promise((r) => setTimeout(r, 200));
  const afterOff = await read();
  check('choosing a route saves it', savedModes.includes('off'), savedModes);
  check('the button shows the chosen route', afterOff.rows.find((r) => r.mode === 'off').checked === 'true', afterOff.rows);

  // Screenshots of the menu as drawn, both themes.
  const shots = path.join(__dirname, '..', '..', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = '${theme}'; el('termsOverlay').hidden = true; setVisionMenu(true); true`);
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(shots, `vision-menu-${theme}.png`), image.toPNG());
  }

  // --- installed and running --------------------------------------------
  llama = { phase: 'running', enabled: true, installed: true, running: true, port: 44815, model: 'm.gguf', progress: null, error: null };
  await load();
  const live = await read();
  const liveLocal = live.rows.find((r) => r.mode === 'local');
  check('an installed model can be chosen', liveLocal.disabled === false, liveLocal);
  check('its hint says what it costs', /GPU|machine/i.test(liveLocal.hint), liveLocal.hint);
  check('a running local model carries the tile tick', live.tileTick === true, live.tileTick);

  const card = await win.webContents.executeJavaScript(`(async () => {
    const overlay = el('settingsOverlay');
    overlay.hidden = false;
    const terms = el('termsOverlay');
    if (terms) terms.hidden = true;
    showSettingsSection('providers');
    selectProviderTile('llamacpp');
    paintLlamaCppSettings();
    await new Promise((r) => setTimeout(r, 200));
    return {
      open: [...document.querySelectorAll('#providerDetail .provider-card')].filter((c) => !c.hidden).map((c) => c.dataset.provider),
      status: el('llamacppStatus')?.textContent.trim() || '',
      installHidden: el('llamacppInstall')?.hidden,
      switchOn: el('llamacppEnabled')?.checked,
      switchDisabled: el('llamacppEnabled')?.disabled,
      startButton: Boolean(el('llamacppStart')),
      stopButton: Boolean(el('llamacppStop')),
      switchText: document.querySelector("#llamacppRow .slide-switch span")?.textContent.trim() || "",
      switchAppearance: getComputedStyle(el("llamacppEnabled")).appearance,
      switchWidth: Math.round(el("llamacppEnabled").getBoundingClientRect().width),
      switchHeight: Math.round(el("llamacppEnabled").getBoundingClientRect().height),
    };
  })()`);
  check('the tile opens the local model card', JSON.stringify(card.open) === JSON.stringify(['llamacpp']), card.open);
  check('the card says it is running, with the port', /44815/.test(card.status), card.status);
  check('install is gone once installed', card.installHidden === true, card.installHidden);
  check('there is one switch, not a start and a stop button', card.startButton === false && card.stopButton === false, card);
  check('the switch reads on while the model runs', card.switchOn === true, card.switchOn);
  check("and it is usable once installed", card.switchDisabled === false, card.switchDisabled);
  check(
    "the switch is a slide, not a tick box (same as the ntfy ones)",
    card.switchAppearance === "none" && card.switchWidth > card.switchHeight,
    { appearance: card.switchAppearance, w: card.switchWidth, h: card.switchHeight }
  );
  check('its label says what it turns on', card.switchText.length > 10, card.switchText);

  // --- installed but switched off ---------------------------------------
  llama = { phase: 'idle', enabled: false, installed: true, running: false, port: null, model: 'm.gguf', progress: null, error: null };
  await load();
  const offState = await read();
  const offLocal = offState.rows.find((r) => r.mode === 'local');
  check('a switched-off machine route is refused too', offLocal.disabled === true, offLocal);
  check('and says the switch is off, not that it is missing', /switch|switched off|off/i.test(offLocal.hint) && !/install/i.test(offLocal.hint), offLocal.hint);
  check('a switched-off local model has no tick, even installed', offState.tileTick === false, offState.tileTick);

  const offCard = await win.webContents.executeJavaScript(`(async () => {
    const canInstall = el('llamacppInstall').hidden;
    selectProviderTile('llamacpp');
    paintLlamaCppSettings();
    return { status: el('llamacppStatus').textContent.trim(), on: el('llamacppEnabled').checked, canInstall };
  })()`);
  check('the card says it is off, not that it is ready', /off/i.test(offCard.status) && !/ready/i.test(offCard.status), offCard.status);
  check('the switch is drawn off', offCard.on === false, offCard.on);

  // Flipping it off stops the model and flipping it back on starts it: one
  // gesture, both directions, remembered.
  await win.webContents.executeJavaScript(`(async () => {
    el('llamacppEnabled').checked = true;
    el('llamacppEnabled').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    el('llamacppEnabled').checked = false;
    el('llamacppEnabled').dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 200));
    return true;
  })()`);
  check('switching it on is saved', switchCalls.includes(true), switchCalls);
  check('switching it off is saved', switchCalls.includes(false), switchCalls);
  const afterSwitch = await win.webContents.executeJavaScript(`el('llamacppStatus').textContent.trim()`);
  check('the card follows the switch without a reload', /off/i.test(afterSwitch), afterSwitch);

  console.log(failures.length ? `\n${failures.length} local-vision UI check(s) failed` : '\nAll local-vision UI checks passed.');
  app.exit(failures.length ? 1 : 0);
});

