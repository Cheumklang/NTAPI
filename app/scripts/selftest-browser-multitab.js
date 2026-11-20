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
check('upload speaks to the extension', BROWSER_TOOLS.browser_upload?.cmd === 'upload');
check('upload needs approval like any other write', browserGuardedTools().includes('browser_upload'));

const specs = browserToolSpecs();
const specFor = (name) => specs.find((s) => s.name === name) || {};
const findSpec = specFor('browser_find_tab');
const uploadSpec = specFor('browser_upload');
const openSpec = specFor('browser_open');

check('find_tab tells the model what to type', /url or title/i.test(findSpec.description || ''));
check('find_tab takes the text to look for', findSpec.parameters?.properties?.match?.type === 'string');
check('every bridge tool still has a unique command', new Set(specs.map((s) => s.cmd)).size === specs.length);
check('upload takes file paths', uploadSpec.parameters?.properties?.files?.type === 'array');
check('upload takes the ref of the input', uploadSpec.parameters?.properties?.ref?.type === 'string');
check('upload says it reads from disk and asks', /approval/i.test(uploadSpec.description || ''));
check(
  'open can target the window the user is looking at',
  (openSpec.parameters?.properties?.window?.enum || []).join(',') === 'agent,user'
);

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
check('open can adopt the user window', /wantsUserWindow/.test(ext) && /userWindowId\(\)/.test(ext));

const mainSrc = read('src/main.js');
check('the app pushes the whole hand-over list', /claims: browserClaims\.list\(\)/.test(mainSrc));
check('one tab can be taken back on its own', /releaseBrowserTab\('user', tabId\)/.test(mainSrc));
check('a closed tab releases only itself', /releaseBrowserTab\('tabClosed', event\.tabId\)/.test(mainSrc));

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
