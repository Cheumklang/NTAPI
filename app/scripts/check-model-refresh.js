'use strict';

/**
 * The model picker with a real catalog in it.
 *
 * A whole-catalog list means hundreds of rows — 477 from OpenRouter alone in the
 * account this was written against — so what is checked here is that the picker
 * stays usable at that size (it renders, the search and the "free only" tick
 * still narrow it), and that the "update model list" button reports what came
 * back and explains itself in its tooltip.
 *
 * Run: electron scripts/check-model-refresh.js --no-sandbox
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

/** A catalog the size of the real one: 477 OpenRouter routes plus the rest. */
function bigCatalog() {
  const models = [];
  for (let i = 0; i < 477; i += 1) {
    models.push({
      provider: 'openrouter',
      id: `vendor-${i % 40}/model-${i}${i % 20 === 0 ? ':free' : ''}`,
      name: `Model ${i}${i % 20 === 0 ? ' (free)' : ''}`,
      plan: i % 20 === 0 ? 'free' : 'paid',
      planNote: i % 20 === 0 ? '' : '$0.30/$1.10',
      freeTier: i % 20 === 0,
    });
  }
  for (let i = 0; i < 24; i += 1) {
    models.push({
      provider: 'cloudflare',
      id: `@cf/vendor/model-${i}`,
      name: `vendor/model-${i}`,
      plan: i < 21 ? 'free' : 'paid',
      planNote: i < 21 ? '' : '$1.40/$4.40',
      freeTier: i < 21,
    });
  }
  for (let i = 0; i < 13; i += 1) {
    models.push({ provider: 'zai', id: `glm-${i}`, name: `GLM-${i}`, plan: 'paid', planNote: '' });
  }
  return models;
}

const MODELS = bigCatalog();
const FREE_COUNT = MODELS.filter((m) => m.plan === 'free').length;

