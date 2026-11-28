'use strict';

/**
 * The sidebar must not be resizeable — the parts a string can prove.
 *
 * It used to be a drag handle with a double-click reset, and this file used to
 * prove that the reset was *saved*. The column is now fixed: its width comes from
 * the longest line it has to show, and nothing in the UI may move it. The reason
 * is not taste — the sponsor creative is cropped to the column, so a resizable
 * sidebar gave every user a different crop of the same ad.
 *
 * The geometry half lives in scripts/check-sidebar-reset.js, which runs a real
 * window; this half guards the removal, where a leftover caller would be invisible
 * until someone dragged something.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');

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

/** The body of one function, from its declaration to the matching closing brace. */
function bodyOf(name) {
  const at = app.indexOf(`function ${name}(`);
  assert.ok(at > 0, `no ${name}() in the renderer`);
  let depth = 0;
  for (let i = app.indexOf('{', at); i < app.length; i += 1) {
    if (app[i] === '{') depth += 1;
    else if (app[i] === '}') {
      depth -= 1;
      if (depth === 0) return app.slice(at, i + 1);
    }
  }
  throw new Error(`${name}() has no closing brace`);
}

check('there is no drag handle in the page', () => {
  assert.ok(!/id="sidebarResizer"/.test(html), 'the resizer is still in index.html');
  assert.ok(!/#sidebarResizer/.test(css), 'the resizer is still styled');
  assert.ok(!/body\.resizing/.test(css), 'the drag cursor is still styled');
});

check('the resize wiring is gone', () => {
  assert.ok(!app.includes('initSidebarResize'), 'initSidebarResize still exists');
  assert.ok(!app.includes('resetSidebarWidth'), 'resetSidebarWidth still exists');
  assert.ok(!/sidebarResizer/.test(app), 'the renderer still looks up the handle');
  assert.ok(!app.includes('sidebarReset'), 'the dead reset notice is still wired');
});

check('the width function takes no argument, so no caller can widen it', () => {
  assert.match(app, /function applySidebarWidth\(\)/);
  assert.ok(!/function applySidebarWidth\(\s*\w+\s*\)/.test(app), 'applySidebarWidth still accepts a value');
  // A leftover call with a number must not survive anywhere.
  assert.ok(!/applySidebarWidth\([^)]\S/.test(app), 'something still calls applySidebarWidth with an argument');
});

check('the width is the measured floor, clamped to the allowed range', () => {
  const body = bodyOf('applySidebarWidth');
  assert.match(body, /sidebarMinWidth\(\)/);
  assert.match(body, /Math\.max\(SIDEBAR_MIN/);
  assert.match(body, /Math\.min\(SIDEBAR_MAX/);
});

check('the width is never saved to prefs', () => {
  assert.ok(!/setPrefs\(\{ sidebarWidth/.test(app), 'the width is still written to prefs');
  assert.ok(!/appPrefs\.sidebarWidth\s*=/.test(app), 'the width is still kept in memory');
});

check('it re-measures after a resize and after the font loads', () => {
  const at = app.indexOf('function lockSidebarWidth');
  assert.ok(at > 0, 'no lockSidebarWidth()');
  const body = app.slice(at, at + 800);
  // Debounced (2026-11-28): the resize still re-measures, once it settles.
  assert.match(body, /addEventListener\('resize'[\s\S]{0,160}applySidebarWidth\(\)/);
  assert.match(body, /document\.fonts\?\.ready\.then\(\(\) => applySidebarWidth\(\)\)/);
});

check('a language switch re-measures the floor too', () => {
  // applyLanguage() calls applySidebarWidth(); the floor moves with the sentence
  // length, so the column has to follow the language without a drag.
  assert.match(app, /if \(typeof applySidebarWidth === 'function'\)[\s\S]{0,200}applySidebarWidth\(\)/);
});

console.log(`${pass} checks passed`);