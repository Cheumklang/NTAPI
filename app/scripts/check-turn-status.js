/*
 * A working window has to look like one.
 *
 * Two things are checked here, both reported by users watching long turns:
 *   1. the activity chip of a running tool must survive a repaint of the bubble,
 *      instead of vanishing under a bash command that is still going;
 *   2. the hint above the composer must name the step the turn is on and count
 *      the elapsed time, so a minute of silence does not read as a hang.
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
  cwd: 'C:\\w',
  sessionId: 's',
  sessionFile: 'C:\\d\\s.jsonl',
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
    await new Promise((r) => setTimeout(r, 150));
    const view = activeView();
    const hint = () => document.getElementById('statusHint').textContent;

    // A tool starts running.
    const wrap = ensureLive(view);
    view.runningTools = 1;
    view.actTool = 'bash';
    markActivity(view, 'tools', true);
    setTurnPhase(view, 'tool', 'bash');
    const chipNow = [...wrap.querySelectorAll('.act-chip')].map((c) => c.textContent);
    const hintNow = hint();

    // The repaint that used to lose everything: the bubble is rebuilt, and only
    // the view's own state is left to say what is running.
    wrap.remove();
    view.liveAssistant = null;
    const fresh = ensureLive(view);
    const chipAfter = [...fresh.querySelectorAll('.act-chip')].map((c) => c.dataset.act);
    const labelAfter = fresh.querySelector('.act-chip[data-act="tools"] .act-text')?.textContent || '';

    // The counter has to move on its own while nothing else happens.
    const before = hint();
    await new Promise((r) => setTimeout(r, 1400));
    const after = hint();

    // A second tool in flight keeps the chip when the first one finishes.
    view.runningTools = 2;
    view.runningTools = Math.max(0, view.runningTools - 1);
    const kept = Boolean(fresh.querySelector('.act-chip[data-act="tools"]'));

    // The turn ends: chips and the step readout both go.
    view.busy = false;
    clearViewActivity(view);
    paintBusyFromViews();
    const chipsEnd = [...fresh.querySelectorAll('.act-chip')].length;
    const hintEnd = hint();

    return { chipNow, hintNow, chipAfter, labelAfter, before, after, kept, chipsEnd, hintEnd };
  })()`);

  check(
    'a running tool shows a chip that names it',
    out.chipNow.length === 1 && /bash/.test(out.chipNow[0]),
    out.chipNow,
  );
  check(
    'the hint names the step and counts the turn',
    /bash/.test(out.hintNow) && /[0-9]/.test(out.hintNow) && out.hintNow !== out.hintEnd,
    out.hintNow,
  );
  check(
    'the chip survives a repaint of the bubble',
    out.chipAfter.includes('tools') && /bash/.test(out.labelAfter),
    { chipAfter: out.chipAfter, labelAfter: out.labelAfter },
  );
  check('the counter moves on its own', out.before !== out.after, { before: out.before, after: out.after });
  check('a second tool in flight keeps its chip', out.kept, out.kept);
  check('the end of the turn clears the chips', out.chipsEnd === 0, out.chipsEnd);

  console.log('');
  if (failures.length) {
    console.log(`FAILED: ${failures.length} check(s)`);
    app.exit(1);
    return;
  }
  console.log('All turn-status checks passed');
  app.exit(0);
});
