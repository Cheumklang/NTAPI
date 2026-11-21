/**
 * Which browser tabs the agent is allowed to touch, and whether a navigation has
 * taken one of them somewhere it was never trusted for.
 *
 * A task can legitimately span more than one site — the same clip goes to
 * Facebook and TikTok — so a tab is granted on its own, revoked on its own, and
 * every tab that was never handed over stays refused. What must not happen is a
 * single grant quietly widening into "the whole browser".
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
 * The tabs the user has handed over, newest last.
 *
 * `MAX_CLAIMS` is a legibility limit, not a security one: eight rows is already
 * more than anyone reads, and refusing the ninth outright beats silently
 * dropping the first one the user granted.
 */
const MAX_CLAIMS = 8;

/**
 * Tabs the agent opened for itself, at most this many remembered.
 *
 * "Go and check example.com" must not mean "hand me a tab first": a site the
 * user never opened is unreachable unless the agent may open it. The tab it
 * opened is its own — it created it, it knows the page — so it may work in it
 * without a hand-over. What that must never become is permission to read the
 * user's own tabs: those are still granted one at a time, by the user.
 */
const MAX_OWNED = 8;

function createClaims(options = {}) {
  const now = typeof options.now === 'function' ? options.now : Date.now;
  /** tabId -> claim. Insertion-ordered so the browser card lists them by arrival. */
  const byTab = new Map();
  let lastTabId = null;
  /** tabId -> tab the agent opened itself (never a hand-over). */
  const ownedTabs = new Map();

  function build({ tabId, url, title } = {}) {
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
    return {
      tabId,
      url: String(url),
      title: String(title || ''),
      domain,
      claimedAt: now(),
    };
  }

  function claim(input = {}) {
    const entry = build(input);
    if (!byTab.has(entry.tabId) && byTab.size >= MAX_CLAIMS) {
      throw Object.assign(
        new Error(`The agent is already holding ${MAX_CLAIMS} tabs. Release one before handing over another.`),
        { code: 'TOO_MANY_TABS' }
      );
    }
    // Re-claiming an existing tab refreshes it and moves it to the end, so `get()`
    // still answers "the tab the user just touched" rather than a stale one.
    byTab.delete(entry.tabId);
    byTab.set(entry.tabId, entry);
    lastTabId = entry.tabId;
    return entry;
  }

  /** Release one tab, or every tab when no id is given. */
  function release(tabId) {
    if (Number.isInteger(tabId)) {
      byTab.delete(tabId);
      if (lastTabId === tabId) {
        const ids = [...byTab.keys()];
        lastTabId = ids.length ? ids[ids.length - 1] : null;
      }
      return;
    }
    byTab.clear();
    lastTabId = null;
  }

  /** The claim for `tabId`, or the most recently granted one when no id is given. */
  function get(tabId) {
    if (Number.isInteger(tabId)) return byTab.get(tabId) || null;
    return lastTabId === null ? null : byTab.get(lastTabId) || null;
  }

  /** Everything handed over, in the order it was handed over. */
  function list() {
    return [...byTab.values()];
  }

  function isClaimed(tabId) {
    return byTab.has(tabId);
  }

  /**
   * Remember a tab the agent opened. Re-opening the same tab refreshes it and
   * moves it to the end, so "the tab I am working in" stays the newest one.
   * Past `MAX_OWNED` the oldest is forgotten — it is a memory limit, not a
   * permission: the tab itself is still open in Chrome.
   */
  function own({ tabId, url, title } = {}) {
    if (!Number.isInteger(tabId)) return null;
    ownedTabs.delete(tabId);
    ownedTabs.set(tabId, {
      tabId,
      url: String(url || ''),
      title: String(title || ''),
      ownedAt: now(),
    });
    while (ownedTabs.size > MAX_OWNED) {
      const oldest = ownedTabs.keys().next().value;
      ownedTabs.delete(oldest);
    }
    return ownedTabs.get(tabId);
  }

  function disown(tabId) {
    if (!Number.isInteger(tabId)) return;
    ownedTabs.delete(tabId);
  }

  function isOwned(tabId) {
    return Number.isInteger(tabId) && ownedTabs.has(tabId);
  }

  function owned(tabId) {
    return isOwned(tabId) ? ownedTabs.get(tabId) : null;
  }

  /** The tab the agent opened last, or null — the default when nothing is claimed. */
  function lastOwned() {
    const ids = [...ownedTabs.keys()];
    return ids.length ? ownedTabs.get(ids[ids.length - 1]) : null;
  }

  function ownedList() {
    return [...ownedTabs.values()];
  }

  /**
   * Would navigating take a claimed tab off the site it was trusted for?
   * `tabId` is optional: without it, the most recent claim is checked, which is
   * what the single-tab call sites did before several tabs could be held.
   */
  function leavesSite(url, tabId) {
    const claimEntry = get(tabId);
    if (!claimEntry) return false;
    let hostname;
    try {
      hostname = new URL(String(url)).hostname;
    } catch {
      return true;
    }
    const domain = registrableDomain(hostname);
    if (!domain) return true;
    return domain !== claimEntry.domain;
  }

  return {
    claim,
    release,
    get,
    list,
    isClaimed,
    leavesSite,
    own,
    disown,
    isOwned,
    owned,
    lastOwned,
    ownedList,
    MAX_CLAIMS,
    MAX_OWNED,
  };
}

/**
 * Which tab to offer the agent when it asks for one: the tab the user is
 * actually looking at, never the agent's own window, never a row without an id.
 */
function pickClaimTarget(tabs) {
  if (!Array.isArray(tabs)) return null;
  // Two things are never a choice: the agent's own window, and a blank tab it
  // opened for itself. Offering either asks the user to hand over nothing, and
  // when only those exist the answer used to be a silent refusal with no dialog.
  const usable = tabs.filter((tab) => tab && !tab.agent && !tab.blank && Number.isInteger(tab.id));
  if (!usable.length) return null;
  return usable.find((tab) => tab.active) || usable[0];
}

module.exports = { SUFFIXES, registrableDomain, sameSite, createClaims, pickClaimTarget };
