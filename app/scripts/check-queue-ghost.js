/*
 * While a queued message is dragged, its floating label must follow the mouse.
 *
 * It used to be pinned to `left: 8px` with only the vertical axis driven, so the
 * label sat at the far left of the window and ignored the pointer entirely.
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
  name: 'n',
  model: { provider: 'free-pi', id: 'm', name: 'M' },
  models: [],
  guest: false,
  busy: false,
  messages: [],
};

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
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    applyTabState(${JSON.stringify(STATE)});
    await new Promise((r) => setTimeout(r, 150));

    // Build one queue row with a handle, the way the composer does.
    const bar = el('queueBar');
    bar.hidden = false;
    const row = document.createElement('div');
    row.className = 'queue-item';
    row.dataset.queueId = 'q1';
    row.innerHTML = '<button class="queue-grab" type="button">⣿</button><span class="queue-text">ข้อความทดสอบในคิว</span>';
    bar.appendChild(row);
    const handle = row.querySelector('.queue-grab');
    enableQueueDrag(row, handle);

    const ghostAt = () => {
      const g = document.querySelector('.queue-ghost');
      if (!g) return null;
      const r = g.getBoundingClientRect();
      return {
        left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width),
        cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
        text: g.textContent,
      };
    };

    // Grab the row's handle at a known point, then move the pointer far right.
    const hr = handle.getBoundingClientRect();
    handle.dispatchEvent(new PointerEvent('pointerdown', {
      button: 0, clientX: hr.left + 4, clientY: hr.top + 4, bubbles: true, pointerId: 1,
    }));
    const atGrab = ghostAt();

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 300, bubbles: true, pointerId: 1 }));
    const atRight = ghostAt();

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 500, bubbles: true, pointerId: 1 }));
    const atLeft = ghostAt();

    // Dragging to the extreme right must not push the label off screen.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 2, clientY: window.innerHeight - 2, bubbles: true, pointerId: 1 }));
    const atEdge = ghostAt();

    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 500, bubbles: true, pointerId: 1 }));
    await new Promise((r) => setTimeout(r, 30));
    const afterUp = ghostAt();

    return { atGrab, atRight, atLeft, atEdge, afterUp, vw: window.innerWidth, vh: window.innerHeight };
  })()`);

  check('a ghost appears while dragging', out.atGrab !== null, out.atGrab);
  check('the ghost shows the queued text', /ข้อความทดสอบ/.test(out.atGrab?.text || ''), out.atGrab?.text);
  check('the ghost is near the pointer when grabbed', Math.abs(out.atGrab.cx - 0) > 0 && out.atGrab.left > 8, out.atGrab);

  // The actual defect: the label ignored X and sat at the window's left edge.
  check('the ghost follows the pointer to the right', out.atRight.cx > out.atGrab.cx, { from: out.atGrab.cx, to: out.atRight.cx });
  check('the ghost follows the pointer back to the left', out.atLeft.cx < out.atRight.cx, { right: out.atRight.cx, left: out.atLeft.cx });
  check('the ghost moves horizontally, not just vertically', out.atRight.left !== out.atLeft.left, [out.atRight.left, out.atLeft.left]);
  check('the label is not stuck at the far left edge', out.atRight.left > 100, out.atRight.left);
  check(
    'the label stays inside the window',
    out.atEdge.left >= 0 && out.atEdge.left + out.atEdge.w <= out.vw,
    { left: out.atEdge.left, w: out.atEdge.w, vw: out.vw }
  );
  check('releasing drops the ghost', out.afterUp === null, out.afterUp);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: the drag label follows the mouse');
  app.exit(failures.length ? 1 : 0);
});
