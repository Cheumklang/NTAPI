/**
 * Reading further up the transcript is never interrupted by new output.
 *
 * The bug: scrollToBottom() counted anything within 180px of the bottom as "at the
 * bottom" — roughly three lines — so scrolling up to re-read the previous answer
 * still counted, and every streamed token pulled the view back down. Several call
 * sites also passed force=true, which ignored the position entirely: a new
 * assistant message, a streamed text update, a tool result and a shell card all
 * yanked the reader to the bottom mid-sentence.
 *
 * Now the reader decides. Output arriving leaves the view where it is, and a
 * "Newest" button appears at the bottom edge to take them down when they want it.
 *
 * Run: node scripts/selftest-read-position.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

/** Function body by name, brace matched after the parameter list. */
function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  const sig = src.indexOf('(', start);
  let pdepth = 0;
  let after = -1;
  for (let i = sig; i < src.length; i += 1) {
    if (src[i] === '(') pdepth += 1;
    else if (src[i] === ')') {
      pdepth -= 1;
      if (pdepth === 0) { after = i; break; }
    }
  }
  const open = src.indexOf('{', after);
  let d = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') {
      d -= 1;
      if (d === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

// --- 1. the threshold is tight ------------------------------------------

check('there is an explicit near-bottom distance', /const NEAR_BOTTOM_PX = (\d+);/.test(app));
const px = Number((app.match(/const NEAR_BOTTOM_PX = (\d+);/) || [])[1]);
check('the distance is under a couple of lines', px > 0 && px <= 64, px);
check('the old 180px allowance is gone', !/< 180\b/.test(app));

// --- 2. there is a single place that decides -----------------------------

check('reading-up is detected in one helper', /function isReadingUp\(/.test(app));
check('the button state has one helper', /function syncJumpToBottom\(/.test(app));

const scrollBody = body(app, 'scrollToBottom');
check('scrollToBottom refuses to move a reader', /if \(!force && isReadingUp\(\)\)/.test(scrollBody));
check('scrollToBottom hides the button at the bottom', /syncJumpToBottom\(\)/.test(scrollBody));

// --- 3. output arriving no longer forces the view -----------------------

// Count the remaining force call sites and check none of them is an output path.
const forceCalls = [...app.matchAll(/scrollToBottom\(true\)/g)].map((m) => {
  const before = app.slice(0, m.index);
  return before.split('\n').length;
});
// Four now, and each is deliberate: the boot render, the tab switch, the queued
// message, and the message the user just sent. The list is kept short on purpose —
// every forced call is somewhere a reader can be pulled away from what they were
// reading — so this is a budget, not a formality. Raise it only with a reason.
check('force is used in only a few places', forceCalls.length <= 4, forceCalls);

function lineOf(pattern) {
  const idx = app.indexOf(pattern);
  return idx === -1 ? -1 : app.slice(0, idx).split('\n').length;
}

check('a new assistant answer does not force',
  /transcript\.appendChild\(wrap\);\s*\/\/ A new answer must not pull[\s\S]{0,120}scrollToBottom\(\);/.test(app));

// The streamed-delta handler is the one that fires per token.
const onDelta = app.slice(app.indexOf('api.onDelta('), app.indexOf('api.onTextEnd('));
check('streamed text does not force', onDelta !== '' && !/scrollToBottom\(true\)/.test(onDelta));
check('streamed text still follows a reader at the bottom', /scrollToBottom\(\);/.test(onDelta));

const shellCardBody = body(app, 'shellCard');
check('a new shell card does not force', shellCardBody !== '' && !/scrollToBottom\(true\)/.test(shellCardBody));

const onToolEnd = app.slice(app.indexOf('api.onToolEnd('), app.indexOf('api.onBusy('));
check('a finished tool does not force', onToolEnd !== '' && !/scrollToBottom\(true\)/.test(onToolEnd));

// --- 4. sending your own message does follow it -------------------------

const sendQueuedBody = body(app, 'sendQueued');
check('your own message still scrolls down', /scrollToBottom\(true\)/.test(sendQueuedBody));

// --- 5. the button exists and is wired ----------------------------------

check('the button is in the markup', /id="jumpToBottom"/.test(html));
check('the button starts hidden', /id="jumpToBottom"[\s\S]{0,200}hidden/.test(html));
check('the button has a label', /data-i18n="jumpToBottom"/.test(html));
check('the button is looked up', /const jumpToBottom = el\('jumpToBottom'\)/.test(app));
check('clicking it goes to the bottom', /jumpToBottom\?\.addEventListener\('click', \(\) => \{\s*scrollToBottom\(true\);/.test(app));
check('scrolling updates the button', /transcript\.addEventListener\('scroll', syncJumpToBottom/.test(app));
check('resizing re-checks the button', /window\.addEventListener\('resize', syncJumpToBottom\)/.test(app));

// --- 6. it is styled and positioned over the messages --------------------

check('the button is styled', /\.jump-bottom\s*\{/.test(css));
check('the button is anchored to a wrapper, not the scroller',
  /\.transcript-wrap\s*\{[^}]*position:\s*relative/.test(css));
check('the wrapper is in the markup', /class="transcript-wrap"/.test(html));
check('a hidden button really disappears', /\.jump-bottom\[hidden\]\s*\{\s*display:\s*none/.test(css));
check('the button has a visible focus ring', /\.jump-bottom:focus-visible/.test(css));
check('the arrow survives a language switch', /\.jump-bottom::after/.test(css) && !/jump-bottom-arrow/.test(html));

// --- 7. both languages have the label -----------------------------------

check('the label exists in English', /jumpToBottom: 'Newest'/.test(app));
check('the label exists in Thai', /jumpToBottom: 'ล่าสุด'/.test(app));

// --- your own message always comes into view ------------------------------
//
// The deliberate exception to "the reader decides". Holding still for arriving
// output protects someone re-reading an old answer; holding still for the words
// you just typed does the opposite, because it hides the bubble you are watching
// for and leaves you scrolling to the bottom to find a message that is already
// there. renderUserMessage() is the single place the user speaks — the plain
// send, the steer while busy, and the queued message all go through it — so it is
// the right place to force the view down, and the only one.

const userMsg = body(app, 'renderUserMessage');
check('the sent message scrolls the transcript', /scrollToBottom\(true\)/.test(userMsg));
check('it forces the scroll past the reading guard', /scrollToBottom\(true\)/.test(userMsg));
check('it does not use the position-guarded call', !/scrollToBottom\(\)/.test(userMsg));

// The forced scroll must be the last thing before returning, so it runs after the
// bubble has been appended: scrolling before the node exists measures the old
// height and lands in the wrong place.
const scrollAt = userMsg.lastIndexOf('scrollToBottom(true)');
const appendAt = userMsg.lastIndexOf('bubble.appendChild');
check('the scroll happens after the bubble is filled', scrollAt > appendAt && appendAt !== -1);
check('the scroll happens before the function returns', scrollAt < userMsg.lastIndexOf('return wrap'));

// Everything that speaks for the user must go through that function.
const steerBlock = app.slice(app.indexOf('if (view.busy) {'), app.indexOf('if (view.busy) {') + 1400);
check('the steer path draws through renderUserMessage', /renderUserMessage\(outgoing/.test(steerBlock));
const submitBody = body(app, 'submit');
check('the plain send draws through renderUserMessage', /renderUserMessage\(outgoing/.test(submitBody));
const queuedBody = body(app, 'sendQueued');
check('the queued message draws through renderUserMessage', /renderUserMessage\(item\.text/.test(queuedBody));

// --- and output still does not yank the reader ---------------------------
//
// Guarding this file against itself: it would be easy to "fix" the scroll above
// by making scrollToBottom() stop honouring the reading position, which would
// bring back the original complaint.
const addBody = body(app, 'addMessage');
check('an arriving answer still respects the reader', /[^)]scrollToBottom\(\);/.test(addBody) && !/scrollToBottom\(true\)/.test(addBody));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll read-position checks passed');
