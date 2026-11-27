/**
 * The window should come back the way it was left (2026-11-26).
 *
 * The complaint: a maximized window reopened at 1240x840 in the corner, and the
 * person had to maximize it again after every launch. Nothing stored the size,
 * the position or the maximized state, so there was nothing to read back.
 *
 * `readWindowState()` is run for real here — an untouched install, a real save,
 * garbage, and a position left behind by a monitor that is no longer plugged in —
 * because getting that last one wrong opens the window where it cannot be
 * reached.
 *
 * Run: node scripts/selftest-window-state.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/* 1. What the saved state means, run against a stand-in prefs.json. */
const stateSrc = bodyOf(main, 'readWindowState');
check('main owns one reader for the saved geometry', Boolean(stateSrc));

const DISPLAY = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
function readWindow(prefs, displays = [DISPLAY]) {
  const fn = new Function('readPrefs', 'screen', `return (${stateSrc.replace('function readWindowState', 'function')});`)(
    () => prefs,
    { getAllDisplays: () => displays }
  );
  return fn();
}

if (stateSrc) {
  const fresh = readWindow({});
  check('an untouched install gets the default size', fresh.width === 1240 && fresh.height === 840);
  check('and no position, so the system places it', fresh.x === undefined && fresh.y === undefined);
  check('and is neither maximized nor full screen', fresh.maximized === false && fresh.fullScreen === false);

  const saved = readWindow({ window: { x: 100, y: 60, width: 1600, height: 1000, maximized: true } });
  check('a saved size comes back', saved.width === 1600 && saved.height === 1000);
  check('a saved position comes back', saved.x === 100 && saved.y === 60);
  check('a maximized window reopens maximized', saved.maximized === true);
  check('full screen is remembered too', readWindow({ window: { fullScreen: true } }).fullScreen === true);

  const junk = readWindow({ window: { width: -5, height: 1e12, x: 'a', y: null, maximized: 'yes' } });
  check('a nonsense size falls back to the default', junk.width === 1240 && junk.height === 840);
  check('a nonsense position is dropped', junk.x === undefined && junk.y === undefined);
  check('only a real boolean maximizes', junk.maximized === false);

  /* A monitor that is gone: the saved spot has nothing under it any more. */
  const stranded = readWindow({ window: { x: 4000, y: 3000, width: 1240, height: 840 } }, [DISPLAY]);
  check('a position no display covers is dropped', stranded.x === undefined && stranded.y === undefined);
  check('but its size is kept', stranded.width === 1240);

  const secondScreen = readWindow({ window: { x: 2100, y: 100, width: 1240, height: 840 } }, [
    DISPLAY,
    { workArea: { x: 1920, y: 0, width: 1920, height: 1040 } },
  ]);
  check('a second monitor still counts', secondScreen.x === 2100 && secondScreen.y === 100);
}

/* 2. The window has to use it, and has to write it back. */
check('the window opens at the saved geometry', /const saved = readWindowState\(\);/.test(main));
check(
  'size and position reach the constructor',
  /width: saved\.width,\s*\n\s*height: saved\.height,/.test(main) && /\.\.\.\(Number\.isSafeInteger\(saved\.x\)/.test(main)
);
check(
  'the maximized state is restored before the page loads',
  /if \(saved\.fullScreen\) win\.setFullScreen\(true\);\s*\n\s*else if \(saved\.maximized\) win\.maximize\(\);/.test(main)
);
check(
  'closing saves the geometry that would be restored to',
  /win\.on\('close', \(\) => \{[\s\S]{0,700}?getNormalBounds\(\)[\s\S]{0,400}?maximized: win\.isMaximized\(\)/.test(main)
);
check('the display list is asked before trusting a position', /screen\.getAllDisplays\(\)/.test(main));
check(
  'the screen module is actually imported',
  /const \{[^}]*\bscreen\b[^}]*\} = require\('electron'\);/.test(main)
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the window reopens at the size, place and state it was closed in');
