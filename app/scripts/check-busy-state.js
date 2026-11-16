'use strict';

/**
 * The pill follows the tab the window is on.
 *
 * A turn that finished in a tab the user had just left used to leave "กำลังทำงาน"
 * on screen with nothing running, and Stop could not help because there was
 * nothing to stop. This drives the repaint against real views and reads the real
 * controls, because what matters is what the window shows, not that a function
 * exists.
 *
 * Run from app/: node_modules/electron/dist/electron.exe scripts/check-busy-state.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const PROBE = `(() => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const read = () => ({
    hint: document.getElementById('statusHint').textContent.trim(),
    stopHidden: document.getElementById('stopBtn').hidden,
    sendHidden: document.getElementById('sendBtn').hidden,
    placeholder: document.getElementById('input').placeholder,
  });

  lang = 'th';
  applyLanguage();

  // Two tabs, the window on the first one, which is the one running.
  const a = createView('probe-a');
  const b = createView('probe-b');
  activeTabId = 'probe-a';
  a.busy = true;
  setBusy(true);
  const running = read();

  // The turn finishes in the tab the user is *not* looking at. The old code only
  // switched the pill off when the settled event belonged to the active tab.
  b.busy = false;
  a.busy = true;
  paintBusyFromViews();
  const stillRunning = read();

  // Now the active tab finishes.
  a.busy = false;
  paintBusyFromViews();
  const done = read();

  // A tab that is busy while the window sits on an idle one must not show
  // "working": the pill is about the tab being read, and Stop there would stop
  // nothing the user can see.
  b.busy = true;
  a.busy = false;
  activeTabId = 'probe-a';
  paintBusyFromViews();
  const otherTabBusy = read();

  views.delete('probe-a');
  views.delete('probe-b');
  activeTabId = null;
  setBusy(false);

  return { running, stillRunning, done, otherTabBusy };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const res = await win.webContents.executeJavaScript(PROBE);
  console.log(JSON.stringify(res, null, 1));

  check('a running turn says กำลังทำงาน', /กำลังทำงาน/.test(res.running.hint), res.running.hint);
  check('a running turn offers Stop', res.running.stopHidden === false);
  check('the working placeholder explains the busy composer',
    /AI กำลังทำงาน/.test(res.running.placeholder), res.running.placeholder);
  check('it stays on while the tab really is busy', /กำลังทำงาน/.test(res.stillRunning.hint), res.stillRunning.hint);
  check('a finished turn goes back to พร้อมใช้งาน', res.done.hint === 'พร้อมใช้งาน', res.done.hint);
  check('a finished turn offers Send again', res.done.sendHidden === false && res.done.stopHidden === true, res.done);
  check('the placeholder goes back to the idle wording',
    /Enter ส่ง/.test(res.done.placeholder), res.done.placeholder);
  check('another tab being busy does not mark the window as working',
    res.otherTabBusy.hint === 'พร้อมใช้งาน' && res.otherTabBusy.stopHidden === true, res.otherTabBusy);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll busy-state checks passed');
  app.exit(failures ? 1 : 0);
});
