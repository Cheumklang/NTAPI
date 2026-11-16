/**
 * The activity chip must live exactly as long as the work it stands for — and it
 * must stay with the reply it belongs to.
 *
 * Two ways it used to break, both reported from the window:
 *
 *   1. Scrolling back after a turn showed "กำลังใช้เครื่องมือ: bash" inside a reply
 *      that had been finished for minutes. The chip state was cleared only on the
 *      bubble the view pointed at, and a repaint mid-turn had moved that pointer.
 *   2. Switching to another chat mid-turn and coming back put the status *below*
 *      the turn — the next tool call opened a second bubble at the bottom instead
 *      of painting into the block that was already running.
 *
 * A window is not needed to prove either wiring; the drawn result is measured in
 * `scripts/check-activity-chips.js`.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'app.js'),
  'utf8'
);

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/** Source between two landmarks, so assertions stay inside one function. */
function body(from, to) {
  const at = renderer.indexOf(from);
  assert.notStrictEqual(at, -1, `${from} is missing`);
  const end = to ? renderer.indexOf(to, at) : renderer.length;
  return renderer.slice(at, end === -1 ? renderer.length : end);
}

check('a finished turn wipes every chip in the transcript, not just one bubble', () => {
  const src = body('function clearViewActivity(view)', '/* ------------------------------ messages');
  assert.ok(/transcript\.querySelectorAll\('\.msg-activity'\)/.test(src),
    'chips left in another bubble survive as "still working"');
  assert.ok(/box\.replaceChildren\(\)/.test(src), 'the chips are never emptied');
});

check('a repaint re-attaches the live bubble instead of opening a new one', () => {
  const adopt = body('function adoptLiveBubble(view)', 'const payloadTabIsActive');
  assert.ok(/const wraps = transcript\.querySelectorAll\('\.msg\.assistant'\)/.test(adopt),
    'the reply the turn is writing into is not found again');
  assert.ok(/view\.liveAssistant = last;/.test(adopt), 'the pointer is not moved back');
  assert.ok(/syncActivity\(view\)/.test(adopt), 'the chips are not repainted on the adopted bubble');
  assert.ok(/!view\.busy/.test(adopt), 'an idle tab would adopt a bubble for nothing');
});

check('the repaint path calls it', () => {
  const src = body('function renderActiveTab()', 'function deriveLabel');
  assert.ok(/adoptLiveBubble\(view\);/.test(src), 'a tab switch still leaves the turn without its status');
});

check('a tool that ends while another chat is open still ends its chip', () => {
  const src = body('api.onToolEnd((p) => {', 'function applyToolResult');
  const count = src.indexOf('view.runningTools = Math.max(');
  const early = src.indexOf('if (!payloadTabIsActive(view)) return;');
  assert.notStrictEqual(count, -1, 'the tool count is never decremented');
  assert.notStrictEqual(early, -1, 'the active-tab guard is missing');
  assert.ok(count < early, 'the count only drops while this tab is on screen, so the chip sticks');
  assert.ok(/view\.act = \{ \.\.\.\(view\.act \|\| \{\}\), tools: Boolean\(view\.runningTools\) \}/.test(src),
    'the chip state is not updated for a background tab');
  assert.ok(/if \(!view\.runningTools\) view\.actTool = '';/.test(src), 'the tool name is kept after the last tool');
});

check('the chip is still painted from view state', () => {
  assert.ok(/function syncActivity\(view\)/.test(renderer), 'the repaint hook is gone');
  assert.ok(/setActivity\(view\.liveAssistant, channel, Boolean\(act\[channel\]\)\)/.test(renderer),
    'the chips are no longer derived from the view');
});

console.log(`\n${pass} checks passed`);
