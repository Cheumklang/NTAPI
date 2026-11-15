'use strict';

/**
 * The About page names the developer once, in the language on screen.
 *
 * The markup carries both spellings so neither has to be typed twice in JS, but
 * drawing both at once made the name collide with itself: "Chanathip Cheumklang"
 * sat on top of "ชนาธิป เชื่อมกลาง", and the nickname repeated the same mistake one
 * line down. A Thai interface shows the Thai spelling, an English one shows the
 * English spelling, and the visible one keeps the primary weight so the page does
 * not read as a translation of itself.
 *
 * The switch is done in CSS keyed on `html[lang]`, which `applyLanguage()` writes
 * on every language change — so this test checks that the hook exists, that both
 * spellings are still in the markup (nothing is lost for screen readers or a
 * future language), and that exactly one of each pair is drawn per language.
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
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/** The body of a CSS rule, matched from the selector text that introduces it. */
function rule(selectorPattern) {
  const src = css.replace(/\r\n/g, '\n');
  const at = src.search(selectorPattern);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  const close = src.indexOf('}', open);
  return open === -1 || close === -1 ? '' : src.slice(open + 1, close);
}

/** True when a selector list matching `pattern` inside `langScope` hides `cls`. */
function hidden(langScope, cls) {
  const src = css.replace(/\r\n/g, '\n');
  const re = new RegExp(
    `${langScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*\\.${cls}[^{}]*\\{[^}]*display:\\s*none`,
  );
  return re.test(src);
}

const TH_SCOPE = 'html[lang="th"]';
const OTHER_SCOPE = 'html:not([lang="th"])';

check('both spellings of the name are still in the markup', () => {
  assert.match(html, /class="about-name-en">Chanathip Cheumklang</);
  assert.match(html, /class="about-name-th">ชนาธิป เชื่อมกลาง</);
});

check('both spellings of the nickname are still in the markup', () => {
  assert.match(html, /class="about-nick-en">Nont</);
  assert.match(html, /class="about-nick-th">นนท์</);
});

check('the interface language is written onto <html>, which the rules key on', () => {
  assert.match(app, /document\.documentElement\.lang\s*=\s*lang/);
});

check('a Thai interface draws only the Thai name', () => {
  assert.ok(hidden(TH_SCOPE, 'about-name-en'), 'English name is still drawn in Thai');
  assert.ok(!hidden(TH_SCOPE, 'about-name-th'), 'the Thai name was hidden as well');
});

check('a Thai interface draws only the Thai nickname', () => {
  assert.ok(hidden(TH_SCOPE, 'about-nick-en'), 'English nickname is still drawn in Thai');
  assert.ok(!hidden(TH_SCOPE, 'about-nick-th'), 'the Thai nickname was hidden as well');
});

check('an English interface draws only the English name', () => {
  assert.ok(hidden(OTHER_SCOPE, 'about-name-th'), 'Thai name is still drawn in English');
  assert.ok(!hidden(OTHER_SCOPE, 'about-name-en'), 'the English name was hidden as well');
});

check('an English interface draws only the English nickname', () => {
  assert.ok(hidden(OTHER_SCOPE, 'about-nick-th'), 'Thai nickname is still drawn in English');
  assert.ok(!hidden(OTHER_SCOPE, 'about-nick-en'), 'the English nickname was hidden as well');
});

check('the Thai name is the prominent line in a Thai interface', () => {
  const body = rule(new RegExp(`${TH_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{}]*\\.about-name-th`));
  assert.ok(body, 'no Thai-language rule for the name');
  assert.match(body, /font-size:\s*15px/, 'the surviving name is not the primary size');
  assert.match(body, /font-weight:\s*600/, 'the surviving name is not the primary weight');
  assert.match(body, /color:\s*var\(--text\)/, 'the surviving name is still muted');
});

if (!process.exitCode) console.log('\nAll about-name checks passed');
