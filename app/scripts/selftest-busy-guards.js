/**
 * The two "the AI is working" guards, checked against the source.
 *
 * Both features are pure renderer behaviour — a confirm dialog before a step
 * back or a model switch — so there is no function to call offline. What can be
 * pinned down is the wiring: the guard exists, the dialog asks, the confirm
 * handler answers, and both languages say something.
 *
 * Run: node scripts/selftest-busy-guards.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'src', 'renderer');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/** Body of `function name(...) { ... }` by brace counting; null when absent. */
function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const undo = functionBody(app, 'undoLastMessage') || '';
const undoBusy = functionBody(app, 'undoWhileBusy') || '';
const choose = functionBody(app, 'chooseModel') || '';
const finish = functionBody(app, 'finishUndo') || '';
const lastText = functionBody(app, 'lastUserText') || '';

// --- step back while busy -------------------------------------------------
check('undo no longer refuses to run during a turn', !/if \(view\.busy\) return showNotice/.test(undo));
check('undo asks before stopping the turn', /kind: 'undoBusy'/.test(undo));
check('undo still works when the tab is idle', /api\.undo\(/.test(undo));
check('the confirm dialog carries the tab', /state: \{ tabId: view\.tabId \}/.test(undo));
check('the busy path stops the turn through takeBack', /api\.takeBackPrompt\(/.test(undoBusy));
check('both undo paths share one tail', /function finishUndo/.test(app) && /finishUndo\(view, null, text\)/.test(undoBusy));
check(
  'the text to restore is the newest user message',
  /kind === 'user'/.test(lastText) && /finishUndo\(view, res\.entryId, typed \|\| res\.text\)/.test(undo)
);

// --- model switch while busy ---------------------------------------------
check('a model switch during a turn asks first', /view\?\.busy/.test(choose) && /kind: 'modelBusy'/.test(choose));
check('the answer names the model it would switch to', /FPProvider\.modelOptionLabel\(entry\)/.test(choose));
check('the switch is applied from the dialog', /function applyModelChoice/.test(app) && /applyModelChoice\(state\.provider, state\.id\)/.test(app));
check('confirming a busy undo runs the undo', /state\.kind === 'undoBusy'/.test(app) && /await undoWhileBusy\(state\.tabId\)/.test(app));

// --- wording, in both languages ------------------------------------------
for (const key of [
  'undoBusyTitle',
  'undoBusySub',
  'undoBusyMeta',
  'undoBusyAction',
  'modelBusyTitle',
  'modelBusySub',
  'modelBusyMeta',
  'modelBusyAction',
  'planFreeTier',
  'planFreeTierTitle',
]) {
  const hits = app.split(`${key}:`).length - 1;
  check(`both languages define ${key}`, hits === 2, `found ${hits}`);
}

// --- the free-allowance chip ---------------------------------------------
check('the closed picker has a quota chip element', /id="modelPickerFreeTier"/.test(html));
check('the chip is styled like the free badge', /\.model-plan\.free \{/.test(css));

console.log(failures ? `\n${failures} check(s) failed` : '\nall busy-guard checks passed');
process.exit(failures ? 1 : 0);