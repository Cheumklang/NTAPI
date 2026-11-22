/**
 * Offline guard for the "compacting" bar and the closed composer.
 *
 * Reported by the user: `/compact` put a yellow line on screen, the line faded
 * away after five seconds while the summary was still being written, and the
 * composer still accepted a message. Both halves of that are lies about the
 * same state — the chat is being rewritten right now — so both are pinned here:
 *
 *   1. the bar stays until the work ends (no default timeout),
 *   2. the end event is what takes it away,
 *   3. the composer refuses a send while it runs, and says why.
 *
 * Run: node scripts/selftest-compacting-bar.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}`);
    if (detail !== undefined) console.log(`     got: ${JSON.stringify(detail)}`);
  }
}

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');

/* ------------------------------ main process ---------------------------- */

check(
  'main announces the start of a compaction as running',
  /case 'compaction_start':[\s\S]{0,400}?agent:compaction', \{ running: true \}/.test(main)
);
check(
  'main announces the end of a compaction',
  /case 'compaction_end':[\s\S]{0,200}?agent:compaction', \{ running: false/.test(main)
);
check(
  'the bar is still raised from main as well',
  /agent:notice', \{ text: 'Compacting conversation…', key: 'notice\.compacting' \}/.test(main)
);

/* -------------------------------- preload ------------------------------- */

check('the bridge carries the compaction state', /onCompaction: on\('agent:compaction'\)/.test(preload));

/* -------------------------------- renderer ------------------------------ */

check(
  'the compacting notice has no timeout',
  /p\.key === 'notice\.compacting' \? 0 : undefined/.test(renderer)
);
check(
  'the end event closes the composer again',
  /api\.onCompaction\?\.\(\(p\) => \{[\s\S]{0,300}?setCompacting\(view, p\.running\)/.test(renderer)
);
check(
  'a manual compact keeps its own result line',
  /if \(view\.compactManual\) return;/.test(renderer)
);
check(
  'a send is refused while the chat is being compacted',
  /if \(view\.compacting\) \{\s*showNotice\(t\('compactingWait'\), 2600\);\s*return;\s*\}/.test(renderer)
);
check(
  'the send button is disabled while compacting',
  /sendBtn\.disabled = Boolean\(view\?\.busy\) \|\| Boolean\(view\?\.compacting\)/.test(renderer)
);
check(
  'the command locks and always unlocks (finally)',
  /setCompacting\(view, true\);/.test(renderer) &&
    /finally \{[\s\S]{0,200}?setCompacting\(view, false\);/.test(renderer)
);
check(
  'the composer says what it is waiting for',
  /input\.placeholder = on \? t\('placeholderCompacting'\)/.test(renderer)
);

/* ---------------------------------- words ------------------------------- */

const en = (key) => new RegExp(`${key}: '`).test(renderer);
check('the new strings exist in both languages', en('placeholderCompacting') &&
  (renderer.match(/placeholderCompacting:/g) || []).length === 2);
check('the refusal line exists in both languages',
  (renderer.match(/compactingWait:/g) || []).length === 2);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the compacting bar stays until the work ends and the composer stays closed');
