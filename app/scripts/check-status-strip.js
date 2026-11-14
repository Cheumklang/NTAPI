/*
 * The footer's activity readout must stay one line.
 *
 * It used to append and keep six rows, so a burst of browser commands grew the
 * footer upward and pushed the composer and the transcript up with it — the chat
 * visibly jumped while the agent worked.
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

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);

  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const strip = el('activityStrip');
    const lines = el('activityLines');
    const composerTop = () => Math.round(document.getElementById('composerBox')?.getBoundingClientRect().top ?? -1);

    clearActivity();
    // Baseline: a visible strip holding exactly one command.
    pushActivity({ cmd: 'scroll', ok: true });
    await new Promise((r) => setTimeout(r, 60));
    const beforeTop = composerTop();
    const beforeH = Math.round(strip.getBoundingClientRect().height);

    // Six more commands in a row, exactly the burst that used to stack up.
    for (let i = 0; i < 6; i += 1) pushActivity({ cmd: 'detachAll', ok: true });
    await new Promise((r) => setTimeout(r, 60));
    const many = {
      rows: lines.children.length,
      h: Math.round(strip.getBoundingClientRect().height),
      text: lines.textContent.trim(),
      composerTop: composerTop(),
    };

    // A newer command replaces the older one rather than joining it.
    pushActivity({ cmd: 'click', ref: '12', ok: true });
    await new Promise((r) => setTimeout(r, 60));
    const replaced = { rows: lines.children.length, text: lines.textContent.trim() };

    // A failure still shows, and shows alone.
    clearActivity();
    pushActivity({ cmd: 'navigate', ok: false });
    await new Promise((r) => setTimeout(r, 60));
    const failed = {
      rows: lines.children.length,
      text: lines.textContent.trim(),
      bad: Boolean(lines.querySelector('.activity-line.bad')),
    };

    clearActivity();
    const cleared = { hidden: strip.hidden, rows: lines.children.length };

    return { beforeTop, beforeH, many, replaced, failed, cleared };
  })()`);

  check('one line only, however many commands run', out.many.rows === 1, out.many.rows);
  check('the strip does not grow taller', out.many.h === out.beforeH, { before: out.beforeH, after: out.many.h });
  check('the composer does not move up', out.many.composerTop === out.beforeTop, {
    before: out.beforeTop,
    after: out.many.composerTop,
  });
  check('the latest command is the one shown', /detachAll/.test(out.many.text), out.many.text);
  check('a newer command replaces the older one', /click/.test(out.replaced.text) && !/detachAll/.test(out.replaced.text), out.replaced.text);
  check('a failure still shows, and alone', out.failed.rows === 1 && out.failed.bad, out.failed);
  check('clearing empties the strip', out.cleared.hidden === true && out.cleared.rows === 0, out.cleared);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: the activity strip stays one line');
  app.exit(failures.length ? 1 : 0);
});
