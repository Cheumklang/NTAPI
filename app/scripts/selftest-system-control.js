/**
 * Desktop control (Linux, AT-SPI2) — the switch, the gate, the panic button.
 *
 * This feature hands the agent the same reach the user has over their own
 * machine, so the test is mostly about the *refusals*: off by default, nothing
 * runs while the switch is off, every press is audited, and the hotkey exists
 * from the moment the switch goes on.
 *
 * Run from app/:   node scripts/selftest-system-control.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.js');
const appSrc = read('src/renderer/app.js');
const html = read('src/renderer/index.html');
const preload = read('src/preload.js');
const freepi = read('src/freepi-bridge.js');
const linux = read('src/system/linux.js');
const index = read('src/system/index.js');
const helperPath = path.join(root, 'src/system/atspi.py');
let systemScreenshotContent = null;
try {
  ({ systemScreenshotContent } = require(path.join(root, 'src/freepi-bridge.js')));
} catch {
  // The bridge needs the SDK to load; the source checks above still run.
}

/** Brace-matched function source, from a signature that may take parameters. */
function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const start = at >= 6 && src.slice(at - 6, at) === 'async ' ? at - 6 : at;
  let parens = 0;
  let afterParams = -1;
  for (let i = src.indexOf('(', start); i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        afterParams = i;
        break;
      }
    }
  }
  if (afterParams === -1) return '';
  const brace = src.indexOf('{', afterParams);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/* ------------------------------------------------------------- the helper */

