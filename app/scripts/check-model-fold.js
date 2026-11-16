/**
 * A provider folder in the model picker folds away, and stays folded.
 *
 * The picker holds two large providers and can grow to more; a reader aiming at
 * one had to scroll past every row of the others. The group header is now a
 * button that closes its folder to a single row, remembers that across restarts,
 * and steps aside (opens everything) while a search is active — because typing
 * means the user is hunting for one row, not browsing folders.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-model-fold.js
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const MODELS = [
  { provider: 'coarena', id: 'gpt-6-luna', name: 'GPT-6 Luna', plan: 'free' },
  { provider: 'coarena', id: 'gemini-3-8-flash', name: 'Gemini 3.8 Flash', plan: 'free' },
  { provider: 'coarena', id: 'deepseek-v4-1-flash-1017', name: 'DeepSeek V4.1', plan: 'free' },
  { provider: 'coarena', id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', plan: 'paid' },
  { provider: 'coarena', id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', plan: 'paid' },
  { provider: 'coarena', id: 'hy4', name: 'Hy4', plan: 'paid' },
  { provider: 'freepi', id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', plan: 'free' },
  { provider: 'freepi', id: 'deepseek-v4-1-flash', name: 'DeepSeek V4.1 Flash', plan: 'free' },
  { provider: 'freepi', id: 'glm-5-3-flash', name: 'GLM 5.3 Flash', plan: 'free' },
  { provider: 'freepi', id: 'particle-1', name: 'Particle-1', plan: 'free' },
];

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('prefs:set', async () => true);

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));

  const run = (expr) => win.webContents.executeJavaScript(expr);
  const boot = await run(`renderModelMenu(${JSON.stringify(MODELS)}, null); ({
    groups: [...modelList.querySelectorAll('.model-group')].map((g) => g.dataset.provider),
  })`);
  check('both provider folders are drawn', boot.groups.length === 2, boot);

  const openitals = await run(`(() => {
    const co = modelList.querySelector('.model-group[data-provider="coarena"]');
    return {
      expanded: co.querySelector('.model-group-head').getAttribute('aria-expanded'),
      rows: co.querySelectorAll('.model-option').length,
      closedClass: co.classList.contains('collapsed'),
    };
  })()`);
  check('an open folder shows its rows', openitals.rows === 6 && openitals.expanded === 'true', openitals);

  // Close Coarena by clicking its header.
  const closed = await run(`(async () => {
    modelList.querySelector('.model-group[data-provider="coarena"] .model-group-head').click();
    await new Promise((r) => setTimeout(r, 20));
    const co = modelList.querySelector('.model-group[data-provider="coarena"]');
    const body = co.querySelector('.model-group-body');
    return {
      expanded: co.querySelector('.model-group-head').getAttribute('aria-expanded'),
      bodyHidden: body.hidden,
      closedClass: co.classList.contains('collapsed'),
      visibleRows: modelList.querySelectorAll('.model-option:not(:disabled)').length,
      visibleOptions: visibleModelOptions().length,
      chev: co.classList.contains('collapsed'),
    };
  })()`);
  check('clicking the header closes the folder', closed.expanded === 'false' && closed.bodyHidden === true, closed);
  check('the closed folder costs one row', closed.visibleOptions === 4, closed);

  // The four still-visible rows are FreePI's.
  const remaining = await run(`[...visibleModelOptions()].map((r) => r.dataset.value)`);
  check('only the other provider is still browsable',
    remaining.every((v) => v.startsWith('freepi||')), remaining);

  // Clicking again reopens it.
  const reopened = await run(`(async () => {
    modelList.querySelector('.model-group[data-provider="coarena"] .model-group-head').click();
    await new Promise((r) => setTimeout(r, 20));
    const co = modelList.querySelector('.model-group[data-provider="coarena"]');
    return {
      expanded: co.querySelector('.model-group-head').getAttribute('aria-expanded'),
      bodyHidden: co.querySelector('.model-group-body').hidden,
      visibleOptions: visibleModelOptions().length,
    };
  })()`);
  check('clicking the closed header reopens it', reopened.expanded === 'true' && !reopened.bodyHidden, reopened);
  check('all ten rows are visible again', reopened.visibleOptions === 10, reopened);

  // A search must not lose the matching row behind a folded folder.
  const viaSearch = await run(`(async () => {
    const co = modelList.querySelector('.model-group[data-provider="coarena"] .model-group-head');
    co.click(); // close it again
    await new Promise((r) => setTimeout(r, 20));
    modelSearch.value = 'claude';
    filterModelMenu();
    await new Promise((r) => setTimeout(r, 20));
    const after = {
      visibleOptions: visibleModelOptions().length,
      freepiOpen: !modelList.querySelector('.model-group[data-provider="freepi"]').classList.contains('collapsed'),
      coBodyHidden: modelList.querySelector('.model-group[data-provider="coarena"] .model-group-body').hidden,
    };
    modelSearch.value = '';
    filterModelMenu();
    return after;
  })()`);
  // Both Claude rows match, and both are reachable although Coarena was closed.
  check('a search opens every folder so the hit is reachable', viaSearch.visibleOptions === 2, viaSearch);
  check('the folded folder was opened for the search', viaSearch.coBodyHidden === false, viaSearch);

  // Closing a folder is persisted, and a fresh draw of the menu honours it.
  const persisted = await run(`(async () => {
    collapsedProviders.clear();
    let co = modelList.querySelector('.model-group[data-provider="coarena"]');
    setGroupOpen(co, true);
    co.querySelector('.model-group-head').click();
    await new Promise((r) => setTimeout(r, 30));
    const saved = [...collapsedProviders];
    // The picker is redrawn on every model change, so the choice has to survive a
    // redraw, not just the click that made it.
    renderModelMenu(${JSON.stringify(MODELS)}, null);
    co = modelList.querySelector('.model-group[data-provider="coarena"]');
    return {
      saved,
      afterRedrawCollapsed: co.classList.contains('collapsed'),
      afterRedrawHidden: co.querySelector('.model-group-body').hidden,
    };
  })()`);
  check('the closed choice is remembered', persisted.saved.includes('coarena'), persisted);
  check('a redraw keeps the folder closed',
    persisted.afterRedrawCollapsed === true && persisted.afterRedrawHidden === true, persisted);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: provider folders fold, remember, and reopen for a search');
  app.exit(failures ? 1 : 0);
});