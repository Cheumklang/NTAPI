/**
 * Autopilot: the mode where the agent stops asking for every step on a tab the
 * user handed over — and the rules that take that trust away again.
 *
 * The user chose to trust the *task* rather than the hostname, so a run keeps
 * going across ads/payments/business.google.com. What ends it: the tab closing,
 * leaving the registrable domain, going quiet for five minutes, three failures
 * in a row, the feature going off, or the user pressing Stop.
 *
 * Run from app/:   node scripts/selftest-browser-autopilot.js
 */
'use strict';

const { createAutopilot, isAlwaysAsk, approvalVerdict, IDLE_MS, MAX_FAILURES } = require('../src/browser-autopilot');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/* --------------------------------------------------------- always-ask list */

check('a pay button always asks', isAlwaysAsk('Pay now'));
check('the Thai pay phrase always asks', isAlwaysAsk('ยืนยันการชำระ'));
check('deleting always asks', isAlwaysAsk('Delete campaign'));
check('removing the account always asks', isAlwaysAsk('Remove account'));
check('the Thai delete phrase always asks', isAlwaysAsk('ลบบัญชี'));
check('an ordinary button does not', !isAlwaysAsk('Continue'));
check('Thai save does not', !isAlwaysAsk('บันทึก'));
check('an empty label does not', !isAlwaysAsk(''));
check('a missing label does not', !isAlwaysAsk(undefined));
check('case does not matter', isAlwaysAsk('PAY NOW'));

check('the idle window is five minutes', IDLE_MS === 300000);
check('three failures end the run', MAX_FAILURES === 3);

/* -------------------------------------------------------------- grants */

let clock = 1000;
const a = createAutopilot({ now: () => clock });

check('off until granted', a.state().on === false);
check('off covers nothing', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === false);
check('the reason when off is "off"', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).reason === 'off');

a.grant({ tabId: 7, domain: 'google.com' });
check('granted means on', a.state().on === true && a.state().tabId === 7 && a.state().domain === 'google.com');
check('4 a grant has an expiry', a.state().until === 1000 + IDLE_MS);
check('granted for the claimed tab', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === true);
check('the reason when covered is autopilot', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).reason === 'autopilot');
check('another tab is not covered', a.allows({ tool: 'browser_click', tabId: 8, label: 'Continue' }).allowed === false);
check('another tab says why', a.allows({ tool: 'browser_click', tabId: 8, label: 'Continue' }).reason === 'otherTab');
check('eval always asks', a.allows({ tool: 'browser_eval', tabId: 7, label: '' }).allowed === false);
check('eval says why', a.allows({ tool: 'browser_eval', tabId: 7, label: '' }).reason === 'guardedTool');
check('bash is never covered', a.allows({ tool: 'bash', tabId: 7, label: '' }).allowed === false);
check('edit is never covered', a.allows({ tool: 'edit', tabId: 7, label: '' }).allowed === false);
check('a pay label always asks', a.allows({ tool: 'browser_click', tabId: 7, label: 'Pay now' }).allowed === false);
check('a pay label says why', a.allows({ tool: 'browser_click', tabId: 7, label: 'Pay now' }).reason === 'alwaysAsk');
check('typing is covered', a.allows({ tool: 'browser_type', tabId: 7, label: 'Campaign name' }).allowed === true);

/* --------------------------------------------------------- idle expiry */

clock += IDLE_MS + 1;
check('idle expiry fires', a.shouldExpire({ type: 'tick' }).reason === 'idle');
check('idle expiry turns it off', a.state().on === false && a.state().reason === 'idle');
check('a stopped run covers nothing', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === false);
check('expiring again reports nothing', a.shouldExpire({ type: 'tick' }) === null);

a.grant({ tabId: 7, domain: 'google.com' });
a.noteAction();
clock += IDLE_MS - 1;
check('a recent action keeps it alive', a.shouldExpire({ type: 'tick' }) === null);
clock += 2;
check('and it expires once the action is old enough', a.shouldExpire({ type: 'tick' }).reason === 'idle');

/* ------------------------------------------------------------- tab closed */

a.grant({ tabId: 7, domain: 'google.com' });
check('closing another tab changes nothing', a.shouldExpire({ type: 'tabClosed', tabId: 8 }) === null);
check('closing the claimed tab expires it', a.shouldExpire({ type: 'tabClosed', tabId: 7 }).reason === 'tabClosed');

/* ------------------------------------------------------------ navigation */

a.grant({ tabId: 7, domain: 'google.com' });
check('staying on the site does not expire', a.shouldExpire({ type: 'navigate', url: 'https://payments.google.com/pay' }) === null);
check('a sibling host is still the same site', a.shouldExpire({ type: 'navigate', url: 'https://business.google.com/x' }) === null);
check('leaving the site expires it', a.shouldExpire({ type: 'navigate', url: 'https://evil.example/x' }).reason === 'leftSite');
check('an unreadable url expires it', (() => {
  a.grant({ tabId: 7, domain: 'google.com' });
  return a.shouldExpire({ type: 'navigate', url: 'nonsense' }).reason === 'leftSite';
})());
check('a two-part-suffix site navigates within itself', (() => {
  const th = createAutopilot({ now: () => 0 });
  th.grant({ tabId: 1, domain: 'shop.co.th' });
  return th.shouldExpire({ type: 'navigate', url: 'https://www.shop.co.th/cart' }) === null;
})());
check('and leaving a two-part-suffix site expires it', (() => {
  const th = createAutopilot({ now: () => 0 });
  th.grant({ tabId: 1, domain: 'shop.co.th' });
  return th.shouldExpire({ type: 'navigate', url: 'https://other.co.th/x' }).reason === 'leftSite';
})());

