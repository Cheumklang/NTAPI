/**
 * Browser tools: they must be registered, and the write ones must take an
 * approval prompt while the read ones do not.
 *
 * Run from app/:   node scripts/selftest-browser-tools.js
 */
'use strict';

const { BROWSER_TOOLS, browserGuardedTools } = require('../src/browser-bridge');
const { isGuardedTool, browserToolSpecs, browserLocalToolSpecs } = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const names = Object.keys(BROWSER_TOOLS);
check('twenty-two bridge-backed browser tools', names.length === 22, names.join(','));

// Every tool has a spec with a matching command, and the commands are distinct.
const specs = browserToolSpecs();
const specNames = specs.map((s) => s.name).sort();
check('every bridge tool has a spec', specNames.join(',') === names.slice().sort().join(','));
check(
  'each spec maps to a distinct command',
  new Set(specs.map((s) => s.cmd)).size === specs.length
);

// The two tools the app answers itself are catalogued separately, so no spec
// ever tries to send a command the extension does not implement.
const local = browserLocalToolSpecs();
const specOf = (name) => [...specs, ...local].find((s) => s.name === name);
check('app-side browser tools are catalogued apart', local.map((s) => s.name).sort().join(',') === 'browser_claim,browser_find');
check('every local spec is marked local and has no command', local.every((s) => s.local === true && !s.cmd));
check('the two catalogues do not overlap', local.every((s) => !names.includes(s.name)));

// Approval routing uses the app's default guarded list.
check('browser_click needs approval', isGuardedTool('browser_click') === true);
check('browser_fill needs approval', isGuardedTool('browser_fill') === true);
check('browser_eval needs approval', isGuardedTool('browser_eval') === true);
check('browser_dialog needs approval', isGuardedTool('browser_dialog') === true);
check('browser_claim needs approval', isGuardedTool('browser_claim') === true);
check('browser_read never asks', isGuardedTool('browser_read') === false);
check('browser_screenshot never asks', isGuardedTool('browser_screenshot') === false);
check('browser_snapshot never asks', isGuardedTool('browser_snapshot') === false);
check('browser_find never asks', isGuardedTool('browser_find') === false);
check('bash still guarded', isGuardedTool('bash') === true);
check('guarded list covers every write tool', browserGuardedTools().every((n) => isGuardedTool(n)));
check('guarded list excludes read tools', browserGuardedTools().every((n) => !BROWSER_TOOLS[n] || BROWSER_TOOLS[n].write));

// Acting by ref is the whole point: every tool that targets an element takes one,
// and `fill` takes one per field.
check('click accepts a ref', Boolean(specOf('browser_click').parameters.properties.ref));
check('type accepts a ref', Boolean(specOf('browser_type').parameters.properties.ref));
check('key accepts a ref', Boolean(specOf('browser_key').parameters.properties.ref));
check('wait accepts a ref', Boolean(specOf('browser_wait').parameters.properties.ref));
check('scroll accepts a ref', Boolean(specOf('browser_scroll').parameters.properties.ref));
check('fill accepts a ref per field', Boolean(specOf('browser_fill').parameters.properties.fields.items.properties.ref));

// The snapshot tool tells the model what to do with what it returns.
check('snapshot is documented as the thing to do first', /before acting/i.test(specOf('browser_snapshot').description));
check('snapshot is documented as read-only', /read-only/i.test(specOf('browser_snapshot').description));
check('find is documented as app-side search', /search/i.test(specOf('browser_find').description));

// The model only knows what the tool text tells it. Before this was pinned, no
// description mentioned Chrome or the companion extension, so the model kept
// looking for a browser window this app does not have and could not explain to
// the user why nothing worked.
const descriptionOf = (name) => {
  const spec = [...specs, ...local].find((s) => s.name === name);
  return spec ? `${spec.description} ${spec.promptSnippet || ''}` : '';
};
check('browser_tabs says whose browser it is', /chrome/i.test(descriptionOf('browser_tabs')));
check('browser_tabs says it is not this app\'s window', /does not have its own browser window/i.test(descriptionOf('browser_tabs')));
check('browser_open names Chrome', /chrome/i.test(descriptionOf('browser_open')));
check('browser_claim names Chrome', /chrome/i.test(descriptionOf('browser_claim')));
check('browser_claim mentions the extension', /extension/i.test(descriptionOf('browser_claim')));
check(
  'no tool still promises an NTAPI browser window',
  ![...specs, ...local].some((s) => /NTAPI browser window/i.test(`${s.description} ${s.promptSnippet || ''}`))
);

// Every registered browser tool must also be on the session's allow-list. The
// `tools` option replaces the selection rather than adding to it, so a tool that
// is registered but not named there is invisible to the model — which is exactly
// how the agent ended up with a browser it could not see.
const { allBrowserToolNames } = require('../src/freepi-bridge');
const allowListed = allBrowserToolNames();
const registered = [...specs, ...local].map((s) => s.name);
check('every registered browser tool is allow-listed', registered.every((n) => allowListed.includes(n)), registered.filter((n) => !allowListed.includes(n)).join(', '));
check('the allow-list names no phantom tool', allowListed.every((n) => registered.includes(n)), allowListed.filter((n) => !registered.includes(n)).join(', '));
check('claim is allow-listed, so the agent can ask for a tab', allowListed.includes('browser_claim'));
check('snapshot is allow-listed, so the agent can read a page', allowListed.includes('browser_snapshot'));

process.exit(failed ? 1 : 0);
