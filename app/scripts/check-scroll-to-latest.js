/**
 * Opening a chat has to land on the newest message.
 *
 * Reproduces the report: read up in one chat, switch to another, and the view
 * stayed where it had been — a screen or two above the end, with the newest
 * answer off screen. The transcript is repainted on a switch, and the tail is
 * drawn first while the rest of the history arrives above it afterwards; each of
 * those passes grows the page below the viewport and fired a scroll event, which
 * the follow handler read as "the reader left the bottom".
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-scroll-to-latest.js
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

/** A conversation long enough that the tail is not the whole transcript. */
function conversation(tag, count) {
  const messages = [{ kind: 'user', text: `${tag}: first question` }];
  for (let i = 0; i < count; i += 1) {
    messages.push({ kind: 'user', text: `${tag} question ${i}` });
    messages.push({
      kind: 'assistant',
      text: `${tag} answer ${i} — ` + 'filler text to take up room. '.repeat(8),
    });
  }
  return messages;
}

const state = (tabId, tag) => ({
  tabId,
  cwd: 'C:\\w',
  sessionId: `s-${tabId}`,
  sessionFile: `C:\\d\\${tabId}.jsonl`,
  name: tag,
  model: { provider: 'free-pi', id: 'm', name: 'M' },
  models: [],
  guest: false,
  busy: false,
  messages: conversation(tag, 30),
});

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:activate', async () => state('t2', 'other'));
  ipcMain.handle('tab:state', async () => state('t2', 'other'));

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));
  // Smooth scrolling animates, so the measured offset would be the old one.
  await win.webContents.insertCSS('html, body, .transcript { scroll-behavior: auto !important; }');

  const run = (expr) => win.webContents.executeJavaScript(expr);

  // Chat one, read all the way up — with a wheel, the way a reader does it. A
  // programmatic scroll lands in the same tick as the jump it is competing with.
  await run(`applyTabState(${JSON.stringify(state('t1', 'first'))})`);
  await new Promise((r) => setTimeout(r, 700));
  const scrolledUp = await run(`(() => {
    const t = document.getElementById('transcript');
    t.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    t.scrollTop = 0;
    t.dispatchEvent(new Event('scroll'));
    return { scrollTop: t.scrollTop, readingUp: isReadingUp() };
  })()`);
  check('the reader is scrolled up in the first chat', scrolledUp.readingUp === true, scrolledUp);

  // Now switch chat. This is the report.
  await run(`applyTabState(${JSON.stringify(state('t2', 'other'))})`);
  const early = await run(`({
    gap: Math.round(distanceFromBottom()),
    readingUp: isReadingUp(),
  })`);
  // The fill continues after the first layout — wait for it, as a reader would.
  await new Promise((r) => setTimeout(r, 400));
  const settled = await run(`({
    gap: Math.round(distanceFromBottom()),
    scrollTop: document.getElementById('transcript').scrollTop,
    scrollHeight: document.getElementById('transcript').scrollHeight,
    clientHeight: document.getElementById('transcript').clientHeight,
    readingUp: isReadingUp(),
    buttonHidden: document.getElementById('jumpToBottom').hidden,
  })`);

  check('the switch starts at the bottom', early.gap <= 2 && early.readingUp === false, early);
  check('the newest message is still on screen once it has drawn', settled.gap <= 2, settled);
  check('the jump-to-newest button is hidden after a switch', settled.buttonHidden === true, settled);

  // The history that arrives above must not walk the view away from the end.
  const late = await run(`new Promise((resolve) => setTimeout(() => resolve({
    gap: Math.round(distanceFromBottom()),
    readingUp: isReadingUp(),
  }), 700))`);
  check('filling the history above does not pull it back up', late.gap <= 2, late);

  // A reader who scrolls away is still respected: the hold must lose to a wheel.
  const afterWheel = await run(`(() => {
    const t = document.getElementById('transcript');
    t.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    t.scrollTop = 200;
    t.dispatchEvent(new Event('scroll'));
    return { readingUp: isReadingUp(), scrollTop: t.scrollTop };
  })()`);
  check('a wheel cancels the forced jump', afterWheel.readingUp === true, afterWheel);

  const stays = await run(`new Promise((resolve) => setTimeout(() => resolve({
    scrollTop: document.getElementById('transcript').scrollTop,
  }), 500))`);
  check('the view is not re-pinned behind the reader', stays.scrollTop === afterWheel.scrollTop, stays);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: a chat opens on its newest message');
  app.exit(failures ? 1 : 0);
});
