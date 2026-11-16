'use strict';

/**
 * The status pill in the topbar, offline.
 *
 * The panel it replaces was three things at once: a live meter, a six-row table,
 * and the block that pushed the sponsor strip around in the sidebar. Moving it to
 * one row of the topbar means every id it carries had to survive the move — the
 * renderer writes those ids directly, so a dropped one fails silently, with a
 * number that simply never updates.
 *
 * Hence the duplicate-id scan: `usageCost` exists in the pill and the popover
 * would have been an easy place to reintroduce it, and two nodes with one id give
 * `getElementById` the first and the user a stale number.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const READ = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const html = READ('src/renderer/index.html');
const css = READ('src/renderer/styles.css');
const app = READ('src/renderer/app.js');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

/** The part of the markup between `<header id="topbar">` and its closing tag. */
const topbar = (() => {
  const at = html.indexOf('<header id="topbar">');
  assert.ok(at > 0, 'no topbar');
  const end = html.indexOf('</header>', at);
  return html.slice(at, end);
})();

const sidebar = (() => {
  const at = html.indexOf('<aside');
  assert.ok(at > 0, 'no sidebar');
  const end = html.indexOf('</aside>', at);
  return html.slice(at, end);
})();

const pillMarkup = (() => {
  const at = topbar.indexOf('class="status-strip"');
  assert.ok(at > -1, 'no status strip in the topbar');
  return topbar.slice(at);
})();

check('the sidebar no longer carries a status panel', () => {
  assert.doesNotMatch(sidebar, /class="section usage"/);
  assert.doesNotMatch(sidebar, /id="usageCost"/);
  assert.doesNotMatch(sidebar, /id="refreshUsage"/);
});

check('the pill sits in the topbar, between the name and the controls', () => {
  const title = topbar.indexOf('id="titleWrap"');
  const strip = topbar.indexOf('class="status-strip"');
  const controls = topbar.indexOf('class="controls"');
  assert.ok(title > -1 && strip > -1 && controls > -1);
  assert.ok(title < strip, 'the pill is before the session name');
  assert.ok(strip < controls, 'the pill is after the model controls — not the same row the user asked for');
});

check('the pill carries the three glanceable values', () => {
  for (const id of ['usageBarFill', 'usagePct', 'usageCost', 'contextPct']) {
    assert.ok(pillMarkup.includes(`id="${id}"`), `${id} is not in the pill`);
  }
});

check('the popover carries everything else', () => {
  const at = pillMarkup.indexOf('id="statusPopover"');
  assert.ok(at > -1, 'no popover');
  const pop = pillMarkup.slice(at);
  for (const id of [
    'usageUsed',
    'usageTokens',
    'usageContext',
    'usageResets',
    'contextFill',
    'refreshUsage',
    'providerUsage',
    'providerName',
    'providerMeterText',
  ]) {
    assert.ok(pop.includes(`id="${id}"`), `${id} is not in the popover`);
  }
});

check('the pill carries no dropdown arrow', () => {
  // The arrow sat on top of the last percentage and pointed at a menu nobody
  // needed announced: the panel opens on hover instead.
  assert.doesNotMatch(html, /status-caret/);
  assert.doesNotMatch(css, /status-caret/);
  // Only inside the pill itself — the model picker right after it has its own
  // arrow, and that one stays.
  const pillButton = pillMarkup.slice(0, pillMarkup.indexOf('id="statusPopover"'));
  assert.doesNotMatch(pillButton, /▾/);
});

check('the popover starts closed and says so', () => {
  assert.match(pillMarkup, /id="statusPopover"[\s\S]{0,200}?hidden/);
  assert.match(pillMarkup, /aria-expanded="false"/);
  assert.match(pillMarkup, /aria-controls="statusPopover"/);
  assert.match(pillMarkup, /aria-haspopup="dialog"/);
});

check('the pill is a real button, so it is reachable by keyboard', () => {
  assert.match(pillMarkup, /<button[\s\S]{0,400}?class="status-pill"[\s\S]{0,80}?id="statusPill"/);
});

check('no id appears twice in the document', () => {
  const seen = new Map();
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const n = m[1];
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  const dupes = [...seen].filter(([, n]) => n > 1).map(([n]) => n);
  assert.deepStrictEqual(dupes, [], `duplicated ids: ${dupes.join(', ')}`);
});

check('the strip is a positioning context for the popover', () => {
  const rule = css.slice(css.indexOf('.status-strip {'), css.indexOf('}', css.indexOf('.status-strip {')));
  assert.match(rule, /position:\s*relative/);
});

check('the popover is anchored under the pill, on the right', () => {
  const at = css.indexOf('.status-popover {');
  assert.ok(at > -1, 'no popover style');
  const rule = css.slice(at, css.indexOf('\n}', at));
  assert.match(rule, /position:\s*absolute/);
  assert.match(rule, /right:\s*0/);
  assert.match(rule, /z-index:\s*\d+/);
});

check('a hidden popover is really hidden', () => {
  // `[hidden]` is a browser default, but any `display` on the class rule beats it
  // — the sponsor strip lost a day to exactly this.
  assert.match(css, /\.status-popover\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.status-group\[hidden\] \{ display: none; \}/);
});

check('the pill fits the topbar at one fixed height', () => {
  const at = css.indexOf('.status-pill {');
  const rule = css.slice(at, css.indexOf('\n}', at));
  assert.match(rule, /height:\s*30px/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /min-width:\s*0/);
});

