/**
 * The window opens usable.
 *
 * A stray `</div>` closed `#sidebar` before the rest of its contents, so the
 * workspace picker, the chat list, the status panel and the composer became
 * siblings of the app shell instead of children of it. Nothing threw and every
 * script ran — the window simply opened with nothing that could be clicked or
 * typed into, and the composer was pushed off the bottom of the window.
 *
 * This loads the real renderer, the real stylesheet and the real preload, then
 * measures what a person would find: is the box you type in on screen, does the
 * sidebar still contain its controls, and does the theme toggle actually switch?
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-shell-usable.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

/**
 * A window that opens with the theme already set, the way main.js does it.
 *
 * The theme reaches the renderer as an argument (`--ntapi-theme=light`) instead of
 * a synchronous IPC: a sendSync with nobody answering blocks the page forever, and
 * these checks load the page without a main process.
 */
async function openWindow(theme) {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--ntapi-theme=${theme}`],
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));
  return win;
}

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  // boot() talks to a main process that is not running here; give it a moment to
  // settle rather than assuming instant readiness.
  await new Promise((r) => setTimeout(r, 700));

  const run = (expr) => win.webContents.executeJavaScript(expr);

  /* ---------- 1. the shell is where it belongs ---------- */

  const shell = await run(`(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('main');
    const composer = document.getElementById('composer');
    const input = document.getElementById('input');
    if (!sidebar || !main || !composer || !input) return { missing: true };
    return {
      composerInMain: main.contains(composer),
      composerInSidebar: sidebar.contains(composer),
      inputInComposer: composer.contains(input),
      // Everything the sidebar offers has to stay inside it, or it will be drawn
      // in the wrong column and the layout is a shell of what it was.
      sidebarHasPicker: sidebar.contains(document.getElementById('pickFolder')),
      sidebarHasList: sidebar.contains(document.getElementById('sessionList')),
      sidebarHasTheme: sidebar.contains(document.getElementById('themeBtn')),
    };
  })()`);

  check('every shell element exists', !shell.missing, shell);
  check('the composer belongs to the main column', shell.composerInMain === true);
  check('the composer is not inside the sidebar', shell.composerInSidebar === false);
  check('the textbox is inside the composer', shell.inputInComposer === true);
  check('the sidebar still holds the workspace picker', shell.sidebarHasPicker === true);
  check('the sidebar still holds the saved-chat list', shell.sidebarHasList === true);
  check('the theme button is in the sidebar', shell.sidebarHasTheme === true);

  /* ---------- 2. the textbox is on screen and usable ---------- */

  const usable = await run(`(() => {
    const input = document.getElementById('input');
    const box = input.getBoundingClientRect();
    const send = document.getElementById('sendBtn');
    return {
      onScreen: box.top >= 0 && box.bottom <= window.innerHeight + 1 && box.height > 0,
      width: Math.round(box.width),
      top: Math.round(box.top),
      viewport: window.innerHeight,
      disabled: input.disabled || input.readOnly,
      sendExists: Boolean(send),
      // The one that matters: can a click reach it?
      topElementIsInput: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === input
        || input.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
    };
  })()`);

  check('the textbox is inside the window', usable.onScreen === true, usable);
  check('it has a usable width', usable.width > 120, usable);
  check('it accepts typing', usable.disabled === false);
  check('nothing is painted over it', usable.topElementIsInput === true, usable);
  check('the send button is there', usable.sendExists === true);

  /* ---------- 3. typing works ---------- */

  const typed = await run(`(async () => {
    const input = document.getElementById('input');
    input.focus();
    input.value = 'hello from the shell test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return {
      focused: document.activeElement === input,
      value: input.value,
      sendEnabled: !document.getElementById('sendBtn').disabled,
    };
  })()`);

  check('the textbox takes focus', typed.focused === true);
  check('the text stays in it', typed.value === 'hello from the shell test');
  check('Send lights up once there is text', typed.sendEnabled === true);

  /* ---------- 4. the theme toggle actually switches ---------- */

  const theme = await run(`(async () => {
    const btn = document.getElementById('themeBtn');
    const root = document.documentElement;
    const read = () => getComputedStyle(document.body).backgroundColor;
    const before = { attr: root.dataset.theme || 'dark', bg: read() };
    btn.click();
    await new Promise((r) => requestAnimationFrame(r));
    const after = { attr: root.dataset.theme || 'dark', bg: read(), pressed: btn.getAttribute('aria-pressed') };
    btn.click();
    await new Promise((r) => requestAnimationFrame(r));
    const back = { attr: root.dataset.theme || 'dark', bg: read() };
    return { before, after, back };
  })()`);

  check('the window starts dark', theme.before.attr === 'dark', theme.before);
  check('clicking switches to light', theme.after.attr === 'light', theme.after);
  check('the background really changes', theme.after.bg !== theme.before.bg, {
    dark: theme.before.bg,
    light: theme.after.bg,
  });
  check('the button reports it is pressed', theme.after.pressed === 'true');
  check('clicking again returns to dark', theme.back.attr === 'dark');
  check('and so does the background', theme.back.bg === theme.before.bg);

  /* ---------- 6. every one of those texts is readable in light mode ---------- */

  // The report was text that stayed white after switching to light. Measuring it
  // against the real stylesheet is the only way to be sure: the tokens resolve
  // through two palettes and a cascade, so reading the source proves nothing about
  // what a pixel actually gets.
  await run(`(async () => {
    if (document.documentElement.dataset.theme !== 'light') {
      document.getElementById('themeBtn').click();
      await new Promise((r) => requestAnimationFrame(r));
    }
  })()`);

  const readability = await run(`(() => {
    const px = (v) => {
      const m = /rgba?\\(([^)]+)\\)/.exec(v || '');
      if (!m) return null;
      const [r, g, b, a] = m[1].split(',').map((n) => parseFloat(n));
      return { r, g, b, a: a === undefined ? 1 : a };
    };
    const lum = (c) => {
      const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a, b) => {
      const A = lum(a), B = lum(b);
      const [hi, lo] = A >= B ? [A, B] : [B, A];
      return (hi + 0.05) / (lo + 0.05);
    };
    // Composite a translucent colour over what is behind it, so a chip that paints
    // rgba(124,92,255,.12) is measured against the row it really sits on.
    const over = (top, bottom) => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });

    const stage = document.createElement('div');
    stage.style.cssText = 'position:fixed;left:0;top:0;width:600px;background:' +
      getComputedStyle(document.body).backgroundColor;
    document.body.appendChild(stage);
    const pageBg = px(getComputedStyle(document.body).backgroundColor);

    const probes = [
      ['bold text in a message', () => {
        const d = document.createElement('div');
        d.className = 'md';
        d.innerHTML = '<strong>x</strong>';
        // Return the wrapper: a <strong> pulled out of .md would not match the
        // very rule being measured, and the probe would pass while the text on
        // screen stayed invisible.
        return d;
      }],
      ['tool chip', () => { const s = document.createElement('span'); s.className = 'tool-chip'; s.textContent = 'x'; return s; }],
      ['shell header', () => { const s = document.createElement('span'); s.className = 'shell-cmd'; s.textContent = 'x'; return s; }],
      ['guide body', () => { const p = document.createElement('p'); p.className = 'guide-text'; p.textContent = 'x'; return p; }],
      ['active chat title', () => { const s = document.createElement('span'); s.className = 's-title'; s.textContent = 'x'; return s; }],
      ['settings tab, selected', () => { const s = document.createElement('div'); s.className = 'settings-nav-item'; s.setAttribute('aria-selected', 'true'); s.textContent = 'x'; return s; }],
      ['window button', () => { const b = document.createElement('button'); b.className = 'tb-btn'; b.textContent = 'x'; return b; }],
    ];

    const out = [];
    for (const [name, make] of probes) {
      const row = document.createElement('div');
      row.style.cssText = 'background:' + getComputedStyle(document.querySelector('#sidebar')).backgroundColor;
      row.appendChild(make());
      stage.appendChild(row);
      const wrapper = row.firstElementChild;
      const el = wrapper.querySelector('strong, em, code, .probe') || wrapper;
      const cs = getComputedStyle(el);
      let fg = px(cs.color);
      if (!fg) { out.push({ name, ratio: null, note: 'colour did not parse' }); continue; }
      // Background: the element's own fill if it has one, composited over the row.
      const own = px(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
      const base = px(getComputedStyle(row).backgroundColor) || pageBg;
      const bg = own.a > 0 ? over(own, base) : base;
      if (fg.a < 1) fg = over(fg, bg);
      out.push({ name, ratio: Math.round(ratio(fg, bg) * 100) / 100 });
    }
    stage.remove();
    return out;
  })()`);

  for (const probe of readability) {
    check(
      `light mode: ${probe.name} is readable (${probe.ratio}:1)`,
      typeof probe.ratio === 'number' && probe.ratio >= 4.5,
      probe
    );
  }

  // Nothing in the window may be painted white-on-white, which is how the report
  // looked: the same tokens in dark are fine, so this has to run in light.
  const stillLight = await run(`document.documentElement.dataset.theme`);
  check('the probes ran against the light theme', stillLight === 'light', { stillLight });

  /* ---------- 7. a saved theme is in place before the first paint ---------- */

  // A fresh window opened with the saved theme: if the attribute is already on
  // <html>, the first paint is light and there is no dark flash to see.
  let second = null;
  try {
    second = await openWindow('light');
    const atLoad = await second.webContents.executeJavaScript(
      `({ attr: document.documentElement.dataset.theme || '', bg: getComputedStyle(document.body).backgroundColor })`
    );
    check('a saved light theme is applied before boot runs', atLoad.attr === 'light', atLoad);
    check('and the very first paint is light, not a dark flash', atLoad.bg === 'rgb(245, 246, 250)', atLoad);
  } catch (err) {
    check('a saved theme can be exercised', false, String(err));
  } finally {
    try {
      second?.destroy();
    } catch {}
  }

  console.log(
    failures === 0
      ? '\nThe window opens usable, and the theme switches.'
      : `\n${failures} shell check(s) failed.`
  );
  win.destroy();
  app.exit(failures === 0 ? 0 : 1);
});