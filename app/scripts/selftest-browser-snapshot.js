/**
 * Snapshot interpretation: raw DOM facts -> roles, names, namespaced refs,
 * a budgeted text rendering, and the ref table `browser_find` searches.
 *
 * Run from app/:   node scripts/selftest-browser-snapshot.js
 */
'use strict';

const {
  roleOf,
  nameOf,
  namespaceRef,
  parseRef,
  formatSnapshot,
  findInTable,
} = require('../src/browser-snapshot');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ roles */

check('input[type=email] is a textbox', roleOf({ tag: 'input', type: 'email' }) === 'textbox');
check('input[type=checkbox] is a checkbox', roleOf({ tag: 'input', type: 'checkbox' }) === 'checkbox');
check('input[type=radio] is a radio', roleOf({ tag: 'input', type: 'radio' }) === 'radio');
check('input[type=submit] is a button', roleOf({ tag: 'input', type: 'submit' }) === 'button');
check('select is a combobox', roleOf({ tag: 'select' }) === 'combobox');
check('textarea is a textbox', roleOf({ tag: 'textarea' }) === 'textbox');
check('a is a link', roleOf({ tag: 'a' }) === 'link');
check('button is a button', roleOf({ tag: 'button' }) === 'button');
check('summary is a summary', roleOf({ tag: 'summary' }) === 'summary');
check('h2 is a heading', roleOf({ tag: 'h2' }) === 'heading');
check('td is other', roleOf({ tag: 'td' }) === 'other');
check('role=tab wins over the tag', roleOf({ tag: 'div', roleAttr: 'tab' }) === 'tab');
check('role=menuitem wins over the tag', roleOf({ tag: 'li', roleAttr: 'menuitem' }) === 'menuitem');
check('role=combobox on a div wins', roleOf({ tag: 'div', roleAttr: 'combobox' }) === 'combobox');
check('an unknown role falls back to the tag', roleOf({ tag: 'button', roleAttr: 'presentation' }) === 'button');
check('contenteditable is recognised', roleOf({ tag: 'div', contentEditable: true }) === 'contenteditable');
check('a missing node is other, not a crash', roleOf(undefined) === 'other');

/* ------------------------------------------------------------------ names */

check('aria-label wins', nameOf({ ariaLabel: 'Search', text: 'ignored' }) === 'Search');
check('label text is used next', nameOf({ labelText: 'Campaign name' }) === 'Campaign name');
check('placeholder is used next', nameOf({ tag: 'input', placeholder: 'Email' }) === 'Email');
check('value is used when there is nothing else', nameOf({ tag: 'input', value: 'hello' }) === 'hello');
check('text is the last resort', nameOf({ tag: 'button', text: 'Continue' }) === 'Continue');
check('whitespace is collapsed and trimmed', nameOf({ text: '  Save\n  now  ' }) === 'Save now');
check('a nameless node is empty, not a crash', nameOf({}) === '');
check('name is truncated to maxNameChars', nameOf({ ariaLabel: 'ก'.repeat(400) }, 120).length === 120);
check('a name under the cap is untouched', nameOf({ ariaLabel: 'สวัสดี' }, 120) === 'สวัสดี');
check(
  'truncation keeps whole characters',
  !/[\uD800-\uDBFF]$/.test(nameOf({ ariaLabel: '😀'.repeat(200) }, 5)),
  JSON.stringify(nameOf({ ariaLabel: '😀'.repeat(200) }, 5))
);

/* ------------------------------------------------------------------- refs */

const framed = namespaceRef('F2', 'e7');
check('refs round-trip through a frame', framed === 'F2:e7' && parseRef(framed).frameId === 'F2' && parseRef(framed).ref === 'e7');
check('a main-frame ref has no prefix', namespaceRef('', 'e7') === 'e7' && parseRef('e7').frameId === '');
check('a nameless-frame ref parses to the main frame', parseRef('e7').frameId === '' && parseRef('e7').ref === 'e7');
check('an empty ref parses safely', parseRef('') .ref === '' && parseRef('').frameId === '');

/* ------------------------------------------------------- format + budget */

