/**
 * A notice has to go away — but not while somebody is reading it.
 *
 * The report: after saving a DeepSeek key the yellow bar said "บันทึกคีย์ DeepSeek
 * แล้ว" and stayed there. `showNotice(text, ms)` only set a timer when the caller
 * passed a duration, and most callers did not, so the notice sat above the composer
 * until the next one replaced it. That is indistinguishable from a stuck message.
 *
 * What it has to do instead:
 *
 *   1. Hide itself after five seconds when the caller says nothing.
 *   2. Show how long is left, so a person about to copy the sentence knows.
 *   3. Stop counting while the pointer rests on it, or while its text is selected,
 *      and carry on from where it stopped — not from the beginning.
 *   4. Still allow a caller to ask for a deliberate duration, or for no timer.
 *
 * scripts/check-notice-countdown.js measures the same three things in a real
 * window; this pins the source so a refactor cannot quietly drop them.
 *
 * Run: node scripts/selftest-notice-countdown.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
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
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
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

/* ------------------------- 1. five seconds by default ---------------------- */

check('there is a default duration', /const NOTICE_DEFAULT_MS = 5000;/.test(app));

const show = body(app, 'showNotice');
check('the notice caller is unchanged in shape', Boolean(show));
check(
  'an omitted duration falls back to the default',
  /ms === undefined \? NOTICE_DEFAULT_MS/.test(show)
);
check('an explicit duration is still honoured', /Number\(ms\) > 0 \? Number\(ms\)/.test(show));
check('zero still means "stay until replaced"', /: 0;/.test(show));
check('the clock is started for every notice', /startNoticeClock\(duration\)/.test(show));
check('the sentence goes into its own node, not over the countdown', /textNode\.textContent = softenTechnical\(text\)/.test(show));

// The bar used to be one text node; it now holds the sentence and the countdown.
check('the bar has a text node', /id="noticeText"/.test(html));
check('the bar has a countdown node', /id="noticeCount"/.test(html));

/* --------------------------- 2. a visible clock ---------------------------- */

const paint = body(app, 'paintNoticeCount');
check('the countdown is painted', Boolean(paint));
check('it shows whole seconds', /Math\.ceil\(noticeLeftMs\(\) \/ 1000\)/.test(paint));
check('it is hidden when there is no timer', /if \(!noticeDuration\) \{[\s\S]{0,80}hidden = true/.test(paint));
check('a paused clock looks paused', /classList\.toggle\('paused', noticePaused\)/.test(paint));
check('the label is translated', /t\('noticeCountdown', \{ n:/.test(app));
check(
  'both languages have the label',
  (app.match(/noticeCountdown:/g) || []).length === 2
);
check('the countdown is styled', /\.notice-count \{/.test(css));
check('it uses tabular figures so it does not jitter', /font-variant-numeric: tabular-nums/.test(css));

/* ------------------------ 3. it pauses for a reader ----------------------- */

const pause = body(app, 'pauseNoticeClock');
check('the clock can be paused', Boolean(pause));
check('it remembers what was left', /noticePausedLeft = noticeLeftMs\(\)/.test(pause));
check('pausing twice is harmless', /if \(!noticeDuration \|\| noticePaused\) return;/.test(pause));

const resume = body(app, 'resumeNoticeClock');
check('the clock can resume', Boolean(resume));
check('it resumes from where it stopped', /noticeDeadline = Date\.now\(\) \+ noticePausedLeft/.test(resume));

check('hovering the notice pauses it', /pointerenter', noticeHoverOn/.test(app) && /mouseenter', noticeHoverOn/.test(app));
check('leaving resumes it', /pointerleave', noticeHoverOff/.test(app) && /mouseleave', noticeHoverOff/.test(app));
check('focus inside pauses it', /focusin', pauseNoticeClock/.test(app));
check(
  'selecting its text pauses it',
  /function noticeHasSelection\(/.test(app) && /selectionchange'[\s\S]{0,160}pauseNoticeClock\(\)/.test(app)
);
check(
  'a selection is not thrown away by leaving the notice',
  /if \(noticeHasSelection\(\)\) return;\s*\n\s*resumeNoticeClock\(\);/.test(app)
);
check(
  'the selection check only looks inside the notice',
  /noticeEl\.contains\(sel\.getRangeAt\(0\)\.commonAncestorContainer\)/.test(app)
);

/* --------------------------- 4. it really goes --------------------------- */

const hide = body(app, 'hideNotice');
check('hiding stops the clock', /stopNoticeClock\(\)/.test(hide));
check('hiding clears the sentence', /textNode\.textContent = ''/.test(hide));
check('hiding clears the countdown', /count\.hidden = true/.test(hide));

const stop = body(app, 'stopNoticeClock');
check('stopping clears the interval', /clearInterval\(noticeClock\)/.test(stop));
check('stopping resets the pause state', /noticePaused = false/.test(stop));
check(
  'the tick hides the notice when the clock runs out',
  /noticeLeftMs\(\) <= 0[\s\S]{0,80}hideNotice\(\)/.test(body(app, 'startNoticeClock'))
);
check('a tick does nothing while paused', /if \(noticePaused\) return;/.test(body(app, 'startNoticeClock')));

/* ------------------- 5. a restored notice keeps its meaning ---------------- */

const restore = body(app, 'restoreTabNotice');
check('a stored notice is restored', Boolean(restore));
check('its remaining time is passed on', /showNotice\(n\.text, n\.ms > 0 \? left : 0\)/.test(restore));
check('an expired one is dropped instead of shown', /if \(n\.ms > 0 && left <= 0\)/.test(restore));

/* ------------------------- 6. the text is selectable --------------------- */

/** The declaration block of a selector, brace matched (the notice rule is long). */
function rule(selector) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open, i + 1);
    }
  }
  return '';
}

check('the notice text can be selected for copying', /user-select: text/.test(rule('.notice')));

console.log(
  failures === 0 ? '\nAll notice-countdown checks passed.' : `\n${failures} notice-countdown check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);