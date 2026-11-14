/**
 * Offline regression guard for how failures behave in the chat view.
 *
 * A failed tool used to pop its card open and force the transcript to the
 * bottom. Users read that as the app taking over: the box "opens itself" and
 * the view jumps to it. This test pins the rule instead — a failure is marked
 * in place, and the transcript only follows when the reader is already at the
 * bottom.
 *
 * src/renderer/app.js needs a live DOM, so this check reads the source and
 * inspects the two functions that own that behaviour.
 *
 * Run: node scripts/selftest-error-ux.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

/** Pull `function name(...) { ... }` out of the source by brace matching. */
function bodyOf(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const applyToolResult = bodyOf('applyToolResult');
const appendErrorBanner = bodyOf('appendErrorBanner');

check('applyToolResult exists', Boolean(applyToolResult));
check('appendErrorBanner exists', Boolean(appendErrorBanner));

// 1. A failure must not expand its own card.
check(
  'a failed tool card stays collapsed',
  Boolean(applyToolResult) && !/classList\.remove\(\s*'collapsed'\s*\)/.test(applyToolResult),
  'applyToolResult must not remove the collapsed class'
);

// 2. A failure must not expand the whole tools group either.
check(
  'a failed tool does not open the tool group',
  Boolean(applyToolResult) && !/tools\.hidden\s*=\s*false/.test(applyToolResult),
  'applyToolResult must not set tools.hidden = false'
);

// 3. The failure still has to be visible: red card, "Failed" label, group summary.
check(
  'the failure is still marked on the card',
  Boolean(applyToolResult) && /classList\.toggle\(\s*'error'/.test(applyToolResult) && /toolFailed/.test(applyToolResult)
);
check(
  'the group summary is refreshed so the failure is countable',
  Boolean(applyToolResult) && /refreshToolsSummary\(/.test(applyToolResult)
);

// 4. The error banner must never force the transcript to the bottom.
check(
  'the error banner does not force a scroll',
  Boolean(appendErrorBanner) && !/scrollToBottom\(\s*true\s*\)/.test(appendErrorBanner),
  'appendErrorBanner must call scrollToBottom() without the force flag'
);
check(
  'the error banner still follows a reader who is at the bottom',
  Boolean(appendErrorBanner) && /scrollToBottom\(/.test(appendErrorBanner)
);

// The rule moved into the sticky `pinnedToBottom` state, which the jump-to-newest
// button shares through isReadingUp(). It is no longer recomputed from a distance
// on every call, because content growing under a reader who never scrolled made
// the measured gap look like they had left.
const scroll = bodyOf('scrollToBottom');
check(
  'scrollToBottom only moves when the reader is following',
  Boolean(scroll) && /if\s*\(\s*!force\s*&&\s*!pinnedToBottom\s*\)/.test(scroll),
  'scrollToBottom must defer to the follow state when not forced'
);

// 6. The banner carries its own gutter.
//
// `.transcript > *` insets every block by 22px, but a block that sets its own
// padding replaces that inset instead of adding to it — so the banner used to
// hug the transcript edge at 12px while everything around it sat at 22px, and
// the error text looked like it was touching the border.
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
const bannerRule = css.match(/\n\.transcript > \.error-banner \{[\s\S]*?\n\}/);
check('the banner is re-inset to the transcript gutter', Boolean(bannerRule));
check(
  'the inset is expressed against the read width',
  Boolean(bannerRule) && /max-width:\s*calc\(var\(--read-width\) - 44px\)/.test(bannerRule[0])
);
check(
  'the banner keeps padding inside its own border',
  Boolean(bannerRule) && /padding:\s*11px 14px/.test(bannerRule[0])
);
check(
  'the longer form of the rule wins over the shared `> *` inset',
  css.indexOf('.transcript > .error-banner') > css.indexOf('.transcript > *')
);

// 7. The browser dialog's buttons: a tidy helper row, then a footer with the
// destructive action kept away from the way out.
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const wrapRow = html.match(/<div class="dialog-actions wrap">[\s\S]*?<\/div>/);
check('the helper buttons share one row', Boolean(wrapRow));
check(
  'that row holds all three helpers',
  Boolean(wrapRow) && ['browserOpenFolder', 'browserCopyUrl', 'browserWatch'].every((id) => wrapRow[0].includes(id))
);
check('the helper row no longer ends the dialog', Boolean(wrapRow) && !wrapRow[0].includes('browserClose'));

const footerRow = html.match(/<div class="dialog-actions footer">[\s\S]*?<\/div>/);
check(
  'the footer holds the toggle and close',
  Boolean(footerRow) && footerRow[0].includes('browserToggle') && footerRow[0].includes('browserClose')
);

const wrapCss = css.match(/\n\.dialog-actions\.wrap \{[\s\S]*?\n\}/);
check('the helper row may wrap instead of overflowing', Boolean(wrapCss) && /flex-wrap:\s*wrap/.test(wrapCss[0]));
check('the helpers share the width evenly', /\n\.dialog-actions\.wrap \.ghost \{[^}]*flex:\s*1 1 auto/.test(css));
const footCss = css.match(/\n\.dialog-actions\.footer \{[\s\S]*?\n\}/);
check(
  'the footer separates the way out from the primary button',
  Boolean(footCss) && /justify-content:\s*space-between/.test(footCss[0])
);
check(
  'the dialog scrolls so its footer is never cut off',
  /\.browser-dialog \{[\s\S]*?overflow-y:\s*auto/.test(css)
);
check('the browser dialog opts into that rule', /class="dialog browser-dialog"/.test(html));

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: failures stay marked, never in the reader\'s face');
