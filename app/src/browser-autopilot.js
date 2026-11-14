/**
 * Autopilot: the mode where the agent stops asking for every single step on a
 * tab the user handed over — and every rule that takes that trust away again.
 *
 * The user chose to trust the *task*, not the hostname: a Google Ads run crosses
 * ads./payments./business.google.com and must not stop to ask at each one. What
 * ends the run is the tab closing, the page leaving the registrable domain
 * entirely, five quiet minutes, three failures in a row, the feature going off,
 * or the user pressing Stop.
 *
 * Two things this mode never covers: `browser_eval`, which can do anything the
 * page can, and any action whose label looks like spending money or deleting an
 * account. Those ask even while autopilot is on.
 *
 * Pure: no I/O, injectable clock.
 */
'use strict';

const { registrableDomain } = require('./browser-claims');

/** Labels that always go back to the user, autopilot or not. */
const ALWAYS_ASK = /pay|purchase|delete|remove account|ยืนยันการชำระ|ลบบัญชี/i;

/** Quiet for this long and the run is over. */
const IDLE_MS = 5 * 60 * 1000;

/** This many browser actions failing in a row and the run is over. */
const MAX_FAILURES = 3;

/**
 * The page-changing tools autopilot may cover. `browser_eval` is deliberately
 * absent: it runs arbitrary JavaScript and always asks.
 */
const COVERED_TOOLS = new Set([
  'browser_open',
  'browser_goto',
  'browser_click',
  'browser_type',
  'browser_fill',
  'browser_key',
  'browser_scroll',
  'browser_close',
  'browser_dialog',
]);

function isAlwaysAsk(label) {
  return ALWAYS_ASK.test(String(label === undefined || label === null ? '' : label));
}

/** eTLD+1 of a URL, or '' when it cannot be read. Same rule as a claim's domain. */
function domainOf(url) {
  try {
    return registrableDomain(new URL(String(url)).hostname);
  } catch {
    return '';
  }
}

function createAutopilot(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  let on = false;
  let tabId = null;
  let domain = '';
  let grantedAt = 0;
  let lastActionAt = 0;
  let failures = 0;
  let reason = null;

  function state() {
    return { on, tabId, domain, until: grantedAt + IDLE_MS, reason };
  }

  function grant({ tabId: id, domain: site } = {}) {
    if (!Number.isInteger(id)) {
      throw Object.assign(new Error('Autopilot needs the tab it applies to.'), { code: 'BAD_GRANT' });
    }
    on = true;
    tabId = id;
    domain = String(site || '');
    grantedAt = now();
    lastActionAt = grantedAt;
    failures = 0;
    reason = null;
    return state();
  }

  function stop(why = 'stopped') {
    on = false;
    reason = why;
    return state();
  }

  /** Any covered action pushes the idle deadline out. */
  function noteAction() {
    if (!on) return;
    lastActionAt = now();
  }

  function noteFailure() {
    if (!on) return;
    failures += 1;
    if (failures >= MAX_FAILURES) stop('failures');
  }

  function endWith(why) {
    if (!on) return null;
    stop(why);
    return { reason: why };
  }

  /**
   * Should the run end because of this event? Returns `{ reason }` when it
   * ends the run (and ends it), or `null` when the run carries on.
   */
  function shouldExpire(event = {}) {
    if (!on) return null;

    if (event.type === 'featureOff') return endWith('featureOff');
    if (event.type === 'tabClosed') return event.tabId === tabId ? endWith('tabClosed') : null;
    if (event.type === 'navigate') {
      if (event.tabId !== undefined && event.tabId !== tabId) return null;
      const next = domainOf(event.url);
      if (!next || next !== domain) return endWith('leftSite');
      return null;
    }
    if (event.type === 'tick') {
      if (now() - lastActionAt > IDLE_MS) return endWith('idle');
      return null;
    }
    return null;
  }

  /**
   * May this tool call go ahead without the approval dialog?
   *
   * A pure question: it never changes the state. The caller records the action
   * with `noteAction()` once it actually happens.
   */
  function allows({ tool, tabId: id, label } = {}) {
    if (!on) return { allowed: false, reason: 'off' };
    if (id !== tabId) return { allowed: false, reason: 'otherTab' };
    if (!COVERED_TOOLS.has(tool)) return { allowed: false, reason: 'guardedTool' };
    if (isAlwaysAsk(label)) return { allowed: false, reason: 'alwaysAsk' };
    return { allowed: true, reason: 'autopilot' };
  }

  return { grant, stop, state, noteAction, noteFailure, shouldExpire, allows };
}

module.exports = { ALWAYS_ASK, IDLE_MS, MAX_FAILURES, COVERED_TOOLS, isAlwaysAsk, createAutopilot };
