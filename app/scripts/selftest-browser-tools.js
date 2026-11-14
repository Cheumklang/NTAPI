/**
 * Browser tools: they must be registered, and the write ones must take an
 * approval prompt while the read ones do not.
 *
 * Run from app/:   node scripts/selftest-browser-tools.js
 */
'use strict';

const { BROWSER_TOOLS, browserGuardedTools } = require('../src/browser-bridge');
const { isGuardedTool, browserToolSpecs } = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const names = Object.keys(BROWSER_TOOLS);
check('thirteen browser tools', names.length === 13, names.join(','));

// Every tool has a spec with a matching command, and the commands are distinct.
const specs = browserToolSpecs();
const specNames = specs.map((s) => s.name).sort();
check('every tool has a spec', specNames.join(',') === names.slice().sort().join(','));
check(
  'each spec maps to a distinct command',
  new Set(specs.map((s) => s.cmd)).size === specs.length
);

// Approval routing uses the app's default guarded list.
check('browser_click needs approval', isGuardedTool('browser_click') === true);
check('browser_fill needs approval', isGuardedTool('browser_fill') === true);
check('browser_eval needs approval', isGuardedTool('browser_eval') === true);
check('browser_read never asks', isGuardedTool('browser_read') === false);
check('browser_screenshot never asks', isGuardedTool('browser_screenshot') === false);
check('bash still guarded', isGuardedTool('bash') === true);
check('guarded list covers every write tool', browserGuardedTools().every((n) => isGuardedTool(n)));
check('guarded list excludes read tools', browserGuardedTools().every((n) => !BROWSER_TOOLS[n] || BROWSER_TOOLS[n].write));

process.exit(failed ? 1 : 0);