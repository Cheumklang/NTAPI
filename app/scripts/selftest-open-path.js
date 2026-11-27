/**
 * Opening a file has to answer the window (2026-11-26).
 *
 * A finished video sat in the chat with its path, clicking it produced
 * "Error invoking remote method 'fs:openPath': reply was never sent" and no
 * player. The cause was `shell.openPath`: on this Linux desktop it asks the
 * desktop to launch the app and then waits for an answer that never arrives —
 * measured here at more than eight seconds for a `.txt`, a `.jpg` and an `.mp4`
 * alike, while `xdg-open` returns at once.
 *
 * So the one helper every click path uses is checked for real: the Linux branch
 * must spawn `xdg-open` detached and answer immediately, and Windows/macOS keep
 * the Electron call.
 *
 * Run: node scripts/selftest-open-path.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const source = bodyOf(main, 'openWithSystem');
check('main owns one opener for the system', Boolean(source));

function load(platform, shellStub) {
  const spawned = [];
  const fn = new Function(
    'process',
    'require',
    'shell',
    `return (${source.replace('function openWithSystem', 'function')});`
  )(
    { platform },
    () => ({
      spawn: (...args) => {
        spawned.push(args);
        return { on: () => {}, unref: () => {} };
      },
    }),
    shellStub
  );
  return { fn, spawned };
}

(async () => {
  if (source) {
    /* 1. Linux: hand it to xdg-open and be done. */
    const linux = load('linux', {
      openPath: () => {
        throw new Error('shell.openPath must not be used on Linux');
      },
    });
    const started = Date.now();
    const res = await linux.fn('/home/nt/NTAPI/sun-black-hole/sun-black-hole.mp4');
    check('linux: the call answers at once', Date.now() - started < 1000);
    check('linux: it answers ok', res?.ok === true);
    check('linux: it really runs xdg-open', linux.spawned[0]?.[0] === 'xdg-open');
    check('linux: with the path asked for', linux.spawned[0]?.[1]?.[0] === '/home/nt/NTAPI/sun-black-hole/sun-black-hole.mp4');
    check('linux: detached, so the app is not the parent that waits', linux.spawned[0]?.[2]?.detached === true);
    check('linux: it does not keep stdout open', linux.spawned[0]?.[2]?.stdio === 'ignore');

    /* 2. Windows and macOS keep the Electron call. */
    const win = load('win32', { openPath: async () => '' });
    check('windows: Electron opens it', (await win.fn('C:\\x.mp4'))?.ok === true);
    const winFail = load('win32', { openPath: async () => 'No application is associated' });
    const failed = await winFail.fn('C:\\x.mp4');
    check('windows: a refusal is reported, not swallowed', failed?.ok === false && /associated/.test(failed.error));

    /* 3. Every click path goes through it, not around it. */
    for (const [name, handler] of [
      ['fs:openPath', /ipcMain\.handle\('fs:openPath'[\s\S]{0,600}?return openWithSystem\(abs\);/],
      ['settings:reveal', /ipcMain\.handle\('settings:reveal'[\s\S]{0,600}?return await openWithSystem\(p\);/],
      ['browser:openFolder', /ipcMain\.handle\('browser:openFolder'[\s\S]{0,400}?return openWithSystem\(dir\);/],
    ]) {
      check(`${name} answers through the helper`, handler.test(main));
    }
    check(
      'nothing clicks through shell.openPath any more',
      !/await shell\.openPath\(/.test(main.replace(source, ''))
    );
  }

  if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: opening a file answers the window and leaves the launching to xdg-open');
})();
