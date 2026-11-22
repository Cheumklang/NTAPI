/**
 * A message typed mid-turn waits, and can be taken back.
 *
 * Sending while the agent worked used to be instant and final, so a typo had to
 * be corrected with a follow-up message. Now the message appears at once with a
 * countdown, and two ways out: edit (words return to the composer) or drop.
 *
 * The rules this locks in:
 *   1. There is a hold of 5 seconds, ticked once a second.
 *   2. Both the steer path (Enter) and the queue path (Ctrl+Enter) hold.
 *   3. "Edit" removes the message and puts the text back in the composer.
 *   4. "Drop" removes the message and says so.
 *   5. Switching tabs cancels the hold instead of firing it unseen.
 *   6. A turn ending early releases the hold rather than leaving a dead timer.
 *   7. Re-rendering the queue does not lose the countdown row.
 *   8. The countdown is announced in the user's language, with the number left.
 *
 * Run: node scripts/selftest-hold-before-send.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Function body by name, brace matched. */
function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  // Start after the parameter list: `{ text, images }` in a destructured
  // parameter is a brace too, and matching it would end the body immediately.
  const sig = src.indexOf('(', start);
  let pdepth = 0;
  let afterParams = -1;
  for (let i = sig; i < src.length; i += 1) {
    if (src[i] === '(') pdepth += 1;
    else if (src[i] === ')') {
      pdepth -= 1;
      if (pdepth === 0) { afterParams = i; break; }
    }
  }
  if (afterParams === -1) return '';
  const open = src.indexOf('{', afterParams);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

// --- 1. five seconds, ticked once a second --------------------------------

check('the hold is five seconds', /const HOLD_SECONDS = 5;/.test(app));
const hold = body(app, 'holdMessage');
check('holdMessage exists', hold !== '');
check('the clock ticks once a second', /setInterval\([\s\S]*?,\s*1000\s*\)/.test(hold));
check('the countdown starts at the configured length', /let left = HOLD_SECONDS/.test(hold));
check('the send happens when the countdown reaches zero', /if \(left > 0\)/.test(hold) && /send\(\)/.test(hold));
check('the timer is cleared before sending', /clearInterval/.test(hold));

// --- 2. both send paths hold ---------------------------------------------

const submit = body(app, 'submit');
check('the steer path holds', /holdMessage\(view, steerWrap/.test(submit));
check('the steer send is passed as a callback, not called inline',
  /send:\s*steerSend/.test(submit));
const queueFn = body(app, 'queueMessage');
check('the queue path holds', /holdMessage\(/.test(queueFn));
check('the queued item is tracked so it can be released', /hold\.item = item/.test(queueFn));

// --- 3/4. edit and drop ---------------------------------------------------

check('edit is offered', /t\('holdEdit'\)/.test(hold));
check('cancel is offered', /t\('holdCancel'\)/.test(hold));
check('edit gives the text back to the composer', /input\.value = text/.test(hold));
check('edit focuses the composer so it can be fixed at once', /input\.focus\(\)/.test(hold));
check('edit restores the attached images', /pendingImages = \(images \|\| \[\]\)\.slice\(\)|pendingImages = images\.slice\(\)/.test(hold));
check('drop reports that it was dropped', /holdDropped/.test(hold));
check('editing removes the message from the transcript',
  /view\.messages\.splice\(at, 1\)/.test(hold) || /onCancel\(taken\)/.test(hold));

// --- 5. tab switch cancels ------------------------------------------------

const activate = body(app, 'activateTabDirect');
check('switching tabs cancels a pending hold', /cancelAllHolds\(/.test(activate));
const cancelAll = body(app, 'cancelAllHolds');
check('cancelAllHolds skips the tab being opened', /exceptTabId/.test(cancelAll));
check('cancelAllHolds clears every other tab', /for \(const tabId of/.test(cancelAll));

// --- 6. the countdown is not cut short -------------------------------
// The turn that was running when a message was queued may end while it is still
// counting down. It used to be shipped the moment it did, so the model read the
// text under a row still promising "จะส่งในอีก 4 วิ". The clock is the promise.

const settledAt = app.indexOf('api.onSettled((p) => {');
const settledSlice = settledAt === -1 ? '' : app.slice(settledAt, settledAt + 1600);
check('a finished turn still drains the queue', /drainQueue\(view\)/.test(settledSlice));
check('a finished turn does not release a countdown that is still running', !/holdReleased/.test(app));

const drain = body(app, 'drainQueue');
check(
  'the drain waits for the countdown on the message at the head',
  /const head = view\.queue\[0\]/.test(drain) && /held\.item === head\) return;/.test(drain)
);
check('the drain does not shift a message it declined to send', /const next = view\.queue\.shift\(\);/.test(drain));
check(
  'the queued message hands the sending back to the drain when its clock ends',
  /send: \(\) => drainQueue\(view\)/.test(body(app, 'queueMessage'))
);

// --- 7. re-render keeps the row -----------------------------------------

const renderQueue = body(app, 'renderQueue');
check('the countdown row is re-mounted after a re-render',
  /appendChild\(held\.row\)/.test(renderQueue));
check('the queue row carries an id to hang it on', /dataset\.queueId/.test(renderQueue));

// --- 8. wording ----------------------------------------------------------

check('the countdown names the number of seconds left', /holdCountdown: 'Sending in \{n\}s/.test(app));
check('the countdown is in Thai too', /holdCountdown: 'จะส่งในอีก \{n\} วิ/.test(app));
check('the countdown says where the message is going', /holdWhatSteer/.test(app) && /holdWhatQueue/.test(app));
check('edit and cancel are translated', /holdEdit: 'แก้ไข'/.test(app) && /holdCancel: 'ยกเลิก'/.test(app));

// --- styling: quiet, and the clock does not jitter ----------------------

check('the row is styled', /\.hold-row\s*\{/.test(css));
check('the clock keeps a steady width', /\.hold-clock[\s\S]{0,200}min-width:\s*15ch/.test(css));
check('the clock uses tabular figures so digits do not jump', /tabular-nums/.test(css));
// The row stacks (line, then countdown) and the line itself never wraps, so a
// long message cannot push the words down and the countdown still gets its own row.
check('the queue row stacks its countdown under the line', /\.queue-item\s*\{[^}]*flex-direction:\s*column/.test(css));
check('the line of the row never wraps', /\.queue-line\s*\{[^}]*flex-wrap:\s*nowrap/.test(css));
check('the buttons are keyboard reachable', /\.hold-btn:focus-visible/.test(css));

// --- a cancel handler set after the call still runs -----------------------
//
// queueMessage() cannot pass a handler in, because the handler has to know the
// item, and the item is created just before the call. It assigns hold.onCancel
// afterwards instead. So look the handler up when the button is pressed: capturing
// the destructured parameter left Cancel doing nothing, and the countdown row
// vanished while the message stayed in the queue.

const holdBody = body(app, 'holdMessage');
check('the cancel handler is read from the record, not the parameter',
  /const handler = record\.onCancel \|\| onCancel/.test(holdBody));
check('the given handler is still the fallback',
  /record\.onCancel \|\| onCancel/.test(holdBody));
check('a missing handler does not swallow the click',
  /typeof handler === 'function'/.test(holdBody));

const queueMsg = body(app, 'queueMessage');
check('the queue sets its cancel handler after the hold is created',
  /hold\.onCancel = /.test(queueMsg));
check('the queue cancel handler removes the item',
  /view\.queue\.splice\(at, 1\)/.test(queueMsg));
check('the queue cancel handler repaints the queue', /renderQueue\(\)/.test(queueMsg));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll hold-before-send checks passed');
