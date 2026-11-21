'use strict';

/**
 * Desktop control — the platform door.
 *
 * Both adapters read the tree the operating system already publishes to screen
 * readers instead of guessing at pixels: AT-SPI2 on Linux, UI Automation on
 * Windows. Neither installs anything — AT-SPI needs python3-gi, UIA is part of
 * Windows — and neither moves the pointer, so both can only press a control
 * that says it can be pressed. Any other platform gets `null` rather than a
 * pretend adapter, and the panel says so.
 */

/** The one hotkey that takes control away, whatever the agent is doing. */
const SYSTEM_STOP_HOTKEY = 'Control+Alt+Escape';

/**
 * @returns {object|null} an adapter with available/windows/snapshot/act, or null
 */
function createSystem({ platform = process.platform } = {}) {
  if (platform === 'linux') return require('./linux');
  if (platform === 'win32') return require('./windows');
  return null;
}

module.exports = { createSystem, SYSTEM_STOP_HOTKEY };
