/**
 * The app's own mcp.json loader: servers come out, a bad file is reported, and
 * a missing file is simply "no servers".
 *
 * Run from app/:   node scripts/selftest-mcp-config.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadAppMcpConfig } = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-mcp-'));
const file = path.join(dir, 'mcp.json');

// 1. Missing file -> no servers, no errors.
{
  const cfg = loadAppMcpConfig(dir)();
  check('missing file is empty', cfg.servers.length === 0 && cfg.errors.length === 0, JSON.stringify(cfg));
}

// 2. A normal config -> one entry per server, pointing at the app file.
{
  fs.writeFileSync(
    file,
    JSON.stringify({
      mcpServers: {
        filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
        docs: { url: 'https://example.com/mcp' },
      },
    })
  );
  const cfg = loadAppMcpConfig(dir)();
  check('reads both servers', cfg.servers.length === 2, JSON.stringify(cfg));
  check('keeps the server name', cfg.servers.some((s) => s.name === 'filesystem'));
  check('keeps the stdio config', cfg.servers.find((s) => s.name === 'filesystem')?.config?.command === 'npx');
  check('keeps the http config', cfg.servers.find((s) => s.name === 'docs')?.config?.url === 'https://example.com/mcp');
  check('source is the app file', cfg.servers.every((s) => s.source === file));
}

// 3. Malformed JSON -> reported, not thrown.
{
  fs.writeFileSync(file, '{ not json');
  let threw = false;
  let cfg;
  try {
    cfg = loadAppMcpConfig(dir)();
  } catch {
    threw = true;
  }
  check('malformed json is reported not thrown', !threw && cfg.servers.length === 0 && cfg.errors.length === 1, JSON.stringify(cfg));
}

// 4. Wrong shapes are ignored rather than crashing.
{
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { good: { command: 'x' }, bad: 42, worse: null } }));
  const cfg = loadAppMcpConfig(dir)();
  check('non-object servers are skipped', cfg.servers.length === 1 && cfg.servers[0].name === 'good', JSON.stringify(cfg));
}

fs.rmSync(dir, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: the app mcp.json loader is safe');
