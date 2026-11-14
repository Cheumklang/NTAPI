/**
 * Durations must read naturally in both languages.
 *
 * The tool cards used to print raw milliseconds (`200646 ms`) and the usage
 * countdown printed `0 นาที` for anything under a minute. Both are now made by
 * src/duration.js, and this script pins the wording, the rounding and the
 * wiring so they cannot drift again.
 *
 * Run: node scripts/selftest-duration.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

const { formatDuration } = require('../src/duration');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

console.log('-- Thai --');
check('sub-second keeps one decimal', () => assert.strictEqual(formatDuration(620, 'th'), '0.6 วินาที'));
check('a few seconds is readable', () => assert.strictEqual(formatDuration(8783, 'th'), '8.8 วินาที'));
check('minutes and seconds', () => assert.strictEqual(formatDuration(200646, 'th'), '3 นาที 21 วินาที'));
check('whole minute drops the seconds', () => assert.strictEqual(formatDuration(120000, 'th'), '2 นาที'));
check('hours drop the seconds', () => assert.strictEqual(formatDuration(19 * 3600000 + 24 * 60000, 'th'), '19 ชม. 24 นาที'));
check('an exact hour has no tail', () => assert.strictEqual(formatDuration(3600000, 'th'), '1 ชม.'));
check('59.96 s carries into a minute instead of "60 วินาที"', () => assert.strictEqual(formatDuration(59960, 'th'), '1 นาที'));

console.log('-- English --');
check('seconds use "sec"', () => assert.strictEqual(formatDuration(8783, 'en'), '8.8 sec'));
check('minutes use "min"', () => assert.strictEqual(formatDuration(200646, 'en'), '3 min 21 sec'));
check('hours', () => assert.strictEqual(formatDuration(3600000 * 2 + 60000, 'en'), '2 h 1 min'));

console.log('-- countdown mode --');
check('rounds up, never "0 วินาที"', () => assert.strictEqual(formatDuration(1200, 'th', { decimals: 0 }), '2 วินาที'));
check('no tenths in a countdown', () => assert.strictEqual(formatDuration(45000, 'th', { decimals: 0 }), '45 วินาที'));
check('countdown in English', () => assert.strictEqual(formatDuration(45000, 'en', { decimals: 0 }), '45 sec'));

console.log('-- edge cases --');
check('missing value is empty, not NaN', () => assert.strictEqual(formatDuration(undefined, 'th'), ''));
check('negative is empty', () => assert.strictEqual(formatDuration(-5, 'th'), ''));
check('unknown language falls back to English', () => assert.strictEqual(formatDuration(8783, 'xx'), '8.8 sec'));
check('very small values stay in milliseconds, spelled out', () =>
  assert.strictEqual(formatDuration(42, 'th'), '42 มิลลิวินาที'));
check('English keeps the short form', () => assert.strictEqual(formatDuration(42, 'en'), '42 ms'));

console.log('-- wiring --');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

check('the renderer loads duration.js before app.js', () => {
  const d = html.indexOf('duration.js');
  const a = html.indexOf('app.js');
  assert.ok(d > 0, 'duration.js is not in index.html');
  assert.ok(d < a, 'duration.js must come before app.js');
});

// A <script src> that points at nothing fails silently: the file just never
// loads, `formatSpan` falls back to raw milliseconds, and every tool card shows
// "9150 ms" again. This is exactly what happened when the renderer asked for
// `duration.js` while the file lived one directory up.
check('every file the renderer asks for exists', () => {
  for (const [, ref] of html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|data:)/.test(ref)) continue;
    const target = path.join(__dirname, '..', 'src', 'renderer', ref);
    assert.ok(fs.existsSync(target), `${ref} does not resolve (looked in src/renderer)`);
  }
});

check('the shared modules publish their global without colliding', () => {
  for (const file of ['duration.js', 'error-messages.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    // Two classic scripts that both declare `const api` at top level throw
    // "Identifier 'api' has already been declared" and the second never runs.
    assert.match(source, /\(function \(root\) \{/, `${file} is not wrapped in an IIFE`);
    assert.match(source, /\(typeof window !== 'undefined' \? window : globalThis\)/);
  }
});
check('tool cards use the formatter, not raw ms', () => {
  assert.doesNotMatch(appJs, /`\$\{res\.durationMs\} ms`/);
  assert.match(appJs, /FPDuration\?\.formatDuration/);
});
check('the usage countdown uses the formatter', () => {
  assert.doesNotMatch(appJs, /\$\{mins\} นาที/);
  assert.match(appJs, /FPDuration/);
});

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: durations read naturally in Thai and English');