const nodes = [
  { ref: 'e1', frameId: '', tag: 'link', text: 'Campaigns' },
  { ref: 'e2', frameId: '', tag: 'button', text: 'Continue' },
];
for (let i = 3; i <= 400; i += 1) {
  nodes.push({ ref: `e${i}`, frameId: '', tag: 'button', text: `Action ${i}` });
}
const raw = { frames: [{ frameId: '', url: 'https://ads.google.com/aw/campaigns' }], nodes };

const out = formatSnapshot(raw, {});
check('text shows at most maxNodes nodes', out.shown === 300, `shown=${out.shown}`);
check('the table keeps every node for find', out.table.size === 400, `size=${out.table.size}`);
check('the total is reported', out.total === 400, `total=${out.total}`);
check('the truncation is flagged', out.truncated === true);
check('the text says it was truncated', /truncated/i.test(out.text));
check('the text names the frame', /https:\/\/ads\.google\.com/.test(out.text));
check('a line carries the ref, role and name', /e9 \[button\] "Action 9"/.test(out.text), out.text.slice(0, 300));

const capped = formatSnapshot(raw, { maxChars: 200 });
check('the char cap wins when it is smaller', capped.text.length <= 200, `len=${capped.text.length}`);
check('a node cap smaller than the list is honoured', formatSnapshot(raw, { maxNodes: 10 }).shown === 10);

const empty = formatSnapshot({ frames: [], nodes: [] }, {});
check('an empty page formats to a clear message', /no interactive elements/i.test(empty.text), empty.text);
check('an empty page has an empty table', empty.table.size === 0 && empty.shown === 0 && empty.truncated === false);
check('a missing raw is handled, not a crash', /no interactive elements/i.test(formatSnapshot(undefined, {}).text));

// A hidden file input is the one element the tree cannot show and an upload
// cannot do without, so the snapshot has to say it exists.
const withFiles = formatSnapshot(
  { frames: [], nodes: [{ ref: 'e1', frameId: '', tag: 'a', text: 'Home' }], fileInputs: { total: 2, hidden: 1 } },
  {},
);
check('a snapshot states the hidden file inputs', /file inputs: 2, 1 hidden/.test(withFiles.text), withFiles.text);
check('and says what fills them', /browser_upload/.test(withFiles.text));
const withoutFiles = formatSnapshot(
  { frames: [], nodes: [{ ref: 'e1', frameId: '', tag: 'a', text: 'Home' }] },
  {},
);
check('a page with no file input gets no such line', !/file inputs/.test(withoutFiles.text), withoutFiles.text);

const quiet = formatSnapshot(raw, { maxNodes: 500 });
check('no truncation notice when nothing was cut', !/truncated/i.test(quiet.text));
check('long names are cut to maxNameChars in the text', (() => {
  const long = formatSnapshot(
    { frames: [{ frameId: '', url: 'https://x.example' }], nodes: [{ ref: 'e1', frameId: '', tag: 'button', text: 'z'.repeat(400) }] },
    { maxNameChars: 40 }
  );
  return long.text.includes('z'.repeat(40)) && !long.text.includes('z'.repeat(41));
})());

/* ------------------------------------------------------------------- find */

const table = formatSnapshot(raw, {}).table;
check('find by text matches by substring, case-insensitively', findInTable(table, { text: 'continue' }).count >= 1);
check('find reports the ref of the match', findInTable(table, { text: 'continue' }).matches[0].ref === 'e2');
check('find by ref matches exactly', findInTable(table, { ref: 'e5' }).count === 1);
check('find by an unknown ref returns nothing', findInTable(table, { ref: 'nope' }).count === 0);
check('find respects max', findInTable(table, { text: 'e' }).matches.length <= 20);
check('find honours an explicit max', findInTable(table, { text: 'e', max: 3 }).matches.length <= 3);
check('find on an empty query returns nothing', findInTable(table, {}).count === 0);
check('find on an empty table returns nothing', findInTable(new Map(), { text: 'x' }).count === 0);
check('find on a missing table returns nothing', findInTable(undefined, { text: 'x' }).count === 0);
check('find reports no match honestly', findInTable(table, { text: 'zzzz-no-such-thing' }).count === 0);
check('find returns role and name with each match', (() => {
  const m = findInTable(table, { text: 'Action 300' }).matches[0];
  return m && m.role === 'button' && m.name === 'Action 300';
})());

process.exit(failed ? 1 : 0);