check('the accessibility helper is shipped', fs.existsSync(helperPath));
if (fs.existsSync(helperPath)) {
  let compiles = true;
  try {
    execFileSync('python3', ['-m', 'py_compile', helperPath], { stdio: 'ignore', timeout: 20000 });
  } catch {
    compiles = false;
  }
  check('it is valid python', compiles);
}
const helper = fs.existsSync(helperPath) ? fs.readFileSync(helperPath, 'utf8') : '';
check('it answers the four questions the app asks', ['probe', 'windows', 'snapshot', 'act'].every((cmd) => helper.includes(`'${cmd}'`)));
check('a stale ref is a named error', /STALE_REF/.test(helper));
check('an element without an action is a named error', /NO_ACTION/.test(helper));
check('a refused action is a named error', /REFUSED/.test(helper));
check('an element with a menu of actions needs one named', /AMBIGUOUS_ACTION/.test(helper));
check('menu internals stay out of the tree', /'\.' not in label/.test(helper));
check('one broken application cannot crash the walk', /def safe\(call/.test(helper));
check('the tree walk is capped', /MAX_DEPTH\s*=\s*\d+/.test(helper) && /--max/.test(helper));

/* ---------------------------------------------------------- the adapter */

check('the adapter clamps what it returns', /MAX_NODES\s*=\s*\d+/.test(linux));
check('a missing interpreter is named', /NO_PYTHON/.test(linux));
check('a hung desktop is named', /TIMEOUT/.test(linux));
check('the interpreter can be pointed at another binary', /NTAPI_PYTHON/.test(linux));
check('the adapter exposes look and press', ['available', 'windows', 'snapshot', 'act'].every((fn) => new RegExp(`async function ${fn}\\b|${fn},`).test(linux)));

const systemIndex = require(path.join(root, 'src/system/index.js'));
check('the hotkey is one constant', systemIndex.SYSTEM_STOP_HOTKEY === 'Control+Alt+Escape');
check('linux gets an adapter', Boolean(systemIndex.createSystem({ platform: 'linux' })));
check('other platforms say "no adapter" instead of pretending', systemIndex.createSystem({ platform: 'win32' }) === null);

/* --------------------------------------------------------------- the gate */

check('the pref defaults to off', /systemControl && prefs\.systemControl\.enabled/.test(body(main, 'systemEnabled')));

const enabledScope = { readPrefs: () => ({ systemControl: { enabled: true } }) };
const enabledFn = new Function('scope', `with (scope) { return (${body(main, 'systemEnabled')}); }`)(enabledScope);
check('a stored switch is read back', enabledFn() === true);
const emptyFn = new Function('scope', `with (scope) { return (${body(main, 'systemEnabled')}); }`)({ readPrefs: () => ({}) });
check('no pref means off', emptyFn() === false);

const guardSrc = body(main, 'systemGuard');
check('the gate exists', guardSrc !== '');
function guardWith(scope) {
  const fn = new Function('scope', `with (scope) { return (${guardSrc}); }`)(scope);
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}
const offGuard = guardWith({ systemAdapter: {}, systemEnabled: () => false });
check('the gate refuses while the switch is off', offGuard && offGuard.code === 'SYSTEM_CONTROL_OFF', offGuard && offGuard.message);
const noAdapter = guardWith({ systemAdapter: null, systemEnabled: () => true });
check('no adapter is its own refusal', noAdapter && noAdapter.code === 'UNSUPPORTED');
check('an allowed call passes the gate', guardWith({ systemAdapter: {}, systemEnabled: () => true }) === null);

check('every command goes through the gate', /async call\(cmd, args = \{\}\) \{\n\s*systemGuard\(\);/.test(main));
check('the switch is persisted', /writePrefs\(\{ systemControl: \{ enabled: true \} \}\)/.test(main));
check('stopping is immediate and audited', /function stopSystemControl\(via\)[\s\S]{0,400}systemAudit\(\{ event: 'stopped'/.test(main));
check('the hotkey is registered when the switch goes on', /registerSystemHotkey\(\);/.test(body(main, 'setSystemControl')));
check('and re-armed on the next boot', /if \(systemEnabled\(\)\) registerSystemHotkey\(\);/.test(main));
check('the hotkey stops instead of asking', /globalShortcut\.register\(SYSTEM_STOP_HOTKEY, \(\) => stopSystemControl\('hotkey'\)\)/.test(main));
check('looks and presses are written to an audit log', /event: 'snapshot'/.test(main) && /event: 'act'/.test(main));
check('the log lives beside the browser log', /system-audit\.log/.test(main));
check('the renderer can ask, switch and watch', /ipcMain\.handle\('system:getState'/.test(main) && /ipcMain\.handle\('system:setEnabled'/.test(main) && /send\('system:state'/.test(main));
check('the agent is told when the user hit the hotkey', /send\('system:stopped'/.test(main));
check('the bridge is handed to the session', /systemBridge,\n/.test(main));

/* ------------------------------------------------------------ the wiring */

check('preload exposes the four calls', ['systemGetState', 'systemSetEnabled', 'onSystemState', 'onSystemStopped'].every((k) => new RegExp(`${k}:`).test(preload)));
check(
  'the chip lives on the workspace row, after the theme button',
  html.indexOf('id="pickFolder"') < html.indexOf('id="sysChip"') &&
    html.indexOf('id="themeBtn"') < html.indexOf('id="sysChip"') &&
    html.indexOf('id="sysChip"') < html.indexOf('id="approvalBtn"')
);
check('the chip opens a panel', /id="sysPopover"/.test(html));
check('the warning is a sentence in the panel', /class="sys-warn" id="sysWarn"/.test(html));
check('the panel carries the hotkey', /Ctrl<\/kbd><kbd>Alt<\/kbd><kbd>Esc/.test(html));
check('the strip is fixed at the foot of the window', /class="sys-banner" id="sysBanner" role="status" hidden/.test(html));
check('the strip has its own stop button', /id="sysBannerStop"/.test(html));
check('the strip starts hidden and off', /data-state="off"/.test(html));
check('styles cover chip, panel and strip', ['.chip-btn.sys-chip', '.sys-popover', '.sys-banner', '.sys-banner-stop'].every((sel) => read('src/renderer/styles.css').includes(sel)));

check('one function paints every indicator', /function applySystemState\(state = \{\}\)/.test(appSrc));
check('the panel can explain why it is unavailable', /systemProbe: \(\) => ipcRenderer\.invoke\('system:probe'\)/.test(preload));
check('and says it in the panel, not only a toast', /el\('sysNote'\)\.textContent = probe\.reason/.test(appSrc));
check('a refused global grab is reported, not hidden', /hotkeyActive: Boolean\(systemHotkeyOn\)/.test(main) && /sysHotkeyDown/.test(appSrc));
check('the hotkey also works inside the window', /!event\.ctrlKey \|\| !event\.altKey \|\| event\.key !== 'Escape'/.test(appSrc));
check('the strip follows the switch', /el\('sysBanner'\)\.hidden = !sysControl\.enabled;/.test(appSrc));
check('turning it on goes through the dialog', /kind: 'system',\n\s*title: t\('sysConfirmTitle'\)/.test(appSrc));
check('the dialog branch turns the switch on', /state\.kind === 'system'[\s\S]{0,80}setSystemControl\(true\)/.test(appSrc));
check('the hotkey stop reaches the window', /payload\.via === 'hotkey' \? t\('sysStoppedHotkey'\)/.test(appSrc));

const countOf = (needle) => (appSrc.match(new RegExp(`\\b${needle}:`, 'g')) || []).length;
for (const key of ['sysTitle', 'sysWarn', 'sysBanner', 'sysConfirmTitle', 'sysStoppedHotkey', 'sysUnsupported']) {
  check(`both languages carry ${key}`, countOf(key) === 2);
}

/* -------------------------------------------------------------- the tools */

const tools = require(path.join(root, 'src/freepi-bridge.js'));
const toolNames = Object.keys(tools.SYSTEM_TOOLS);
check('four desktop tools, no more', toolNames.length === 4);
check(
  'look before pressing is the order offered',
  toolNames[0] === 'system_windows' && toolNames[1] === 'system_snapshot' && toolNames[3] === 'system_act'
);
check(
  'the three reads never prompt',
  tools.SYSTEM_TOOLS.system_windows.write === false &&
    tools.SYSTEM_TOOLS.system_snapshot.write === false &&
    tools.SYSTEM_TOOLS.system_screenshot.write === false
);
check('pressing prompts', tools.systemGuardedTools().join() === 'system_act');
check('system_act is in the default guard list', tools.DEFAULT_GUARDED_TOOLS.includes('system_act'));
check('the allow-list carries them when the bridge exists', /const systemToolAllowList = systemBridge \? Object\.keys\(SYSTEM_TOOLS\) : \[\];/.test(freepi));
check('the extension is only installed with a bridge', /\.\.\.\(systemBridge \? \[systemExtension\] : \[\]\)/.test(freepi));
check('the model is told the rules', /## Desktop control/.test(freepi) && /SYSTEM_CONTROL_OFF/.test(freepi));
check('the prompt says the pointer cannot be moved', /pointer cannot be moved/.test(freepi));

/* ------------------------------------------------------- a live look, if any */

(async () => {
  const adapter = systemIndex.createSystem();
  if (!adapter) {
    console.log('SKIP live probe: no adapter on this platform');
  } else {
    const probe = await adapter.available();
    if (!probe.ok) {
      console.log(`SKIP live probe: ${probe.code} — ${probe.reason}`);
    } else {
      check('the desktop can be listed', probe.apps > 0, `apps: ${probe.apps}`);
      const windows = await adapter.windows();
      check('windows come back as rows', Array.isArray(windows));
      const first = windows.find((w) => Number.isInteger(w.app));
      if (first) {
        const snap = await adapter.snapshot({ app: first.app, maxNodes: 40 });
        check('a snapshot is smaller than the cap', snap.nodes.length <= 40);
        check('every element carries a ref', snap.nodes.every((n) => /^\d+(\/\d+)*$/.test(n.ref)));
      } else {
        console.log('SKIP snapshot: no window to read');
      }
    }
  }

  /* ------------------------------------------------------ the picture */

  check('there is a screenshot tool', /system_screenshot: \{/.test(freepi) && /cmd: 'screenshot'/.test(freepi));
  check('taking a picture is not a guarded act', /system_screenshot: \{[\s\S]{0,400}?write: false/.test(freepi));
  check('main photographs the window it owns', /webContents\.capturePage\(\)/.test(main));
  check('another app is refused with a reason', /NOT_CAPTURABLE/.test(main));
  check('the refusal names the compositor, not a bug', /compositor refuses screen capture/.test(main));
  check('the attempt is audited', /event: 'screenshot'/.test(main));
  check('a model with eyes gets the image', /type: 'image', data: result\.data/.test(freepi));
  check('a text-only model gets a path', /could not see images|cannot see images/.test(freepi) && /desktop-\$\{/.test(freepi));

  const shot = typeof systemScreenshotContent === 'function' ? systemScreenshotContent : null;
  check('the helper is exported for tests', Boolean(shot));

  /* ---------------------------------------- the panel escapes the sidebar box */

  const cssSrc = read('src/renderer/styles.css');
  const place = body(appSrc, 'placeSysPanel');
  check('the panel is drawn on the window, not in the clipping column', /\.sys-popover \{\n  position: fixed;/.test(cssSrc));
  check('the sidebar does clip, which is why it had to move', /#sidebar \{[\s\S]{0,800}overflow-x: hidden;/.test(cssSrc));
  check('the panel is above the chat', /\.sys-popover \{[\s\S]{0,160}z-index: 60;/.test(cssSrc));

  /** The chip rectangle is whatever the test says it is; the maths is the point. */
  function placeWith({ right, top, innerWidth, innerHeight, popW = 268, popH = 300, hidden = false }) {
    const pop = { hidden, offsetWidth: popW, offsetHeight: popH, style: {} };
    const chip = { getBoundingClientRect: () => ({ right, top }) };
    const scope = { el: (id) => (id === 'sysPopover' ? pop : chip), window: { innerWidth, innerHeight } };
    new Function('scope', `with (scope) { return (${place}); }`)(scope)();
    return { left: Number.parseFloat(pop.style.left), top: Number.parseFloat(pop.style.top), pop };
  }

  const beside = placeWith({ right: 260, top: 96, innerWidth: 1280, innerHeight: 800 });
  check('it opens just beside the chip', beside.left === 270 && beside.top === 96, JSON.stringify(beside));

  const atEdge = placeWith({ right: 1270, top: 96, innerWidth: 1280, innerHeight: 800 });
  check('a chip at the window edge keeps the panel on screen', atEdge.left === 1002, String(atEdge.left));

  const low = placeWith({ right: 260, top: 780, innerWidth: 1280, innerHeight: 800 });
  check('a chip near the bottom lifts the panel up', low.top === 490, String(low.top));

  const closed = placeWith({ right: 260, top: 96, innerWidth: 1280, innerHeight: 800, hidden: true });
  check('a closed panel is not measured', closed.pop.style.left === undefined);

  check('resizing keeps the panel with its chip', /window\.addEventListener\('resize', \(\) => placeSysPanel\(\)\)/.test(appSrc));
  check('scrolling the column keeps it too', /addEventListener\('scroll', \(\) => placeSysPanel\(\)/.test(appSrc));

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: desktop control is off by default, gated, audited and stoppable');
})();
