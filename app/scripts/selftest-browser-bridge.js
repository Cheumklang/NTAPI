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
check('catalogue has 15 tools', b.browserToolNames().length === 15, b.browserToolNames().join(','));
check('write tools are guarded', b.browserGuardedTools().includes('browser_click'));
check('read tools are not guarded', !b.browserGuardedTools().includes('browser_read'));
check('snapshot is a read command', b.BROWSER_TOOLS.browser_snapshot.write === false && b.BROWSER_TOOLS.browser_snapshot.cmd === 'snapshot');
check('dialog is a guarded write command', b.BROWSER_TOOLS.browser_dialog.write === true && b.BROWSER_TOOLS.browser_dialog.cmd === 'dialog');
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

  const readAudit = () => {
    try {
      return fs
        .readFileSync(auditPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };

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

  // Request/response round trip with a fake extension.
  const w3 = await open(`ws://127.0.0.1:${port}`, 'chrome-extension://testext');
  await hello(w3, '123456');
  w3.on('message', (raw) => {
    const frame = JSON.parse(raw.toString());
    if (frame.id) w3.send(JSON.stringify({ id: frame.id, ok: true, result: { done: true, cmd: frame.cmd } }));
  });
  const result = await bridge.call('read', { maxChars: 5 });
  check('call resolves result', result.done === true && result.cmd === 'read');

  await bridge.call('click', { selector: '#go', ref: 'e9' });
  const auditLines = readAudit();
  check('audit written for a write command', auditLines.some((l) => l.cmd === 'click' && l.selector === '#go'));
  check('audit covers read commands too', auditLines.some((l) => l.cmd === 'read' && l.ok === true));
  check('audit records the ref that was used', auditLines.some((l) => l.cmd === 'click' && l.ref === 'e9'));
  check('audit always carries a tabId field', auditLines.every((l) => Object.prototype.hasOwnProperty.call(l, 'tabId')));
  w3.close();

  // A connected extension that never answers must time out.
  const w4 = await open(`ws://127.0.0.1:${port}`, 'chrome-extension://testext');
  await hello(w4, '123456');
  let timeoutCode = '';
  try {
    await bridge.call('read', {}, { timeoutMs: 60 });
  } catch (err) {
    timeoutCode = err.code;
  }
  check('silent extension times out', timeoutCode === 'TIMEOUT', `code=${timeoutCode}`);
  check('a timed-out command is audited as a failure', readAudit().some((l) => l.cmd === 'read' && l.ok === false));
  w4.close();

  await bridge.stop();
  check('stop disables', bridge.status().enabled === false);
  let disabledCode = '';
  try {
    await bridge.call('read', {});
  } catch (err) {
    disabledCode = err.code;
  }
  check('call after stop is DISABLED', disabledCode === 'DISABLED', `code=${disabledCode}`);
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