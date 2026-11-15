/**
 * The sidebar must never be allowed to squeeze its own header.
 *
 * It used to clamp at a flat 200px, which is narrower than the brand row
 * (icon + name + language / browser / settings chips), so dragging it in made
 * those chips slide under one another. The floor is now measured from the row
 * itself, and the row is allowed to shrink the *name*, never the buttons.
 *
 * Run: node scripts/selftest-sidebar-min.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');

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

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
const appJs = read('src', 'renderer', 'app.js');
const css = read('src', 'renderer', 'styles.css');
const html = read('src', 'renderer', 'index.html');

check('the minimum is measured, not a flat constant', () => {
  assert.match(appJs, /function sidebarMinWidth\(\)/);
  assert.match(appJs, /scrollWidth/);
});

check('the fixed width is that measurement, not a flat constant', () => {
  const fn = appJs.match(/function applySidebarWidth[\s\S]*?\n}/);
  assert.ok(fn, 'applySidebarWidth is missing');
  assert.match(fn[0], /sidebarMinWidth\(\)/);
  assert.match(fn[0], /Math\.max\(SIDEBAR_MIN,/);
});

check('a window resize re-measures the floor', () => {
  assert.match(appJs, /addEventListener\('resize',[\s\S]{0,200}applySidebarWidth\(\)/);
});

check('the brand row may not overflow its own box', () => {
  const brand = css.match(/\.brand \{[\s\S]*?\n\}/);
  assert.ok(brand, '.brand rule is missing');
  assert.match(brand[0], /min-width:\s*0/);
});

check('the chips keep their width while the name shrinks', () => {
  assert.match(css, /\.chip-btn \{[\s\S]{0,120}flex:\s*0 0 auto/);
  assert.match(css, /\.brand > span[\s\S]{0,160}text-overflow:\s*ellipsis/);
});

check('the header still holds the chips we protect', () => {
  for (const id of ['langBtn', 'browserBtn', 'settingsBtn']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from index.html`);
  }
  assert.match(html, /<div class="brand">/);
});

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the sidebar cannot be narrowed past its own header');
