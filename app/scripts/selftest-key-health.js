/**
 * Diagnostic: a saved provider key that cannot be decrypted must be named, not
 * silently dropped.
 *
 * The failure this guards (seen in the wild on 2026-11-22): the GNOME keyring
 * was recreated, every `safeStorage` ciphertext became unreadable, and the
 * providers simply vanished from the model picker — the person using the app
 * had no way to know a key was still on disk.
 *
 * Run from app/:   node scripts/selftest-key-health.js
 */
'use strict';

const { unreadableProviders, unreadableLabelList, PROVIDER_LABELS } = require('../src/key-health');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const CONFIGURED = { configured: true, readable: true, encrypted: true, hint: 'abcd' };
const MISSING = { configured: false, readable: false, encrypted: false, hint: null };
const UNREADABLE = { configured: true, readable: false, encrypted: true, hint: null, error: 'undecryptable' };
const CORRUPT = { configured: true, readable: false, encrypted: false, hint: null, error: 'corrupt' };

// A readable key is not a problem.
check('readable key is not reported', unreadableProviders([{ provider: 'nvidia', status: CONFIGURED }]).length === 0);

// No key file at all is a first run, not a loss.
check('missing key is not reported', unreadableProviders([{ provider: 'zro', status: MISSING }]).length === 0);

// The case that started this: the file is there, the keystore is not.
const lost = unreadableProviders([{ provider: 'nvidia', status: UNREADABLE }]);
check('unreadable key is reported once', lost.length === 1, JSON.stringify(lost));
check('unreadable key carries its label', lost[0] && lost[0].label === 'NVIDIA', JSON.stringify(lost[0]));
check('unreadable key carries its reason', lost[0] && lost[0].error === 'undecryptable', JSON.stringify(lost[0]));

// A damaged file is the same problem seen from the window: name it too.
const broken = unreadableProviders([{ provider: 'coarena', status: CORRUPT }]);
check('corrupt key is reported', broken.length === 1 && broken[0].error === 'corrupt', JSON.stringify(broken));

// Order follows the Settings panel, and only broken stores appear.
const rawMixed = [
  { provider: 'coarena', status: UNREADABLE },
  { provider: 'zro', status: MISSING },
  { provider: 'nvidia', status: CONFIGURED },
  { provider: 'tokenharbor', status: UNREADABLE },
];
const mixed = unreadableProviders(rawMixed);
check(
  'mixed stores report only the broken ones, in order',
  JSON.stringify(mixed.map((m) => m.provider)) === JSON.stringify(['coarena', 'tokenharbor']),
  JSON.stringify(mixed)
);

check(
  'label list is comma-separated, from store statuses',
  unreadableLabelList(rawMixed) === 'Coarena, Token Harbor',
  unreadableLabelList(rawMixed)
);

// Defensive: a half-built store (a provider that never loaded) must not throw.
check('empty input is safe', unreadableProviders([]).length === 0);
check('null input is safe', unreadableProviders(null).length === 0);
check('unknown provider falls back to its id', unreadableProviders([{ provider: 'routeway', status: UNREADABLE }])[0].label === 'routeway');

check('every keyed provider has a label', ['coarena', 'zro', 'nvidia', 'tokenharbor', 'llm7', 'deepseek', 'anthropic', 'google'].every((id) => Boolean(PROVIDER_LABELS[id])));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
