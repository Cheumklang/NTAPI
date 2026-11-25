/**
 * Offline guard for the plan panel: a finished step must leave it, and the
 * reader must be able to close the panel by hand.
 *
 * src/renderer/app.js needs a live DOM, so this reads the source and inspects
 * renderTodos — the one function that owns both rules.
 *
 * Run: node scripts/selftest-todo-hide.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}`);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
const start = source.indexOf('function renderTodos(');
const end = source.indexOf('\n}\n', start);
const body = start === -1 ? '' : source.slice(start, end);

check('renderTodos can be read out of the renderer', Boolean(body));
check('a done step is filtered out of the rendered list', /it\.status !== 'done'/.test(body));
check('the panel hides when nothing is left to do', /!open\.length \|\| key === todosClosedKey/.test(body));
check('the head carries a close button', /class="todo-close"/.test(body));
check(
  'closing the panel keeps that list closed',
  /todosClosedKey = key;[\s\S]{0,80}?panel\.hidden = true;/.test(body)
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: a finished plan clears itself');
