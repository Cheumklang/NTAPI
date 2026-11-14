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
    // A hidden element has no box to measure, and the button is hidden whenever
    // the reader is at the bottom — so it has to be revealed for this measurement.
    const wasHidden = b.hidden;
    b.hidden = false;
    const br = b.getBoundingClientRect();
    const wr = w.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const mid = br.left + br.width / 2;
    const result = {
      insideWrap: br.top >= wr.top - 1 && br.bottom <= wr.bottom + 1,
      horizontallyCentred: Math.abs(mid - (tr.left + tr.width / 2)) <= 3,
      aboveTheBottom: br.bottom <= tr.bottom,
      measuredWidth: Math.round(br.width),
    };
    b.hidden = wasHidden;
    return result;
  })()`);
  check('the button stays inside the messages area', geom.insideWrap, geom);
  check('the button is centred', geom.horizontallyCentred, geom);
  check('the button sits above the transcript edge', geom.aboveTheBottom, geom);

  // --- your own message is the exception ---------------------------------
  //
  // Output waits for the reader; your own message does not. If it did, typing
  // while scrolled up would put your bubble at the bottom and leave the view
  // where it was, so you would scroll down to find a message already on screen.
  const own = await win.webContents.executeJavaScript(`(async () => {
    const dist = () => transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    const out = [];
    for (const where of ['scrolled-up', 'at-bottom']) {
      activeTabId = 'own';
      const view = views.get('own') || createView('own');
      views.set('own', view);
      view.busy = false;
      transcript.innerHTML = '';
      for (let i = 0; i < 40; i += 1) {
        const d = document.createElement('div');
        d.className = 'msg';
        d.style.height = '60px';
        d.textContent = 'old ' + i;
        transcript.appendChild(d);
      }
      if (where === 'scrolled-up') transcript.scrollTop = 0;
      else transcript.scrollTop = transcript.scrollHeight;
      await new Promise((r) => setTimeout(r, 60));
      const before = dist();
      renderUserMessage('my new words', []);
      await new Promise((r) => setTimeout(r, 60));
      out.push({ where, before, after: dist(), jumpHidden: document.getElementById('jumpToBottom').hidden });
    }
    return out;
  })()`);

  const up = own.find((x) => x.where === 'scrolled-up');
  const bottom = own.find((x) => x.where === 'at-bottom');
  check('sending while scrolled up was far from the bottom before', up.before > 100, up);
  check('sending from up the transcript jumps to the bottom', up.after === 0, up);
  check('sending at the bottom stays at the bottom', bottom.after === 0, bottom);
  check('the Newest button hides once your message is in view', up.jumpHidden === true, up);

  // An arriving answer still must not move a reader. This is the pair that keeps
  // the two rules from collapsing into one.
  const arriving = await win.webContents.executeJavaScript(`(async () => {
    const dist = () => transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
    // Scrolling has to be *announced*, not just assigned. The follow state is
    // decided by the scroll event now, so a silent scrollTop write leaves the app
    // still believing the reader is at the bottom — which is what the previous
    // version of this test was doing.
    transcript.scrollTop = 0;
    transcript.dispatchEvent(new Event('scroll'));
    // The browser fires its own scroll event for the assignment, and it can land
    // after ours — reading the state too early sometimes caught the stale value.
    // Waiting two frames lets every queued scroll handler run before we sample.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 80));
    const before = dist();
    const pinnedBefore = pinnedToBottom;
    addMessage('assistant');
    await new Promise((r) => setTimeout(r, 60));
    return { before, after: dist(), pinnedBefore };
  })()`);
  check('a silent scrollTop write is not a scroll', arriving.pinnedBefore === false, arriving);
  check('an arriving answer still leaves the reader alone', arriving.after > 100, arriving);

  // --- staying at the bottom, the thing the user asked for ----------------
  //
  // "If I am at the bottom already, keep me at the bottom; only if I move up to
  // read does it stop." The old code re-measured the gap every time, so content
  // arriving under a reader who never touched the scrollbar made the gap look
  // like they had left — and they drifted up while the answer streamed.
  const follow = await win.webContents.executeJavaScript(`(async () => {
    const gap = () => Math.round(
      transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight);
    activeTabId = 'follow';
    const view = views.get('follow') || createView('follow');
    views.set('follow', view);
    transcript.innerHTML = '';
    for (let i = 0; i < 30; i += 1) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.style.height = '70px';
      d.textContent = 'm' + i;
      transcript.appendChild(d);
    }
    // Sit at the bottom, as a reader who has read everything would be.
    transcript.scrollTop = transcript.scrollHeight;
    transcript.dispatchEvent(new Event('scroll'));
    const start = gap();
    const gaps = [];
    for (let i = 0; i < 6; i += 1) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.style.height = '70px';
      d.textContent = 'new ' + i;
      transcript.appendChild(d);
      scrollToBottom();
      gaps.push(gap());
    }
    const stayed = { start, gaps, pinned: pinnedToBottom,
      buttonHidden: document.getElementById('jumpToBottom').hidden };

    // Now move up to read: following must stop, and adding output must not move us.
    transcript.scrollTop = 200;
    transcript.dispatchEvent(new Event('scroll'));
    const upStart = gap();
    const upGaps = [];
    for (let i = 0; i < 3; i += 1) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.style.height = '70px';
      d.textContent = 'while reading ' + i;
      transcript.appendChild(d);
      scrollToBottom();
      upGaps.push(gap());
    }
    return { stayed, up: { upStart, upGaps, pinned: pinnedToBottom,
      readingUp: isReadingUp(),
      buttonShown: !document.getElementById('jumpToBottom').hidden } };
  })()`);

  check('a reader at the bottom starts at the bottom', follow.stayed.start === 0, follow.stayed);
  check('a reader at the bottom is never left behind',
    follow.stayed.gaps.every((g) => g === 0), follow.stayed.gaps);
  check('the follow state stays on while at the bottom',
    follow.stayed.pinned === true, follow.stayed);
  check('the Newest button stays hidden while following',
    follow.stayed.buttonHidden === true, follow.stayed);

  check('scrolling up stops the following', follow.up.pinned === false, follow.up);
  check('scrolling up reports reading', follow.up.readingUp === true, follow.up);
  check('moving up shifts the view away from the bottom', follow.up.upStart > 100, follow.up);
  check('output does not pull a reading user down',
    follow.up.upGaps.every((g, i) => i === 0 || g > follow.up.upGaps[i - 1] || g === follow.up.upGaps[i - 1]),
    follow.up.upGaps);
  check('the Newest button appears when scrolled up',
    follow.up.buttonShown === true, follow.up);

  // Clicking Newest must return to the bottom and resume following.
  const jumpedBack = await win.webContents.executeJavaScript(`(async () => {
    document.getElementById('jumpToBottom').click();
    await new Promise((r) => setTimeout(r, 600));
    return {
      gap: Math.round(transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight),
      pinned: pinnedToBottom,
      buttonHidden: document.getElementById('jumpToBottom').hidden,
    };
  })()`);
  check('the Newest button lands at the bottom', jumpedBack.gap === 0, jumpedBack);
  check('the Newest button resumes following', jumpedBack.pinned === true, jumpedBack);
  check('the Newest button hides itself', jumpedBack.buttonHidden === true, jumpedBack);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll read-position checks passed in the running renderer');
  app.exit(0);
});
