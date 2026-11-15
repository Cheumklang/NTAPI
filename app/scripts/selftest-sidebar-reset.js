'use strict';

/**
 * Double-clicking the sidebar restores its width — the parts a string can prove.
 *
 * The geometry check (scripts/check-sidebar-reset.js) runs the page without the
 * app's main process, so it can prove the width comes back but not that it is
 * written to prefs. That half lives here: a reset that is applied and never saved
 * looks perfect until the next launch, which is exactly the bug this test exists
 * to prevent.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

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

check('the reset function exists and applies the shipped default', () => {
  const body = bodyOf('resetSidebarWidth');
  assert.match(body, /applySidebarWidth\(SIDEBAR_DEFAULT\)/);
});

check('it saves the width, so the reset survives a restart', () => {
  const body = bodyOf('resetSidebarWidth');
  assert.match(body, /appPrefs\.sidebarWidth = w/);
  assert.match(body, /api\.setPrefs\(\{ sidebarWidth: w \}\)/);
});

check('it says so on screen', () => {
  assert.match(bodyOf('resetSidebarWidth'), /showNotice\(t\('sidebarReset'\)/);
});

check('the divider answers a double-click', () => {
  // The resize handle is the small, obvious target; a double-click on it must not
  // also start a drag, which is why this listener sits next to the mousedown one.
  const at = app.indexOf('function initSidebarResize');
  assert.ok(at > 0, 'no initSidebarResize()');
  const block = app.slice(at, at + 3000);
  assert.match(block, /bar\.addEventListener\('dblclick'[\s\S]{0,120}?resetSidebarWidth\(\)/);
});

check('the sidebar background answers one too', () => {
  const at = app.indexOf('function initSidebarResize');
  const block = app.slice(at, at + 3000);
  assert.match(block, /querySelector\('#sidebar'\)\?\.addEventListener\('dblclick'/);
});

check('but a double-click on a row or a control is left alone', () => {
  const at = app.indexOf("querySelector('#sidebar')?.addEventListener('dblclick'");
  const block = app.slice(at, at + 500);
  // A row already means "open this chat"; a button already means "press me".
  assert.match(block, /e\.target\.closest\('[^']*\.session-item/);
  assert.match(block, /button, input, select, textarea, a/);
  assert.match(block, /if \(e\.target\.closest\([\s\S]{0,160}?\)\s*\)\s*return;/);
});

check('Home on the focused divider does the same thing', () => {
  assert.match(app, /e\.key === 'Home'[\s\S]{0,120}?resetSidebarWidth\(\)/);
});

check('the message is translated both ways', () => {
  assert.match(app, /sidebarReset: 'Sidebar width reset'/);
  assert.match(app, /sidebarReset: 'คืนความกว้างเริ่มต้นแล้ว'/);
});

check('dragging still saves the width it ends on', () => {
  // The reset shares its save path with the drag; breaking that would make every
  // width in the app forget itself.
  assert.match(app, /const onUp = \(\) => \{[\s\S]{0,400}?api\.setPrefs\(\{ sidebarWidth: w \}\)/);
});

console.log(`${pass} checks passed`);
