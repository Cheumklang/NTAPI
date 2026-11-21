/**
 * Guard rails for the update channel.
 *
 * A Windows installer is ~113 MB and the code we change between releases is a
 * few tens of KB, so an update is only quick because electron-updater can diff
 * the new installer against the previous one. Three separate settings make that
 * possible, and each one fails silently:
 *
 *   1. `nsis.differentialPackage: "store-asar"` keeps `resources/app.asar`
 *      byte-identical between builds. Without it the payload is one compressed
 *      solid member, and a one-line change invalidates nearly every block.
 *   2. The previous release must still exist, because its `.blockmap` is what
 *      the diff is computed against. Pruning down to one release turns every
 *      update into a full download.
 *   3. `dist/*.blockmap` must be uploaded with the release, and the app must
 *      actually go looking for updates on its own.
 *
 * None of that shows up in a unit test of the app code, which is exactly why it
 * needs a test of its own: the failure is measured in user download time, not in
 * an assertion.
 *
 * Run from app/:   node scripts/selftest-update-channel.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const appDir = path.join(__dirname, '..');
const repoDir = path.join(appDir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
const mainSrc = fs.readFileSync(path.join(appDir, 'src', 'main.js'), 'utf8');
const rendererSrc = fs.readFileSync(path.join(appDir, 'src', 'renderer', 'app.js'), 'utf8');
const pruneSrc = fs.readFileSync(path.join(repoDir, '.github', 'workflows', 'prune-releases.yml'), 'utf8');
const releaseSrc = fs.readFileSync(path.join(repoDir, '.github', 'workflows', 'release.yml'), 'utf8');

/* ---------------------------- the installer ---------------------------- */

check(
  'the app payload is stored uncompressed, so a small change is a small block delta',
  pkg.build?.nsis?.differentialPackage === 'store-asar',
  `nsis.differentialPackage = ${JSON.stringify(pkg.build?.nsis?.differentialPackage)}`
);

check(
  'the installer is still a plain nsis target and keeps its artifact name',
  Array.isArray(pkg.build?.win?.target) &&
    pkg.build.win.target.includes('nsis') &&
    pkg.build.win.artifactName.includes('${version}'),
  JSON.stringify(pkg.build?.win)
);

check(
  'updates are published to the public releases repo',
  pkg.build?.publish?.[0]?.provider === 'github' &&
    pkg.build.publish[0].repo === 'NTAPI-releases',
  JSON.stringify(pkg.build?.publish)
);

/* ------------------------------ the app ------------------------------- */

check(
  'the app downloads updates on its own instead of waiting for a click',
  /updater\.autoDownload\s*=\s*true/.test(mainSrc)
);

check(
  'the app checks again on a timer, not only at startup',
  /setInterval\(\s*backgroundCheck\s*,\s*CHECK_EVERY_MS\s*\)/.test(mainSrc) &&
    /setTimeout\(\s*backgroundCheck\s*,\s*FIRST_CHECK_MS\s*\)/.test(mainSrc),
  'expected the two check schedulers in setUpdates()'
);

check(
  'the check timers cannot keep the app alive',
  (mainSrc.match(/\.unref\?\.\(\)/g) || []).length >= 2
);

check(
  'a failed background check is swallowed instead of thrown',
  /check\(origin\)\.catch\(\(\) => \{\}\)/.test(mainSrc)
);

check(
  'the update panel explains that checks happen automatically',
  /updateIdle: '[^']*automatic/i.test(rendererSrc) && !/only checked when you ask/i.test(rendererSrc),
  'the English copy still promises manual checks'
);

check(
  'the download progress line spells สระอำ with one code point',
  !/\u0e4d\u0e32/.test(rendererSrc)
);

check(
  'the panel still handles every update state',
  ['available', 'downloading', 'ready', 'installing', 'error'].every((s) =>
    new RegExp(`case '${s}'`).test(rendererSrc)
  )
);

/* ---------------------------- the pipeline ---------------------------- */

check(
  'the release uploads the blockmap next to the installer',
  /dist\/\*\.blockmap/.test(releaseSrc)
);

const keepCountDefault = Number(
  /keep_count:[\s\S]{0,400}?default:\s*(\d+)/.exec(pruneSrc)?.[1] || 0
);
check(
  'pruning always keeps at least the latest two releases',
  keepCountDefault >= 2,
  `keep_count default = ${keepCountDefault}`
);

check(
  'pruning refuses a keep_count below 2',
  /keep_count must be a whole number >= 2/.test(pruneSrc)
);

check(
  'pruning still refuses an unknown version and an empty release list',
  /has no published release/.test(pruneSrc) && /is not a version like/.test(pruneSrc)
);

/* ----------------------- the twenty-release window ---------------------- */

const indexSrc = fs.readFileSync(path.join(appDir, 'src', 'renderer', 'index.html'), 'utf8');

check(
  'pruning keeps twenty releases by default',
  /keep_count:[\s\S]*?default:\s*2\b/.test(pruneSrc),
  'keep_count default is not 2'
);

check(
  'the window slides on its own after a successful release',
  /workflow_run:/.test(pruneSrc) && /workflow_run\.conclusion == 'success'/.test(pruneSrc),
  'prune no longer runs after the Release workflow'
);

check(
  'the automatic prune keeps the same number the app assumes',
  /NTAPI_UPDATE_RETENTION:-2\b/.test(pruneSrc) && /const UPDATE_RETENTION = 2\b/.test(mainSrc)
);

