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
//
// It is a three-position switch, not a dropdown. A dropdown hid the current
// setting behind a click, and the most consequential choice in the app looked
// like an ordinary form field.
check('the switch is not a <select>', !/<select[^>]*id="approvalPolicy"/.test(html));
check('the switch is a radio group', /id="approvalPolicy"[\s\S]{0,200}role="radiogroup"/.test(html));
check('every choice is present', (html.match(/name="approvalPolicy" value="(ask|allow|deny)"/g) || []).length === 3);
check('"ask" comes first', /name="approvalPolicy" value="ask"/.test(html));
check('the radio group is labelled', /aria-labelledby="approvalLabel"/.test(html));
check('the label element exists', /id="approvalLabel"/.test(html));
check('the label names the control', /id="approvalLabel">การอนุมัติเครื่องมือ</.test(html));
check('one quiet line says what gets approved', /class="approval-note"/.test(html));
check('the old bare hint element stays gone', !/id="approvalPolicyHint"/.test(html));
// Scoped to the switch itself: the folder button elsewhere legitimately uses
// .path-btn, and a whole-document search would fail on it forever.
const approvalBlock = (html.match(/<div class="section approval-section">[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
check('the approval section was found', approvalBlock !== '');
check('it does not borrow .path-btn', approvalBlock !== '' && !/path-btn/.test(approvalBlock));

// --- the sliding thumb ---------------------------------------------------
const group = rule('.approval-switch');
check('the switch has a rule', group !== '');
check('the switch is a three-column grid', /grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(group));
check('the switch defines a position variable', /--at:\s*0/.test(group));
const thumb = rule('.approval-thumb');
check('there is a sliding thumb', thumb !== '');
check('the thumb is one third wide', /width:\s*calc\(\(100% - 6px\) \/ 3\)/.test(thumb));
check('the thumb moves by its position', /translateX\(calc\(var\(--at\) \* 100%\)\)/.test(thumb));
check('the thumb animates', /transition:\s*transform/.test(thumb));
check('the thumb does not eat clicks', /pointer-events:\s*none/.test(thumb));
check('the motion can be turned off', /prefers-reduced-motion[\s\S]{0,80}approval-thumb/.test(css));

const opt = rule('.approval-opt');
check('an option is a styled label', opt !== '');
check('an option is selectable by click', /cursor:\s*pointer/.test(opt));
check('the hidden radio is still reachable', /\.approval-opt input \{[^}]*clip-path:\s*inset\(50%\)/.test(css));
check('the checked option is emphasised', /\.approval-opt:has\(input:checked\)/.test(css));
check('the option shows a focus ring', /\.approval-opt:has\(input:focus-visible\)/.test(css));

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

// The switch is the only control, so it must show the current value by itself.
check('the renderer drives the thumb position', /style\.setProperty\('--at'/.test(fs.readFileSync(path.join(root, 'app.js'), 'utf8')));

// Wording: the third choice says "ไม่อนุมัติเลย" (never), not "ไม่อนุมัติเสมอ"
// (always deny), which read like a permanent setting rather than a choice.
check('the third choice reads ไม่อนุมัติเลย', /name="approvalPolicy" value="deny"[\s\S]{0,80}ไม่อนุมัติเลย/.test(html));
check('the old ไม่อนุมัติเสมอ wording is gone', !/ไม่อนุมัติเสมอ/.test(html));
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
check('the tooltip agrees with the new wording', /deny: 'ไม่อนุมัติเลย/.test(appSrc));
check('no stale wording is left in the renderer', !/ไม่อนุมัติเสมอ/.test(appSrc));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll approval UI checks passed');

// --- live agent activity shares the status row ---------------------------
//
// It used to be a bordered, tinted panel above the composer with two buttons,
// one of which ("show the tab") duplicated what clicking the tab already does.
// It is now one line of text beside the "working…" hint.
check('the activity strip exists', /id="activityStrip"/.test(html));
check('it has no "show the tab" button', !/id="activityFocus"/.test(html));
check('the renderer does not wire a removed button', !/activityFocus/.test(appJs));
check('the strip still has its Stop control', /id="activityStop"/.test(html));
check('the strip sits inside the status row', /class="status-row"[\s\S]*id="activityStrip"/.test(html));
check('the strip is hidden until there is activity', /id="activityStrip"[^>]*hidden/.test(html));

const stripRule = rule('.activity-strip');
check('the strip has a rule', stripRule !== '');
check('the strip draws no border', !/border:/.test(stripRule));
check('the strip draws no background', !/background:/.test(stripRule));
