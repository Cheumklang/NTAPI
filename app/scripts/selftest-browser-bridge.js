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

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function open(url, origin) {
  const WebSocket = require('ws');
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
  return ws;
}

async function hello(ws, token) {
  ws.send(JSON.stringify({ type: 'hello', token, version: 1 }));
  return new Promise((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));
}

async function main() {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-bridge-'));
  const auditPath = path.join(dir, 'audit.log');
  const bridge = b.createBrowserBridge({ port: 0, extensionId: 'testext', token: '123456', auditPath });
  const { port } = await bridge.start();
  check('server listening on a real port', Number.isInteger(port) && port > 0, `port=${port}`);
  check('audit file created', fs.existsSync(auditPath));

  // Wrong origin: the connection is closed before any handshake.
  const wrong = require('ws');
  const bad = new wrong(`ws://127.0.0.1:${port}`, { headers: { Origin: 'chrome-extension://evil' } });
  await new Promise((res) => bad.once('close', res));
  check('wrong origin leaves us disconnected', bridge.status().connected === false);

  // Wrong token.
  const w1 = await open(`ws://127.0.0.1:${port}`, 'chrome-extension://testext');
  const r1 = await hello(w1, '000000');
  check('wrong token rejected', r1.ok === false);
  check('wrong token leaves us disconnected', bridge.status().connected === false);
  w1.close();

  // Right token.
  const w2 = await open(`ws://127.0.0.1:${port}`, 'chrome-extension://testext');
  const r2 = await hello(w2, '123456');
  check('right token accepted', r2.ok === true);
  check('status connected', bridge.status().connected === true);
  w2.close();
  await delay(60);
  check('disconnect clears status', bridge.status().connected === false);

  await bridge.stop();
  check('stop disables', bridge.status().enabled === false);
}

main()
  .then(() => {
    if (failed) process.exit(1);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });