/*
 * A repaint in the middle of a turn must not hand the running turn the finished
 * reply above it.
 *
 * The renderer draws one bubble per turn, and after a repaint it has to find the
 * bubble that turn is writing into again (`adoptLiveBubble`). It used to adopt the
 * last reply unconditionally, so when the running turn had not answered yet the
 * next tool card went into the *previous* turn's bubble: the transcript showed an
 * old answer with one summary line over it counting both turns' tools. Reloading
 * the chat rebuilt it correctly, which is why the wrong count vanished on the
 * next repaint and could not be found again.
 *
 * Main now sends `liveTurnStart` — the entry index where the running turn begins —
 * and the renderer adopts only a bubble drawn at or after it.
 *
 * Measured on the real renderer; no agent is started.
 *
 * Run from app/:   electron scripts/check-live-turn-bubble.js
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

const FINISHED = [
  { kind: 'user', text: 'คำถามแรก', images: [], ts: 1 },
  {
    kind: 'assistant',
    text: 'คำตอบแรก',
    thinking: '',
    ts: 2,
    tools: [
      { id: 'old-1', name: 'bash', args: { command: 'ls' } },
      { id: 'old-2', name: 'bash', args: { command: 'pwd' } },
      { id: 'old-3', name: 'edit', args: { file: 'a.js' } },
    ],
  },
  { kind: 'user', text: 'คำถามใหม่', images: [], ts: 3 },
];

const STATE = {
  tabId: 't1',
  cwd: '/w',
  sessionId: 's',
  sessionFile: '/d/s.jsonl',
  name: 'n',
  model: { provider: 'free-pi', id: 'm', name: 'M' },
  models: [],
  guest: false,
  busy: true,
  messages: FINISHED,
  // The running turn starts after the last user message and has not answered yet.
  liveTurnStart: 3,
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
  await sleep(200);

  const before = await exec(`(() => {
    const v = views.get('t1');
    const wraps = [...document.querySelectorAll('.msg.assistant')];
    return {
      bubbles: wraps.length,
      live: Boolean(v.liveAssistant),
      summaries: wraps.map((w) => w.querySelector('.tools-toggle')?.textContent || ''),
    };
  })()`);
  check('the finished turn keeps its own bubble', before.bubbles === 1, before);
  check('no bubble is adopted for a turn that has not answered', before.live === false, before);
  check('the finished turn counts its three tools', /3/.test(before.summaries[0] || ''), before.summaries);

  // The running turn starts working after the repaint.
  win.webContents.send('agent:toolStart', { tabId: 't1', id: 'new-1', name: 'bash', args: { command: 'uname -s' } });
  await sleep(200);

  const after = await exec(`(() => {
    const v = views.get('t1');
    const wraps = [...document.querySelectorAll('.msg.assistant')];
    return {
      bubbles: wraps.length,
      summaries: wraps.map((w) => w.querySelector('.tools-toggle')?.textContent || ''),
      inFirst: document.querySelectorAll('.msg.assistant')[0]?.querySelectorAll('.tool').length || 0,
      inSecond: document.querySelectorAll('.msg.assistant')[1]?.querySelectorAll('.tool').length || 0,
      liveIsLast: v.liveAssistant === wraps[wraps.length - 1],
    };
  })()`);
  check('the running turn gets its own bubble', after.bubbles === 2, after);
  check('the old reply is not given the new card', after.inFirst === 3, after);
  check('the new card lands in the running turn', after.inSecond === 1, after);
  check('the running turn counts only its own tool', /1/.test(after.summaries[1] || '') && !/\[object/.test(after.summaries[1] || ''), after.summaries);
  check('the live pointer follows the running turn', after.liveIsLast === true, after);

  // A repaint in the middle of that turn must re-adopt the running turn's bubble,
  // not the finished one, and must not open a third.
  await exec(`(() => { applyTabState(${JSON.stringify({ ...STATE, messages: FINISHED, liveTurnStart: 3 })}); return true; })()`);
  await sleep(200);
  const repainted = await exec(`(() => {
    const v = views.get('t1');
    const wraps = [...document.querySelectorAll('.msg.assistant')];
    return {
      bubbles: wraps.length,
      summaries: wraps.map((w) => w.querySelector('.tools-toggle')?.textContent || ''),
      liveIsLast: v.liveAssistant === wraps[wraps.length - 1],
    };
  })()`);
  // The live turn's own card is kept on the view, so the repaint draws it again as
  // its own bubble — two bubbles, never one with both turns' cards.
  check('the repaint keeps one bubble per turn', repainted.bubbles === 2, repainted);
  check('a repainted turn is not merged into the finished one', repainted.liveIsLast === true, repainted);
  check('the repainted finished turn keeps its three tools', /3/.test(repainted.summaries[0] || ''), repainted.summaries);

  // A state from an older build carries no boundary: the last reply is the only
  // clue, and adopting it is better than opening a second bubble below it.
  await exec(`(() => {
    const v = views.get('t1');
    v.messages = ${JSON.stringify(FINISHED)};
    v.liveMessages = [];
    v.liveTurnStart = null;
    v.liveAssistant = null;
    v.busy = true;
    renderActiveTab();
    return true;
  })()`);
  await sleep(150);
  win.webContents.send('agent:toolStart', { tabId: 't1', id: 'legacy-1', name: 'bash', args: { command: 'ls' } });
  await sleep(200);
  const legacy = await exec(`(() => {
    const wraps = [...document.querySelectorAll('.msg.assistant')];
    return { bubbles: wraps.length, last: wraps[wraps.length - 1]?.querySelectorAll('.tool').length || 0 };
  })()`);
  check('without a boundary the old behaviour is kept', legacy.bubbles === 1 && legacy.last === 4, legacy);

  await win.close();
  if (failures.length) {
    console.log(`\n${failures.length} live-turn check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nlive turn bubble: all checks passed');
  app.exit(0);
});
