'use strict';

/*
 * Wrapped in a function, like markdown.js and provider-ui.js: a second
 * classic <script> declaring `const api` at top level would throw
 * "Identifier 'api' has already been declared" and this file would never run.
 */
(function (root) {

  /**
   * Durations, in the reader's language.
   *
   * `8783 ms` is accurate and unreadable; `8.8 วินาที` is what a Thai user asked
   * for, and `8.8 sec` is the same thing in English. Every surface that shows a
   * span of time goes through here so the wording and the rounding never drift
   * apart between the tool cards and the usage countdown.
   *
   * Loaded twice on purpose, like error-messages.js:
   *   - main / tests:  require('./duration')
   *   - renderer:      <script src="../duration.js"> sets globalThis.FPDuration
   */

  const UNITS = {
    en: { h: 'h', m: 'min', s: 'sec', ms: 'ms' },
    th: { h: 'ชม.', m: 'นาที', s: 'วินาที', ms: 'มิลลิวินาที' },
  };

  /** Rounded to one decimal, without a pointless ".0". */
  function oneDecimal(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function langUnits(lang) {
    return UNITS[lang] || UNITS.en;
  }

  /**
   * Format a span of time.
   *
   *   formatDuration(620, 'th')                  -> '0.6 วินาที'
   *   formatDuration(8783, 'th')                 -> '8.8 วินาที'
   *   formatDuration(86, 'th')                   -> '86 มิลลิวินาที'
   *   formatDuration(200646, 'th')               -> '3 นาที 21 วินาที'
   *   formatDuration(19 * 3600000, 'th')         -> '19 ชม.'
   *   formatDuration(8783, 'en')                 -> '8.8 sec'
   *   formatDuration(45000, 'th', {decimals: 0}) -> '45 วินาที'
   *
   * @param {number} ms
   * @param {'en'|'th'} [lang]
   * @param {{decimals?: number}} [opts] `decimals: 0` for countdowns, where a
   *   tenth of a second is noise.
   * @returns {string} empty string when the value is unusable
   */
  function formatDuration(ms, lang = 'en', opts = {}) {
    const value = Number(ms);
    if (!Number.isFinite(value) || value < 0) return '';

    const u = langUnits(lang);
    const decimals = opts.decimals;
    // Round to a tenth of a second up front, so 59960 ms becomes "1 นาที" instead
    // of a "60 วินาที" that no one writes.
    const tenths = Math.round(value / 100) * 100;
    const showSeconds = (seconds) => {
      if (decimals === 0) {
        // Countdowns round *up* so "0 วินาที" never sits on screen while waiting.
        const whole = Math.max(1, Math.ceil(seconds));
        return `${whole} ${u.s}`;
      }
      if (value < 100) return `${Math.round(value)} ${u.ms}`;
      const scaled = Math.round(seconds * 10) / 10;
      return `${oneDecimal(Math.max(0.1, scaled))} ${u.s}`;
    };

    const seconds = tenths / 1000;

    if (seconds < 60) return showSeconds(seconds);

    const minutes = Math.floor(seconds / 60);
    let rest = Math.round(seconds - minutes * 60);
    if (rest === 60) return formatDuration((minutes + 1) * 60000, lang, opts);

    if (minutes < 60) {
      return rest ? `${minutes} ${u.m} ${rest} ${u.s}` : `${minutes} ${u.m}`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes - hours * 60;
    const tail = mins ? `${mins} ${u.m}` : rest ? `${rest} ${u.s}` : '';
    return tail ? `${hours} ${u.h} ${tail}` : `${hours} ${u.h}`;
  }

  const api = { formatDuration, UNITS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FPDuration = api;
})(typeof window !== 'undefined' ? window : globalThis);
