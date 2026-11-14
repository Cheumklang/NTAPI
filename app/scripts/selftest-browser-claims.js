/**
 * Claims: which tab the agent may touch, and whether a navigation has left the
 * site it was trusted for.
 *
 * The rule this encodes is the one the user chose: trust the *task*, not the
 * hostname — so ads/payments/business.google.com are one site — but stop dead
 * if the page leaves the registrable domain entirely.
 *
 * Run from app/:   node scripts/selftest-browser-claims.js
 */
'use strict';

const { registrableDomain, sameSite, createClaims, pickClaimTarget } = require('../src/browser-claims');
const { createBrowserBridge } = require('../src/browser-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------ registrable domain */

check('plain host', registrableDomain('ads.google.com') === 'google.com');
check('subdomains collapse', registrableDomain('a.b.google.com') === 'google.com');
check('two-part suffix is respected', registrableDomain('shop.co.th') === 'shop.co.th');
check('subdomain of a two-part suffix collapses', registrableDomain('a.b.co.th') === 'b.co.th');
check('a three-label suffix is respected', registrableDomain('a.b.c.co.uk') === 'c.co.uk');
check('localhost stays itself', registrableDomain('localhost') === 'localhost');
check('an IP stays itself', registrableDomain('127.0.0.1') === '127.0.0.1');
check('case is folded', registrableDomain('ADS.Google.COM') === 'google.com');
check('a trailing dot is ignored', registrableDomain('example.com.') === 'example.com');
check('an empty host is empty', registrableDomain('') === '');
check('a non-string host is empty', registrableDomain(null) === '');

/* ------------------------------------------------------------------- site */

check('ads/payments/business are one site', sameSite('https://ads.google.com/aw', 'https://payments.google.com/pay'));
check('an unrelated host is not', !sameSite('https://ads.google.com', 'https://evil.example'));
check('the port does not matter', sameSite('http://example.com:8080/a', 'https://example.com/b'));
check('http and https are the same site', sameSite('http://example.com', 'https://example.com'));
check('two bad urls are not the same site', !sameSite('nonsense', 'also nonsense'));
check('one bad url is not the same site', !sameSite('https://example.com', 'nonsense'));

/* ------------------------------------------------------------------ claim */

const c = createClaims({});
check('nothing is claimed at first', c.get() === null && c.isClaimed(7) === false);
check('a claim on nothing is not claimed', c.isClaimed(undefined) === false);

const claimed = c.claim({ tabId: 7, url: 'https://ads.google.com/aw', title: 'Google Ads' });
check('the claim is recorded with its domain', c.get().domain === 'google.com' && c.isClaimed(7));
check('the claim keeps the title and tab', c.get().tabId === 7 && c.get().title === 'Google Ads');
check('claiming reports what was claimed', claimed && claimed.tabId === 7 && claimed.domain === 'google.com');
check('claiming stamps a time', Number.isFinite(c.get().claimedAt));

check('crossing within the site is allowed', c.leavesSite('https://payments.google.com/pay') === false);
check('leaving the site is flagged', c.leavesSite('https://evil.example/x') === true);
check('staying put is not leaving', c.leavesSite('https://ads.google.com/aw/campaigns') === false);
check('an unreadable url counts as leaving', c.leavesSite('nonsense') === true);

check('only one claim at a time', (() => {
  c.claim({ tabId: 8, url: 'https://x.example' });
  return c.get().tabId === 8 && c.isClaimed(7) === false;
})());

check('release clears it', (c.release(), c.get() === null && c.isClaimed(8) === false));

check('a bad url is refused', (() => {
  try {
    c.claim({ tabId: 9, url: 'not a url' });
    return false;
  } catch {
    return true;
  }
})());
check('a refused claim leaves nothing behind', c.get() === null);

check('a missing tab id is refused', (() => {
  try {
    c.claim({ url: 'https://example.com' });
    return false;
  } catch {
    return true;
  }
})());

check('leasing with no claim answers honestly', (() => {
  const empty = createClaims({});
  return empty.leavesSite('https://example.com') === false;
})());

check('now is injectable', (() => {
  const fixed = createClaims({ now: () => 1234 });
  return fixed.claim({ tabId: 1, url: 'https://example.com' }).claimedAt === 1234;
})());

/* --------------------------------------------------- which tab to offer up */

const tabList = [
  { id: 1, windowId: 1, active: false, agent: false, url: 'https://a.example', title: 'A' },
  { id: 2, windowId: 1, active: true, agent: false, url: 'https://b.example', title: 'B' },
  { id: 7, windowId: 3, active: true, agent: true, url: 'https://c.example', title: 'C' },
];
check('picking prefers the tab the user is looking at', pickClaimTarget(tabList).id === 2);
check('never picks the agent window', pickClaimTarget(tabList).agent === false);
check('falls back to the first usable tab', pickClaimTarget(tabList.map((t) => ({ ...t, active: false }))).id === 1);
check('picks nothing from an empty list', pickClaimTarget([]) === null);
check('picks nothing from a missing list', pickClaimTarget(undefined) === null);
check('picks nothing when only the agent window is open', pickClaimTarget([tabList[2]]) === null);
check('skips rows without an id', pickClaimTarget([{ active: true, agent: false }, tabList[0]]).id === 1);

// The bridge must expose the live claim so the system prompt can name the tab.
// Without it the model cannot tell a ready tab from no tab, and re-asks for one
// the user already handed over — which reads as the app not understanding.
check('bridge exposes the claimed tab', typeof createBrowserBridge({}).claimedTab === 'function');
check('an unclaimed bridge reports no tab', createBrowserBridge({}).claimedTab() === null);
{
  const claims = createClaims({});
  claims.claim({ tabId: 42, url: 'https://news.example/a', title: 'A headline' });
  const bridge = createBrowserBridge({});
  bridge.setClaims(claims);
  check('a claimed bridge reports that tab', bridge.claimedTab()?.tabId === 42);
  check('the reported tab carries its url', /news\.example/.test(bridge.claimedTab()?.url || ''));
  claims.release();
  check('releasing clears what the prompt sees', bridge.claimedTab() === null);
}

process.exit(failed ? 1 : 0);
