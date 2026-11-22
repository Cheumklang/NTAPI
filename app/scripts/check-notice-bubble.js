/*
 * The passing note above the composer ("sent into the running turn") must sit in
 * the same column as the input box, not stray out to the window edge — and it
 * should fade out rather than blink away.
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
    // No animations: this measures the resting geometry.
    const s = document.createElement('style');
    s.textContent = '.notice{animation:none !important} .notice.out{animation:none !important}';
    document.head.appendChild(s);

    showNotice('ส่งเข้าเทิร์นที่กำลังทำงานแล้ว', 0);
    await new Promise((r) => setTimeout(r, 60));

    const n = el('notice');
    const box = document.querySelector('.composer-box');
    const nr = n.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const cs = getComputedStyle(n);
    const footer = el('composer').getBoundingClientRect();

    const shown = {
      left: Math.round(nr.left), right: Math.round(nr.right), w: Math.round(nr.width),
      centre: Math.round(nr.left + nr.width / 2),
      boxCentre: Math.round(br.left + br.width / 2),
      boxLeft: Math.round(br.left), boxRight: Math.round(br.right),
      radius: cs.borderRadius, border: cs.borderTopWidth, bg: cs.backgroundColor,
      height: Math.round(nr.height),
      notAtWindowEdge: nr.left > footer.left + 2,
      insideBoxColumn: nr.left >= br.left - 1 && nr.right <= br.right + 1,
      fitsContent: nr.width < br.width,
      text: n.textContent,
      visible: !n.hidden,
    };

    // Every short remark shares this one element, so the frame must not depend on
    // the text: "compacting the conversation" gets the same bubble as the steer
    // note. A zero duration means it stays put until something replaces it.
    showNotice(t('compact') + '…', 0);
    await new Promise((r) => setTimeout(r, 500));
    const nr2 = el('notice').getBoundingClientRect();
    const compact = {
      text: el('notice').textContent,
      stillVisible: !el('notice').hidden,
      sameFrame:
        Math.abs(Math.round(nr2.left + nr2.width / 2) - Math.round(br.left + br.width / 2)) <= 2 &&
        nr2.left >= br.left - 1 &&
        nr2.right <= br.right + 1,
      style: getComputedStyle(el('notice')).borderRadius,
    };
    showNotice('ส่งเข้าเทิร์นที่กำลังทำงานแล้ว', 0);
    await new Promise((r) => setTimeout(r, 40));

    // Fading out must not remove it in the same frame.
    hideNotice();
    await new Promise((r) => setTimeout(r, 40));
    const fading = { hidden: n.hidden, out: n.classList.contains('out') };
    await new Promise((r) => setTimeout(r, 260));
    const gone = { hidden: n.hidden, text: n.textContent };

    return { shown, compact, fading, gone };
  })()`);

  const { shown, compact, fading, gone } = out;
  check('the notice is shown', shown.visible === true);
  check('it carries the steer message', /เทิร์น/.test(shown.text), shown.text);
  check('it is not pinned to the window edge', shown.notAtWindowEdge === true, { left: shown.left });
  check('it sits inside the composer column', shown.insideBoxColumn === true, {
    notice: [shown.left, shown.right],
    box: [shown.boxLeft, shown.boxRight],
  });
  check('it is centred on the composer', Math.abs(shown.centre - shown.boxCentre) <= 2, {
    centre: shown.centre,
    boxCentre: shown.boxCentre,
  });
  check('it is a bubble, not a full-width bar', shown.fitsContent === true, { w: shown.w });
  check('it is rounded and bordered', parseFloat(shown.radius) >= 10 && parseFloat(shown.border) >= 1, {
    radius: shown.radius,
    border: shown.border,
  });
  check('a persistent note does not vanish on its own', compact.stillVisible === true, compact);
  check('another message gets the same frame', compact.sameFrame === true, compact);
  check('the compact note is the same bubble', parseFloat(compact.style) >= 10, compact.style);
  check('it fades before disappearing', fading.hidden === false && fading.out === true, fading);
  // The bubble itself keeps its two child spans, and the markup around them is
  // indentation — so "emptied" means no words are left to read, not that the
  // string is zero-length.
  check('it is gone and emptied afterwards', gone.hidden === true && gone.text.trim() === '', gone);

  win.destroy();
  console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: the note sits in the chat frame and fades out');
  app.exit(failures.length ? 1 : 0);
});
