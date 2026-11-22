/**
 * A queued message must not be fired into a turn that did not finish.
 *
 * The report: a turn ran out of allowance, the message the user had queued went
 * out anyway, and the model they switched in afterwards read it as the next job
 * and started on it while the previous work was still open. The queue is drained
 * from `agent:settled` and nowhere else, so every kind of ending released it
 * equally — a clean finish, a limit, a provider error, a Stop.
 *
 * What is checked here, in a real window:
 *   1. a settle that says the turn failed leaves the queue alone
 *   2. a settle after a Stop leaves it alone too
 *   3. the bar says why, in one line, with one button
 *   4. that button releases the message and it goes out
 *   5. a clean settle still sends, exactly as before
 *
 * Run from app/:   npx electron --no-sandbox scripts/check-queue-hold.js
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

const sent = [];

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('usage:fetch', async () => null);
  ipcMain.handle('system:getState', async () => null);
  ipcMain.handle('tab:state', async (_e, tabId) => ({
    tabId,
    cwd: '/tmp',
    sessionId: `s-${tabId}`,
    sessionFile: `/tmp/${tabId}.jsonl`,
    name: tabId,
    model: { provider: 'free-pi', id: 'm', name: 'M' },
    models: [],
    guest: false,
    busy: false,
    messages: [],
  }));
  // The drain only proves itself once the prompt leaves the window.
  ipcMain.handle('prompt:send', async (_e, payload) => {
    sent.push(payload);
    return { ok: true };
  });

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
  const settle = (payload) => win.webContents.send('agent:settled', { tabId: 't1', ...payload });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await run(`(() => {
    const view = views.get('t1') || createView('t1');
    view.sessionId = 's-t1';
    view.sessionFile = '/tmp/t1.jsonl';
    view.name = 't1';
    views.set('t1', view);
    activeTabId = 't1';
    return true;
  })()`);

  /* ---- 1. the turn died on a limit -------------------------------------- */
  await run(`(() => {
    const view = activeView();
    view.busy = true;
    view.queue = [{ kind: 'prompt', text: 'queued: install ponytail too', queueId: 'q1' }];
    renderQueue();
    return true;
  })()`);
  settle({ aborted: false, failed: true });
  await wait(150);
  const failed = await run(`(() => {
    const view = activeView();
    const hold = document.querySelector('#queueBar .queue-hold');
    return {
      queue: view.queue.length,
      hold: view.queueHold,
      note: hold ? hold.querySelector('.queue-hold-why')?.textContent || '' : null,
      button: hold ? hold.querySelector('.queue-hold-send')?.textContent || '' : null,
      pending: view.messages.filter((m) => m.kind === 'user').map((m) => m.text),
      busy: view.busy,
    };
  })()`);
  check('a failed turn does not send the queued message', failed.queue === 1 && failed.pending.length === 0, failed);
  check('the queue is marked as held', failed.hold === 'failed', failed);
  check('the bar says why it is waiting', /error|ผิดพลาด/i.test(failed.note || ''), failed.note);
  check('and offers the one press that releases it', Boolean(failed.button), failed.button);
  check('the composer is idle again, so the pause is the only thing holding it', failed.busy === false, failed);

  /* ---- 2. a Stop is not a finish either --------------------------------- */
  await run(`(() => {
    const view = activeView();
    view.queueHold = null;
    view.busy = true;
    renderQueue();
    return true;
  })()`);
  settle({ aborted: true, failed: false });
  await wait(150);
  const stopped = await run(`(() => {
    const view = activeView();
    const hold = document.querySelector('#queueBar .queue-hold');
    return {
      queue: view.queue.length,
      hold: view.queueHold,
      note: hold ? hold.querySelector('.queue-hold-why')?.textContent || '' : null,
      pending: view.messages.filter((m) => m.kind === 'user').map((m) => m.text),
    };
  })()`);
  check('a Stop does not send the queued message either', stopped.queue === 1 && stopped.pending.length === 0, stopped);
  check('a Stop gets its own wording', /stop|หยุด/i.test(stopped.note || ''), stopped.note);

  /* ---- 3. the button releases it ---------------------------------------- */
  const released = await run(`(async () => {
    const button = document.querySelector('#queueBar .queue-hold-send');
    if (button) button.click();
    await new Promise((r) => setTimeout(r, 200));
    const view = activeView();
    return {
      queue: view.queue.length,
      hold: view.queueHold,
      pending: view.messages.filter((m) => m.kind === 'user').map((m) => m.text),
    };
  })()`);
  check('pressing it sends the message', released.pending.includes('queued: install ponytail too'), released);
  check('the queue empties and the hold clears', released.queue === 0 && released.hold === null, released);

  /* ---- 4. a clean turn still sends, exactly as before -------------------- */
  await run(`(() => {
    const view = activeView();
    view.queue = [{ kind: 'prompt', text: 'queued: after a clean turn', queueId: 'q2' }];
    view.busy = true;
    renderQueue();
    return true;
  })()`);
  settle({ aborted: false, failed: false });
  await wait(200);
  const clean = await run(`(() => {
    const view = activeView();
    return {
      queue: view.queue.length,
      hold: view.queueHold,
      pending: view.messages.filter((m) => m.kind === 'user').map((m) => m.text),
    };
  })()`);
  check('a clean settle releases the queue as it always did',
    clean.pending.includes('queued: after a clean turn') && clean.queue === 0 && clean.hold === null, clean);
  check('the prompt really left the window', sent.some((p) => String(p?.text || '').includes('after a clean turn')), sent.length);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: an unfinished turn holds the queue');
  app.exit(failures ? 1 : 0);
});