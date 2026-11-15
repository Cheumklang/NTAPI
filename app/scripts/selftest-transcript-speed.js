'use strict';

/**
 * The rules that keep a repaint cheap, checked without a window.
 *
 * The behaviour is measured in scripts/check-transcript-speed.js. What a string
 * check adds is permanence: the drawing loop is the kind of code that grows a
 * "just draw everything" line back later, and the symptom (a chat that takes
 * seconds to appear) is invisible in a small test conversation.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const app = read('src/renderer/app.js');

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

const render = app.slice(app.indexOf('function renderActiveTab()'), app.indexOf('/** How much of a conversation has to be on screen'));
assert.ok(render.length > 1000, 'renderActiveTab() not found');

check('the end of the chat is drawn before the history above it', () => {
  const tail = render.indexOf('drawRange(tailFrom, total);');
  const rest = render.indexOf('setTimeout(paintNext, 0);');
  assert.ok(tail > 0, 'no tail-first draw');
  assert.ok(rest > tail, 'the follow-up pass must be scheduled after the tail');
});

check('the blocking pass is bounded, not the whole conversation', () => {
  assert.match(app, /const RENDER_TAIL_MESSAGES = 24;/);
  assert.match(app, /const RENDER_CHUNK_MESSAGES = 30;/);
  assert.match(render, /RENDER_TAIL_MESSAGES \* 2/);
});

check('history arrives in follow-up passes, not one big one', () => {
  assert.match(render, /pending\.shift\(\)/);
  assert.match(render, /if \(pending\.length\) setTimeout\(paintNext, 0\);/);
});

check('a newer repaint cancels the fill that is still running', () => {
  assert.match(render, /const generation = \+\+renderGeneration;/);
  assert.match(render, /if \(generation !== renderGeneration\) return;/);
  assert.match(app, /let renderGeneration = 0;/);
});

check('a chunk never starts mid-turn, which would split a bubble', () => {
  assert.match(app, /function alignChunk\(messages, index\)/);
  assert.match(app, /messages\[at\]\.kind !== 'user'\) at -= 1;/);
  assert.match(render, /alignChunk\(messages, total - RENDER_TAIL_MESSAGES\)/);
});

check('the window is usable before the history is finished', () => {
  const busy = render.indexOf('setBusy(Boolean(view.busy));');
  const schedule = render.indexOf('setTimeout(paintNext, 0);');
  assert.ok(busy > 0 && schedule > busy, 'busy/scroll must run with the tail, not after the fill');
});

check('inserting above the view does not move the text being read', () => {
  assert.match(render, /transcript\.scrollTop \+= Math\.max\(0, transcript\.scrollHeight - heightBefore\);/);
  assert.match(render, /if \(wasAtBottom\) scrollToBottom\(\);/);
});

check('a gap is still reported, and only once the drawing is done', () => {
  assert.match(render, /else if \(gaps\.length\) reportTranscriptGaps\(view, gaps, total, drawn\);/);
  assert.match(render, /if \(!pending\.length\) \{\s*\n\s*if \(gaps\.length\) reportTranscriptGaps\(view, gaps, total, drawn\);/);
});

console.log(`${pass} checks passed`);
