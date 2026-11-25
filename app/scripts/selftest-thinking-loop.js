/**
 * Offline check for src/thinking-loop.js — no network, no Electron.
 * Run: node scripts/selftest-thinking-loop.js
 */
'use strict';

const { createLoopGuard, looksLooping } = require('../src/thinking-loop');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/** Feed a whole string the way the stream arrives: in small pieces. */
function feed(guard, text, size = 40) {
  let hit = false;
  for (let i = 0; i < text.length; i += size) {
    if (guard.push(text.slice(i, i + size))) hit = true;
  }
  return hit;
}

const PARAGRAPH =
  'I need to check whether the file already exists, and if it does I should read it ' +
  'before writing anything, because overwriting would destroy the user work. ';

// A genuine loop: the same long paragraph returns again and again.
{
  const guard = createLoopGuard();
  const looped = feed(guard, PARAGRAPH.repeat(5));
  check('a repeated paragraph is caught', looped === true);
}

// A shorter period loops too: the tail span need not line up with the period.
{
  const guard = createLoopGuard();
  const sentence = 'The same clause keeps coming back here without any progress. ';
  const looped = feed(guard, sentence.repeat(30));
  check('a repeated sentence is caught', looped === true);
}

// Healthy reasoning that never repeats a long span is left alone.
{
  const guard = createLoopGuard();
  const healthy = Array.from(
    { length: 60 },
    (_, i) => `step ${i}: inspect item ${i * 7} and decide the next thing to do. `
  ).join('');
  const looped = feed(guard, healthy);
  check('distinct reasoning is not a loop', looped === false);
}

// Restating a short phrase is normal; it must not trip the detector.
{
  const guard = createLoopGuard();
  // "let me check" returns, but no long span does: every line differs after it.
  const lines = Array.from(
    { length: 40 },
    (_, i) => `let me check item ${i} before moving on to the next part. `
  );
  check('a short repeated phrase is not a loop', feed(guard, lines.join('')) === false);
}

// Below the minimum length there is nothing to compare yet.
{
  const guard = createLoopGuard();
  check('too little text never trips', feed(guard, PARAGRAPH) === false);
}

// Whitespace/formatting runs are not reasoning and must not count.
{
  const blank = '\n'.repeat(600);
  check('a blank run is not a loop', looksLooping(blank) === false);
}

// reset() clears the window, so a nudge starts the new attempt clean.
{
  const guard = createLoopGuard();
  feed(guard, PARAGRAPH.repeat(5));
  guard.reset();
  check('reset clears the window', guard.text === '' && feed(guard, PARAGRAPH) === false);
}

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall thinking-loop checks passed');
