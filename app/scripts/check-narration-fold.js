/*
 * A turn narrates, calls a tool, narrates again, then answers. Only the answer
 * should be open; the notes before each tool call fold away. Verified against
 * the real renderer page so the folding helpers are exercised as they ship.
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
  name: 'x',
  model: { provider: 'free-pi', id: 'm', name: 'M' },
  models: [],
  guest: false,
  busy: true,
  messages: [],
};

// One turn: note, tool, note, tool, final answer.
const HISTORY = [
  { kind: 'user', text: 'go' },
  { kind: 'assistant', text: 'Let me look at exactly how thinking arrives.', thinking: '', tools: [] },
  { kind: 'tool', id: 'a', name: 'bash', text: 'ok' },
  { kind: 'assistant', text: 'Found it. The initial HTML sets hidden = true.', thinking: '', tools: [] },
  { kind: 'tool', id: 'b', name: 'read', text: 'ok' },
  { kind: 'assistant', text: 'เสร็จแล้วครับ นี่คือคำตอบจริง', thinking: '', tools: [] },
];
const replay = { ...STATE, busy: false, messages: HISTORY };

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => [STATE]);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:activate', async () => replay);
  ipcMain.handle('tab:state', async () => replay);

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    applyTabState(${JSON.stringify(replay)});
    await new Promise((r) => setTimeout(r, 200));

    const wrap = document.querySelector('#transcript .msg.assistant');
    const group = wrap.querySelector('.narration-group');
    const list = group && group.querySelector('.narration-list');
    const toggle = group && group.querySelector('.narration-toggle');
    const openBodies = [...wrap.querySelectorAll(':scope > .body')].filter((b) => b.textContent.trim());

    const read = () => ({
      groupHidden: group ? group.hidden : null,
      listHidden: list ? list.hidden : null,
      folded: group ? [...group.querySelectorAll('.narration .body')].map((b) => b.textContent.trim()) : [],
      open: openBodies.map((b) => b.textContent.trim()),
      label: toggle ? toggle.querySelector('.narration-text').textContent : null,
      expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
      toggleVisible: toggle ? toggle.getBoundingClientRect().height > 0 : false,
    });

    const before = read();
    if (toggle) toggle.click();
    await new Promise((r) => setTimeout(r, 50));
    const afterClick = read();
    // The answer must never end up inside the fold.
    const answerFolded = before.folded.some((t) => t.includes('คำตอบจริง'));

    // A turn with no tool call must not grow a toggle at all.
    applyTabState({ ...${JSON.stringify(STATE)}, busy: false, messages: [
      { kind: 'user', text: 'q' },
      { kind: 'assistant', text: 'ตอบสั้น ๆ', thinking: '', tools: [] },
    ]});
    await new Promise((r) => setTimeout(r, 200));
    const noTools = document.querySelector('#transcript .msg.assistant');

    return { before, afterClick, answerFolded, plainToggle: Boolean(noTools.querySelector('.narration-toggle')), plainBodies: [...noTools.querySelectorAll(':scope > .body')].length };
  })()`);

  check('narration is folded behind a toggle', out.before.toggleVisible === true, out.before);
  check('the fold starts closed', out.before.listHidden === true && out.before.expanded === 'false', out.before);
  check('both notes are inside the fold', out.before.folded.length === 2, out.before.folded);
  check('the toggle counts the notes', /2/.test(out.before.label || ''), out.before.label);
  check('the real answer stays open', out.before.open.length === 1 && out.before.open[0].includes('คำตอบจริง'), out.before.open);
  check('the answer is never folded away', out.answerFolded === false);
  check('clicking opens the notes', out.afterClick.listHidden === false && out.afterClick.expanded === 'true', out.afterClick);
  check('a turn with no tools has no fold', out.plainToggle === false, out.plainToggle);
  check('a plain turn keeps its answer open', out.plainBodies === 1, out.plainBodies);


  const liveOut = await win.webContents.executeJavaScript(`(async () => {
    // Now the same turn arriving live: prose, tool, prose, tool, answer.
    applyTabState(${JSON.stringify({ ...STATE, messages: [] })});
    await new Promise((r) => setTimeout(r, 150));
    const view = activeView();
    const pushText = (t) => {
      const body = currentBody(ensureLive(view));
      body.__fpText = (body.__fpText || '') + t;
      body.textContent = body.__fpText;
    };
    pushText('Let me look at how thinking arrives.');
    sealBody(ensureLive(view));
    pushText('Found it — the hidden flag.');
    sealBody(ensureLive(view));
    pushText('เสร็จแล้วครับ คำตอบจริง');

    const wrap = document.querySelector('#transcript .msg.assistant');
    const group = wrap.querySelector('.narration-group');
    return {
      folded: group ? [...group.querySelectorAll('.narration .body')].map((b) => b.textContent.trim()) : [],
      open: [...wrap.querySelectorAll(':scope > .body')].map((b) => b.textContent.trim()).filter(Boolean),
      label: group ? group.querySelector('.narration-text').textContent : null,
      closed: group ? group.querySelector('.narration-list').hidden : null,
    };
  })()`);

  check('live turn folds its notes too', liveOut.folded.length === 2, liveOut.folded);
  check('live answer stays open', liveOut.open.length === 1 && liveOut.open[0].includes('คำตอบจริง'), liveOut.open);
  check('live fold starts closed', liveOut.closed === true, liveOut.closed);

  win.destroy();
  console.log(
    failures.length
      ? `\n${failures.length} check(s) failed`
      : '\nPASS: working notes fold away, the answer stays'
  );
  app.exit(failures.length ? 1 : 0);
});
