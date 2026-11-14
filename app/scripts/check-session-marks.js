/**
 * Pins and colours, measured on the real renderer.
 *
 * The static test proves the wiring exists; this one proves the sidebar actually
 * draws what it was told — a pin on the pinned row and nowhere else, a colour
 * attribute that CSS turns into a stripe, pinned rows above unpinned ones, and a
 * swatch for every palette colour in the context menu.
 *
 * The session list is served from a real `session:list` handler rather than by
 * patching `api.listSessions` in the page: contextBridge hands the renderer a
 * frozen copy, so patching it there silently does nothing and every assertion
 * would fail against an empty list.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-session-marks.js
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

const SESSIONS = [
  {
    id: 's1',
    path: 'C:\\data\\sessions\\ws\\one.jsonl',
    created: '2026-01-10T00:00:00.000Z',
    modified: '2026-01-10T00:00:00.000Z',
    name: 'งานใหม่สุด',
    pinned: false,
    color: null,
  },
  {
    id: 's2',
    path: 'C:\\data\\sessions\\ws\\two.jsonl',
    created: '2026-01-05T00:00:00.000Z',
    modified: '2026-01-05T00:00:00.000Z',
    name: 'งานที่ปักหมุด',
    pinned: true,
    color: 'green',
  },
  {
    id: 's3',
    path: 'C:\\data\\sessions\\ws\\three.jsonl',
    created: '2026-01-07T00:00:00.000Z',
    modified: '2026-01-07T00:00:00.000Z',
    name: 'งานสีแดง',
    pinned: false,
    color: 'red',
  },
];

/** The colour the CSS must produce for the pinned row. */
const GREEN = 'rgb(70, 193, 122)';
const RED = 'rgb(242, 85, 95)';

app.whenReady().then(async () => {
  // The renderer boots through `api.boot()`; unrelated calls are stubbed so the
  // page loads without a flood of "no handler" noise. `session:list` is the one
  // this probe actually measures.
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('usage:fetch', async () => null);
  ipcMain.handle('presence:get', async () => null);
  ipcMain.handle('skills:list', async () => []);
  ipcMain.handle('session:list', async () => SESSIONS);
  ipcMain.handle('session:colors', async () => ['red']);
  ipcMain.handle('session:mark', async () => ({ ok: true, mark: { pinned: false, color: null } }));

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const result = await win.webContents.executeJavaScript(`(async () => {
    await renderSessions('C:\\\\data\\\\ws');

    const rows = [...document.querySelectorAll('#sessionList .session-item')];
    const read = rows.map((r) => {
      const style = getComputedStyle(r);
      return {
        title: r.querySelector('.s-title')?.textContent?.trim() || '',
        pinned: r.classList.contains('pinned'),
        pin: Boolean(r.querySelector('.s-pin-slot')?.textContent.trim()),
        titleLeft: Math.round(r.querySelector('.s-title').getBoundingClientRect().left),
        color: r.dataset.color || null,
        borderLeft: style.borderLeftWidth,
        borderColor: style.borderLeftColor,
      };
    });

    // Where the swatches live: open the menu for the coloured row.
    const redRow = rows.find((r) => r.dataset.color === 'red');
    openSessionMenu(20, 20, 'C:\\\\data\\\\ws', ${JSON.stringify(SESSIONS[2])}, redRow);
    const menu = document.querySelector('.ctx-menu');
    const swatches = [...menu.querySelectorAll('.ctx-color[data-color]')].map((b) => b.dataset.color);
    const noneBtn = Boolean(menu.querySelector('.ctx-color-none'));
    const entries = [...menu.querySelectorAll('button')].map((b) => b.textContent.trim());
    const pinLabel = entries.find((t) => t.includes('หมุด') || /Pin|Unpin/i.test(t)) || null;
    const pressed = menu.querySelector('.ctx-color[aria-pressed="true"]')?.dataset.color || null;
    const swatchBg = getComputedStyle(menu.querySelector('.ctx-color[data-color="red"]')).background;
    closeSessionMenu();

    return { read, swatches, noneBtn, pinLabel, pressed, swatchBg };
  })()`);

  const [first, second, third] = result.read;

  check('three rows rendered', result.read.length === 3, result.read.length);
  check(
    'the pinned chat is first even though it is not the newest',
    first?.title === 'งานที่ปักหมุด',
    result.read.map((r) => r.title)
  );
  check('the pinned row is marked', first?.pinned === true && first?.pin === true, first);
  check('unpinned rows carry no pin', second?.pin === false && third?.pin === false);
  check(
    'unpinned rows keep creation order below the pin',
    second?.title === 'งานใหม่สุด' && third?.title === 'งานสีแดง',
    [second?.title, third?.title]
  );
  check('the colour reaches the pinned row', first?.color === 'green', first?.color);
  check('a coloured row has a real left border', parseFloat(first?.borderLeft) >= 3, first?.borderLeft);
  check('the stripe is the chosen colour, not the accent', first?.borderColor === GREEN, first?.borderColor);
  check('the second colour is distinct', third?.color === 'red', third?.color);
  check('the red row stripes in red', third?.borderColor === RED, third?.borderColor);
  check('an uncoloured row has no colour attribute', second?.color === null);
  check('an uncoloured row draws no stripe', parseFloat(second?.borderLeft || '0') <= 1, second?.borderLeft);
  // Titles must sit in one column whether or not the row is pinned. Otherwise
  // the list reads as broken rather than as marked.
  check(
    'row titles line up whether pinned or not',
    new Set(result.read.map((r) => r.titleLeft)).size === 1,
    result.read.map((r) => r.titleLeft)
  );

  check('every palette colour has a swatch', result.swatches.length === 7, result.swatches);
  check('there is a way to remove the colour', result.noneBtn === true);
  check('the current colour is marked as pressed', result.pressed === 'red', result.pressed);
  check('the pin entry is labelled for the current state', /Pin|ปักหมุด/i.test(result.pinLabel || ''), result.pinLabel);
  check('swatches resolve to a colour', !/rgba\(0, 0, 0, 0\)/.test(result.swatchBg), result.swatchBg);

  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: pins and colours render in the sidebar');
  win.destroy();
  app.exit(failures ? 1 : 0);
});
