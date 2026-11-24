/**
 * Working across more than one hand-over tab, and putting a local file into a
 * file input.
 *
 * The user's request (2026-11-21): "upload the clip to Facebook and TikTok" —
 * so the agent has to hold two tabs at once, find the right one by name, and get
 * past the one step a page can never do for itself: choosing the file.
 *
 * What must not happen is any of that widening into "the agent may touch any
 * tab": every grant is per tab, the ninth is refused, and a tab nobody handed
 * over is still refused by id.
 *
 * Run from app/:   node scripts/selftest-browser-multitab.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BROWSER_TOOLS,
  browserGuardedTools,
  createBrowserBridge,
  checkUploadFiles,
} = require('../src/browser-bridge');
const { createClaims } = require('../src/browser-claims');
const { browserToolSpecs } = require('../src/freepi-bridge');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/* ------------------------------------------------------- two tabs at once */

const claims = createClaims({});
claims.claim({ tabId: 21, url: 'https://www.facebook.com/reels/create', title: 'Facebook Reels' });
claims.claim({ tabId: 22, url: 'https://www.tiktok.com/upload', title: 'TikTok upload' });

const bridge = createBrowserBridge({});
bridge.setClaims(claims);

check('the newest tab is the default target', bridge.targetFor() .ok === true && bridge.targetFor().tabId === 22);
check('an older handed-over tab is still allowed', bridge.targetFor(21).ok === true && bridge.targetFor(21).tabId === 21);
check('both tabs are reported to the caller', bridge.claimedTabs().map((c) => c.tabId).join(',') === '21,22');

const refused = bridge.targetFor(99);
check('a tab nobody handed over is refused', refused.ok === false && refused.code === 'NOT_CLAIMED');
check('the refusal says how many tabs are held', /holding 2 tab/.test(refused.message));

claims.release(21);
check('releasing one tab leaves the other usable', bridge.targetFor(22).ok === true && bridge.targetFor(21).ok === false);
check('the default target survives a partial release', bridge.claimedTabs().length === 1);

const bare = createBrowserBridge({});
bare.setClaims(createClaims({}));
check('with nothing handed over the agent keeps its own window', bare.targetFor().ok === true && bare.targetFor().tabId === null);
check('and still refuses an id', bare.targetFor(22).ok === false);

/* --------------------------------------------------------------- the tools */

check('find_tab exists and only reads', BROWSER_TOOLS.browser_find_tab?.write === false);
check('find_tab asks Chrome for the tab list', BROWSER_TOOLS.browser_find_tab?.cmd === 'tabs-real');
check('upload is a write tool', BROWSER_TOOLS.browser_upload?.write === true);
// A page cannot fill its own file input, and "the user did not approve" was
// being said about a user who was never asked. Both are app-side truths now.
check(
  'no tab to hand over is explained instead of read as a refusal',
  (() => {
    const src = read('src/main.js');
    return /claim has no target/.test(src) && /EXTENSION_OFF/.test(src) && /NO_TAB/.test(src);
  })(),
);
check('upload speaks to the extension', BROWSER_TOOLS.browser_upload?.cmd === 'upload');
check('upload needs approval like any other write', browserGuardedTools().includes('browser_upload'));

const specs = browserToolSpecs();
const specFor = (name) => specs.find((s) => s.name === name) || {};
const findSpec = specFor('browser_find_tab');
const uploadSpec = specFor('browser_upload');
check(
  'the upload explains pages that build their input on click',
  /file picker itself/.test(uploadSpec.description || ''),
  uploadSpec.description,
);
const openSpec = specFor('browser_open');

check('find_tab tells the model what to type', /url or title/i.test(findSpec.description || ''));
check('find_tab takes the text to look for', findSpec.parameters?.properties?.match?.type === 'string');
check('every bridge tool still has a unique command', new Set(specs.map((s) => s.cmd)).size === specs.length);
check('upload takes file paths', uploadSpec.parameters?.properties?.files?.type === 'array');
check('upload takes the ref of the input', uploadSpec.parameters?.properties?.ref?.type === 'string');
check('upload says it reads from disk and asks', /approval/i.test(uploadSpec.description || ''));
check('open lands in the tab already in hand', /handed over it is navigated in place/.test(openSpec.description || ''));
check('open never asks for a second window', !openSpec.parameters?.properties?.window);

/* ------------------------------------------------------------- file checks */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-upload-'));
const clip = path.join(dir, 'clip.mp4');
fs.writeFileSync(clip, Buffer.alloc(2048, 7));
const empty = path.join(dir, 'empty.mp4');
fs.writeFileSync(empty, '');

check('an absolute, real file passes', checkUploadFiles([clip]).ok === true);
check('and comes back absolute', checkUploadFiles([clip]).files?.[0] === path.resolve(clip));
check('a relative path is refused', checkUploadFiles(['clip.mp4']).code === 'BAD_ARGS');
check('a missing file is refused', checkUploadFiles([path.join(dir, 'nope.mp4')]).code === 'NO_FILE');
check('a directory is refused', checkUploadFiles([dir]).code === 'NO_FILE');
check('an empty file is refused', checkUploadFiles([empty]).code === 'BAD_ARGS');
check('nothing at all is refused', checkUploadFiles([]).code === 'BAD_ARGS');
check('a blank string is not a file', checkUploadFiles(['   ']).code === 'BAD_ARGS');
const many = Array.from({ length: 6 }, (_, i) => {
  const file = path.join(dir, `clip${i}.mp4`);
  fs.writeFileSync(file, 'x');
  return file;
});
check('more than five files is refused', checkUploadFiles(many).code === 'BAD_ARGS');

