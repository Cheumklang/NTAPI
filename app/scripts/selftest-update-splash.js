/**
 * Offline check for the update hand-off — no Electron, no installer.
 *
 * The complaint this protects against: press Install, the window vanishes, and
 * nothing says whether the app is coming back. Three things have to be true for
 * that to be fixed:
 *
 *   1. the splash branch runs before the single-instance lock, otherwise the
 *      splash process would hand its argv to the running app and quit;
 *   2. the install handler starts that splash before quitting, and leaves the
 *      overlay up long enough to read;
 *   3. the next launch closes the splash and says the version moved.
 *
 * Run: node scripts/selftest-update-splash.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

const main = read('src', 'main.js');
const splash = read('src', 'update-splash.js');
const splashHtml = read('src', 'renderer', 'update-splash.html');
const app = read('src', 'renderer', 'app.js');
const preload = read('src', 'preload.js');
const html = read('src', 'renderer', 'index.html');

/* --------------------------- the splash process --------------------------- */

const branchAt = main.indexOf("process.argv.includes('--ntapi-splash')");
const lockAt = main.indexOf('requestSingleInstanceLock');
check('the splash branch exists', branchAt !== -1);
check(
  'the splash starts before the instance lock',
  branchAt !== -1 && lockAt !== -1 && branchAt < lockAt,
  `branch at ${branchAt}, lock at ${lockAt}`
);
check(
  'the branch stops the rest of main from loading',
  /--ntapi-splash'\)\) \{[\s\S]{0,200}?require\('\.\/update-splash'\)\.run\(\);[\s\S]{0,40}?return;/.test(main)
);
check('the splash only needs normal window APIs', /require\('electron'\)/.test(splash));
check('the splash takes its own userData folder', /setPath\('userData'/.test(splash));
check('the splash writes a pid so the app can close it', /writeFileSync\(pidFile\(\)/.test(splash));
check('the splash closes itself eventually', /SELF_CLOSE_MS/.test(splash) && /setTimeout\(\(\) => app\.quit\(\)/.test(splash));
check('the splash is always on top', /alwaysOnTop: true/.test(splash));
check('the splash reads the language from prefs', /prefs\.json/.test(splash) && /lang === 'th'/.test(splash));

/* ------------------------------- splash page ------------------------------- */

check('the splash page exists', splashHtml.includes('id="title"'));
check('the splash page is bilingual', /กำลังอัปเดต NTAPI/.test(splashHtml) && /Updating NTAPI/.test(splashHtml));
check('the splash page says no need to reopen', /ไม่ต้องกดเปิดใหม่/.test(splashHtml));
check('the splash page can be closed by hand', /Escape/.test(splashHtml) && /window\.close\(\)/.test(splashHtml));
check('the splash page allows no remote content', /default-src 'none'/.test(splashHtml));

/* ------------------------------ install flow ------------------------------ */

const installAt = main.indexOf("ipcMain.handle('update:install'");
const installBlock = installAt === -1 ? '' : main.slice(installAt, installAt + 900);
check('installing opens the splash', installBlock.includes('openUpdateSplash()'));
check(
  'the overlay has time to be read before quitting',
  /setTimeout\(\(\) => updater\.quitAndInstall\(true, true\), (\d{4,})\)/.test(installBlock)
);
const waitMatch = installBlock.match(/quitAndInstall\(true, true\), (\d+)\)/);
check('the wait is at least four seconds', Boolean(waitMatch) && Number(waitMatch[1]) >= 4000, waitMatch && waitMatch[1]);
check('the splash is spawned detached so it outlives the app', /detached: true/.test(main));
check('the splash is spawned from the same executable', /spawn\(process\.execPath, \['--ntapi-splash'\]/.test(main));

/* ------------------------------- next launch ------------------------------- */

check('the next launch closes a leftover splash', /closeLeftoverSplash\(\);/.test(main));
check(
  'the splash is closed before the window is created',
  main.indexOf('closeLeftoverSplash();') < main.indexOf('createWindow();')
);
check('the version move is remembered', /writePrefs\(\{ lastVersion: currentVersion \}\)/.test(main));
check('the version move is announced', /send\('app:updated'/.test(main));
check('the renderer listens for it', /api\.onAppUpdated/.test(app));
check('the preload exposes it', /onAppUpdated: on\('app:updated'\)/.test(preload));

/* --------------------------------- overlay --------------------------------- */

check('the overlay exists in the window', html.includes('id="updateOverlay"'));
check('the overlay is opened while installing', /el\('updateOverlay'\)\.hidden = false;/.test(app));
check('the overlay is cleared when installing fails', /case 'error':\s*\n\s*el\('updateOverlay'\)\.hidden = true;/.test(app));
check('the overlay text is bilingual', /updateOverlayTitle: 'กำลังอัปเดต NTAPI/.test(app) && /updateOverlayTitle: 'Updating NTAPI/.test(app));

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the update gap is covered by an overlay and a standalone splash');
