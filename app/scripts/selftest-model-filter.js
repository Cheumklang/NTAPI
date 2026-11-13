/**
 * DeepSeek-only catalogs.
 *
 * FreePi serves coder/assistant families beside DeepSeek and Coarena serves a
 * dozen Claude / Gemini / GLM / Kimi ids. The person using this app picks
 * DeepSeek only, so everything else is dropped before a provider is registered.
 *
 * The second half is the free-only rule, using the live FreePi catalog's own
 * fields: the unlimited routes are `free: true`, the metered ones are
 * `free: false` with a `usage_x` multiplier such as "18" or "295".
 *
 * Run from app/:   node scripts/selftest-model-filter.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isDeepSeekModel, isFreeModel, onlyDeepSeek, onlyDeepSeekFree } = require('../src/model-filter');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// --- DeepSeek only ---

// The two catalogs spell DeepSeek differently; both must survive.
check('free-pi slash id is DeepSeek', isDeepSeekModel({ id: 'deepseek/deepseek-v4-flash' }));
check('free-pi dotted id is DeepSeek', isDeepSeekModel({ id: 'deepseek-v4.1-flash' }));
check('coarena numeric id is DeepSeek', isDeepSeekModel({ id: 'deepseek-v4-1-flash-1017' }));
check('a DeepSeek name without the id still counts', isDeepSeekModel({ id: 'dm-7', name: 'DeepSeek V4.1 Flash' }));
check('qwen is not DeepSeek', !isDeepSeekModel({ id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B' }));

const freePi = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { id: 'deepseek-v4.1-pro', name: 'DeepSeek V4.1 Pro' },
  { id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B' },
  { id: 'defense-guard-1', name: 'Defense Guard 1' },
];
const keptFree = onlyDeepSeek(freePi);
check('free-pi keeps both DeepSeek models', keptFree.length === 2, JSON.stringify(keptFree));
check('free-pi drops qwen', !keptFree.some((m) => /qwen/.test(m.id)));
check('free-pi drops the defense model', !keptFree.some((m) => m.id === 'defense-guard-1'));
check('free-pi order is preserved', keptFree[0].id === 'deepseek-v4.1-flash');

const coarena = [
  { id: 'claude-fable-5' },
  { id: 'deepseek-v4-1-flash-1017', name: 'DeepSeek V4.1 Flash' },
  { id: 'gemini-4-argon' },
  { id: 'glm-5-3-flash' },
  { id: 'kimi-k3-1-pro' },
  { id: 'grok-4-7' },
];
const keptCoarena = onlyDeepSeek(coarena);
check('coarena keeps exactly its one DeepSeek id', keptCoarena.length === 1 && keptCoarena[0].id === 'deepseek-v4-1-flash-1017');

// --- free only ---

check('free: true is free', isFreeModel({ id: 'x', free: true }));
check('free: false is paid', !isFreeModel({ id: 'x', free: false }));
check('a missing field counts as free', isFreeModel({ id: 'x' }) && isFreeModel(undefined));

// The live FreePi catalog, trimmed to the DeepSeek entries.
const liveDeepSeek = [
  { id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', free: true },
  { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', free: true },
  { id: 'deepseek-v4.1-flash-1017-ultrafast', name: 'DeepSeek V4.1 Flash Ultrafast', free: false, usage_x: '295' },
  { id: 'deepseek-v4.1-flash-abliterated', name: 'DeepSeek V4.1 Flash Abliterated', free: false, usage_x: '20', section: 'defense' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', free: false, usage_x: '18' },
];
const keptFreeOnly = onlyDeepSeekFree(liveDeepSeek);
check('only the unlimited DeepSeek routes survive', keptFreeOnly.length === 2, JSON.stringify(keptFreeOnly));
check('the free ids are the flash pair', keptFreeOnly.map((m) => m.id).join(',') === 'deepseek-v4.1-flash,deepseek-v4-flash');
check('the 295x ultrafast route is dropped', !keptFreeOnly.some((m) => m.id.includes('ultrafast')));
check('the paid pro route is dropped', !keptFreeOnly.some((m) => m.id === 'deepseek-v4-pro'));
check('the defense route is dropped too', !keptFreeOnly.some((m) => m.section === 'defense'));
check('a paid non-DeepSeek model was never in the running', onlyDeepSeekFree([{ id: 'qwen3-coder-480b', free: false }]).length === 0);
check('nothing in, nothing out', onlyDeepSeek([]).length === 0);
check('a missing catalog is not a crash', onlyDeepSeek(undefined).length === 0 && onlyDeepSeek(null).length === 0);

const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
check('the FreePi catalog is filtered', /onlyDeepSeekFree\(catalogModelsFor\(/.test(bridge));
check('the defense catalog is filtered', /onlyDeepSeekFree\(defenseModelsFor\(/.test(bridge));
check('the Coarena catalog is filtered at start', /onlyDeepSeekFree\(coarenaCatalog\.models\)/.test(bridge));
check(
  'a new Coarena key cannot restore the other models',
  /onlyDeepSeekFree\(result\.models\)/.test(bridge) && !/coarenaProviderConfig\(\{ apiKey: activeCoarenaKey, models: result\.models \}\)/.test(bridge)
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: only DeepSeek reaches the model dropdown');