check(
  'the downloaded installer is kept where the next delta looks for it',
  /function keepInstallerForNextDelta\(/.test(mainSrc) &&
    /path\.join\(dir, 'pending', 'installer\.exe'\)/.test(mainSrc) &&
    /path\.join\(dir, 'installer\.exe'\)/.test(mainSrc) &&
    /keepInstallerForNextDelta\(\);/.test(mainSrc)
);

check(
  'the updater cache folder is found from app-update.yml, not guessed alone',
  /updaterCacheDirName/.test(mainSrc) && /app-update\.yml/.test(mainSrc)
);

check(
  'the updater writes its own log to a file, not to a console nobody can see',
  /updater\.logger = \{/.test(mainSrc) &&
    /path\.join\(DATA_ROOT, 'update\.log'\)/.test(mainSrc) &&
    !/updater\.logger = console/.test(mainSrc)
);

check(
  'the app asks how far behind it is before deciding to auto-download',
  /async function releasesBehindNow/.test(mainSrc) &&
    /updater\.autoDownload = !mandatory/.test(mainSrc) &&
    /behind > UPDATE_RETENTION/.test(mainSrc)
);

check(
  'an unknown release count never forces an update',
  /Number\.isFinite\(behind\) && behind > UPDATE_RETENTION/.test(mainSrc)
);

const helpers = (() => {
  const start = mainSrc.indexOf('function compareVersions(');
  const end = mainSrc.indexOf('async function releasesBehindNow(');
  if (start < 0 || end < start) return null;
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(
      `${mainSrc.slice(start, end)}\nthis.cmp = compareVersions; this.behind = releasesBehind;`,
      sandbox
    );
    return sandbox;
  } catch {
    return null;
  }
})();

check('version comparison helpers can be read out of main.js', Boolean(helpers));
if (helpers) {
  check('0.5.27 compares above 0.5.9, not below it', helpers.cmp('0.5.27', '0.5.9') > 0);
  check('a leading v makes no difference', helpers.cmp('v0.5.27', '0.5.27') === 0);
  check(
    'three newer releases count as three behind',
    helpers.behind(['v0.5.27', 'v0.5.26', 'v0.6.0'], '0.5.25') === 3
  );
  check('a missing list counts as zero behind', helpers.behind(null, '0.5.25') === 0);
}

/* --------------------------- the forced card --------------------------- */

check(
  'the required-update card exists and has no close button',
  /id="forcedUpdate"/.test(indexSrc) &&
    /id="forcedUpdateBtn"/.test(indexSrc) &&
    /id="forcedUpdateQuitBtn"/.test(indexSrc)
);

check(
  'the renderer blocks the app only for a state it is sure about',
  /function paintForcedUpdate/.test(rendererSrc) &&
    /st\?\.mandatory === true/.test(rendererSrc) &&
    /api\.quitApp\(\)/.test(rendererSrc)
);

check(
  'the update card shows the installer size before downloading',
  /size: fmtBytes\(info\?\.files\?\.\[0\]\?\.size\)/.test(mainSrc) &&
    /t\('updateSizeFull', \{ s: st\.size \}\)/.test(rendererSrc)
);
check(
  'a delta download reports its own weight',
  /got: fmtBytes\(p\?\.transferred\)/.test(mainSrc) &&
    /total: fmtBytes\(p\?\.total\)/.test(mainSrc) &&
    /updateDownloadingBytes/.test(rendererSrc) &&
    /updateReadySize/.test(rendererSrc)
);
check(
  'the forced card states the size too',
  /forcedUpdateSize/.test(rendererSrc) && /forcedUpdateSize:/.test(rendererSrc)
);
check(
  'a timer-driven check never opens the card',
  /const quiet = st\?\.origin === 'timer'/.test(rendererSrc) &&
    /!quiet &&/.test(rendererSrc)
);

check(
  'the launch check is the one allowed to show it',
  /const origin = launchCheckPending \? 'startup' : 'timer'/.test(mainSrc) &&
    /origin: 'manual'/.test(mainSrc)
);

check(
  'closing the window is the other moment it may ask',
  /askAboutUpdateOnClose/.test(mainSrc) &&
    /win\.on\('close'/.test(mainSrc) &&
    /\['available', 'ready'\]\.includes\(updateState\.status\)/.test(mainSrc)
);

check(
  'a forced update does not start downloading behind the user',
  /updater\.autoDownload = !mandatory/.test(mainSrc)
);

/* --------------------------- the coffee card --------------------------- */

check(
  'the post-update card shows the donation QR',
  /id="updateThanks"/.test(indexSrc) &&
    /id="updateThanks"[\s\S]*?qr-donation\.jpg[\s\S]*?id="updateThanksClose"/.test(indexSrc)
);

const thanksBlock = /id="updateThanks"[\s\S]*?<\/div>\s*<\/div>/.exec(indexSrc)?.[0] || '';
check(
  'the coffee QR is the same image About already uses',
  /class="about-qr-img"/.test(thanksBlock) && fs.existsSync(path.join(appDir, 'src', 'renderer', 'assets', 'qr-donation.jpg'))
);

check(
  'the app remembers which version it was on, so the card shows once',
  /writePrefs\(\{ updatedFrom: app\.getVersion\(\) \}\)/.test(mainSrc) &&
    /from === app\.getVersion\(\)\) return/.test(mainSrc) &&
    /send\('app:updated'/.test(mainSrc)
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: the update channel can still ship small deltas');
