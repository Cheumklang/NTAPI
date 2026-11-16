/**
 * A turn that ended without `agent:settled` must not hold the queue hostage.
 *
 * The report: the composer still said "AI กำลังทำงาน" and offered Stop, and the
 * message the user had queued never went out. The pill was the visible half; the
 * damage was the queue, which is drained from the settle event and from nowhere
 * else. So a missed settle left a message waiting for a turn that was already
 * over — and pressing Stop could not help, because there was nothing to stop.
 *
 * The repair checks the tab's real state and then does what the settle would have
 * done: release the flag, clear the chips, and send the queued message.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-stale-queue.js
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

/** Main's answer for a tab: `busy` mirrors the agent events, and it is stale-free. */
const busyFromMain = { t1: false, t2: false };

app.whenReady().then(async () => {
  const stateFor = (tabId) => ({
    tabId,
    cwd: 'C:\\w',
    sessionId: `s-${tabId}`,
    sessionFile: `C:\\d\\${tabId}.jsonl`,
    name: tabId,
    model: { provider: 'free-pi', id: 'm', name: 'M' },
    models: [],
    guest: false,
    busy: busyFromMain[tabId],
    messages: [],
  });

  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async (_e, tabId) => stateFor(tabId));

  const win = new BrowserWindow({
    show: true,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 800));

  const run = (expr) => win.webContents.executeJavaScript(expr);

  // Two chats that both think they are working: one on screen, one behind it.
  const setup = await run(`(() => {
    for (const tabId of ['t1', 't2']) {
      const view = views.get(tabId) || createView(tabId);
      view.sessionId = 's-' + tabId;
      view.sessionFile = 'C:\\\\d\\\\' + tabId + '.jsonl';
      view.name = tabId;
      view.busy = true;
      view.queue = [{ text: 'queued in ' + tabId }];
      views.set(tabId, view);
    }
    activeTabId = 't1';
    setBusy(true);
    renderQueue();
    return { tabs: [...views.keys()], queueRows: document.querySelectorAll('#queueBar .q-row').length };
  })()`);
  check('two chats are set up as working with a queued message each', setup.tabs.length === 2, setup);

  const healed = await run(`(async () => {
    await reconcileBusy();
    await new Promise((r) => setTimeout(r, 80));
    const at = views.get('t1');
    const bg = views.get('t2');
    // The send itself reaches the main process, which is not running here, so the
    // proof that the drain ran is the message it put into the transcript.
    const sentText = (v) => v.messages.filter((m) => m.kind === 'user' && m.pending).map((m) => m.text);
    return {
      t1busy: at.busy, t2busy: bg.busy,
      t1queue: at.queue.length, t2queue: bg.queue.length,
      t1messages: sentText(at), t2messages: sentText(bg),
      stopShown: !document.getElementById('stopBtn').hidden,
      sendShown: !document.getElementById('sendBtn').hidden,
    };
  })()`);
  check('the on-screen chat stops claiming to work', healed.t1busy === false, healed);
  check('its queued message goes out', healed.t1messages.includes('queued in t1'), healed);
  check('the composer is back to Send', healed.stopShown === false && healed.sendShown === true, healed);

  // The background chat is the one the report was about: its queue is stuck and
  // the reader never opens it to notice.
  check('the chat behind it is released too', healed.t2busy === false, healed);
  check('and its queued message goes out as well',
    healed.t2messages.includes('queued in t2'), healed);
  check('both queues are empty', healed.t1queue === 0 && healed.t2queue === 0, healed);

  // A turn that really is running must be left alone.
  busyFromMain.t1 = true;
  const running = await run(`(async () => {
    const view = views.get('t1');
    view.busy = true;
    setBusy(true);
    view.queue = [{ kind: 'prompt', text: 'must wait' }];
    await reconcileBusy();
    return { busy: view.busy, queue: view.queue.length, stopShown: !document.getElementById('stopBtn').hidden };
  })()`);
  check('a genuinely running turn is not cut short', running.busy === true && running.queue === 1, running);
  check('Stop stays up while it really runs', running.stopShown === true, running);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: a stale busy flag releases the queue');
  app.exit(failures ? 1 : 0);
});
