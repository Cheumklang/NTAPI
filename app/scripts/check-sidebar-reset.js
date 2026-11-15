'use strict';

/**
 * Prove the sidebar cannot be resized any more.
 *
 * The column is fixed at the width its own longest line needs, because the
 * sponsor creative is cropped to it: a user who dragged the sidebar was choosing
 * a different crop of the same ad. The static half is
 * scripts/selftest-sidebar-reset.js; this is the geometry a real window can show —
 * no handle, no drag, no double-click, no keyboard, and the note still fits.
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

  // This harness runs the page without the app's main process, so prefs:set has
  // no handler behind it. Nothing here depends on saving: the width is not saved
  // at all any more.
  window.addEventListener('unhandledrejection', (e) => e.preventDefault());

  const initial = width();
  const floor = Math.round(sidebarMinWidth());
  const bar = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('sidebar');

  // A leftover caller from an older build must not be able to widen the column.
  const returned = applySidebarWidth(480);
  await frame();
  const afterCall = width();

  // Every gesture that used to resize it.
  sidebar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 300 }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 500 }));
  sidebar.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  sidebar.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
  await frame();
  const afterGestures = width();

  const note = document.querySelector('#sidebar .approval-note');
  return {
    initial,
    floor,
    returned,
    afterCall,
    afterGestures,
    hasHandle: Boolean(bar),
    resizingClass: document.body.classList.contains('resizing'),
    sidebarBox: Math.round(sidebar.getBoundingClientRect().width),
    noteFits: note ? note.scrollWidth <= note.clientWidth + 1 : true,
  };
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

  check('the drag handle is gone', m.hasHandle === false);
  check('the column starts at the measured floor', Math.abs(m.initial - m.floor) <= 1, {
    width: m.initial,
    floor: m.floor,
  });
  check('the sidebar is drawn at that width', Math.abs(m.sidebarBox - m.initial) <= 1, {
    sidebar: m.sidebarBox,
    applied: m.initial,
  });
  check('a call with a pixel value cannot widen it', m.returned === m.initial && m.afterCall === m.initial, {
    returned: m.returned,
    after: m.afterCall,
  });
  check('no drag, double-click or key moves the column', m.afterGestures === m.initial, {
    before: m.initial,
    after: m.afterGestures,
  });
  check('nothing enters the dragging state', m.resizingClass === false);
  check('the longest line still fits at that width', m.noteFits === true);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll sidebar lock checks passed');
  app.exit(failures ? 1 : 0);
}