/**
 * Reports Thai text that spells สระอำ as two code points instead of one.
 *
 * The right character is U+0E33 (SARA AM) — the one the Thai keyboard produces
 * on the E key. The wrong spelling is U+0E4D (NIKHAHIT) followed by U+0E32
 * (SARA AA): it looks almost identical on screen, but it is a different string.
 * Search misses it, sorting is wrong, and it is a spelling error.
 *
 * Run:   node scripts/check-sara-am.js            report only (exit 0)
 *        node scripts/check-sara-am.js --strict   exit 1 when anything is found
 *        node scripts/check-sara-am.js --fix      rewrite the files in place
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** U+0E33 */
const GOOD = '\u0e33';
/** U+0E4D U+0E32 */
const BAD = '\u0e4d\u0e32';

const ROOT = path.join(__dirname, '..', '..');
const EXTS = new Set(['.md', '.js', '.html', '.css', '.json', '.yml', '.txt']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'PROVENANCE', 'shots', 'shots-model-picker']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.AGENT') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const strict = args.includes('--strict');

  let total = 0;
  const offenders = [];
  for (const file of walk(ROOT)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const count = text.split(BAD).length - 1;
    if (!count) continue;
    total += count;
    offenders.push({ file: path.relative(ROOT, file), count });
    if (fix) fs.writeFileSync(file, text.split(BAD).join(GOOD), 'utf8');
  }

  if (!offenders.length) {
    console.log('ok: every Thai สระอำ uses the single character U+0E33'.replace('\u0e33a', '\u0e33'));
    return 0;
  }

  offenders.sort((a, b) => b.count - a.count);
  for (const { file, count } of offenders) console.log(`${String(count).padStart(4)}  ${file}`);
  console.log(`\n${total} place(s) in ${offenders.length} file(s) use U+0E4D + U+0E32 instead of U+0E33`);
  if (fix) {
    console.log('rewritten in place.');
    return 0;
  }
  console.log('run with --fix to rewrite them.');
  return strict ? 1 : 0;
}

process.exit(main());