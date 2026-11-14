/**
 * MCP tools must go through the approval prompt, and their label must say which
 * server is asking.
 *
 * Run from app/:   node scripts/selftest-mcp-guard.js
 */
'use strict';

const { isGuardedTool, mcpToolLabel } = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// Built-in guards keep working.
check('bash needs approval', isGuardedTool('bash') === true);
check('edit needs approval', isGuardedTool('edit') === true);
check('write needs approval', isGuardedTool('write') === true);
check('read never needs approval', isGuardedTool('read') === false);
check('grep never needs approval', isGuardedTool('grep') === false);

// Every MCP tool is guarded, whatever the server or tool is.
check('mcp tool needs approval', isGuardedTool('mcp__filesystem__read_file') === true);
check('mcp tool guarded even when custom list given', isGuardedTool('mcp__x__y', ['bash']) === true);
check('a name merely starting with "mcp" is not guarded', isGuardedTool('mcpfoo') === false);
check('empty name is safe', isGuardedTool('') === false && isGuardedTool(undefined) === false);

// Labels tell the user which server is asking.
check(
  'mcp label names the server and tool',
  mcpToolLabel('mcp__filesystem__read_file') === 'MCP \u00b7 filesystem / read_file',
  mcpToolLabel('mcp__filesystem__read_file')
);
check(
  'server names with underscores survive',
  mcpToolLabel('mcp__my_server__do_thing') === 'MCP \u00b7 my_server / do_thing',
  mcpToolLabel('mcp__my_server__do_thing')
);
check(
  'tool names with __ survive',
  mcpToolLabel('mcp__srv__a__b') === 'MCP \u00b7 srv / a__b',
  mcpToolLabel('mcp__srv__a__b')
);
check('non-mcp label is unchanged', mcpToolLabel('bash') === 'bash');

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: MCP tools are guarded and labelled');
