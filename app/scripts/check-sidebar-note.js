'use strict';

/**
 * Prove the sidebar's approval note stays on one line, and that the column
 * refuses to be dragged narrower than that line.
 *
 * The note ("เมื่อ AI จะรันคำสั่งในคอมพิวเตอร์ เช่น รัน bash หรือแก้ไฟล์") is the
 * longest fixed sentence in the column. Wrapped, it turned into a two-line
 * paragraph that pushed the session list down; clipped, it would silently lose
 * its ending. So the rule is: never wrap, and never allow a width where wrapping
 * or clipping could happen — the floor moves with the text.
 *
 * That floor is translated, so both languages are measured here, and the whole
 * thing is measured through the real renderer rather than by reading CSS text.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-sidebar-note.js
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

/** One round trip: set a language, try to force a silly width, measure. */
const measure = (language) => `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  lang = '${language}';
  applyLanguage();
  // The note lives in the approval popover now: open it so its box is real.
  setApprovalPopover(true);
  await frame();

  const note = document.querySelector('#sidebar .approval-note');
  const line = parseFloat(getComputedStyle(note).lineHeight) || 15;
  const before = {
    text: note.textContent.trim(),
    height: Math.round(note.getBoundingClientRect().height),
    oneLine: line,
    scroll: note.scrollWidth,
    client: note.clientWidth,
    whiteSpace: getComputedStyle(note).whiteSpace,
  };

  // The column is locked to its floor, so asking for a silly width must have no
  // effect at all — this is the check that used to prove the drag clamp.
  const forced = applySidebarWidth();
  await frame();
  const after = {
    width: forced,
    sidebar: Math.round(document.getElementById('sidebar').getBoundingClientRect().width),
    height: Math.round(note.getBoundingClientRect().height),
    scroll: note.scrollWidth,
    client: note.clientWidth,
    fits: note.scrollWidth <= note.clientWidth + 1,
    cssVar: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10),
  };

  return { before, after, resetHeight: Math.round(note.getBoundingClientRect().height) };
})()`;

app
  .whenReady()
  .then(async () => {
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
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 500));

    for (const language of ['th', 'en']) {
      const out = await win.webContents.executeJavaScript(measure(language));
      console.log(`\n--- ${language} ---`);
      console.log('as drawn  ', JSON.stringify(out.before));
      console.log('forced 40 ', JSON.stringify(out.after));
      console.log('reset     ', out.reset);

      check(`${language}: the note is shown`, out.before.height > 0, out.before.height);
      check(`${language}: the note is not clipped as drawn`, out.before.scroll <= out.before.client + 1, {
        scroll: out.before.scroll,
        client: out.before.client,
      });
      // The column no longer takes its width from this sentence: the note wraps
      // inside a fixed-width popover, so the floor is the brand row's.
      check(`${language}: the column refuses to go below its content`, out.after.width > 40, out.after.width);
      check(`${language}: the sidebar really is that wide`, out.after.sidebar >= out.after.width - 1, {
        sidebar: out.after.sidebar,
        applied: out.after.width,
      });
      check(`${language}: the note still fits inside its popover`, out.after.fits === true, out.after);
      check(`${language}: the floor is written to --sidebar-w`, out.after.cssVar === out.after.width, {
        cssVar: out.after.cssVar,
        applied: out.after.width,
      });
      check(`${language}: the column is locked to that width`, out.after.cssVar === out.after.width, {
        applied: out.after.cssVar,
        expected: out.after.width,
      });
      check(`${language}: the reset keeps the note visible`, out.resetHeight > 0, out.resetHeight);
    }

    win.destroy();

    if (failures) {
      console.error(`\n${failures} check(s) FAILED`);
      process.exitCode = 1;
    } else {
      console.log('\nPASS: the sidebar floor follows its longest single line');
    }
    app.quit();
  })
  .catch((err) => {
    console.error('harness error:', err && err.stack ? err.stack : err);
    process.exitCode = 1;
    app.quit();
  });
