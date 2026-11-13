/**
 * Free / paid labelling for every catalog.
 *
 * The picker used to drop anything that was not DeepSeek, and then anything
 * that was not free. It now lists every model each provider serves, so the part
 * that has to be right is the label: a row that spends money must say so, and a
 * row that does not must not.
 *
 * Each provider states its plan differently, which is the whole reason this
 * module exists: FreePi sends `free: false` plus a `usage_x` multiplier, Coarena
 * prices in its own `pricing` block, Token Harbor marks free ids with a `:free`
 * suffix, and Zro / NVIDIA say so outright.
 *
 * Run from app/:   node scripts/selftest-model-filter.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepSeekModel, isFreeModel, planOf, planNote, tagPlans } = require('../src/model-filter');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// --- what counts as DeepSeek (kept: it picks the default model) ---

check('free-pi slash id is DeepSeek', isDeepSeekModel({ id: 'deepseek/deepseek-v4-flash' }));
check('free-pi dotted id is DeepSeek', isDeepSeekModel({ id: 'deepseek-v4.1-flash' }));
check('coarena numeric id is DeepSeek', isDeepSeekModel({ id: 'deepseek-v4-1-flash-1017' }));
check('a DeepSeek name without the id still counts', isDeepSeekModel({ id: 'dm-7', name: 'DeepSeek V4.1 Flash' }));
check('qwen is not DeepSeek', !isDeepSeekModel({ id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B' }));

// --- FreePi: `free` flag plus a credit multiplier ---

const freePi = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', free: true },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', free: false, usage_x: '18' },
  { id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B', free: true },
];
const tagged = tagPlans(freePi);
check('every FreePi model is kept', tagged.length === 3, JSON.stringify(tagged));
check('free: true is free', planOf(freePi[0]) === 'free' && isFreeModel(freePi[0]));
check('free: false is paid', planOf(freePi[1]) === 'paid' && !isFreeModel(freePi[1]));
check('the multiplier becomes the note', planNote(freePi[1]) === '18x', planNote(freePi[1]));
check('a free row carries no note', planNote(freePi[0]) === '');
check('a non-DeepSeek model is still listed', tagged.some((m) => m.id === 'qwen3-coder-480b'));

// --- Coarena: priced in its own block ---

const coarenaFree = { id: 'claude-fable-5', name: 'Claude Fable 5', pricing: { prompt: '0', completion: '0' } };
const coarenaPaid = { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', pricing: { prompt: '3', completion: '15' } };
check('zero pricing is free', planOf(coarenaFree) === 'free');
check('a priced route is paid', planOf(coarenaPaid) === 'paid');
check('the price becomes the note', planNote(coarenaPaid) === '$3.00/$15.00', planNote(coarenaPaid));
check(
  'a catalog with no pricing is free',
  planOf({ id: 'x' }) === 'free' && planOf(undefined) === 'free'
);

// --- Token Harbor: the `:free` suffix is the marker ---

check('a :free id is free', planOf({ id: 'deepseek-v4.1-flash:free' }) === 'free');
check(
  'a discovered wallet route is paid',
  planOf({ id: 'claude-opus-5-5', plan: 'paid', planNote: 'wallet' }) === 'paid'
);
check('the suffix wins over the missing pricing', isFreeModel({ id: 'mimo-v2.6-flash:free' }));

// --- Zro / NVIDIA: the catalog states the plan outright ---

check('an explicit plan is respected', planOf({ id: 'glm-5.3', plan: 'paid' }) === 'paid');
check('an explicit free plan is respected', planOf({ id: 'deepseek-v4.1-flash', plan: 'free' }) === 'free');
check('the explicit note wins', planNote({ id: 'glm-5.3', plan: 'paid', planNote: '$1.40/$4.20' }) === '$1.40/$4.20');
check('a coded note is passed through', planNote({ id: 'x', plan: 'paid', planNote: 'trial' }) === 'trial');
check('a free row never carries a note', planNote({ id: 'x', plan: 'free', planNote: 'oops' }) === '');

// --- tagPlans labels, it does not filter ---

check('nothing in, nothing out', tagPlans([]).length === 0);
check('a missing catalog is not a crash', tagPlans(undefined).length === 0 && tagPlans(null).length === 0);
check('an entry without an id is dropped', tagPlans([{ name: 'no id' }]).length === 0);
check(
  'the original entry is not mutated',
  (() => {
    const one = { id: 'x', free: false };
    tagPlans([one]);
    return one.plan === undefined;
  })()
);

// --- the bridge really uses the tagger, in every path ---

const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
check('the FreePi catalog is tagged', /tagPlans\(catalogModelsFor\(/.test(bridge));
check('the defense catalog is tagged', /tagPlans\(defenseModelsFor\(/.test(bridge));
check('the Coarena catalog is tagged at start', /tagPlans\(coarenaCatalog\.models\)/.test(bridge));
check('a new Coarena key re-tags the catalog', /tagPlans\(result\.models\)/.test(bridge));
check('nothing is filtered out by plan any more', !/onlyDeepSeekFree/.test(bridge));
check('entries carry the plan to the renderer', /function modelEntry\(provider, model\)/.test(bridge));

for (const file of ['coarena.js', 'zro.js', 'nvidia.js', 'tokenharbor.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  check(`${file} tags its dropdown entries`, /plan:\s/.test(src) && /planNote/.test(src));
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: every catalog is tagged free or paid');
