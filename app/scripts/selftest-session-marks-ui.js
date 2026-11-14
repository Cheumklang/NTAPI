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
  const body = css.slice(start, start + 600);
  must(body, 'border-left: 4px solid var(--swatch)');
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
