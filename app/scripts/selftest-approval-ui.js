/**
 * The approval switch has to look like part of the app, not like a Windows
 * control dropped into it.
 *
 * `.path-btn` was the obvious class to reuse and the wrong one: it is built for
 * a <button> (flex layout, a chevron svg, a <span> for the label). On a <select>
 * it silently loses `appearance` and Windows paints its own white box and arrow
 * over the dark theme. This checks the switch has its own styling, and that the
 * styling actually reaches the closed control and the option list.
 *
 * Run: node scripts/selftest-approval-ui.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** The rule body for one selector, or '' when it is missing. */
function rule(selector) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const end = css.indexOf('}', at);
  return css.slice(at, end);
}

// --- the control ---------------------------------------------------------
const selectTag = (html.match(/<select[^>]*id="approvalPolicy"[^>]*>/) || [''])[0];
check('the approval switch is a <select>', selectTag !== '');
check('it has its own class', /class="approval-policy-select"/.test(selectTag));
// Borrowing .path-btn is the bug this file exists to stop.
check('it does not borrow .path-btn', !/class="[^"]*path-btn/.test(selectTag));
check('every choice is present', (html.match(/<option value="(ask|allow|deny)"/g) || []).length === 3);
check('"ask" is the first choice a user sees', /<option value="ask"/.test(html));

// The switch used to take three stacked rows (heading + select + hint line),
// which overflowed the sidebar. It now takes one: the option names its own
// effect, and the tooltip carries the longer wording.
const selectSection = (html.split('<section').find((s) => s.includes('id="approvalPolicy"')) || '').split('</select>')[0] || '';
check('the switch has no heading of its own', !/approvalPolicyHint/.test(html));
check('the switch needs no hint line', !/id="approvalPolicyHint"/.test(html));
check('the switch is still reachable by screen readers', /aria-label=/.test(selectTag));

// --- the styling ---------------------------------------------------------
const body = rule('.approval-policy-select');
check('the switch has a rule', body !== '');
// Without this Windows paints a white box and its own arrow over the theme.
check('native appearance is off', /appearance:\s*none/.test(body));
check('it takes the app background', /background-color:\s*var\(--bg-3\)/.test(body));
check('it takes the app text colour', /color:\s*var\(--text\)/.test(body));
check('it has the app focus ring', /outline:\s*2px solid var\(--accent\)/.test(rule('.approval-policy-select:focus-visible')));
check('the option list is themed', /background:\s*var\(--bg-2\)/.test(rule('.approval-policy-select option')));

// --- the tokens must exist ----------------------------------------------
function token(name) {
  return new RegExp(`--${name}:\\s*[^;]+;`).test(css);
}
check('--bg-3 exists', token('bg-3'));
check('--bg-2 exists', token('bg-2'));
check('--text exists', token('text'));
check('--line exists', token('line'));
check('--accent exists', token('accent'));
check('--radius exists', token('radius'));

// --- no second warning ------------------------------------------------
//
// There used to be a banner here saying "not asking for permission" with an
// "ask me again" button. Both are gone: the switch itself shows the state, and
// the button only existed to undo a setting the switch can now change directly.
// Left in, it was a second place to look, in the corner of the sidebar, for a
// fact the switch already told you.
check('no "not asking" banner is left in the UI', !/approvalModeBanner/.test(html));
check('no separate "ask me again" button is left', !/approvalModeReset/.test(html));
check('the old banner strings are gone', !/approvalsOff|turnPromptsBackOn/.test(html));

// The rendered module must not look for those elements either: a getter for a
// missing node throws, and that would break every call to applyApprovalMode.
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
check('the renderer does not query the removed banner', !/approvalModeBanner|approvalModeReset/.test(appJs));
check('the renderer does not set the removed strings', !/approvalsOff|turnPromptsBackOn/.test(appJs));

// The switch is now the only control, so it has to be reachable and must show
// the current value without a hint line underneath.
check('the switch is a real form control', /<select[^>]*id="approvalPolicy"/.test(html));
check('the switch carries its explanation in a tooltip', /title="การอนุมัติเครื่องมือ"/.test(html));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll approval UI checks passed');
