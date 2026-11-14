/**
 * /compact must be able to wait its turn.
 *
 * It used to refuse while a turn was running ("wait for this to finish"), even
 * though every other input could already queue. Worse, the Ctrl+Enter queue path
 * would have sent the eight characters "/compact" to the model as a message.
 *
 * The renderer cannot be loaded outside Electron, so this test reads its source
 * for the three facts that make the behaviour correct:
 *   1. `compactConversation` queues when busy instead of returning a notice
 *   2. the queue can hold an action, and `drainQueue` runs it without a turn
 *   3. Ctrl+Enter resolves a typed `/compact` to the command, not to text
 *
 * Run: node scripts/selftest-compact-queue.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** The body of a function, by matching braces from its declaration. */
function body(name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

// --- 1. compact waits instead of refusing --------------------------------
const compact = body('compactConversation');
check('compactConversation exists', compact !== '');
// The old refusal. If this comes back, the bug is back.
check('it no longer refuses a running turn', !/if \(view\.busy\) return showNotice/.test(compact));
check('it queues the work when a turn is running', /if \(view\.busy\)[\s\S]*queueAction\(/.test(compact));
check('it still runs immediately when idle', /await runCompact\(view\)/.test(compact));

const runCompact = body('runCompact');
check('the actual work is separate', runCompact !== '');
check('the work calls the compact IPC', /api\.compact\(/.test(runCompact));
check('it reports a real failure, not "busy"', /compactFailed/.test(runCompact) && !/undoBusy/.test(runCompact));

// --- 2. the queue can carry an action -----------------------------------
const queueAction = body('queueAction');
check('queueAction exists', queueAction !== '');
check('an action item is tagged as such', /kind: 'action'/.test(queueAction));
check('it remembers a label to show in the queue', /label/.test(queueAction));

const drain = body('drainQueue');
check('drainQueue exists', drain !== '');
check('it runs an action item', /next\.kind === 'action'/.test(drain));
check('it keeps draining after an action', /await drainQueue\(view\)/.test(drain));
// An action produces no turn, so nothing else would restart the queue.
check('it does not wait for a settle that will never come', /next\.run\(\)/.test(drain));

// --- 3. a queued /compact stays a command -------------------------------
const finder = body('findSlashCommand');
check('findSlashCommand exists', finder !== '');
check('it matches on the first word', /split\(\/\\s\+\//.test(finder));
check('it only looks at slash input', /startsWith\('\/'\)/.test(finder));

// The Ctrl+Enter path: it must not hand "/compact" to queueMessage as text.
const ctrlEnter = src.slice(src.indexOf("if (e.key === 'Enter' && e.ctrlKey)"), src.indexOf('document.addEventListener(\'click\'', src.indexOf("if (e.key === 'Enter' && e.ctrlKey)")));
check('the Ctrl+Enter path was found', ctrlEnter.length > 0);
check('it resolves a typed command before queueing', /findSlashCommand\(text\)/.test(ctrlEnter));
check('a typed /compact goes to the command, not the queue', /compactConversation\(\)/.test(ctrlEnter));
// Queuing the text itself would still be the bug for any other reason.
check('plain text still queues', /queueMessage\(text/.test(ctrlEnter));

// --- 4. the queue row shows what an action will do ----------------------
check('a queued action shows its label', /item\.kind === 'action' \? item\.label : item\.text/.test(src));

// --- 5. the strings exist in both languages -----------------------------
check('the failure string exists in English', /compactFailed: 'Could not compact/.test(src));
check('the failure string exists in Thai', /compactFailed: 'ย่อประวัติไม่สำเร็จ'/.test(src));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll compact queue checks passed');
