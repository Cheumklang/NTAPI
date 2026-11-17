/**
 * Following a streaming answer, without the reader having to chase it.
 *
 * The complaint: while the agent was thinking and writing, the newest lines sat
 * below the fold, and the only way to read along was to scroll by hand every few
 * seconds.
 *
 * The cause was a measurement, not a missing scroll call. Every delta did ask for
 * a scroll to the bottom, but the follow state was re-decided from "is the gap to
 * the bottom under 48px" on every scroll event — and during a stream the
 * transcript grows between the pin and the event that reports it (a thinking box
 * expanding, an image decoding, markdown re-rendering). The gap that growth left
 * behind read as "the reader scrolled away", so following switched off on its own
 * and stayed off for the rest of the turn.
 *
 * Run: node scripts/selftest-follow-stream.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

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
  const open = src.indexOf('{', src.indexOf(')', src.indexOf('(', start)) + 1);
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

/* ---------- the state is sticky, and our own pin is not a reader scroll ---------- */

const syncFollow = body(app, 'syncFollow');
check('the follow state has one decision point', Boolean(syncFollow));
check(
  'the offset this code wrote is recognised as ours',
  /lastScrollSet >= 0 && Math\.abs\(transcript\.scrollTop - lastScrollSet\) < 1/.test(syncFollow)
);
check('our own pin keeps following even after growth', /pinnedToBottom = true;/.test(syncFollow));
check('and it re-pins instead of leaving the gap', /if \(distanceFromBottom\(\) > 1\) pinScrollTop\(\);/.test(syncFollow));
check(
  'a real move by the reader still unpins',
  /pinnedToBottom = distanceFromBottom\(\) <= NEAR_BOTTOM_PX;/.test(syncFollow)
);
check('an explicit jump is not mistaken for a move', /if \(jumpingToBottom\) return;/.test(syncFollow));

/* ---------- streaming asks for a hold, not a single scroll ---------- */

const follow = body(app, 'followStream');
check('streaming has its own follow step', Boolean(follow));
check(
  'a reader who scrolled up is left alone',
  /if \(!pinnedToBottom\) \{[\s\S]{0,120}return;/.test(follow)
);
check('it borrows the bottom hold so late layout is caught', /holdBottom\(\);/.test(follow));
check('it pins immediately when the view is short', /if \(distanceFromBottom\(\) > 1\) pinScrollTop\(\);/.test(follow));

check(
  'both halves of a delta go through it',
  /if \(p\.channel === 'thinking'\)[\s\S]{0,1200}followStream\(\);/.test(app)
);
check('a finished block goes through it too', /\/\/ Streaming output follows only a reader who is already at the bottom\.\s*\n\s*followStream\(\);/.test(app));
check('the delta handler no longer scrolls once and stops', !/if \(p\.channel === 'thinking'\)[\s\S]{0,1200}scrollToBottom\(\);/.test(app));

/* ---------- the hold keeps re-asserting while content grows ---------- */

const hold = body(app, 'holdBottom');
check('the hold re-pins on every tick while short', /if \(distanceFromBottom\(\) > 1\) pinScrollTop\(\);/.test(hold));
check('it stops on its own', /Date\.now\(\) > bottomHoldUntil/.test(hold));
check('it stops for a reader who moved', /!pinnedToBottom \|\|/.test(hold));
check(
  'a wheel or a drag still ends it',
  /function releaseBottomHold\(/.test(app) && /releaseBottomHold\(\)/.test(app)
);

/* ---------- the thinking box keeps its own tail in view ---------- */

check('reasoning still follows its own newest line', /pinThinkingScroll\(th\)/.test(app));
check(
  'a reader who scrolled the box up keeps it',
  /box\.__fpFollow === false\) return/.test(app)
);

console.log(failures === 0 ? '\nAll follow-stream checks passed.' : `\n${failures} follow-stream check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);