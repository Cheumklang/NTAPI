/**
 * The standing "where you actually run" rule: it must say the things a
 * chat-tuned model gets wrong (no environment, no commands, guessing hardware),
 * it must be added once and only once, and it must stay registered in the bridge.
 *
 * Run from app/:   node scripts/selftest-reality-policy.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const bridge = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const rule = bridge.realityPolicyRule();
const section = bridge.REALITY_SECTION;

check('section heading is the one the guard looks for', section === '## What this session actually is', section);
check('the rule opens with that heading', rule.includes(`\n\n${section}\n\n`), rule.slice(0, 60));

// The exact failure this rule exists to prevent: a model that says it has no
// environment while `bash` sits in its tool list.
for (const phrase of ['bash executes commands here', 'not a chat window', 'only a text model']) {
  check(`spells out: ${phrase}`, rule.includes(phrase));
}
check('names the forbidden self-description', rule.includes('"I have no environment"'), rule.slice(0, 400));
check('forbids untested hardware claims', /never a guess about the user's hardware/.test(rule));
check('tells the model to check hardware with a command', /check first, since a machine may have a working GPU/.test(rule));
check('covers install/try/run as instructions', /"install this", "try it", "run it"/.test(rule));
check('asks first only for cost/licence/damage', /Ask first only when the cost, the licence or the damage/.test(rule));
check('short enough to not dilute the tool list', rule.length < 2400, `${rule.length} chars`);

// The extension: a fake pi that records the hook it is handed.
function loadHook() {
  const hooks = [];
  const pi = { on: (name, fn) => hooks.push({ name, fn }), registerTool: () => {} };
  bridge.realityPolicyExtension.factory(pi);
  return hooks;
}

const hooks = loadHook();
check('registers exactly one hook', hooks.length === 1, JSON.stringify(hooks.map((h) => h.name)));
check('hook runs before the turn starts', hooks[0] && hooks[0].name === 'before_agent_start', hooks[0] && hooks[0].name);

const appended = hooks[0].fn({ systemPrompt: 'BASE PROMPT' });
check('appends to the prompt it is given', Boolean(appended) && typeof appended.systemPrompt === 'string');
check('keeps the original prompt first', Boolean(appended) && appended.systemPrompt.startsWith('BASE PROMPT'));
check('adds the rule on the first turn', Boolean(appended) && appended.systemPrompt.includes(section));

const again = hooks[0].fn({ systemPrompt: appended.systemPrompt });
check('does not add it a second time', again === undefined, String(JSON.stringify(again)).slice(0, 80));
check('ignores an event with no prompt', hooks[0].fn({}) === undefined);
check('ignores a non-string prompt', hooks[0].fn({ systemPrompt: null }) === undefined);

// A guard that recognised the heading but the factory were never registered
// would pass every test above and change nothing in the app.
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
check(
  'the extension is registered in the session factory',
  /downloadsPolicyExtension,\s*\n\s*realityPolicyExtension,/.test(source)
);
check('exported for tests', typeof bridge.realityPolicyRule === 'function' && bridge.realityPolicyExtension.name === 'freepi-reality-policy');

if (failed) {
  console.error(`\n${failed} reality-policy check(s) failed`);
  process.exit(1);
}
console.log('\nreality policy: all checks passed');
