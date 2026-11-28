/**
 * Reloading the window must not kill or hide a running turn.
 *
 * The renderer is a view over tabs that live in the main process, so Ctrl+R
 * destroys the view only: the agent keeps streaming. Three things have to hold
 * for that to be invisible to the user, and each one was broken:
 *
 *   1. tab:open must REATTACH to a tab already open on the same session, not
 *      spawn a second tab on the same file (which strands the running turn).
 *   2. boot() must apply the state it is handed, not create a blank view.
 *   3. applyTabState must restore the busy state, or the reloaded window looks
 *      idle while the agent is still working, and Send starts a second turn.
 *
 * Run: node scripts/selftest-reload-reattach.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Whole handler body for an ipcMain.handle('name', …) by brace matching. */
function handlerBody(name) {
  const start = main.indexOf(`ipcMain.handle('${name}'`);
  if (start === -1) return '';
  // The handler is `ipcMain.handle('name', async (...) => {` — start at the
  // `=> {` so the object literals in the parameters are not mistaken for it.
  const arrowAt = main.indexOf('=>', start);
  if (arrowAt === -1) return '';
  const arrow = main.indexOf('{', arrowAt);
  if (arrow === -1) return '';
  if (arrow === -1) return '';
  let depth = 0;
  for (let i = arrow; i < main.length; i += 1) {
    if (main[i] === '{') depth += 1;
    else if (main[i] === '}') {
      depth -= 1;
      if (depth === 0) return main.slice(arrow, i + 1);
    }
  }
  return '';
}

/** Function body by name, brace matched. Default parameters are skipped first. */
function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) break;
    }
  }
  const open = src.indexOf('{', i);
  if (open === -1) return '';
  let depth = 0;
  for (let j = open; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, j + 1);
    }
  }
  return '';
}

// --- 1. tab:open reattaches instead of duplicating -------------------------

const openTab = handlerBody('tab:open');
check('tab:open exists', openTab !== '');
check('tab:open looks for an already-open tab on the same session',
  /for \(const .* of tabs\)/.test(openTab));
check('tab:open compares session files, not just ids', /sessionFile/.test(openTab));
check('tab:open hands back the live tab id', /tabId:\s*liveId/.test(openTab));
check('tab:open marks a reattached tab as reused', /reused:\s*true/.test(openTab));
check('the reattach check runs before a new tab id is made',
  openTab.indexOf('for (const') !== -1
  && openTab.indexOf('for (const') < openTab.indexOf('newTabId()'));

// The comparison must resolve paths so `C:\\x\\y` and `C:/x/y` match.
check('the comparison normalises paths', /path\.resolve\(liveFile\)/.test(openTab));

// --- 2. boot applies the state it is given ---------------------------------

const boot = body(app, 'boot');
check('boot exists', boot !== '');
check('boot applies the state from tab:open',
  /applyTabState\(res\.state(?:,\s*\{\s*show:\s*false\s*\})?\)/.test(boot));
check('boot no longer discards it into a blank view',
  !/views\.set\(view\.state\.tabId,\s*createView/.test(boot));

// --- 3. applyTabState restores busy ---------------------------------------

const applyState = body(app, 'applyTabState');
check('applyTabState exists', applyState !== '');
check('applyTabState restores the busy state', /setBusy\(\s*Boolean\(state\.busy\)\s*\)/.test(applyState));
check('busy is restored after the tab becomes active',
  // The soft (same-tab) refresh sets busy early on purpose; the full paint must
  // still restore it after the tab becomes active.
  applyState.indexOf('activeTabId = state.tabId') < applyState.lastIndexOf('setBusy('));

// --- 4. nothing in the renderer blocks or swallows reload -----------------

check('no beforeunload handler blocks the reload',
  !/beforeunload[\s\S]{0,200}(returnValue|preventDefault)/.test(app));
const swallowsReload = /ctrlKey[\s\S]{0,240}key\s*===\s*'r'/i.test(app)
  && /ctrlKey[\s\S]{0,240}key\s*===\s*'r'[\s\S]{0,240}preventDefault/i.test(app);
check('no key handler swallows Ctrl+R / Ctrl+Shift+R', !swallowsReload);

// --- 5. the running turn keeps its stream pinned to the tab --------------

// Stream events are addressed by tabId, so reusing the id is what keeps them
// landing in the right pane. Assert the sender uses the given id.
check('main sends stream events per tab', /function sendTab\(/.test(main));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll reload reattach checks passed');
