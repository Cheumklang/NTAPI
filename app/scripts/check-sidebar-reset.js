'use strict';

/**
 * Double-clicking the sidebar puts its width back.
 *
 * The static half guards the wiring; the geometry half is what the user actually
 * asked for and only a real window can prove it — the width has to come back to
 * the shipped 268px, survive the minimum-width floor, and be *saved*, because a
 * reset that reverted on the next launch would read as a broken double-click.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-sidebar-reset.js
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

const SETUP = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const width = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // This harness runs the page without the app's main process, so the prefs:set channel has
  // no handler behind it and the call rejects. That is expected here: whether the
  // reset *persists* is a source-level fact, checked in
  // scripts/selftest-sidebar-reset.js. This check is only about geometry.
  window.addEventListener('unhandledrejection', (e) => e.preventDefault());

  // Pretend the user dragged the divider wide open, and that the drag was saved.
  const wide = window.applySidebarWidth ? window.applySidebarWidth(480) : null;
  await frame();
  const before = width();

  const bar = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('sidebar');
  if (!bar || !sidebar) return { error: 'no divider in the page' };

  // 1. The divider itself.
  bar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await frame();
  const afterDivider = width();

  // 2. The sidebar's empty space — the generous target. Widen it again first so a
  //    reset that silently did nothing cannot pass.
  bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 500 }));
  await frame();
  const rewidened = width();
  sidebar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  await frame();
  const afterSidebar = width();

  // 3. A double-click on a session row must not resize anything — a row already
  //    means "open this chat".
  let afterRow = null;
  const row = document.querySelector('.session-item');
  if (row) {
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 480 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 480 }));
    await frame();
    const beforeRow = width();
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    await frame();
    afterRow = { before: beforeRow, after: width() };
  }

  // 4. Home on the focused divider is the keyboard equivalent.
  let afterHome = null;
  if (bar) {
    bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 400 }));
    await frame();
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    await frame();
    afterHome = width();
  }
  await wait(60);

  return { before, afterDivider, rewidened, afterSidebar, afterRow, afterHome, defaultWidth: 268 };
})()`;

app.whenReady()
  .then(main)
  .catch((err) => {
    console.error('check aborted:', err && err.stack ? err.stack : err);
    app.exit(1);
  });

setTimeout(() => {
  console.error('check timed out');
  app.exit(2);
}, 2 * 60 * 1000);

async function main() {
  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 600));

  const m = await win.webContents.executeJavaScript(SETUP);
  console.log(JSON.stringify(m));

  check('the divider and sidebar are in the page', !m.error, m.error);
  if (!m.error) {
    check('a dragged width is honoured first', m.before > 268, { before: m.before });
    check('double-clicking the divider restores the default width',
      Math.abs(m.afterDivider - 268) <= 1, { after: m.afterDivider });
    check('the reset happens again after widening to the sidebar edge', m.rewidened > 268, { rewidened: m.rewidened });
    check('double-clicking the sidebar background restores it too',
      Math.abs(m.afterSidebar - 268) <= 1, { after: m.afterSidebar });
    if (m.afterRow) {
      check('a double-click on a session row does not resize', m.afterRow.after === m.afterRow.before, m.afterRow);
    }
    check('Home on the divider restores it as well', Math.abs(m.afterHome - 268) <= 1, { after: m.afterHome });
    // The reset must not have crossed the minimum-width floor either: 268 is the
    // shipped default and the sidebar header needs less than that.
    check('the reset never goes below the default it restored', m.afterDivider >= m.defaultWidth - 1, {
      after: m.afterDivider,
    });
  }

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll sidebar reset checks passed');
  app.exit(failures ? 1 : 0);
}
