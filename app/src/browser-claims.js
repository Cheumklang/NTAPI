/**
 * Which browser tab the agent is allowed to touch, and whether a navigation has
 * taken it somewhere it was never trusted for.
 *
 * The user's rule: trust the *task*, not the hostname. A Google Ads run crosses
 * ads.google.com, payments.google.com and business.google.com, and must not stop
 * to ask at each one — so "the same site" means the same **registrable domain**
 * (eTLD+1). What must stop the run is leaving that domain entirely, which is how
 * a redirect to somewhere unrelated gets caught.
 *
 * Pure: no I/O, no clock of its own.
 */
'use strict';

/**
 * The two-label public suffixes that would otherwise be mistaken for the
 * registrable domain (`shop.co.th` is the site, `co.th` is not). Only the ones
 * that matter here; a full public-suffix list is not worth the weight.
 */
const SUFFIXES = new Set([
  'co.th',
  'or.th',
  'ac.th',
  'go.th',
  'in.th',
  'net.th',
  'org.th',
  'co.uk',
  'org.uk',
  'ac.uk',
  'co.jp',
  'com.br',
  'com.cn',
  'co.in',
  'co.kr',
  'com.sg',
  'com.hk',
  'com.tw',
  'com.au',
]);

function isIpAddress(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':');
}

/**
 * `ads.google.com` -> `google.com`, `a.b.co.th` -> `b.co.th`.
 * IPs and single-label hosts are already as specific as they get.
 */
function registrableDomain(host) {
  if (typeof host !== 'string') return '';
  const clean = host.trim().toLowerCase().replace(/\.$/, '');
  if (!clean) return '';
  if (isIpAddress(clean)) return clean;

  const labels = clean.split('.');
  if (labels.length < 2) return clean;

  const lastTwo = labels.slice(-2).join('.');
  if (SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.');
  return lastTwo;
}

/** Do two URLs belong to the same registrable domain? */
function sameSite(urlA, urlB) {
  const hostOf = (value) => {
    try {
      return new URL(String(value)).hostname;
    } catch {
      return '';
    }
  };
  const a = registrableDomain(hostOf(urlA));
  const b = registrableDomain(hostOf(urlB));
  if (!a || !b) return false;
  return a === b;
}

/**
 * One claimed tab at a time. A claim is deliberate and short-lived: it exists
 * only while the user has handed a tab over in this run of the app.
 */
function createClaims(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  let current = null;

  function claim({ tabId, url, title } = {}) {
    if (!Number.isInteger(tabId)) {
      throw Object.assign(new Error('A claim needs the tab id it applies to.'), { code: 'BAD_CLAIM' });
    }
    let hostname;
    try {
      hostname = new URL(String(url)).hostname;
    } catch {
      throw Object.assign(new Error(`Not a URL that can be claimed: ${String(url)}`), { code: 'BAD_CLAIM' });
    }
    const domain = registrableDomain(hostname);
    if (!domain) {
      throw Object.assign(new Error(`That page has no site to claim: ${String(url)}`), { code: 'BAD_CLAIM' });
    }
    current = {
      tabId,
      url: String(url),
      title: String(title || ''),
      domain,
      claimedAt: now(),
    };
    return current;
  }

  function release() {
    current = null;
  }

  function get() {
    return current;
  }

  function isClaimed(tabId) {
    return Boolean(current) && current.tabId === tabId;
  }

  /** Would navigating this tab to `url` take it off the site it was trusted for? */
  function leavesSite(url) {
    if (!current) return false;
    let hostname;
    try {
      hostname = new URL(String(url)).hostname;
    } catch {
      return true;
    }
    const domain = registrableDomain(hostname);
    if (!domain) return true;
    return domain !== current.domain;
  }

  return { claim, release, get, isClaimed, leavesSite };
}

/**
 * Which tab to offer the agent when it asks for one: the tab the user is
 * actually looking at, never the agent's own window, never a row without an id.
 */
function pickClaimTarget(tabs) {
  if (!Array.isArray(tabs)) return null;
  const usable = tabs.filter((tab) => tab && !tab.agent && Number.isInteger(tab.id));
  if (!usable.length) return null;
  return usable.find((tab) => tab.active) || usable[0];
}

module.exports = { SUFFIXES, registrableDomain, sameSite, createClaims, pickClaimTarget };
