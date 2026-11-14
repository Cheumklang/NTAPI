/**
 * Second launch of NTAPI must bring the existing window forward instead of
 * starting a rival process.
 *
 * Run from app/:   node scripts/selftest-single-instance.js
 */
'use strict';

const { focusExistingWindow } = require('../src/single-instance');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

function fakeWindow({ minimized = false, visible = true, destroyed = false } = {}) {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    isVisible: () => visible,
    restore: () => calls.push('restore'),
    show: () => calls.push('show'),
    focus: () => calls.push('focus'),
  };
}

// Normal case: window is already visible -> only focus, no restore/show noise.
{
  const win = fakeWindow();
  const focused = focusExistingWindow(win);
  check('a visible window is just focused', focused === true && win.calls.join() === 'focus', win.calls.join());
}

// Minimized in the taskbar: must come back before it can take focus.
{
  const win = fakeWindow({ minimized: true });
  focusExistingWindow(win);
  check(
    'a minimized window is restored, then focused',
    win.calls.join() === 'restore,focus',
    win.calls.join()
  );
}

// Hidden (closed to tray / show:false start): without show() focus does nothing on Windows.
{
  const win = fakeWindow({ visible: false });
  focusExistingWindow(win);
  check('a hidden window is shown, then focused', win.calls.join() === 'show,focus', win.calls.join());
}

// Minimized and hidden at once.
{
  const win = fakeWindow({ minimized: true, visible: false });
  focusExistingWindow(win);
  check(
    'a minimized hidden window is restored, shown, then focused',
    win.calls.join() === 'restore,show,focus',
    win.calls.join()
  );
}

// The old window may be gone (user closed it while the second launch was starting).
{
  const win = fakeWindow({ destroyed: true });
  let threw = false;
  let focused;
  try {
    focused = focusExistingWindow(win);
  } catch {
    threw = true;
  }
  check('a destroyed window is ignored, not touched', !threw && focused === false && win.calls.length === 0);
}

// No window at all (quit during shutdown).
{
  let threw = false;
  let focused;
  try {
    focused = focusExistingWindow(null);
  } catch {
    threw = true;
  }
  check('no window is not an error', !threw && focused === false);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: a second launch focuses the window that is already open');
