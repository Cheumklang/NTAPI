/**
 * Diagnostic: the sidebar wiring for pins and colours, and what `/clear` keeps.
 *
 * These are static checks against the real source files. They exist because the
 * failures here are silent: a missing preload method makes a click do nothing, a
 * `/clear` that forgets the name looks like the app wiped your title, and a CSS
 * rule in the wrong place lets `.active` draw over the user's colour.
 *
 * Run from app/:   node scripts/selftest-session-marks-ui.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src');
const read = (p) => fs.readFileSync(path.join(src, p), 'utf8');

const mainJs = read('main.js');
const preload = read('preload.js');
const appJs = path.join(src, 'renderer', 'app.js');
const renderer = fs.readFileSync(appJs, 'utf8');
const css = fs.readFileSync(path.join(src, 'renderer', 'styles.css'), 'utf8');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${err.message}`);
  }
}
function must(haystack, needle, why) {
  if (!haystack.includes(needle)) throw new Error(`missing ${JSON.stringify(needle)}${why ? ` — ${why}` : ''}`);
}

/* ----------------------------- /clear keeps ---------------------------- */

const clearBlock = (() => {
  const start = mainJs.indexOf("ipcMain.handle('session:clear'");
  if (start === -1) throw new Error('session:clear handler not found');
  return mainJs.slice(start, start + 4200);
})();

check('/clear reads the name before the old handle is disposed', () => {
  const reads = clearBlock.indexOf('sessionName');
  const dispose = clearBlock.indexOf('tab.handle.dispose()');
  if (reads === -1) throw new Error('sessionName is never read: the name cannot survive');
  if (dispose !== -1 && reads > dispose) throw new Error('sessionName is read after dispose()');
});

check('/clear writes the name back onto the new session', () => {
  must(clearBlock, 'setSessionName(keepName)', 'the new session never receives the old name');
});

check('/clear re-selects the old model', () => {
  must(clearBlock, 'keepModel', 'the old model is not captured');
  must(clearBlock, 'setModel(keepModel.provider, keepModel.id)', 'the model is never re-selected');
  // Selecting it is not enough: the state handed to the renderer has to carry
  // the new model, otherwise the dropdown still shows the default.
  must(clearBlock, 'state.model = { provider: model.provider', 'the state keeps the old model');
});

check('/clear still deletes the history file (a real new session, not a truncation)', () => {
  must(clearBlock, 'fs.promises.unlink(target)', 'the old history file must be removed');
  must(clearBlock, 'sdk.SessionManager.create', 'a fresh session must be created');
});

check('/clear reports whether the name was kept', () => {
  must(clearBlock, 'keptName', 'the renderer cannot tell the user what was preserved');
});

/* ------------------------------ list/serve ----------------------------- */

check('listSessions ships pinned and color with each row', () => {
  const start = mainJs.indexOf('async function listSessions');
  const body = mainJs.slice(start, start + 2200);
  must(body, 'pinned: mark.pinned');
  must(body, 'color: mark.color');
});

check('pinned chats are sorted to the top of the list', () => {
  const start = mainJs.indexOf('async function listSessions');
  const body = mainJs.slice(start, start + 2200);
  must(body, 'sortSessionsByMark', 'pins never move a row');
});

check('a mark IPC exists and validates its session path', () => {
  must(mainJs, "ipcMain.handle('session:mark'");
  must(mainJs, "require('./session-marks')");
  const start = mainJs.indexOf("ipcMain.handle('session:mark'");
  const body = mainJs.slice(start, start + 1200);
  must(body, 'SESSIONS_ROOT', 'an arbitrary path must not be writable');
});

check('preload exposes the mark API', () => {
  must(preload, 'setSessionMark:');
  must(preload, "ipcRenderer.invoke('session:mark'");
});

/* -------------------------------- sidebar ------------------------------ */

check('the sidebar draws a pin for pinned chats', () => {
  must(renderer, 's-pin-slot', 'no pin slot');
  must(renderer, "s.pinned ? '\\u{1F4CC}'", 'no pin glyph');
});

