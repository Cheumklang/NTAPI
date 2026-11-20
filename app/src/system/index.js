'use strict';

/**
 * Desktop control — the platform door.
 *
 * Only Linux has an adapter today, and it is the honest one: AT-SPI2 is how the
 * desktop already describes itself to screen readers, so the agent reads the
 * same tree a blind user's tools read instead of guessing at pixels. Windows
 * would answer here with UIAutomation later; until an adapter exists this
 * module says so instead of pretending.
 */

/** The one hotkey that takes control away, whatever the agent is doing. */
const SYSTEM_STOP_HOTKEY = 'Control+Alt+Escape';

/**
 * @returns {object|null} an adapter with available/windows/snapshot/act, or null
 */
function createSystem({ platform = process.platform } = {}) {
  if (platform === 'linux') return require('./linux');
  return null;
}

module.exports = { createSystem, SYSTEM_STOP_HOTKEY };
