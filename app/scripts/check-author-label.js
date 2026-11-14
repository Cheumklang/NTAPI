/*
 * The label above an assistant reply must name the provider and model that
 * answered, not the app. Runs the real renderer page with stubbed IPC so the
 * helper and the repaint path are exercised as they ship.
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
  cwd: 'C:\work\demo',
  sessionId: 'sess-1',
  sessionFile: 'C:\data\sessions\work\sess-1.jsonl',
  name: 'demo',
  model: { provider: 'free-pi', id: 'deepseek-v4-1-flash', name: 'DeepSeek V4.1 Flash' },
  models: [
    { provider: 'free-pi', id: 'deepseek-v4-1-flash', name: 'DeepSeek V4.1 Flash' },
    { provider: 'nvidia', id: 'deepseek-flash', name: 'DeepSeek Flash' },
  ],
  guest: false,
  busy: false,
  messages: [
    { kind: 'user', text: 'hello' },
    { kind: 'assistant', text: 'hi there', thinking: '', tools: [] },
  ],
};

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0.0.0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => [STATE]);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:activate', async () => STATE);
  ipcMain.handle('tab:state', async () => STATE);
  ipcMain.handle('tab:setModel', async (_e, _t, provider, id) => {
    const m = STATE.models.find((x) => x.provider === provider && x.id === id);
    return m || null;
  });

  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    applyTabState(window.__STATE__ = ${JSON.stringify(STATE)});
    await new Promise((r) => setTimeout(r, 120));
    const roles = () => [...document.querySelectorAll('#transcript .msg.assistant > .role')].map((n) => n.textContent);
    const before = roles();
    const model = activeView().model;
    renderActiveTab();
    const rendered = roles();

    // What the CSS actually shows (letter-spacing/uppercase are styling only).
    const upper = getComputedStyle(document.querySelector('#transcript .msg.assistant > .role')).textTransform;

    // A user row must keep saying "You", not the model.
    const userRole = document.querySelector('#transcript .msg.user > .role').textContent;
    const noneHelper = messageAuthor({ model: null });

    // Switching model must re-stamp the replies already on screen.
    const other = { provider: 'nvidia', id: 'deepseek-flash', name: 'DeepSeek Flash' };
    activeView().model = other;
    refreshMessageAuthors();
    const after = roles();

    // No model at all must not print a bare separator.
    activeView().model = null;
    refreshMessageAuthors();
    const none = roles();

    activeView().model = model;
    return { before, rendered, after, none, upper, userRole, noneHelper };
  })()`);

  check('assistant replies are labelled with provider and model', /^FreePi \| Model: DeepSeek V4\.1 Flash$/.test(out.rendered[0] || ''), out.rendered);
  check('the label renders upper case', out.upper === 'uppercase', out.upper);
  check('a user row still says You', out.userRole.toLowerCase() === 'you', out.userRole);
  check('switching model re-stamps existing replies', /^NVIDIA \| Model: DeepSeek Flash$/.test(out.after[0] || ''), out.after);
  // With no model chosen there is nothing honest to name, so fall back to the
  // plain role word rather than printing " | Model: " on its own.
  check('no model prints the plain role label, not a dangling separator', out.none[0] === 'NTAPI', out.none);

  // The whole string the user asked for, as displayed.
  const shown = (out.rendered[0] || '').toUpperCase();
  check('via the real page the text reads FREEPI | MODEL: DEEPSEEK V4.1 FLASH', shown === 'FREEPI | MODEL: DEEPSEEK V4.1 FLASH', shown);

  win.destroy();
  console.log(
    failures.length
      ? `\n${failures.length} check(s) failed`
      : '\nPASS: replies are labelled with the provider and model'
  );
  app.exit(failures.length ? 1 : 0);
});
