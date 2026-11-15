'use strict';

/**
 * Run the offline tests. No window, no network, no token.
 *
 * Same arrangement as NTAPI's own runner: every `src/` and `scripts/` file is
 * syntax-checked first, because an apostrophe inside a single-quoted label is
 * enough to break a file and Electron's only symptom is a dialog at startup.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const TESTS = [
  'selftest-feed.js',
  'selftest-media.js',
  'selftest-github.js',
  'selftest-config.js',
];

const scriptsDir = __dirname;
const rootDir = path.join(scriptsDir, '..');

if (process.argv.includes('--list')) {
  for (const name of TESTS) console.log(name);
  process.exit(0);
}

const missing = TESTS.filter((name) => !fs.existsSync(path.join(scriptsDir, name)));
if (missing.length) {
  console.error(`missing test script(s): ${missing.join(', ')}`);
  process.exit(1);
}

const allJs = [];
for (const dir of ['src', 'scripts']) {
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        allJs.push(full);
      }
    }
  };
  walk(path.join(rootDir, dir));
}

const badSyntax = [];
for (const file of allJs) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) badSyntax.push({ file, out: `${res.stdout || ''}${res.stderr || ''}` });
}
if (badSyntax.length) {
  console.error('');
  console.error(`${badSyntax.length} file(s) with a syntax error:`);
  for (const item of badSyntax) {
    const head = item.out.trim().split('\n').slice(0, 6).join('\n');
    console.error('');
    console.error(`--- ${path.relative(rootDir, item.file)} ---`);
    console.error(head);
  }
  process.exit(1);
}
console.log(`Syntax OK: ${allJs.length} file(s)`);

const failed = [];
for (const name of TESTS) {
  process.stdout.write(`\n=== ${name} ===\n`);
  const res = spawnSync(process.execPath, [path.join(scriptsDir, name)], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 120000,
  });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  process.stdout.write(out);
  if (res.status !== 0) failed.push({ name, status: res.status, out });
}

if (failed.length) {
  console.error(`\n${failed.length}/${TESTS.length} test script(s) failed:`);
  for (const item of failed) {
    const tail = item.out.trim().split('\n').slice(-20).join('\n');
    console.error(`\n--- ${item.name} (exit ${item.status}) ---\n${tail}`);
  }
  process.exit(1);
}

console.log(`\nPASS: all ${TESTS.length} offline test scripts passed`);
