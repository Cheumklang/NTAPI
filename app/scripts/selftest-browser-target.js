/**
 * Turning a `ref` the model read in a snapshot back into something the browser
 * can act on, and remembering which refs are still live.
 *
 * A ref is a promise: "element e9 is where I said it was". The page can be
 * anything, so a ref that is no longer in the latest snapshot — or that was
 * never a ref at all — must fail loudly rather than resolve to whatever now
 * sits in that position. That is the whole job of this module.
 *
 * Run from app/:   node scripts/selftest-browser-target.js
 */
'use strict';

const { createRefTables, refSelector, resolveRefArgs, resolveFieldRefs, REF_PATTERN } = require('../src/browser-target');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const table = new Map([
  ['e1', { ref: 'e1', frameId: '', role: 'button', name: 'Continue' }],
  ['F2:e7', { ref: 'F2:e7', frameId: 'F2', role: 'button', name: 'Save' }],
]);

/* ------------------------------------------------------------- the tables */

const tables = createRefTables();
check('an unknown tab has no table', tables.tableFor(7) === null);
tables.remember(7, table);
check('a remembered table comes back', tables.tableFor(7) === table);
check('a non-integer tab id is ignored', (tables.remember('x', table), tables.tableFor('x') === null));
check('a missing table is ignored', (tables.remember(8, null), tables.tableFor(8) === null));
tables.clear(7);
check('clearing one tab forgets only that tab', tables.tableFor(7) === null);
tables.remember(7, table);
tables.remember(8, table);
tables.clear();
check('clearing with no argument forgets everything', tables.tableFor(7) === null && tables.tableFor(8) === null);

/* ------------------------------------------------------------ the selector */

check('a ref becomes an attribute selector', refSelector('e9') === '[data-ntapi-ref="e9"]');
check('a quote in a ref cannot break out', !refSelector('e9"]').includes('"]"]'));

/* ----------------------------------------------------------- ref resolving */

check('a call with no ref is passed through untouched', (() => {
  const r = resolveRefArgs({ selector: '#go', text: 'Go' }, table);
  return r.ok === true && r.args.selector === '#go' && r.args.text === 'Go' && r.args.ref === undefined;
})());
check('missing args resolve to an empty call', resolveRefArgs(undefined, table).ok === true);
check('a blank ref counts as no ref', resolveRefArgs({ ref: '   ' }, table).ok === true);

const main = resolveRefArgs({ ref: 'e1' }, table);
check('a live ref in the main frame becomes a selector', main.ok === true && main.args.selector === '[data-ntapi-ref="e1"]');
check('the ref itself is dropped from the call', main.args.ref === undefined);
check('a main-frame ref adds no frameId', main.args.frameId === undefined);
check('the resolved label comes back for the always-ask check', main.role === 'button' && main.name === 'Continue');

const framed = resolveRefArgs({ ref: 'F2:e7' }, table);
check('a ref in a subframe carries its frame', framed.ok === true && framed.args.frameId === 'F2');
check('the framed selector is the same shape', framed.args.selector === '[data-ntapi-ref="F2:e7"]');

const stale = resolveRefArgs({ ref: 'e99' }, table);
check('an unknown ref is STALE_REF', stale.ok === false && stale.code === 'STALE_REF');
check('a stale ref never reaches the browser', stale.args === undefined);
check('the stale message says what to do', /snapshot/i.test(stale.message));

const forged = resolveRefArgs({ ref: 'e1"] , body *[' }, table);
check('a ref that is not a ref is refused', forged.ok === false && forged.code === 'STALE_REF');
check('a forged ref never reaches the browser', forged.args === undefined);

check('a stale ref against a missing table is refused', resolveRefArgs({ ref: 'e1' }, null).ok === false);
check('a very long ref is refused', resolveRefArgs({ ref: 'e'.repeat(200) }, table).ok === false);
check('the ref pattern accepts a framed ref', REF_PATTERN.test('F2:e7') === true && REF_PATTERN.test('e1"]') === false);

check('a non-string ref is treated as absent', (() => {
  const r = resolveRefArgs({ ref: 42 }, table);
  return r.ok === true && r.args.ref === 42;
})());

check('the input object is not mutated', (() => {
  const input = { ref: 'e1' };
  resolveRefArgs(input, table);
  return input.ref === 'e1';
})());

/* ---------------------------------------------------------- fill's fields */

const fields = [
  { ref: 'e1', value: 'Campaign A' },
  { selector: '#plain', value: 'x' },
];
const filled = resolveFieldRefs(fields, table);
check('a field ref becomes its selector', filled.ok === true && filled.fields[0].selector === '[data-ntapi-ref="e1"]');
check('a field ref is dropped from the field', filled.fields[0].ref === undefined);
check('a plain field selector is untouched', filled.fields[1].selector === '#plain' && filled.fields[1].value === 'x');
const staleField = resolveFieldRefs([{ ref: 'e99', value: 'stale' }], table);
check('a stale field ref fails the whole call', staleField.ok === false && staleField.code === 'STALE_REF');
check('a failed field resolution carries no fields', staleField.fields === undefined);
check('an empty field list is fine', resolveFieldRefs([], table).ok === true);
check('a missing field list is fine', resolveFieldRefs(undefined, table).ok === true);
check('fields keep their frame', (() => {
  const withFrame = resolveFieldRefs([{ ref: 'F2:e7', value: 'v' }], table);
  return withFrame.ok === true && withFrame.fields[0].frameId === 'F2';
})());
check('fields are not mutated', (() => {
  const input = [{ ref: 'e1', value: 'v' }];
  resolveFieldRefs(input, table);
  return input[0].ref === 'e1';
})());

process.exit(failed ? 1 : 0);