/* ------------------------------------------------- what the pieces contain */

const ext = read('browser-extension/background.js');
check('the extension answers an upload command', /case 'upload':\n\s*return uploadFiles\(args\);/.test(ext));
check('the file goes in through the debugger', /DOM\.setFileInputFiles/.test(ext));
check('a non-file input is refused, not guessed at', /NO_FILE_INPUT/.test(ext));
check('upload waits for the page to react', /await settleAfterAction\(tabId\)/.test(ext));
check('tab listing can be narrowed by text', /args\.match/.test(ext) && /matched: rows\.length/.test(ext));
check(
  'open works in the user window, in a collapsed group',
  /userWindowId\(\)/.test(ext) && /placeInGroup/.test(ext) && /collapsed: true/.test(ext)
);

const mainSrc = read('src/main.js');
check('the app pushes the whole hand-over list', /claims: browserClaims\.list\(\)/.test(mainSrc));
check('one tab can be taken back on its own', /releaseBrowserTab\('user', tabId\)/.test(mainSrc));
check('a closed tab releases only itself', /releaseBrowserTab\('tabClosed', event\.tabId\)/.test(mainSrc));

/* ------------------------------------- a tab the agent opened for itself */

// The user's report (2026-11-21): "the extension cannot go to another website on
// its own". Opening it worked, but the tab was not covered by any hand-over, so
// the snapshot that follows the open — and every later read — was refused.
const mine = createClaims({});
const ownBridge = createBrowserBridge({});
ownBridge.setClaims(mine);

check('nothing is usable before a tab is opened or handed over', ownBridge.targetFor(5).ok === false && ownBridge.targetFor().tabId === null);

mine.own({ tabId: 5, url: 'https://example.com/', title: 'Example Domain' });
check('a tab the agent opened is usable by its id', ownBridge.targetFor(5).ok === true && ownBridge.targetFor(5).tabId === 5);
check('a tab the agent did not open is still refused', ownBridge.targetFor(6).ok === false && ownBridge.targetFor(6).code === 'NOT_CLAIMED');
check('with no hand-over the opened tab becomes the default', ownBridge.targetFor().tabId === 5);
check('an opened tab is reported as owned, not as handed over', mine.isOwned(5) === true && mine.isClaimed(5) === false);

mine.claim({ tabId: 21, url: 'https://www.facebook.com/reels/create', title: 'Facebook Reels' });
check('a hand-over still wins as the default tab', ownBridge.targetFor().tabId === 21);
check('the opened tab stays usable next to it', ownBridge.targetFor(5).ok === true);

mine.disown(5);
check('closing the tab takes the permission with it', ownBridge.targetFor(5).ok === false);

for (let i = 100; i < 120; i += 1) mine.own({ tabId: i, url: `https://site${i}.example/` });
check('the owned list is bounded, oldest forgotten first', mine.ownedList().length === mine.MAX_OWNED && mine.isOwned(119) && !mine.isOwned(100));

const bridgeSrc = read('src/browser-bridge.js');
check('opening a tab records it as the agent\'s own', /rememberOwnership\(cmd, callArgs, result\)/.test(bridgeSrc) && /cmd === 'open'/.test(bridgeSrc));
check('closing a tab forgets it', /cmd === 'close'/.test(bridgeSrc) && /claims\.disown\(id\)/.test(bridgeSrc));

const prompt = read('src/freepi-bridge.js');
check('the prompt says a site with no tab is reachable', /call browser_open with the URL/.test(prompt));
check('the prompt no longer forbids opening its own tabs', !/Do not guess URLs or open your own tabs/.test(prompt));
check('the prompt names the two kinds of usable tab', /tabs the user handed over, or tabs you opened yourself/.test(prompt));
check(
  'browser_open no longer claims it needs a hand-over',
  !/Requires a tab handed over first/.test(prompt) && /collapsed NTAPI tab group/.test(prompt)
);

const preload = read('src/preload.js');
check('the window can release one tab', /browserRelease: \(tabId\) => ipcRenderer\.invoke\('browser:release', \{ tabId \}\)/.test(preload));

const renderer = read('src/renderer/app.js');
check('the renderer keeps a list of handed-over tabs', /let browserClaims = \[\]/.test(renderer));
check('each row can be released on its own', /function releaseOneTab\(tabId\)/.test(renderer));
check('the chip shows handed-over when any tab is held', /browserClaims\.length\s*\?\s*'claimed'/.test(renderer));
check(
  'both languages name the per-tab release',
  (renderer.match(/browserReleaseTab:/g) || []).length === 2
);

fs.rmSync(dir, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: several tabs can be held at once, the right one is findable, and a file can be attached');
