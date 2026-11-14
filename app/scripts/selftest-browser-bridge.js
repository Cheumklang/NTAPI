/**
 * Browser bridge: protocol, tool catalogue, and WebSocket lifecycle.
 *
 * Everything here runs offline — no Chrome, no network beyond loopback.
 *
 * Run from app/:   node scripts/selftest-browser-bridge.js
 */
'use strict';

const b = require('../src/browser-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

// --- catalogue ---
check('catalogue has 13 tools', b.browserToolNames().length === 13);
check('write tools are guarded', b.browserGuardedTools().includes('browser_click'));
check('read tools are not guarded', !b.browserGuardedTools().includes('browser_read'));
check('unknown name rejected', b.isBrowserTool('browser_nope') === false);

// --- origin ---
check('origin pinned', b.isAllowedOrigin('chrome-extension://' + b.EXTENSION_ID, b.EXTENSION_ID) === true);
check('foreign origin rejected', b.isAllowedOrigin('chrome-extension://evil', b.EXTENSION_ID) === false);

// --- frames ---
check('parse request', b.parseFrame(JSON.stringify({ id: 1, cmd: 'read', args: { maxChars: 10 } })).cmd === 'read');
check('parse bad json', b.parseFrame('{oops') === null);
check('parse missing id', b.parseFrame(JSON.stringify({ cmd: 'read' })) === null);

process.exit(failed ? 1 : 0);