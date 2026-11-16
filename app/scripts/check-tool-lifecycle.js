/*
 * A tool's chip and its card must end when the tool ends — including a tool that
 * finished while another chat was on screen.
 *
 * Two ways they used to outlive the work:
 *
 *   1. `onToolStart` counted the tool twice: the count was bumped once before the
 *      active-tab branch and once again inside it. One finished tool therefore
 *      left the count at 1, and "กำลังใช้เครื่องมือ: bash" stayed on a turn that had
 *      moved on to its answer.
 *   2. The count was right, but the card was rebuilt from `view.messages` when a
 *      chat was opened again. That redraw drew every card as "running…" and never
 *      asked the view for the result it already had, so a tool that ended off
 *      screen read as still running for as long as the chat stayed open.
 *
 * Both are measured on the real renderer; no real agent is started.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

setTimeout(() => {
  console.log('FAIL the test did not finish in 90s');
  app.exit(1);
}, 90000);

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
  await sleep(900);

  const exec = (code) => win.webContents.executeJavaScript(code);

  await exec(`(() => { applyTabState(${JSON.stringify(STATE)}); return true; })()`);
  await sleep(150);

  // One tool starts and ends the way the main process reports it.
  win.webContents.send('agent:toolStart', { tabId: 't1', id: 'tool-1', name: 'bash', args: { command: 'ls' } });
  await sleep(150);

  const started = await exec(`(() => {
    const v = views.get('t1');
    const chip = v.liveAssistant?.querySelector('.act-chip[data-act="tools"] .act-text');
    return {
      runningTools: v.runningTools,
      actTools: Boolean(v.act?.tools),
      chipText: chip ? chip.textContent : null,
      cards: document.querySelectorAll('[data-tool-id="tool-1"]').length,
    };
  })()`);

  win.webContents.send('agent:toolEnd', {
    tabId: 't1', id: 'tool-1', name: 'bash', result: { content: [{ type: 'text', text: 'file.txt' }] },
    isError: false, durationMs: 1200, diff: null,
  });
  await sleep(150);

  const ended = await exec(`(() => {
    const v = views.get('t1');
    const chip = v.liveAssistant?.querySelector('.act-chip[data-act="tools"]');
    const card = document.querySelector('[data-tool-id="tool-1"]');
    return {
      runningTools: v.runningTools,
      actTools: Boolean(v.act?.tools),
      chip: Boolean(chip),
      status: card?.querySelector('.tool-status')?.textContent || null,
      body: card?.querySelector('.tool-body')?.textContent || null,
      runningLabel: t('toolRunning'),
    };
  })()`);

  // A chat drawn again from its own state: the tool ended while it was off screen,
  // so the result lives in `view.toolResults` and not yet in the stored history.
  const redrawn = await exec(`(() => {
    const v = views.get('t1');
    v.messages = [{ kind: 'assistant', text: '', thinking: '', tools: [{ id: 'tool-2', name: 'bash', args: { command: 'ls' } }] }];
    v.toolResults = new Map([['tool-2', { text: 'finished output', isError: false, durationMs: 1500, diff: null }]]);
    renderActiveTab();
    const card = document.querySelector('[data-tool-id="tool-2"]');
    return {
      exists: Boolean(card),
      status: card?.querySelector('.tool-status')?.textContent || null,
      body: card?.querySelector('.tool-body')?.textContent || null,
      ok: Boolean(card?.classList.contains('ok')),
      runningLabel: t('toolRunning'),
    };
  })()`);

  check('one running tool counts as one', started.runningTools === 1, started);
  check('the chip names the tool that is running', started.chipText === `${'กำลังใช้เครื่องมือ'}: bash` || /bash/.test(started.chipText || ''), started.chipText);
  check('the running tool has a card', started.cards === 1, started.cards);

  check('the count drops when the tool ends', ended.runningTools === 0, ended);
  check('the tool chip is gone when it ends', ended.chip === false && ended.actTools === false, ended);
  check('the finished card shows its duration, not "running"', ended.status !== ended.runningLabel && ended.status !== null, ended);
  check('the finished card keeps its output', ended.body === 'file.txt', ended.body);

  check('a redrawn chat finds the finished tool card', redrawn.exists === true, redrawn);
  check('a tool that ended off screen is not redrawn as running', redrawn.status !== redrawn.runningLabel, redrawn);
  check('the redrawn card carries the stored result', redrawn.body === 'finished output' && redrawn.ok === true, redrawn);

  // A call that never came back — the run was cut short (context spent, app closed).
  // On a turn that is over, "running…" claims work that is not happening.
  const cut = await exec(`(() => {
    const v = views.get('t1');
    v.busy = false;
    v.messages = [{ kind: 'assistant', text: '', thinking: '', tools: [{ id: 'tool-3', name: 'bash', args: {} }] }];
    v.toolResults = new Map();
    renderActiveTab();
    const card = document.querySelector('[data-tool-id="tool-3"]');
    return { status: card?.querySelector('.tool-status')?.textContent || null, runningLabel: t('toolRunning') };
  })()`);
  check('a tool with no result on a finished turn does not claim to be running', cut.status !== cut.runningLabel && cut.status !== null, cut);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: a tool chip and card end when the tool ends');
  app.exit(failures.length ? 1 : 0);
});
