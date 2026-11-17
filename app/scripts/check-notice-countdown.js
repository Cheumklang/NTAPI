/**
 * The notice bar, measured in a real window.
 *
 * The bug was a yellow bar that never went away, so waiting is the only honest
 * test: show a notice, do nothing, and see whether it is gone. Then do the other
 * half — hover it and confirm the clock stops — because a fix that removes the
 * bar too eagerly would be just as wrong for someone trying to copy the sentence.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-notice-countdown.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');


// A test that hangs forever tells nobody anything, so it fails itself instead.
const watchdog = setTimeout(() => {
  console.log('FAIL the check finished within 60s');
  app.exit(1);
}, 60000);
watchdog.unref?.();

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await wait(600);
  const run = (expr) => win.webContents.executeJavaScript(expr);

  /* ---------- 1. it disappears on its own ---------- */

  // A key save is what reported the bug, so the same call shape is used here: no
  // duration argument at all. app.js is a classic script, so its top-level
  // declarations are on `window` and this is the real function, not a copy.
  const shown = await run(`(() => {
    if (typeof window.showNotice !== 'function') return { missing: true };
    window.showNotice('บันทึกคีย์ DeepSeek แล้ว');
    const n = document.getElementById('notice');
    const count = document.getElementById('noticeCount');
    return {
      visible: !n.hidden,
      text: (document.getElementById('noticeText') || n).textContent,
      countdown: count && !count.hidden ? count.textContent : null,
    };
  })()`);

  if (shown.missing) {
    // showNotice lives in a classic script, so the page has to be given a way to
    // call it. If that is missing the check cannot lie about it: report it.
    check('the notice can be driven from the test', false, { reason: 'showNotice not reachable' });
  } else {    check('the notice appears', shown.visible === true, shown);
    check('it carries the sentence', /DeepSeek/.test(shown.text || ''), shown);
    check('a countdown is shown immediately', /[0-9]/.test(shown.countdown || ''), shown);
    check('the countdown starts at the default five seconds', /5/.test(shown.countdown || ''), shown);

    // Wait past the default, then confirm it is gone.
    await wait(5600);
    const gone = await run(`(() => {
      const n = document.getElementById('notice');
      const count = document.getElementById('noticeCount');
      return { hidden: n.hidden, countHid: count ? count.hidden : true };
    })()`);
    check('it removes itself after the default five seconds', gone.hidden === true, gone);
    check('the countdown goes with it', gone.countHid === true, gone);
  }

  /* ---------- 2. hovering stops the clock ---------- */

  // Two seconds is enough to prove the clock runs, and short enough to keep this
  // check quick; the default is asserted above.
  const hovered = await run(`(async () => {
    const n = document.getElementById('notice');
    window.showNotice('hover me', 1200);
    // Hover immediately: a pointerenter on the bar is what a person does when they
    // lean in to read it.
    n.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    const first = document.getElementById('noticeCount').textContent;
    await new Promise((r) => setTimeout(r, 2200));
    const stillThere = !n.hidden;
    const second = document.getElementById('noticeCount').textContent;
    return { first, second, stillThere, pausedClass: document.getElementById('noticeCount').classList.contains('paused') };
  })()`);

  check('the notice is still on screen while hovered', hovered.stillThere === true, hovered);
  check('the countdown is visibly paused', hovered.pausedClass === true, hovered);
  check('and the number stops moving', hovered.first === hovered.second, hovered);

  /* ---------- 3. leaving resumes from where it stopped ---------- */

  const resumed = await run(`(async () => {
    const n = document.getElementById('notice');
    n.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    const afterLeave = document.getElementById('noticeCount').textContent;
    const resumedClass = document.getElementById('noticeCount').classList.contains('paused');
    // 1.2s notice + a 200ms tick: give it room, or the check fails on timing alone.
    await new Promise((r) => setTimeout(r, 2500));
    return { afterLeave, resumedClass, hidden: n.hidden };
  })()`);

  check('leaving the notice un-pauses the countdown', resumed.resumedClass === false, resumed);
  check('and the clock then finishes', resumed.hidden === true, resumed);

  /* ---------- 4. a caller can still ask for a longer or endless notice ------ */

  const sticky = await run(`(async () => {
    const n = document.getElementById('notice');
    window.showNotice('stays', 0);
    await new Promise((r) => setTimeout(r, 700));
    return { hidden: n.hidden, countHid: document.getElementById('noticeCount').hidden };
  })()`);

  check('a zero duration keeps the notice up', sticky.hidden === false, sticky);
  check('and shows no countdown, because there is no deadline', sticky.countHid === true, sticky);

  const custom = await run(`(async () => {
    const n = document.getElementById('notice');
    window.showNotice('brief', 500);
    const first = document.getElementById('noticeCount').textContent;
    await new Promise((r) => setTimeout(r, 900));
    return { first, hidden: n.hidden };
  })()`);

  check('a caller can ask for a shorter notice', /1/.test(custom.first || ''), custom);
  check('which then goes away on time', custom.hidden === true, custom);

  /* ---------- 5. the text is selectable ---------- */

  const selectable = await run(`(() => {
    const n = document.getElementById('notice');
    window.showNotice('copy me', 0);
    const node = document.getElementById('noticeText') || n;
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return { selected: sel.toString(), userSelect: getComputedStyle(n).userSelect };
  })()`);

  check('the sentence can be selected', /copy me/.test(selectable.selected || ''), selectable);
  check('and the stylesheet allows it', selectable.userSelect === 'text', selectable);

  await run(`window.showNotice(null)`);

  console.log(
    failures === 0
      ? '\nThe notice counts down, pauses for a reader, and goes away.'
      : `\n${failures} notice check(s) failed.`
  );
  win.destroy();
  app.exit(failures === 0 ? 0 : 1);
  } catch (err) {
    // A rejected script call used to leave the process alive with no output.
    console.log('FAIL the check completed', String(err && err.message ? err.message : err));
    app.exit(1);
  }
});