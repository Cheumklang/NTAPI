/*
 * Settings → Providers: one tile per company, five to a row, one form open.
 *
 * The list of full cards had grown past the point where the key somebody came to
 * fix could be found, and every new company pushed it further down. This check
 * pins the rules the grid has to keep:
 *
 *   - twelve tiles, five to a row, each with its own bundled mark;
 *   - a tick only for a key this machine can actually read;
 *   - the tick sits outside the logo, never on top of it;
 *   - one card open at a time, opened by its tile;
 *   - both themes keep text and tick readable (contrast, not just "a colour").
 *
 * It also writes two screenshots (dark, light) so the layout can be looked at.
 *
 * Run: electron scripts/check-provider-grid.js
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

// A-Z by the name on the tile, which is what the grid has to show.
const TILE_ORDER = ['anthropic', 'cloudflare', 'coarena', 'deepseek', 'freepi', 'google', 'llm7', 'nvidia', 'openrouter', 'tokenharbor', 'zai', 'zro'];

/** Statuses the stubbed main process reports: two keys saved, the rest empty. */
function status(configured) {
  return configured
    ? { configured: true, readable: true, encrypted: true, hint: 'a1b2' }
    : { configured: false, readable: false, encrypted: false, hint: null };
}

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0.0.0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);
  ipcMain.handle('providers:key-health', async () => []);
  // FreePi's tick is its signed-in session, so the account has to answer.
  ipcMain.handle('account:status', async () => ({ hasToken: true, guest: false, signedIn: true }));
  ipcMain.handle('settings:get', async () => ({
    dataRoot: 'C:/NTAPI',
    coarena: status(true),
    zro: status(false),
    nvidia: status(false),
    tokenharbor: status(false),
    llm7: status(false),
    deepseek: status(true),
    anthropic: status(false),
    google: status(false),
    zai: status(false),
    openrouter: status(false),
    cloudflare: { ...status(false), accountConfigured: true, accountReadable: true, accountHint: '9f90' },
  }));

  // Shown, not hidden: a hidden window stops advancing CSS transitions, so a
  // theme switch would be measured on a half-finished frame.
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    x: 40,
    y: 40,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const result = await win.webContents.executeJavaScript(`(async () => {
    await openSettings();
    // openSettings() talks to a main process this harness does not have, so the
    // dialog is forced open before anything is measured.
    const overlay = el('settingsOverlay');
    if (overlay) overlay.hidden = false;
    // The first-run terms dialog sits above everything and dims the panel.
    el('termsOverlay').hidden = true;
    showSettingsSection('providers');
    await new Promise((r) => setTimeout(r, 250));

    const grid = el('providerGrid');
    const tiles = [...grid.querySelectorAll('.provider-tile')];
    const localCard = document.querySelector('#llamacppRow');
    const localCardAboveGrid = Boolean(localCard && localCard.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING);
    const localCardLayout = localCard ? getComputedStyle(localCard).display : '';
    const detail = el('providerDetail');
    const visibleCards = () => [...document.querySelectorAll('#providerDetail .provider-card')].filter((c) => !c.hidden);
    const rect = (node) => {
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

    // First-row length, measured: a hidden panel resolves grid-template-columns to
    // the literal repeat() text, which counts nothing.
    const order = tiles.map((t) => t.dataset.provider);
    const firstRow = tiles.filter((t) => Math.abs(t.getBoundingClientRect().top - tiles[0].getBoundingClientRect().top) < 2).length;
    const marks = tiles.map((t) => t.querySelector('.provider-tile-logo')?.getAttribute('src') || '');
    const names = tiles.map((t) => t.querySelector('.provider-tile-name')?.textContent.trim() || '');

    // Ticks: only the two stubbed readable keys. Rendered visibility, not the
    // hidden property: the tick sets display:flex, which overrides [hidden]
    // in the UA sheet — checking the property alone passed while every tile ticked.
    const ticks = tiles.map((t) => {
      const tick = t.querySelector('.provider-tile-tick');
      return { id: t.dataset.provider, shown: getComputedStyle(tick).display !== 'none' };
    });
    const ticked = ticks.filter((t) => t.shown).map((t) => t.id).sort();

    // The tick must not sit on the mark.
    const deepseekTile = tiles.find((t) => t.dataset.provider === 'deepseek');
    const tickRect = rect(deepseekTile.querySelector('.provider-tile-tick'));
    const logoTileRect = rect(deepseekTile.querySelector('.provider-tile-logo'));
    const tileOverlap = overlaps(tickRect, logoTileRect);

    // Label fits inside its tile (no clipped or overflowing company name).
    const overflow = tiles
      .map((t) => t.querySelector('.provider-tile-name'))
      .filter((n) => n.scrollWidth > n.clientWidth + 1).length;
    const nameSize = parseFloat(getComputedStyle(tiles[0].querySelector('.provider-tile-name')).fontSize);
    const tileH = rect(tiles[0]).h;

    const freepi = tiles.find((t) => t.dataset.provider === 'freepi');
    const freepiTile = freepi
      ? {
          logo: freepi.querySelector('.provider-tile-logo')?.getAttribute('src') || '',
          name: freepi.querySelector('.provider-tile-name')?.textContent.trim() || '',
          tick: Boolean(freepi.querySelector('.provider-tile-tick')),
        }
      : null;
    // A card outside #providerDetail would sit above the grid all the time.
    const freepiAboveGrid = Boolean(
      document.querySelector('#freepiRow') &&
        !document.querySelector('#providerDetail #freepiRow')
    );

    // Whatever was saved opens first; one form, and only one.
    const openFirst = visibleCards().map((c) => c.dataset.provider);
    // Clicking another tile swaps the form; clicking it again closes it.
    // FreePi above all: its card is one of the detail cards now.
    freepi.click();
    const afterFreepi = visibleCards().map((c) => c.dataset.provider);
    freepi.click();
    tiles.find((t) => t.dataset.provider === 'zai').click();
    await new Promise((r) => setTimeout(r, 60));
    const afterZai = visibleCards().map((c) => c.dataset.provider);
    const zaiActive = tiles.find((t) => t.dataset.provider === 'zai').getAttribute('aria-pressed');
    tiles.find((t) => t.dataset.provider === 'zai').click();
    await new Promise((r) => setTimeout(r, 60));
    const afterToggle = { detailHidden: detail.hidden, visible: visibleCards().length };
    tiles.find((t) => t.dataset.provider === 'deepseek').click();
    await new Promise((r) => setTimeout(r, 60));

    // Contrast helpers: relative luminance of an rgb() string.
    const lum = (color) => {
      const m = color.match(/[\\d.]+/g) || [];
      const [r, g, b] = m.slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (fg, bg) => {
      const a = lum(fg);
      const b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };

    // Transitions off for the measurement: the colour that matters is the one the
    // theme settles on, not a value caught mid-fade.
    const freeze = document.createElement('style');
    freeze.textContent = '* { transition: none !important; animation: none !important; }';
    document.head.appendChild(freeze);

    const readings = {};
    for (const theme of ['dark', 'light']) {
      document.documentElement.dataset.theme = theme;
      // The tile colour transitions over 120ms, so reading it sooner measures a
      // half-finished frame and reports the dark surface against light text.
      await new Promise((r) => setTimeout(r, 320));
      const tile = tiles[0];
      const tileStyle = getComputedStyle(tile);
      const nameStyle = getComputedStyle(tile.querySelector('.provider-tile-name'));
      const tickStyle = getComputedStyle(deepseekTile.querySelector('.provider-tile-tick'));
      // Marks drawn in near-white ink need their own dark plate in this theme,
      // or they disappear against the pale tile.
      const plated = tiles
        .filter((t) => {
          const bg = getComputedStyle(t.querySelector('.provider-tile-logo-wrap')).backgroundColor;
          return bg && bg !== 'rgba(0, 0, 0, 0)';
        })
        .map((t) => t.dataset.provider)
        .sort();
      const tileBg = tileStyle.backgroundColor;
      readings[theme] = {
        nameContrast: Math.round(ratio(nameStyle.color, tileBg) * 100) / 100,
        nameSize: parseFloat(nameStyle.fontSize),
        tickContrast: Math.round(ratio(tickStyle.color, tickStyle.backgroundColor) * 100) / 100,
        tickSize: parseFloat(tickStyle.width),
        border: tileStyle.borderColor,
        activeBorder: getComputedStyle(tile).borderColor,
        plated,
      };
    }
    document.documentElement.dataset.theme = 'dark';

    return {
      tiles: tiles.length,
      localCardAboveGrid,
      localCardLayout,
      columns: firstRow,
      gridWidth: Math.round(grid.getBoundingClientRect().width),
      marksOk: marks.every((m) => /^assets\\/providers\\/.+\\.(svg|png)$/.test(m)),
      names,
      ticked,
      tileOverlap,
      tickRect,
      logoTileRect,
      overflow,
      nameSize,
      tileH,
      openFirst,
      afterZai,
      zaiActive,
      afterToggle,
      detailExists: Boolean(detail),
      order,
      freepiTile,
      freepiAboveGrid,
      afterFreepi,
      readings,
    };
  })()`);

  check('twelve provider tiles without a duplicate llama.cpp tile', result.tiles === 12 && !result.order.includes('llamacpp'), { count: result.tiles, order: result.order });
  check('llama.cpp details sit above the provider grid', result.localCardAboveGrid, result.localCardAboveGrid);
  check('llama.cpp uses a visible dedicated-card layout', result.localCardLayout !== 'none', result.localCardLayout);
  check('tiles run A-Z by the name they show', JSON.stringify(result.order) === JSON.stringify(TILE_ORDER), result.order);
  check('FreePi is a tile like the others', result.freepiTile && result.freepiTile.logo && result.freepiTile.name === 'FreePi', result.freepiTile);
  check('FreePi has no card above the grid', result.freepiAboveGrid === false, result.freepiAboveGrid);
  check('a signed-in FreePi carries the tick', result.ticked.includes('freepi'), result.ticked);
  check('the tick stays only for a readable key or a session', JSON.stringify(result.ticked) === JSON.stringify(['coarena', 'deepseek', 'freepi']), result.ticked);
  check('the FreePi tile opens its card', JSON.stringify(result.afterFreepi) === JSON.stringify(['freepi']), result.afterFreepi);
  check('the grid has a real width', result.gridWidth > 400, result.gridWidth);
  check('five tiles to a row', result.columns === 5, { firstRow: result.columns, gridWidth: result.gridWidth });
  check('every tile has a bundled mark', result.marksOk);
  check('every company is named under its mark', result.names.every((n) => n && n.length > 1), result.names);
  check('the tick does not cover the logo', result.tileOverlap === false, {
    tick: result.tickRect,
    logo: result.logoTileRect,
  });
  check('company names fit their tile', result.overflow === 0, result.overflow);
  check('name size stays legible (>= 11px)', result.nameSize >= 11, result.nameSize);
  check('tiles stay compact (<= 96px tall)', result.tileH <= 96, result.tileH);
  check('a saved key opens its form first', JSON.stringify(result.openFirst) === JSON.stringify(['coarena']), result.openFirst);
  check('clicking a tile opens that one form', JSON.stringify(result.afterZai) === JSON.stringify(['zai']), result.afterZai);
  check('the open tile is marked for the accessibility tree', result.zaiActive === 'true');
  check('clicking the same tile again closes the form', result.afterToggle.detailHidden === true && result.afterToggle.visible === 0, result.afterToggle);

  const dark = result.readings.dark;
  const light = result.readings.light;
  check('dark: company name contrasts with the tile', dark.nameContrast >= 4.5, dark.nameContrast);
  check('light: company name contrasts with the tile', light.nameContrast >= 4.5, light.nameContrast);
  check('dark: the tick mark is readable on its badge', dark.tickContrast >= 4.5, dark.tickContrast);
  check('light: the tick mark is readable on its badge', light.tickContrast >= 4.5, light.tickContrast);
  check('the badge is small enough not to dominate', dark.tickSize <= 16, dark.tickSize);
  check('dark theme needs no logo plate', Array.isArray(dark.plated) && dark.plated.length === 0, dark.plated);
  check(
    'light theme plates only the near-white marks',
    JSON.stringify(light.plated) === JSON.stringify(['coarena', 'openrouter', 'tokenharbor', 'zro']),
    light.plated
  );
  check('the name renders at the same size in both themes', dark.nameSize === light.nameSize, {
    dark: dark.nameSize,
    light: light.nameSize,
  });

  // Two screenshots, so the layout can be judged and not only measured.
  const shots = path.join(__dirname, '..', '..', 'shots');
  fs.mkdirSync(shots, { recursive: true });
  for (const theme of ['dark', 'light']) {
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = '${theme}';`);
    await new Promise((r) => setTimeout(r, 150));
    const image = await win.webContents.capturePage();
    const file = path.join(shots, `provider-grid-${theme}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log(`[shot] ${file}`);
  }

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed.`);
    app.exit(1);
    return;
  }
  console.log('\nAll provider-grid checks passed.');
  app.exit(0);
}).catch((err) => {
  // A thrown check is a failure with a line number, not a hang.
  console.error('grid check crashed:', err && err.stack ? err.stack : err);
  app.exit(1);
});
