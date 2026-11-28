/**
 * Browser / desktop / ntfy fixes (2026-11-28).
 *
 *  - The extension's own error codes reach the agent (not all EXTENSION_ERROR).
 *  - A click or key a hidden tab swallowed is detected and redone in the DOM.
 *  - The app asks a stale extension to reload itself.
 *  - The desktop stop key the agent is told about is the one that works.
 *  - ntfy keeps real rooms and drops empty placeholders; reconnects back off;
 *    ntfy_send publishes to its own chat's room.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const bridge = read('src/browser-bridge.js');
const ext = read('browser-extension/background.js');
const main = read('src/main.js');
const fpb = read('src/freepi-bridge.js');
const svc = read('src/ntfy-service.js');
const app = read('src/renderer/app.js');

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed += 1;
};

check('extension error codes pass through the bridge', /frame\.error\.code/.test(bridge) && /entry\.reject\(bridgeError\(code,/.test(bridge));
check('browser audit records why a call failed', /code: \(err && err\.code\) \|\| null/.test(bridge));
check('click checks the page received it', /armInputProbe\(tabId, args\.frameId, button === 'right' \? 'contextmenu' : 'mousedown'\)/.test(ext) && /domClickAt\(/.test(ext));
check('a key a hidden tab dropped is replayed', /armInputProbe\(tabId, args\.frameId, 'keydown'\)/.test(ext) && /requestSubmit/.test(ext));
check('a click waits for a navigation to start', /settleAfterAction\(tabId, beforeUrl\)/.test(ext));
check('the extension can reload itself', /case 'reload':[\s\S]{0,200}chrome\.runtime\.reload\(\)/.test(ext));
check('the app asks a stale extension to reload', /extensionVersion !== bundledVersion/.test(bridge) && /bundledVersion:/.test(main));
check('manifest version was bumped', JSON.parse(read('browser-extension/manifest.json')).version !== '0.3.1');

check('a desktop failure is audited', /ok: false,\n\s*code: \(err && err\.code\) \|\| 'ERROR'/.test(main));
check('the stop flag stops control in the running app', /argv\.includes\(STOP_CONTROL_FLAG\)[\s\S]{0,80}stopSystemControl\('hotkey'\)/.test(main));
check('the GNOME stop key is installed only from the panel', /ipcMain\.handle\('system:installStop'/.test(main) && /api\.systemInstallStop/.test(app));
check('the agent is told the stop key that really works', /function stopKeyLine\(\)/.test(fpb) && !/Ctrl\+Alt\+Esc; if a tool/.test(fpb));
check('a near-empty window tree comes with a hint', /a browser keeps the web page itself out of the desktop accessibility tree/.test(fpb));

check('ntfy reconnects back off', /RECONNECT_MAX_MS/.test(svc) && /2 \*\* Math\.min\(tries, 8\)/.test(svc));
check('ntfy_send publishes to its own chat', /sessionKey: ntfyKeyFor\(tabId\)/.test(main));
check('agent sends are tagged as our own', /'ntapi-agent'/.test(svc) && /'ntapi-agent'/.test(app));
check('a command for a closed chat opens it instead of dropping it', /ntfyOpenChatAndRun\(payload\?\.sessionKey, message\)/.test(app));

// The keyboard: names, single characters and combinations.
{
  const grab = (start, endMarker) => {
    const a = ext.indexOf(start);
    const b = ext.indexOf(endMarker, a);
    return ext.slice(a, b);
  };
  const src = grab('const NAMED_KEYS = {', 'async function pressKey(');
  // eslint-disable-next-line no-new-func
  const parseKey = new Function(`${src}; return parseKey;`)();
  const ck = parseKey('Control+k');
  check('Control+k is a shortcut, not text', ck.key === 'k' && ck.modifiers === 2 && !ck.text && ck.code === 'KeyK');
  const pd = parseKey('PageDown');
  check('PageDown is a named key', pd.key === 'PageDown' && pd.vk === 34);
  const st = parseKey('Shift+Tab');
  check('Shift+Tab carries shift', st.key === 'Tab' && st.modifiers === 8);
  const a = parseKey('a');
  check('a single letter types itself', a.key === 'a' && a.text === 'a');
  let bad = null;
  try {
    parseKey('Hyper+x');
  } catch (err) {
    bad = err.code;
  }
  check('an unknown modifier is refused', bad === 'BAD_ARGS');
}

const { BROWSER_TOOLS } = require('../src/browser-bridge.js');
for (const name of ['browser_hover', 'browser_drag', 'browser_navigate', 'browser_console', 'browser_network']) {
  check(`${name} is registered`, Boolean(BROWSER_TOOLS[name]) && fpb.includes(`${name}: {`));
}
check('hover, console and network never ask for approval', !BROWSER_TOOLS.browser_hover.write && !BROWSER_TOOLS.browser_console.write && !BROWSER_TOOLS.browser_network.write);
check('a dropdown is chosen, not typed into', /chooseOption\(tabId, selector, text, frameId\)/.test(ext));
check('a hidden tab is clicked through the page at once', /if \(await pageHidden\(tabId\)\) \{\s*const hit = await domClickAt/.test(ext));
check('a hidden tab is shown just for its screenshot', /withTabShown\(tabId, capture\)/.test(ext));
check('the page shows the agent is working', /ACTING\.has\(cmd\)[\s\S]{0,80}showWorking/.test(ext) && /__ntapiStop/.test(ext));
check('the agent has a pointer of its own in the page', /host\.__point = /.test(ext) && /async function showPointer\(/.test(ext));
check('click, hover, drag and type show where they act', ['click', 'double', 'right', 'hover', 'drag', 'type'].every((k) => ext.includes(`'${k}'`)) && (ext.match(/await showPointer\(/g) || []).length >= 5);
check('the real mouse is never moved for the pointer', !/showPointer[\s\S]{0,1200}Input\.dispatchMouseEvent/.test(ext.slice(ext.indexOf('async function showPointer('), ext.indexOf('async function fieldPoint('))));
check('Stop in the page ends the turn', /event\.event === 'userStop'[\s\S]{0,600}abortTabTurn\(running\)/.test(main));

// ntfy rooms survive a long history of chats without rooms.
const { createNtfyService } = require('../src/ntfy-service.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntfy-rooms-'));
const sessions = {};
for (let i = 0; i < 250; i += 1) sessions[`file:/x/empty-${i}.jsonl`] = { topic: null, enabled: false, since: 'all', at: 0 };
sessions['file:/x/real.jsonl'] = { topic: 'ntapi-realroom123', enabled: true, since: 'all', at: 5 };
fs.writeFileSync(path.join(dir, 'ntfy.json'), JSON.stringify({ v: 2, server: 'https://ntfy.sh', sessions }));
const fakeClient = {
  NTFY_DEFAULT_SERVER: 'https://ntfy.sh',
  normalizeServer: (s) => s,
  sanitizeTopicName: (t) => (typeof t === 'string' && /^[\w-]{1,64}$/.test(t) ? t : null),
  randomTopicName: () => 'ntapi-random',
};
const service = createNtfyService({ dir, client: fakeClient });
service.load();
const kept = service._internal.settings.sessions;
check('a real room survives 250 empty records', kept['file:/x/real.jsonl']?.topic === 'ntapi-realroom123' && kept['file:/x/real.jsonl'].enabled);
check('empty records are not loaded', Object.keys(kept).length === 1);
service.setActiveSession('file:/x/new-chat.jsonl');
const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'ntfy.json'), 'utf8')).sessions || {};
check('opening a chat without a room writes nothing for it', !('file:/x/new-chat.jsonl' in onDisk));
service.stop();
fs.rmSync(dir, { recursive: true, force: true });

if (failed) {
  console.log(`\n${failed} control check(s) failed.`);
  process.exit(1);
}
console.log('\nAll control checks passed');
