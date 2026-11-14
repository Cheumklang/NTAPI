/*
 * The three detail sections are all collapsed, so the message carries a live
 * chip for whichever part is producing output. A chip must appear while that
 * part works, vanish when it stops, and several may show at once.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const STATE = {
  tabId: 't1',
  cwd: 'C:\w',
  sessionId: 's',
  sessionFile: 'C:\d\s.jsonl',
  name: 'n',
  model: { provider: 'free-pi', id: 'm', name: 'M' },
  models: [],
  guest: false,
  busy: true,
  messages: [],
};

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => [STATE]);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:activate', async () => STATE);
  ipcMain.handle('tab:state', async () => STATE);

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    applyTabState(${JSON.stringify(STATE)});
    await new Promise((r) => setTimeout(r, 120));

    const wrap = addMessage('assistant');
    const box = wrap.querySelector('.msg-activity');
    const chips = () => [...box.querySelectorAll('.act-chip')].map((c) => c.dataset.act);
    const snap = () => ({ chips: chips(), hidden: box.hidden, height: Math.round(box.getBoundingClientRect().height) });

    const start = snap();

    // Reasoning.
    setActivity(wrap, 'think', true);
    const thinking = snap();

    // The model starts writing prose: reasoning hands over to writing, and the
    // reasoning chip must not linger.
    setActivity(wrap, 'think', false);
    setActivity(wrap, 'notes', true);
    const writing = snap();

    // A tool call: writing stops, the tool chip takes over.
    setActivity(wrap, 'notes', false);
    setActivity(wrap, 'tools', true);
    const tooling = snap();

    // Reasoning can resume while a tool runs: both chips show together.
    setActivity(wrap, 'think', true);
    const both = snap();

    // Everything idle: the row empties and the space collapses.
    clearMsgActivity(wrap);
    const idle = snap();

    // The row must sit inside the message, above the collapsed sections. Measured
    // with a chip showing: a hidden row has no box to compare against.
    const order = [...wrap.children].map((n) => n.className);
    setActivity(wrap, 'tools', true);
    const boxEl = wrap.querySelector('.msg-activity');
    const r = boxEl.getBoundingClientRect();
    const msg = wrap.getBoundingClientRect();
    clearMsgActivity(wrap);

    return {
      start, thinking, writing, tooling, both, idle,
      order,
      insideMsg: r.left >= msg.left - 1 && r.right <= msg.right + 1,
      beforeSections:
        order.indexOf('msg-activity') < order.indexOf('thinking-wrap') &&
        order.indexOf('msg-activity') < order.indexOf('tools-wrap'),
      labels: [t('actThinking'), t('actTools'), t('actNotes')],
    };
  })()`);

  check('no chips before anything starts', out.start.chips.length === 0 && out.start.hidden === true, out.start);
  check('reasoning shows a chip', out.thinking.chips.includes('think'), out.thinking.chips);
  check('the chip row is visible when active', out.thinking.hidden === false && out.thinking.height > 0, out.thinking);
  check('writing replaces reasoning', out.writing.chips.includes('notes') && !out.writing.chips.includes('think'), out.writing.chips);
  check('a tool call shows the tools chip', out.tooling.chips.includes('tools') && !out.tooling.chips.includes('notes'), out.tooling.chips);
  check('two active parts show together', out.both.chips.length === 2, out.both.chips);
  check('idle removes every chip and the row space', out.idle.chips.length === 0 && out.idle.hidden === true, out.idle);
  check('the chips sit inside the message', out.insideMsg === true);
  check('the chips sit above the collapsed sections', out.beforeSections === true, out.order);
  check('each part has its own words', new Set(out.labels).size === 3, out.labels);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: each active part shows a chip, idle parts show none');
  app.exit(failures.length ? 1 : 0);
});