/* -------------------------------------------------------------- failures */

a.grant({ tabId: 7, domain: 'google.com' });
a.noteFailure();
a.noteFailure();
check('two failures are tolerated', a.state().on === true);
a.noteFailure();
check('the third failure stops it', a.state().on === false && a.state().reason === 'failures');
check('a stopped run covers nothing after failures', a.allows({ tool: 'browser_click', tabId: 7, label: 'Continue' }).allowed === false);

a.grant({ tabId: 7, domain: 'google.com' });
a.noteFailure();
a.grant({ tabId: 7, domain: 'google.com' });
check('granting clears the failure count', (() => {
  a.noteFailure();
  a.noteFailure();
  return a.state().on === true;
})());

/* ------------------------------------------------------- stop and feature */

a.stop();
check('stop turns it off', a.state().on === false && a.state().reason === 'stopped');
check('stop reports the reason given', (() => {
  a.grant({ tabId: 7, domain: 'google.com' });
  a.stop('user');
  return a.state().reason === 'user';
})());
check('turning the feature off expires it', (() => {
  a.grant({ tabId: 7, domain: 'google.com' });
  return a.shouldExpire({ type: 'featureOff' }).reason === 'featureOff';
})());

check('an unknown event changes nothing', (() => {
  a.grant({ tabId: 7, domain: 'google.com' });
  return a.shouldExpire({ type: 'nonsense' }) === null && a.state().on === true;
})());
check('a grant without a tab is refused', (() => {
  try {
    a.grant({ domain: 'google.com' });
    return false;
  } catch {
    return true;
  }
})());
check('noteAction and noteFailure are harmless when off', (() => {
  const idle = createAutopilot({ now: () => 0 });
  idle.noteAction();
  idle.noteFailure();
  return idle.state().on === false;
})());

/* ------------------------------------------- who answers the approval prompt */

check('an ordinary tool is asked about', approvalVerdict({ toolName: 'bash', label: 'bash' }).skip === false);
check('a preapproved tool is skipped', approvalVerdict({ toolName: 'bash', label: 'bash', allowEverything: true }).skip === true);
check('a remembered tool is skipped', approvalVerdict({ toolName: 'bash', label: 'bash', remembered: true }).skip === true);
check('the reason for a preapproval is recorded', approvalVerdict({ toolName: 'bash', label: 'bash', allowEverything: true }).reason === 'preapproved');

// The money/delete guard is a promise made to the user, and it outranks every
// "stop asking" control they may have switched on earlier.
check('a pay label is asked about even when everything is allowed', approvalVerdict({ toolName: 'browser_click', label: 'button "Pay now"', allowEverything: true }).skip === false);
check('and the reason says why', approvalVerdict({ toolName: 'browser_click', label: 'button "Pay now"', allowEverything: true }).reason === 'alwaysAsk');
check('a delete label beats a remembered tool', approvalVerdict({ toolName: 'browser_click', label: 'Delete campaign', remembered: true }).skip === false);
check('a pay label beats hand-over mode', (() => {
  const on = createAutopilot({ now: () => 0 });
  on.grant({ tabId: 7, domain: 'google.com' });
  return approvalVerdict({ toolName: 'browser_click', label: 'Pay now', autopilot: on, targetTabId: 7 }).skip === false;
})());
check('a non-browser tool keeps its name and does not trip the guard', approvalVerdict({ toolName: 'write', label: 'write', allowEverything: true }).skip === true);

check('hand-over mode answers for its own tab', (() => {
  const on = createAutopilot({ now: () => 0 });
  on.grant({ tabId: 7, domain: 'google.com' });
  const verdict = approvalVerdict({ toolName: 'browser_click', label: 'button "Continue"', autopilot: on, targetTabId: 7 });
  return verdict.skip === true && verdict.reason === 'autopilot';
})());
check('hand-over mode does not answer for another tab', (() => {
  const on = createAutopilot({ now: () => 0 });
  on.grant({ tabId: 7, domain: 'google.com' });
  return approvalVerdict({ toolName: 'browser_click', label: 'Continue', autopilot: on, targetTabId: 8 }).skip === false;
})());
check('eval is never covered by hand-over mode', (() => {
  const on = createAutopilot({ now: () => 0 });
  on.grant({ tabId: 7, domain: 'google.com' });
  return approvalVerdict({ toolName: 'browser_eval', label: 'browser_eval', autopilot: on, targetTabId: 7 }).skip === false;
})());
check('a missing autopilot is fine', approvalVerdict({ toolName: 'browser_click', label: 'Continue' }).skip === false);

process.exit(failed ? 1 : 0);
