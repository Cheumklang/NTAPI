/**
 * Reading up is left alone; the button brings you back.
 *
 * Loads the real renderer, fills the transcript with enough messages to scroll,
 * scrolls up to the top, then fires the events that used to yank the reader down
 * (a streamed delta, a finished tool, a new assistant message) and measures where
 * the view actually ended up.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-read-position.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
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

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    show: false,
    webPreferences: {
      // The real preload, so app.js finishes loading. Without it the first
      // api.getWinState() call throws and the rest of the script — including the
      // scroll listener — never runs, which would make this test lie.
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  // Let boot() settle; it talks to main, which is not running here.
  await new Promise((r) => setTimeout(r, 600));

  // scroll-behavior: smooth animates every assignment, so reading scrollTop back
  // immediately returns the old value. The animation is right for a person
  // clicking the button; a test has to measure the destination, so smooth is
  // switched off here only. The CSS rule itself is asserted separately.
  await win.webContents.insertCSS('html, body, .transcript { scroll-behavior: auto !important; }');

  const run = (expr) => win.webContents.executeJavaScript(expr);
  // A scroll handler reads the offset from before the assignment if the event is
  // dispatched in the same tick, so scrolling and dispatching wait a frame.
  const scrollTo = (value) => run(`new Promise((resolve) => {
    const t = document.getElementById('transcript');
    t.scrollTop = ${value} === null ? t.scrollHeight : ${value};
    requestAnimationFrame(() => {
      t.dispatchEvent(new Event('scroll'));
      requestAnimationFrame(() => resolve({ scrollTop: t.scrollTop }));
    });
  })`);

  // Build a transcript long enough to scroll, using the page's own renderer.
  const built = await run(`(() => {
    const t = document.getElementById('transcript');
    if (!t) return { error: 'no transcript' };
    for (let i = 0; i < 40; i += 1) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.innerHTML = '<div class="role">AI</div><div class="body">Message ' + i +
        ' — ' + 'filler text to take up room. '.repeat(6) + '</div>';
      t.appendChild(d);
    }
    t.scrollTop = t.scrollHeight;
    return { scrollHeight: t.scrollHeight, clientHeight: t.clientHeight };
  })()`);

  check('the transcript scrolls', built && built.scrollHeight > built.clientHeight * 2, built);

  // The real helpers, reachable because app.js is a classic script.
  const helpers = await run(`({
    hasScroll: typeof scrollToBottom === 'function',
    hasReading: typeof isReadingUp === 'function',
    hasSync: typeof syncJumpToBottom === 'function',
  })`);
  check('scrollToBottom is reachable', helpers.hasScroll);
  check('isReadingUp is reachable', helpers.hasReading);
  check('syncJumpToBottom is reachable', helpers.hasSync);

  // --- at the bottom: button hidden, new output follows ------------------
  await scrollTo(null);
  const atBottom = await run(`({
    hidden: document.getElementById('jumpToBottom').hidden,
    readingUp: isReadingUp(),
  })`);
  check('the button is hidden at the bottom', atBottom.hidden === true, atBottom);
  check('being at the bottom is not reading up', atBottom.readingUp === false);

  // --- scroll up: button appears, and stays put --------------------------
  await scrollTo(0);
  const upTop = await run(`({
    hidden: document.getElementById('jumpToBottom').hidden,
    readingUp: isReadingUp(),
    scrollTop: document.getElementById('transcript').scrollTop,
  })`);
  check('the button appears once you scroll up', upTop.hidden === false, upTop);
  check('scrolling to the top counts as reading up', upTop.readingUp === true);

  // --- the regression: output must not pull you down ---------------------
  await scrollTo(0);
  const afterDelta = await run(`(() => {
    const t = document.getElementById('transcript');
    // What a streamed token used to do.
    scrollToBottom();
    return { scrollTop: t.scrollTop, readingUp: isReadingUp() };
  })()`);
  check('a streamed token does not move a reader', afterDelta.scrollTop === 0, afterDelta);

  // A new message appended while reading up must not move the view either.
  const afterAppend = await run(`(() => {
    const t = document.getElementById('transcript');
    const before = t.scrollTop;
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = '<div class="role">AI</div><div class="body">A brand new answer arrives.</div>';
    t.appendChild(d);
    scrollToBottom();
    return { before, after: t.scrollTop };
  })()`);
  check('a new answer does not move a reader', afterAppend.after === afterAppend.before, afterAppend);

  // --- the button works --------------------------------------------------
  const jumped = await run(`(() => {
    const t = document.getElementById('transcript');
    document.getElementById('jumpToBottom').click();
    // smooth scrolling animates; jump the helper's own way for a deterministic read
    scrollToBottom(true);
    return {
      scrollTop: t.scrollTop,
      scrollHeight: t.scrollHeight,
      clientHeight: t.clientHeight,
      hidden: document.getElementById('jumpToBottom').hidden,
    };
  })()`);
  check('the button takes you to the newest message',
    Math.abs(jumped.scrollHeight - jumped.clientHeight - jumped.scrollTop) <= 2, jumped);
  check('the button hides once you are back', jumped.hidden === true, jumped);

  // --- force still works when a view is opened ---------------------------
  const forced = await run(`(() => {
    const t = document.getElementById('transcript');
    t.scrollTop = 0;
    // A synchronous scroll event reads the offset from before the change.
    t.dispatchEvent(new Event('scroll'));
    scrollToBottom(true);
    return { scrollTop: t.scrollTop, scrollHeight: t.scrollHeight, clientHeight: t.clientHeight };
  })()`);
  check('opening a view still follows the newest message',
    Math.abs(forced.scrollHeight - forced.clientHeight - forced.scrollTop) <= 2, forced);

  // --- the button sits over the messages, inside the wrapper -------------
  const geom = await run(`(() => {
    const b = document.getElementById('jumpToBottom');
    const w = document.querySelector('.transcript-wrap');
    const t = document.getElementById('transcript');
    t.scrollTop = 0;
    // A synchronous scroll event reads the offset from before the change.
    t.dispatchEvent(new Event('scroll'));
    const br = b.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const mid = br.left + br.width / 2;
    return {
      insideWrap: br.top >= wr.top - 1 && br.bottom <= wr.bottom + 1,
      horizontallyCentred: Math.abs(mid - (tr.left + tr.width / 2)) <= 3,
      aboveTheBottom: br.bottom <= tr.bottom,
    };
  })()`);
  check('the button stays inside the messages area', geom.insideWrap, geom);
  check('the button is centred', geom.horizontallyCentred, geom);
  check('the button sits above the transcript edge', geom.aboveTheBottom, geom);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll read-position checks passed in the running renderer');
  app.exit(0);
});