check('narrow windows drop the words, not the numbers', () => {
  assert.match(css, /@media \(max-width: 1080px\)[\s\S]{0,200}?\.status-pill \.status-label \{ display: none; \}/);
});

check('the pill changes what it shows for a non-FreePi provider', () => {
  assert.match(app, /stripFree\.hidden = chrome\.meter !== null/);
  assert.match(app, /stripProvider\.hidden = chrome\.meter === null/);
  // The two lines in the pill are mirrors of the popover's rows, written in the
  // same function so they cannot drift apart.
  assert.match(app, /function paintProviderMeter[\s\S]{0,900}?pillName\.textContent = name\.textContent/);
  assert.match(app, /function paintProviderMeter[\s\S]{0,4000}?mirror\(\);[\s\S]{0,40}?\n\}/);
});

check('the pill percentage is bare, the sentence moved to the popover', () => {
  assert.match(app, /el\('usagePct'\)\.textContent = `\$\{usedPct\}%`/);
  // The popover keeps the long form, which is where the allowance is spelled out.
  assert.match(app, /el\('usageUsed'\)\.textContent = t\('spent'/);
});

check('toggling the popover updates aria-expanded', () => {
  assert.match(app, /function setStatusPopover\(open\)[\s\S]{0,400}?setAttribute\('aria-expanded', open \? 'true' : 'false'\)/);
});

check('hovering the pill opens the popover after a short delay', () => {
  assert.match(app, /STATUS_OPEN_DELAY_MS = \d+/);
  assert.match(
    app,
    /addEventListener\('pointerenter', \(\) => queueStatusPopover\(true, STATUS_OPEN_DELAY_MS\)\)/,
  );
});

check('leaving waits longer than arriving, so the panel is reachable', () => {
  const open = Number((app.match(/STATUS_OPEN_DELAY_MS = (\d+)/) || [])[1]);
  const close = Number((app.match(/STATUS_CLOSE_DELAY_MS = (\d+)/) || [])[1]);
  assert.ok(open > 0 && close > open, { open, close });
});

check('the leave handler listens on the whole strip, not the pill', () => {
  // Moving from the pill into the panel is not "leaving" — otherwise the refresh
  // button inside could never be clicked.
  assert.match(app, /statusStripEl\.addEventListener\('pointerleave'/);
});

check('a click pins the panel open so its buttons are usable', () => {
  assert.match(app, /statusPinned = true;[\s\S]{0,40}?cancelStatusHover\(\);/);
  assert.match(app, /if \(!open && statusPinned\) return;/);
});

check('Escape closes it and puts focus back on the pill', () => {
  assert.match(
    app,
    /el\('statusPopover'\)\.addEventListener\('keydown'[\s\S]{0,400}?setStatusPopover\(false\);[\s\S]{0,80}?el\('statusPill'\)\.focus\(\)/,
  );
});

check('a click outside closes it, on pointerdown so it cannot reopen itself', () => {
  assert.match(
    app,
    /document\.addEventListener\('pointerdown'[\s\S]{0,300}?closest\('#statusStrip'\)[\s\S]{0,80}?setStatusPopover\(false\)/,
  );
});

check('every label the pill and popover show is translated in both languages', () => {
  for (const key of ['status', 'credits', 'bonus', 'lane', 'resets', 'context', 'refreshStatus', 'provider']) {
    const hits = app.match(new RegExp(`\\n\\s*${key}:`, 'g')) || [];
    assert.ok(hits.length >= 2, `${key} is missing from one of the two languages`);
  }
});

check('the command palette entry still reaches the refresh control', () => {
  assert.match(app, /run: \(\) => el\('refreshUsage'\)\.click\(\)/);
});

check('a model name too long for the tab ends in an ellipsis', () => {
  // Reported from the window: “Zro DeepSeek V4.1 Flash” in a provider pill was
  // cut mid-glyph on the tab's border. The provider name stays whole; only the
  // model name gives way, and it gives way with an ellipsis.
  const at = css.indexOf('#statusProviderMeter {');
  assert.ok(at > -1, 'no rule for the model name');
  const rule = css.slice(at, css.indexOf('\n}', at));
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.match(rule, /overflow:\s*hidden/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /min-width:\s*0/);
  const nameAt = css.indexOf('#statusProviderName {');
  assert.ok(nameAt > -1, 'no rule for the provider name');
  assert.match(css.slice(nameAt, css.indexOf('\n}', nameAt)), /flex:\s*none/);
  // Truncated on screen is only honest if the whole name is reachable.
  assert.match(app, /pillMeter\.title = text\.textContent/);
});

check('the popover is wide enough for its longest row on one line', () => {
  const at = css.indexOf('.status-popover {');
  assert.ok(at > -1, 'no popover style');
  const rule = css.slice(at, css.indexOf('\n}', at));
  const min = Number((rule.match(/min-width:\s*(\d+)px/) || [])[1]);
  assert.ok(min >= 220, `min-width is ${min}px`);
  // Still anchored to the tab's left edge, so growing only moves the right side.
  assert.match(rule, /left:\s*0/);
});

check('a hidden usage row is really hidden', () => {
  // Same trap as the popover itself: `.usage-row` sets `display: flex`, which
  // beats the browser's `[hidden]` rule — the Coarena reset line (and its last
  // date) stayed on screen for every other provider.
  assert.match(css, /\.usage-row\[hidden\] \{ display: none; \}/);
});

console.log(`${pass} checks passed`);
