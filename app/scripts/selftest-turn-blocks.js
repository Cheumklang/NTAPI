/**
 * A turn can speak more than once, and none of it may be lost.
 *
 * The bug the user reported as "the first answer disappears": the agent says what
 * it is going to do, calls a tool, then reports again. Those are separate blocks
 * of prose in one turn. Every block arrives as a text_end carrying the whole of
 * that block, and the renderer assigned it to one bubble — so the second block
 * overwrote the first. The first thing the agent said was gone, and there was no
 * sign in the UI that anything had ever been there.
 *
 * The fix splits text bubbles inside an assistant message and seals one at a real
 * boundary: a tool call, which always separates one statement from the next.
 *
 * Run: node scripts/selftest-turn-blocks.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return '';
}

// --- the bubble a delta writes into --------------------------------------
const cur = body(app, 'currentBody');
check('there is a helper for the current bubble', cur !== '');
check('it looks at the last bubble, not the first', /bodies\[bodies\.length - 1\]/.test(cur));
check('it refuses a sealed bubble', /!last\.__fpDone/.test(cur));
check('it creates a bubble when there is none', /document\.createElement\('div'\)/.test(cur));
check('a new bubble goes below the old one', /wrap\.appendChild\(created\)/.test(cur));

// --- sealing at a tool call ----------------------------------------------
const seal = body(app, 'sealBody');
check('a block is sealed at a boundary', seal !== '');
check('sealing only marks a non-empty block', /__fpText \|\| ''\)\.trim\(\)/.test(seal));

const toolStart = app.slice(app.indexOf('api.onToolStart'), app.indexOf('api.onToolUpdate'));
check('a tool call seals the block before it', /sealBody\(wrap\)/.test(toolStart));
// Order matters: seal before the card is drawn, or the check reads the wrong one.
check('the seal happens before the tool card is drawn',
  toolStart.indexOf('sealBody(wrap)') < toolStart.indexOf('toolCard(view.liveTools, p)'));

// --- the streaming delta --------------------------------------------------
const delta = app.slice(app.indexOf('api.onDelta'), app.indexOf('api.onTextEnd'));
check('a delta writes into the current bubble', /const body = currentBody\(wrap\)/.test(delta));
check('a delta does not query the first bubble', !/wrap\.querySelector\('\.body'\)/.test(delta));

// --- the completed block --------------------------------------------------
const textEnd = app.slice(app.indexOf('api.onTextEnd'), app.indexOf('api.onToolStart'));
check('a finished block goes into the current bubble', /const body = currentBody\(wrap\)/.test(textEnd));
check('a finished block does not query the first bubble', !/wrap\.querySelector\('\.body'\)/.test(textEnd));
check('a finished block is marked done', /body\.__fpDone = true/.test(textEnd));
// The assignment that caused the loss is fine *because* the bubble came from
// currentBody(). What must never come back is picking the bubble with a plain
// querySelector while the text is assigned rather than appended.
check('the finished text is assigned exactly once', (textEnd.match(/__fpText = p\.text/g) || []).length === 1);

// --- the layout must allow more than one bubble --------------------------
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const bodyRule = (() => {
  const at = css.indexOf('.msg.assistant .body');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('an assistant bubble has a rule', bodyRule !== '');
// Two bubbles stacked need a gap between them, or the blocks read as one
// paragraph that suddenly changes subject.
const stacked = (() => {
  const at = css.indexOf('.msg.assistant .body + .body');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('two bubbles in one message are spaced apart', stacked !== '');
check('the gap is real spacing, not zero', /margin-top:\s*\.?\d/.test(stacked));

// --- history replay keeps every block ------------------------------------
//
// Rebuilding a tab from stored messages must not collapse them either.
const applyState = app.slice(app.indexOf('function applyTabState'), app.indexOf('function mergeIncomingMessages'));
// Replaying a stored conversation appends each step's text, so switching tabs
// never showed the loss — the bug was in the live stream only. This check pins
// that difference so a future rewrite does not copy the overwrite into replay.
const replayStart = app.indexOf('let currentAssistant = null;');
// The replay block grows as the drawing code gains detail; end it where the block
// really ends rather than at a fixed offset, so a comment cannot push the walk out
// of the window and fail a check that is still true.
const replayEnd = replayStart === -1 ? -1 : app.indexOf('const tailFrom', replayStart);
const replay = replayStart === -1
  ? ''
  : app.slice(replayStart, replayEnd === -1 ? replayStart + 8000 : replayEnd);
// The loop draws through a guard so one unrenderable entry cannot cut the rest of
// the chat off; it still walks every stored message.
check(
  'replay walks every stored message',
  /for \(let i = from; i < to; i \+= 1\)/.test(replay) && /draw\(m\)/.test(replay),
);
check('replay appends step text instead of overwriting it',
  /body\.__fpText \? `\$\{body\.__fpText\}\$\{text\}` : text/.test(replay));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll turn-block checks passed');
