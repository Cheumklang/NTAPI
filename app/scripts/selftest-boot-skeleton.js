'use strict';

/**
 * The reading area used to be blank for a frame or two at boot: the window shows
 * before the first transcript paints, and an empty scroll area reads as "nothing
 * loaded". A shimmering placeholder fills it now.
 *
 * The wiring is what needs guarding — a placeholder that never hides is worse than
 * no placeholder at all — so this pins where it lives, what clears it, and that
 * the shimmer respects the reduced-motion setting.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const html = read('src', 'renderer', 'index.html');
const css = read('src', 'renderer', 'styles.css');
const app = read('src', 'renderer', 'app.js');

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

check('the placeholder sits beside the transcript, not inside it', () => {
  const start = html.indexOf('<div class="transcript-wrap">');
  const end = html.indexOf('<footer id="composer">');
  if (start === -1 || end === -1) throw new Error('could not find the transcript area');
  const wrap = html.slice(start, end);
  const at = wrap.indexOf('id="txSkeleton"');
  if (at === -1) throw new Error('no #txSkeleton in the transcript area');
  // #transcript is emptied with `innerHTML = ''` on every tab switch.
  if (at < wrap.indexOf('</section>')) throw new Error('the skeleton is inside #transcript, which is rebuilt on every switch');
});

check('it is cleared by the first paint', () => {
  assert.match(app, /function hideSkeleton\(\)/);
  const at = app.indexOf('function renderActiveTab');
  assert.ok(at > 0, 'no renderActiveTab()');
  if (!app.slice(at, at + 2600).includes('hideSkeleton()')) {
    throw new Error('the first paint does not clear the placeholder');
  }
});

check('it cannot survive a boot that never finishes', () => {
  assert.match(app, /setTimeout\(hideSkeleton, \d+\)/, 'no safety timeout');
});

check('the shimmer stops for reduced motion', () => {
  assert.match(css, /@keyframes tx-shimmer/);
  const at = css.indexOf('@media (prefers-reduced-motion: reduce)', css.indexOf('@keyframes session-breathe'));
  if (at === -1) throw new Error('no reduced-motion block for the polish layer');
  if (!css.slice(at, at + 900).includes('.tx-sk-bar')) {
    throw new Error('the shimmer keeps animating for reduced motion');
  }
});

console.log(`${pass} checks passed`);