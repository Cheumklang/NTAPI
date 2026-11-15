'use strict';

/**
 * The plumbing behind "a repaint must not leave the chat short".
 *
 * The behaviour is proven in a real window by scripts/check-transcript-resilience.js.
 * What a string check adds is the wire the behaviour depends on: a report that is
 * only written to the console is gone when the window closes, and the whole point
 * of the log line is to have something to read *after* the chat went short.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = read('src/renderer/app.js');
const preload = read('src/preload.js');
const main = read('src/main.js');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

check('the transcript is drawn entry by entry', () => {
  // The loop must isolate each message. A guard around the whole loop would still
  // stop at the first bad entry — which is the bug.
  assert.match(app, /for \(let i = from; i < to; i \+= 1\) \{/);
  assert.match(app, /for \(let i = from; i < to; i \+= 1\) \{\s*\n\s*const m = messages\[i\];\s*\n\s*try \{/);
});

check('a failed entry does not become a missing tail', () => {
  assert.match(app, /gaps\.push\(\{ index: i, kind: m && m\.kind/);
  assert.match(app, /if \(gaps\.length\) reportTranscriptGaps\(/);
});

check('the gap is reported with the position and the reason', () => {
  const at = app.indexOf('function reportTranscriptGaps');
  assert.ok(at > 0, 'no reportTranscriptGaps()');
  const body = app.slice(at, at + 900);
  assert.match(body, /drew \$\{drawn\}\/\$\{total\}/);
  assert.match(body, /console\.error/);
  assert.match(body, /api\.uiLog/);
});

check('the report reaches disk, not just the console', () => {
  assert.match(preload, /uiLog: \(line\) => ipcRenderer\.send\('ui:log'/);
  assert.match(main, /ipcMain\.on\('ui:log', \(_e, line\) => logUi\(/);
  // Next to the crash log: one file to ask for when something looks wrong.
  assert.match(main, /function logUi\(line\) \{\s*\n\s*logCrash\('ui', line\);/);
});

check('reports are capped so a broken entry cannot flood the log', () => {
  assert.match(app, /if \(transcriptGapReports > 40\) return;/);
});

check('the media band and the advert still repaint after a gap', () => {
  // renderActiveTab() finishes its work after the loop; a guard that returned
  // early would leave the composer and the busy state wrong.
  // Whatever happens to the drawing, the chrome after it must still be applied:
  // the busy state, the scroll, the attachments, the ad band.
  const at = app.indexOf('drawRange(tailFrom, total);');
  const tail = app.slice(at, at + 400);
  assert.match(tail, /setBusy\(Boolean\(view\.busy\)\)/);
  assert.match(tail, /scrollToBottom\(true\)/);
});

console.log(`${pass} checks passed`);