check('every row reserves the pin slot, so titles line up', () => {
  // The slot must be rendered unconditionally; only its contents vary.
  const row = /<span class="s-row">([\s\S]{0,300}?)<\/span>\s*<span class="s-title"/.exec(renderer);
  if (!row) throw new Error('could not find the sidebar row markup');
  if (!row[1].includes('s-pin-slot')) throw new Error('the pin slot is missing from the row');
  if (/\$\{s\.pinned \? `<span class="s-pin-slot"/.test(renderer)) {
    throw new Error('the slot is conditional, so titles shift when a chat is pinned');
  }
  must(css, '.session-item .s-pin-slot', 'the slot has no width rule');
  must(css, 'width: 14px', 'the reserved slot has no fixed width');
});

check('the running spinner does not push the title aside', () => {
  // It has to share the reserved left slot: a marker in front of the title shifted
  // every chat name to the right for the length of the turn.
  if (!/<span class="s-pin-slot" aria-hidden="true">\$\{marker\}/.test(renderer)) {
    throw new Error('the reserved slot does not carry the running marker');
  }
  if (/<span class="s-title">\$\{busy/.test(renderer)) {
    throw new Error('the spinner is back in front of the title');
  }
  const spin = /\.s-spin \{[\s\S]*?\n\}/.exec(css);
  if (!spin) throw new Error('no .s-spin rule');
  if (/margin-right/.test(spin[0])) throw new Error('.s-spin still reserves space beside the title');
});

check('the row is repainted when a turn starts and when it ends', () => {
  if (!/function refreshSessionBusy\(\)/.test(renderer)) throw new Error('no refreshSessionBusy()');
  const expected = [
    ['onBusy', /view\.busy = p\.busy;\s*\n\s*refreshSessionBusy\(\);/],
    ['onSettled', /const hadQueue = Boolean\(view\.queue\?\.length\);[^\n]*\n[\s\S]{0,1200}?view\.busy = false;\s*\n\s*view\.steerPending = false;\s*\n\s*refreshSessionBusy\(\);/],
    ['onError', /view\.busy = false;\s*\n\s*view\.steerPending = false;\s*\n\s*refreshSessionBusy\(\);/],
  ];
  for (const [hook, re] of expected) {
    if (!re.test(renderer)) throw new Error(`${hook} leaves the row spinner stale`);
  }
});

check('the busy mark stays off the row that is already on screen', () => {
  // Two "working" marks on one row read as noise: the selected row breathes instead.
  must(renderer, "if (busy) btn.classList.add('busy')");
  must(renderer, 'busy && !isActive');
  if (/<span class="s-title">\$\{busy/.test(renderer)) throw new Error('the spinner is back in front of the title');
});

check('the selected chat breathes through its shadow, not its border', () => {
  const at = css.indexOf('@keyframes session-breathe');
  if (at === -1) throw new Error('no session-breathe keyframes');
  const block = css.slice(at, at + 520);
  must(block, 'box-shadow');
  if (/border-color/.test(block)) {
    throw new Error('the animation repaints border-color, which would paint over the colour stripe');
  }
  must(css, '.session-item.active.busy { animation: session-breathe');
});

check('the pulse keeps its shape: quick peak, slow fade', () => {
  // A symmetric rise and fall gives the eye nothing to catch: the card just reads
  // as slightly heavier. The user sent back exactly that from the real window.
  const at = css.indexOf('@keyframes session-breathe');
  if (at === -1) throw new Error('no session-breathe keyframes');
  if (!/22%/.test(css.slice(at, at + 400))) {
    throw new Error('the peak moved off 22% — a symmetric rise and fall reads as a flat, heavier card');
  }
  const rule = css.slice(css.indexOf('.session-item.active.busy {'), at);
  if (!/1\.2s/.test(rule)) throw new Error('the pulse is back to a slow cycle');
});

check('every new animation stops for reduced motion', () => {
  // The file has several reduced-motion blocks; only one of them is this layer,
  // so look in all of them instead of assuming the last one.
  const headers = [];
  let at = css.indexOf('@media (prefers-reduced-motion: reduce)');
  while (at !== -1) {
    headers.push(at);
    at = css.indexOf('@media (prefers-reduced-motion: reduce)', at + 1);
  }
  if (!headers.length) throw new Error('no reduced-motion block at all');
  const blocks = headers.map((start, n) => css.slice(start, headers[n + 1] ?? css.length));
  for (const needle of ['session-item.active.busy', 'settings-dialog', 'model-menu', 'ctx-menu']) {
    if (!blocks.some((block) => block.includes(needle))) {
      throw new Error(`${needle} keeps animating for reduced motion`);
    }
  }
});

check('pressable things share one motion language', () => {
  must(css, '.chip-btn:hover', 'no chip hover motion');
  must(css, '.ghost:hover', 'no ghost hover motion');
  must(css, 'button:focus-visible', 'no global focus ring');
  must(css, 'transform: scale(1.035)', 'model rows do not thicken to the agreed amount');
  must(css, '-webkit-text-stroke', 'the model row does not gain weight under the pointer');
});

check('menus fade out instead of vanishing', () => {
  // Opening was animated and closing was a hard cut; that mismatch is what read
  // as a flicker. Guard the exit on all three, not just the dialog.
  must(css, 'allow-discrete', 'no discrete transition, so a hidden menu cannot fade');
  must(css, '@starting-style', 'no entry state, so menus appear with a jump');
  must(css, '#settingsOverlay[hidden]', 'the settings overlay has no exit rule');
  must(css, '.model-menu[hidden] { opacity: 0; }', 'the model menu has no exit rule');
  must(css, '.ctx-menu.is-closing', 'the context menu has no exit state');
  // The menu node is removed from the DOM, so the class has to be added in JS.
  must(renderer, "classList.add('is-closing')", 'the context menu never enters its exit state');
  must(renderer, 'openMenuEl = null;', 'a closing menu can be closed twice');
  if (/animation: ui-arrive/.test(css)) {
    throw new Error('the old entrance animation is back alongside the transitions');
  }
});

check('the sidebar draws a colour stripe cell', () => {
  must(renderer, 'btn.dataset.color', 'the colour never reaches the row');
});

check('the context menu offers pin and unpin', () => {
  must(renderer, "pinChat");
  must(renderer, "unpinChat");
  must(renderer, 'setSessionMark(session.path, { pinned: !session.pinned }', 'the pin entry does not save');
});

check('the context menu offers every colour from the palette', () => {
  const list = /const SESSION_COLORS = \[([^\]]+)\]/.exec(renderer);
  if (!list) throw new Error('SESSION_COLORS not found in the renderer');
  const keys = list[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean);
  // The palette in src/session-marks.js is the source of truth.
  const module = require('../src/session-marks');
  const expected = module.COLOR_KEYS;
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    throw new Error(`renderer palette ${JSON.stringify(keys)} != ${JSON.stringify(expected)}`);
  }
});

check('every colour has a label in both languages', () => {
  const module = require('../src/session-marks');
  for (const { key } of module.COLORS) {
    must(renderer, `color_${key}: '`, `English label missing for ${key}`);
    // The Thai block appears later in the same file; count occurrences instead.
    const total = renderer.split(`color_${key}: '`).length - 1;
    if (total < 2) throw new Error(`Thai label missing for ${key}`);
  }
});

check('every colour has a swatch colour in CSS', () => {
  const module = require('../src/session-marks');
  for (const { key } of module.COLORS) {
    must(css, `.session-item[data-color="${key}"]`, `no --swatch for ${key}`);
  }
});

check('the user colour wins over the active row border', () => {
  // The colour rule has to come after `.session-item.active`, otherwise that
  // rule's `border-left` paints over the stripe.
  const activeAt = css.lastIndexOf('.session-item.active {');
  const colorAt = css.lastIndexOf('.session-item[data-color],');
  if (activeAt === -1 || colorAt === -1) throw new Error('rules not found');
  if (colorAt < activeAt) throw new Error('colour rules come before .active; the stripe would be hidden');
});

check('a colour is drawn as a border, not a background tint', () => {
  const start = css.lastIndexOf('.session-item[data-color],');
  const body = css.slice(start, start + 900);
  must(body, 'border-left: 4px solid var(--swatch)');
});

check('a coloured row does not also keep the purple active frame', () => {
  // Two frames sharing an edge read as a doubled border: `.active` paints purple
  // all the way round while the colour paints the left edge.
  const start = css.lastIndexOf('.session-item[data-color],');
  const body = css.slice(start, start + 900);
  for (const side of ['top', 'right', 'bottom']) {
    must(body, `border-${side}-color: transparent`);
  }
});

check('the active coloured row draws no second ring inside the stripe', () => {
  const at = css.lastIndexOf('.session-item[data-color].active');
  if (at === -1) throw new Error('no .session-item[data-color].active rule');
  const body = css.slice(at, at + 400);
  if (body.includes('inset 0 0 0 1px var(--swatch)')) {
    throw new Error('the active coloured row still draws an inset ring on top of its stripe');
  }
});

/* -------------------------------- clearing ----------------------------- */

check('clearing a chat forgets its mark', () => {
  const start = renderer.indexOf('async function clearSession');
  const body = renderer.slice(start, start + 1800);
  must(body, 'sessionMarksLocal.delete(oldKey)', 'a cleared chat keeps its pin/colour');
});

check('deleting a chat forgets its mark', () => {
  const start = renderer.indexOf('const deletedKey = sessionMarkKey(state.session.path)');
  if (start === -1) throw new Error('deleting a session never drops its mark');
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: pin/colour wiring is in place and /clear keeps the name and model');
