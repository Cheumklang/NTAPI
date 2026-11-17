/**
 * Apply the saved theme before the first paint.
 *
 * This runs from <head>, before the stylesheet has been laid out and long before
 * app.js has booted, because the theme has to be on <html> by then: doing it in
 * boot() meant a light-mode window painted dark first and flashed on every start.
 *
 * The value comes from prefs through a synchronous bridge call — one string, read
 * once, before anything is drawn. Anything unexpected (no bridge, no prefs, a
 * value from a future version) leaves the default dark theme in place.
 */
(function () {
  'use strict';
  try {
    // The preload exposes the bridge as `freepi` (its historical name); `api` is
    // accepted too so a rename in the preload cannot silently turn this off and
    // bring back the dark flash.
    const bridge = window.freepi || window.api;
    const theme = bridge && typeof bridge.getThemeSync === 'function' ? bridge.getThemeSync() : null;
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    else if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  } catch {
    // A theme is a preference, never a reason to fail to draw the window.
  }
})();