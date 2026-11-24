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

async function expectCode(fn) {
  try {
    await fn();
    return '';
  } catch (err) {
    return (err && err.code) || 'ERROR';
  }
}

// --- catalogue ---
check('catalogue has 17 tools', b.browserToolNames().length === 17, b.browserToolNames().join(','));
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

async function hello(ws, token, extensionVersion) {
  ws.send(JSON.stringify({ type: 'hello', token, version: 1, extensionVersion }));
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
  const r2 = await hello(w2, '123456', '0.3.1');
  check('right token accepted', r2.ok === true);
  check('status connected', bridge.status().connected === true);
  // Which build Chrome is running cannot be guessed from the app's own files:
  // an app update leaves the old extension loaded until it is reloaded.
  check('the loaded extension version is reported', bridge.status().extensionVersion === '0.3.1', bridge.status().extensionVersion);
  w2.close();
  await delay(60);
  check('disconnect clears status', bridge.status().connected === false);
  check('and forgets the version with it', bridge.status().extensionVersion === '');

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

  // --- claims decide which tab the agent may touch at all ---
  const { createClaims } = require('../src/browser-claims');
  const claims = createClaims({});
  const claimBridge = b.createBrowserBridge({ port: 0, extensionId: 'testext', token: '123456' });
  claimBridge.setClaims(claims);
  const claimPort = (await claimBridge.start()).port;

  const w5 = await open(`ws://127.0.0.1:${claimPort}`, 'chrome-extension://testext');
  await hello(w5, '123456');
  w5.on('message', (raw) => {
    const frame = JSON.parse(raw.toString());
    if (!frame.id) return;
    w5.send(
      JSON.stringify({
        id: frame.id,
        ok: true,
        result: { done: true, cmd: frame.cmd, tabId: frame.args ? frame.args.tab : undefined },
      })
    );
  });

  check('an explicit tab with no claim is refused', (await expectCode(() => claimBridge.call('read', { tab: 99 }))) === 'NOT_CLAIMED');
  check('with no claim, a call naming no tab still works as before', (await claimBridge.call('read', {})).done === true);

  claims.claim({ tabId: 7, url: 'https://ads.google.com' });
  check('a claimed tab is used when none is given', (await claimBridge.call('read', {})).tabId === 7);
  check('the claimed tab id is accepted', (await claimBridge.call('read', { tab: 7 })).tabId === 7);
  check('another tab id is refused', (await expectCode(() => claimBridge.call('read', { tab: 99 }))) === 'NOT_CLAIMED');
  check('reads on an unclaimed tab are refused too', (await expectCode(() => claimBridge.call('snapshot', { tab: 99 }))) === 'NOT_CLAIMED');
  check('writes on an unclaimed tab are refused too', (await expectCode(() => claimBridge.call('click', { tab: 99 }))) === 'NOT_CLAIMED');

  const activity = [];
  claimBridge.onActivity((entry) => activity.push(entry));
  await claimBridge.call('click', { ref: 'e1' });
  check('activity is emitted with the host', activity.length === 1 && activity[0].host === 'ads.google.com' && activity[0].cmd === 'click', JSON.stringify(activity));
  check('activity carries the ref and the tab', activity[0].ref === 'e1' && activity[0].tabId === 7);
  await claimBridge.call('read', {});
  check('activity is emitted for reads too', activity.length === 2 && activity[1].cmd === 'read');
  check('activity is stamped', Number.isFinite(Date.parse(activity[0].ts)));

  // Two tabs in hand: "the current tab" would be a guess, so it must be named.
  claims.claim({ tabId: 11, url: 'https://a.example', title: 'A' });
  check('with two tabs held, a call naming none is refused', (await expectCode(() => claimBridge.call('read', {}))) === 'AMBIGUOUS_TAB');
  check('naming one of them works', (await claimBridge.call('read', { tab: 11 })).tabId === 11);
  check('listing is never refused for ambiguity', (await claimBridge.call('tabs-real', {})).done === true);
  check(
    'and the refusal lists what can be named',
    /11|7/.test(await (async () => {
      try {
        await claimBridge.call('click', { ref: 'e1' });
        return '';
      } catch (err) {
        return err.message;
      }
    })())
  );
  check('with one tab left, a call naming none works again', (claims.release(11), (await claimBridge.call('read', {})).tabId === 7));

  claims.release();
  check('releasing the claim stops explicit tabs', (await expectCode(() => claimBridge.call('read', { tab: 7 }))) === 'NOT_CLAIMED');
  check('and releases the automatic target', (await claimBridge.call('read', {})).tabId === undefined);
  w5.close();
  await claimBridge.stop();
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