app.whenReady().then(async () => {
  let refreshCalls = 0;
  const state = () => ({
    tabId: 't1',
    cwd: '/tmp',
    sessionId: 's1',
    name: 'Session',
    model: MODELS[0],
    models: MODELS,
    busy: false,
    messages: [],
    usage: null,
  });

  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0.0.0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => [{ id: 't1', label: 'Session', active: true }]);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => state());
  ipcMain.handle('providers:key-health', async () => []);
  ipcMain.handle('models:refresh', async () => {
    refreshCalls += 1;
    return {
      ok: false,
      counts: { openrouter: 477, cloudflare: 24, zai: 13 },
      errors: [{ provider: 'coarena', error: 'offline' }],
      tabs: 1,
    };
  });
  ipcMain.handle('settings:get', async () => ({ dataRoot: '/tmp' }));

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    x: 40,
    y: 40,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));

  // Paint the picker the way the tab state would, and time it.
  const painted = await win.webContents.executeJavaScript(`(async () => {
    el('termsOverlay').hidden = true;
    const models = ${JSON.stringify(MODELS)};
    const t0 = performance.now();
    renderModelPicker({ models, model: models[0] });
    const renderMs = performance.now() - t0;
    openModelMenu();
    const rows = document.querySelectorAll('#modelList .model-option').length;
    const groups = document.querySelectorAll('#modelList .model-group').length;
    const collapseAll = el('modelCollapseAll');
    const collapseAllExists = Boolean(collapseAll);
    if (collapseAll) {
      collapseAll.click();
      await new Promise((r) => setTimeout(r, 30));
    }
    const allCollapsed = [...document.querySelectorAll('#modelList .model-group')]
      .every((group) => group.classList.contains('collapsed') && group.querySelector('.model-group-body').hidden);
    return { renderMs: Math.round(renderMs), rows, groups, collapseAllExists, allCollapsed };
  })()`).catch((err) => ({ error: err.message }));

  if (painted.error) {
    check('the picker paints a whole catalog', false, painted.error);
  } else {
    console.log(`info: ${MODELS.length} rows painted in ${painted.renderMs} ms`);
    check('a whole catalog renders as rows', painted.rows === MODELS.length, painted);
    check('it renders fast enough to open a menu', painted.renderMs < 1200, painted.renderMs);
    check('the providers stay grouped', painted.groups === 3, painted.groups);
    check('collapse-all button folds every provider', painted.collapseAllExists && painted.allCollapsed, painted);
  }

  // Search and the free-only tick must still narrow 514 rows.
  const narrowed = await win.webContents.executeJavaScript(`(async () => {
    const visible = () => [...document.querySelectorAll('#modelList .model-option')]
      .filter((row) => !row.closest('.model-row').hidden && !row.closest('.model-group').hidden).length;
    modelSearch.value = 'model-42';
    const t0 = performance.now();
    filterModelMenu();
    const searchMs = performance.now() - t0;
    const searched = visible();
    modelSearch.value = '';
    filterModelMenu();
    modelFreeOnly.checked = true;
    filterModelMenu();
    const free = visible();
    modelFreeOnly.checked = false;
    filterModelMenu();
    return { searchMs: Math.round(searchMs), searched, free, all: visible() };
  })()`);
  console.log(`info: search filtered in ${narrowed.searchMs} ms · free only left ${narrowed.free} of ${MODELS.length} rows`);
  check('typing narrows the list', narrowed.searched > 0 && narrowed.searched < 40, narrowed);
  check(`a search over ${MODELS.length} rows stays instant`, narrowed.searchMs < 300, narrowed.searchMs);
  check('free only leaves the free rows', narrowed.free === FREE_COUNT, { got: narrowed.free, want: FREE_COUNT });
  check('unticking it brings everything back', narrowed.all === MODELS.length, narrowed.all);

  // The update button: it exists, it explains itself, and it reports per provider.
  const button = await win.webContents.executeJavaScript(`(() => {
    const btn = el('modelRefresh');
    const r = btn.getBoundingClientRect();
    return {
      exists: Boolean(btn),
      title: btn.getAttribute('title') || '',
      label: btn.getAttribute('aria-label') || '',
      inSearchRow: btn.closest('.model-menu-search') !== null,
      size: Math.round(r.width),
      noteHidden: el('modelRefreshNote').hidden,
    };
  })()`);
  check('the update button is in the search row', button.exists && button.inSearchRow, button);
  check('it explains itself on hover', button.title.length > 40, button.title);
  check('its title names what it costs', /network|tokens/i.test(button.title) || /เครือข่าย|โทเคน/.test(button.title), button.title);
  check('it is named for screen readers', button.label.length > 5, button.label);
  check('it is a comfortable hit target', button.size >= 24, button.size);
  check('no result line before it is used', button.noteHidden === true, button.noteHidden);

  const clicked = await win.webContents.executeJavaScript(`(async () => {
    el('modelRefresh').click();
    await new Promise((r) => setTimeout(r, 300));
    const note = el('modelRefreshNote');
    return {
      text: note.textContent.trim(),
      hidden: note.hidden,
      isError: note.classList.contains('error'),
      busyOff: el('modelRefresh').getAttribute('aria-busy'),
      disabled: el('modelRefresh').disabled,
    };
  })()`);
  check('pressing it asks the main process once', refreshCalls === 1, refreshCalls);
  check('it reports per provider', /OpenRouter 477/.test(clicked.text) && /Cloudflare 24/.test(clicked.text), clicked.text);
  check('it names the provider that failed', /Coarena/.test(clicked.text), clicked.text);
  check('a failure is shown as one', clicked.isError === true, clicked);
  check('the button is usable again afterwards', clicked.busyOff === 'false' && clicked.disabled === false, clicked);

  const shots = path.join(__dirname, '..', '..', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await win.webContents.executeJavaScript(
      `document.documentElement.dataset.theme = '${theme}'; openModelMenu(); el('modelRefresh').click(); true`
    );
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(shots, `model-refresh-${theme}.png`), image.toPNG());
  }

  console.log(failures.length ? `\n${failures.length} model-catalog check(s) failed` : '\nAll model-catalog checks passed.');
  app.exit(failures.length ? 1 : 0);
});
