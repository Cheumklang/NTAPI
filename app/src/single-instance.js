'use strict';

/**
 * Bring the window that is already open back to the front.
 *
 * NTAPI allows one running copy (see `requestSingleInstanceLock` in main.js).
 * When the user launches it again — taskbar icon, shortcut, installer's "run
 * now" — that second process quits immediately and the first one receives
 * `second-instance`. The user expects the app to appear, so the existing window
 * has to be restored, shown and focused; a minimized or hidden window ignores
 * focus() on Windows.
 *
 * Kept pure and separate from the Electron main process so it can be tested
 * without an app running.
 *
 * @param {object|null} win a BrowserWindow-like object
 * @returns {boolean} whether a window was brought forward
 */
function focusExistingWindow(win) {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;

  if (typeof win.isMinimized === 'function' && win.isMinimized()) win.restore();
  if (typeof win.isVisible === 'function' && !win.isVisible()) win.show();
  win.focus();
  return true;
}

module.exports = { focusExistingWindow };
