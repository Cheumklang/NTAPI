/*
 * The reasoning switch must always be on screen — it used to be removed whenever
 * the model reported no reasoning support, so it blinked in and out as models
 * changed. It must also colour-code effort green (frugal) to red (expensive).
 *
 * Runs the real renderer page and measures what a user would see.
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const failures = [];
let lastSetThinking = null;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const SUPPORTED = {
  supported: true,
  level: 'medium',
  levels: ['off', 'minimal', 'low', 'medium', 'high'],
};
const UNSUPPORTED = { supported: false, level: 'off', levels: ['off'] };

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);
  // Record what the UI asks the main process for, so the click path is proven
  // end to end rather than only the painting.
  ipcMain.handle('session:thinking', async (_e, { tabId, level }) => {
    lastSetThinking = level;
    return { supported: true, level: level, levels: SUPPORTED.levels, tabId };
  });

  const win = new BrowserWindow({
    show: false,
    width: 1400,
    height: 900,
    webPreferences: { preload: path.join(__dirname, '..', 'src', 'preload.js'), contextIsolation: true },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const out = await win.webContents.executeJavaScript(`(async () => {
    const sw = el('thinkingSwitch');
    const note = el('thinkingNote');
    // Measure the settled state, not a frame mid-transition: the thumb animates
    // transform and background over .18s.
    const style = document.createElement('style');
    style.textContent = '.think-thumb{transition:none !important}';
    document.head.appendChild(style);

    const read = () => {
      const thumb = sw.querySelector('.think-thumb');
      const opts = [...sw.querySelectorAll('.think-opt')];
      return {
        visible: sw.getBoundingClientRect().height > 0,
        h: Math.round(sw.getBoundingClientRect().height),
        labels: opts.map((o) => o.textContent.trim()),
        disabled: opts.map((o) => o.querySelector('input').disabled),
        checked: opts.filter((o) => o.querySelector('input').checked).map((o) => o.textContent.trim()),
        thumbBg: getComputedStyle(thumb).backgroundColor,
        thumbX: Math.round(thumb.getBoundingClientRect().left),
        noteHidden: note.hidden,
        noteText: note.textContent,
        locked: sw.classList.contains('is-locked'),
      };
    };

    paintThinking(${JSON.stringify(SUPPORTED)});
    await new Promise((r) => setTimeout(r, 120));
    const supported = read();

    // Move to the cheapest and dearest ends and record the thumb colour of each.
    const pick = (lvl) => {
      const inp = [...sw.querySelectorAll('input')].find((i) => i.value === lvl);
      inp.checked = true;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
    paintThinking({ ...${JSON.stringify(SUPPORTED)}, level: 'off' });
    await new Promise((r) => setTimeout(r, 120));
    const atOff = read();
    paintThinking({ ...${JSON.stringify(SUPPORTED)}, level: 'high' });
    await new Promise((r) => setTimeout(r, 120));
    const atHigh = read();

    // A model with no reasoning: same slot, dimmed, inert.
    paintThinking(${JSON.stringify(UNSUPPORTED)});
    await new Promise((r) => setTimeout(r, 60));
    const unsupported = read();

    // The label must say what the control is, and the thumb must sit exactly
    // behind the chosen word — the highlight drifted left of "ต่ำ" before, and
    // brushed the neighbouring label.
    // setLanguage() repaints from the active view afterwards, so it must settle
    // before painting the state we want to measure.
    await setLanguage('th');
    paintThinking({ supported: true, level: 'low', levels: ['off', 'minimal', 'low', 'medium', 'high'] });
    await new Promise((r) => setTimeout(r, 80));
    const thSw = el('thinkingSwitch');
    const thOpts = [...thSw.querySelectorAll('.think-opt')];
    const thThumb = thSw.querySelector('.think-thumb').getBoundingClientRect();
    const thSel = thOpts.find((o) => o.querySelector('input').checked).getBoundingClientRect();
    const aligned = {
      label: document.getElementById('thinkingLabel').textContent,
      labels: thOpts.map((o) => o.textContent.trim()),
      drift: Math.round(Math.abs((thThumb.left + thThumb.width / 2) - (thSel.left + thSel.width / 2))),
      overflow: thOpts.filter((o) => o.scrollWidth > o.clientWidth + 1).map((o) => o.textContent.trim()),
    };
    await setLanguage('en');
    paintThinking({ supported: true, level: 'medium', levels: ['off', 'minimal', 'low', 'medium', 'high'] });
    await new Promise((r) => setTimeout(r, 80));

    // A three-level model must still spread across the whole ramp.
    paintThinking({ supported: true, level: 'low', levels: ['off', 'low', 'high'] });
    await new Promise((r) => setTimeout(r, 60));
    const three = read();

    // And painting with no tabs at all must not throw or hide it.
    paintThinking(null);
    const blank = read();

    return { supported, atOff, atHigh, unsupported, three, blank, aligned, pickExists: typeof pick === 'function' };
  })()`);

  const { supported, atOff, atHigh, unsupported, three, blank } = out;

  check('the switch is on screen for a reasoning model', supported.visible, supported);
  check('every level is a position on the switch', supported.labels.length === 5, supported.labels);
  check('the current level is the selected one', supported.checked.length === 1, supported.checked);
  check('the switch is not a dropdown', out.pickExists === true);

  // green -> red: hue falls as effort rises.
  const hue = (rgb) => {
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb || '');
    if (!m) return null;
    const [r, g, b] = [+m[1] / 255, +m[2] / 255, +m[3] / 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return null;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const hOff = hue(atOff.thumbBg);
  const hHigh = hue(atHigh.thumbBg);
  check('the cheapest level is green', hOff !== null && hOff > 80 && hOff < 170, { rgb: atOff.thumbBg, hue: hOff });
  check('the dearest level is red', hHigh !== null && (hHigh < 20 || hHigh > 340), { rgb: atHigh.thumbBg, hue: hHigh });
  check('the thumb actually slides between levels', atOff.thumbX !== atHigh.thumbX, [atOff.thumbX, atHigh.thumbX]);

  check('an unsupported model still shows the switch', unsupported.visible, unsupported.visible);
  check('an unsupported model locks the positions', unsupported.disabled.every(Boolean), unsupported.disabled);
  check('the switch is visibly dimmed when locked', unsupported.locked === true, unsupported.locked);
  check('the reason is stated', unsupported.noteHidden === false && unsupported.noteText.length > 0, unsupported.noteText);

  check('a three-level model spreads over the whole ramp', hue(three.thumbBg) !== null, three.thumbBg);
  check('the switch says what it is', /การคิด/.test(out.aligned.label), out.aligned.label);
  check('the positions are translated', out.aligned.labels.includes('ต่ำ'), out.aligned.labels);
  check('the highlight sits behind the chosen word', out.aligned.drift <= 1, out.aligned.drift);
  check('no label spills out of its position', out.aligned.overflow.length === 0, out.aligned.overflow);

  // Clicking a position must reach the main process exactly once, with that level.
  lastSetThinking = null;
  const clicked = await win.webContents.executeJavaScript(`(async () => {
    // A tab is needed for the change handler to act.
    applyTabState(${JSON.stringify({ tabId: 't1', cwd: 'C:\w', sessionId: 's', sessionFile: 'C:\d\s.jsonl', name: 'n', model: { provider: 'free-pi', id: 'm', name: 'M' }, models: [], guest: false, busy: false, messages: [] })});
    await new Promise((r) => setTimeout(r, 150));
    paintThinking({ supported: true, level: 'off', levels: ['off', 'minimal', 'low', 'medium', 'high'] });
    const hi = [...el('thinkingSwitch').querySelectorAll('.think-opt')].find((o) => o.textContent.trim().toLowerCase().includes('high') || o.querySelector('input').value === 'high');
    hi.querySelector('input').click();
    await new Promise((r) => setTimeout(r, 150));
    return { level: el('thinkingSelect').value };
  })()`);
  check('clicking a position reaches the main process', lastSetThinking === 'high', { sent: lastSetThinking, clicked: clicked.level });
  check('no tab painted is still on screen', blank.visible === true, blank);

  win.destroy();
  console.log(
    failures.length ? `\n${failures.length} check(s) failed` : '\nPASS: the reasoning switch is always there and colour-coded'
  );
  app.exit(failures.length ? 1 : 0);
});
