'use strict';

/**
 * The ad slot names who is paying.
 *
 * Two things are being locked down here. First the caption: the strip used to say
 * "AD", which is a warning label rather than information — someone reading the
 * conversation wants to know *whose* ad it is. Second the refresh button, which is
 * gone on purpose: the creative rotates on its own, and a control in the middle of
 * the message area read as part of the app instead of as an ad. A test that only
 * checked the markup would let the button's handler and CSS linger, so both are
 * checked too.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const READ = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const html = READ('src/renderer/index.html');
const css = READ('src/renderer/styles.css');
const app = READ('src/renderer/app.js');

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

const slot = (() => {
  const at = html.indexOf('id="adSlot"');
  assert.ok(at > 0, 'no ad slot in the markup');
  const end = html.indexOf('</div>', html.indexOf('class="ad-cta"', at));
  return html.slice(at, end);
})();

check('the caption says where the ad comes from, in both languages', () => {
  assert.match(slot, /data-i18n="adFrom"/);
  assert.match(app, /adFrom: 'โฆษณาจาก FREEPI\.AI'/);
  assert.match(app, /adFrom: 'Ad from FREEPI\.AI'/);
});

check('the old three-letter tag is gone', () => {
  assert.doesNotMatch(slot, />\s*AD\s*</);
});

check('the refresh button is gone from the markup', () => {
  assert.doesNotMatch(html, /adRefresh/);
  assert.doesNotMatch(slot, /ad-refresh/);
});

check('nothing in the renderer still reaches for it', () => {
  assert.doesNotMatch(app, /adRefresh/);
  // Its two strings went with it; leaving them translated would suggest a control
  // that no longer exists.
  assert.doesNotMatch(app, /changeAd:/);
  assert.doesNotMatch(app, /adBusy:/);
});

check('the stylesheet carries no dead button rule', () => {
  assert.doesNotMatch(css, /\.ad-refresh/);
});

check('the caption is a label, not a chip', () => {
  const at = css.indexOf('.ad-tag {');
  assert.ok(at > 0, 'no .ad-tag rule');
  const rule = css.slice(at, css.indexOf('}', at));
  // A border here competed with the headline beside it, and letterspacing made a
  // long caption ("โฆษณาจาก FREEPI.AI") wide enough to clip.
  assert.doesNotMatch(rule, /border:/);
  assert.match(rule, /text-overflow: ellipsis/);
  assert.match(rule, /max-width:/);
});

check('the caption is still translated when the language changes', () => {
  // `applyLanguage()` rewrites every [data-i18n] node, which is what keeps the
  // caption from staying Thai after a switch to English.
  assert.match(app, /querySelectorAll\('\[data-i18n\]'\)/);
});

check('the ad still opens on click and on Enter', () => {
  assert.match(app, /adSlot\.addEventListener\('click', openCurrentAd\)/);
  assert.match(app, /adSlot\.addEventListener\('keydown'/);
  assert.match(app, /adSlot\.tabIndex = 0/);
});

check('the creative still rotates on its own without the button', () => {
  // Rotation was never the button's job: main decides it is due, the renderer only
  // polls. If this interval went with the button the ad would never change again.
  assert.match(app, /AD_ROTATE_POLL_MS/);
  assert.match(app, /setInterval\([\s\S]{0,400}?rotateAd/);
});

check('the tooltip explains the ad instead of the button', () => {
  assert.match(app, /adSlot\.title = t\('adFrom'\)/);
});

console.log(`${pass} checks passed`);
