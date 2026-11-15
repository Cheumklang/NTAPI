/**
 * The sponsor strip: what it is allowed to show, and how it is wired.
 *
 * The strip is the one piece of the interface that is not really ours — it is a
 * sponsor's words and a sponsor's address. Two things therefore have to hold:
 *
 * 1. A file we did not write can only ever produce a strip we would have drawn
 *    ourselves. `normalize()` drops anything doubtful, so the worst case of a
 *    hand-edited typo is a missing link, never a javascript: URL one click away
 *    from a user who trusts the app.
 * 2. It stays small and out of the way: last in the sidebar, two lines, no
 *    image, no motion.
 *
 * Run: node scripts/selftest-sponsor.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { normalize, MAX_TEXT } = require('../src/sponsor');

const src = path.join(__dirname, '..', 'src');
const renderer = path.join(src, 'renderer');
const main = fs.readFileSync(path.join(src, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(src, 'preload.js'), 'utf8');
const app = fs.readFileSync(path.join(renderer, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(renderer, 'styles.css'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(src, 'sponsor.json'), 'utf8'));

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const good = () => ({
  enabled: true,
  id: 'term24hr',
  url: 'https://www.term24hr.in.th/',
  text: { th: { label: 'ผู้สนับสนุน', title: 'เติมเกมราคาถูก' } },
});

// ---------------------------------------------------------------- the config

check('the shipped sponsor config is valid', normalize(config) !== null);

const ok = normalize(good());
check('a valid entry survives', ok && ok.enabled === true && ok.id === 'term24hr');
check('the url is normalised through URL()', ok && ok.url === 'https://www.term24hr.in.th/');
check('english falls back to thai when absent', ok && ok.text.en.label === ok.text.th.label);

// Anything we cannot vouch for has to disappear, not be guessed at.
check('disabled means no strip', normalize({ ...good(), enabled: false }) === null);
check('a missing enabled flag is not consent', normalize({ ...good(), enabled: 'yes' }) === null);
check('http is rejected', normalize({ ...good(), url: 'http://www.term24hr.in.th/' }) === null);
check('javascript: is rejected', normalize({ ...good(), url: 'javascript:alert(1)' }) === null);
check('file: is rejected', normalize({ ...good(), url: 'file:///C:/Windows' }) === null);
check('a bare host with no dot is rejected', normalize({ ...good(), url: 'https://intranet/' }) === null);
check('garbage instead of a url is rejected', normalize({ ...good(), url: 42 }) === null);
check('no id means no strip', normalize({ ...good(), id: '   ' }) === null);
check('an over-long id is rejected', normalize({ ...good(), id: 'x'.repeat(65) }) === null);
check('thai text is required', normalize({ ...good(), text: {} }) === null);
check('a half-filled slot is rejected', normalize({
  ...good(), text: { th: { label: 'ผู้สนับสนุน', title: '  ' } },
}) === null);
check('null is not a config', normalize(null) === null);
check('an array is not a config', normalize([]) === null);

const longTitle = normalize({
  ...good(),
  text: { th: { label: 'ผู้สนับสนุน', title: 'ก'.repeat(300) } },
});
check('a long title is capped', longTitle && [...longTitle.text.th.title].length === MAX_TEXT);
check('a capped title ends in an ellipsis', longTitle && longTitle.text.th.title.endsWith('\u2026'));
// Counting code points keeps a Thai tone mark attached to its consonant; a plain
// slice would cut between them and change the word.
const thaiCut = normalize({
  ...good(),
  text: { th: { label: 'ผู้สนับสนุน', title: 'กำลัง'.repeat(40) } },
});
check('thai is cut on code points, not UTF-16 units', thaiCut && !/[\u0e31\u0e34-\u0e3a]$/.test(thaiCut.text.th.title));
check('whitespace in the copy is flattened', (() => {
  const flat = normalize({ ...good(), text: { th: { label: 'ผู้สนับสนุน', title: 'เติม\n  เกม' } } });
  return flat && flat.text.th.title === 'เติม เกม';
})());

// ------------------------------------------------------------ main process

check('main reads sponsor.json from its own folder', /SPONSOR_PATH = path\.join\(__dirname, 'sponsor\.json'\)/.test(main));
check('main validates through the pure module', /normalizeSponsor\(raw\)/.test(main));
check('a broken file falls back to nothing', /function readBundledSponsor\(\)[\s\S]{0,600}?catch \{\s*return null;\s*\}/.test(main));
check('there is a sponsor:get channel', /ipcMain\.handle\('sponsor:get'/.test(main));
check('there is a sponsor:click channel', /ipcMain\.handle\('sponsor:click'/.test(main));
// The creative is fetched per slot, so the strip can be drawn from the feed
// without downloading eight videos first.
check('there is a sponsor:media channel', /ipcMain\.handle\('sponsor:media'/.test(main));
check('the feed is primed from cache before the window is drawn', /primeSponsorCache\(\)/.test(main));

const clickHandler = main.slice(main.indexOf("ipcMain.handle('sponsor:click'"), main.indexOf("ipcMain.handle('app:openExternal'"));
check('a click is counted before the browser opens', (() => {
  const writeAt = clickHandler.indexOf('writePrefs');
  const openAt = clickHandler.indexOf('shell.openExternal');
  return writeAt !== -1 && openAt !== -1 && writeAt < openAt;
})());
// The id must resolve to a slot in the feed we validated; the renderer cannot
// invent a destination.
check('the click must name a slot from the feed', /findSlot\(rawId\)/.test(clickHandler));
check('the opened url comes from the feed, not the renderer', /shell\.openExternal\(slot\.url\)/.test(clickHandler));
check('a failed prefs write does not block the link', /catch \{\}/.test(clickHandler));

// ------------------------------------------------------------- renderer

check('preload exposes sponsorGet', /sponsorGet: \(\) => ipcRenderer\.invoke\('sponsor:get'\)/.test(preload));
check('preload exposes sponsorClick', /sponsorClick: \(id\) => ipcRenderer\.invoke\('sponsor:click'/.test(preload));
check('boot asks for the sponsor config', /\n  initSponsor\(\);/.test(app));
// The slot is chosen at paint time now, so the click has to read the id from the
// slot on screen rather than from the (gone) single config.
check('the click goes through the counted channel', /api\.sponsorClick\(slot\.id\)/.test(app));
check('the renderer never picks the url itself', !/openExternal\(sponsor\.url\)/.test(app));
check('switching language repaints the strip', /paintSponsor\(\)/.test(app.slice(app.indexOf('function applyLanguage'))));

// ---------------------------------------------------------------- the slot

const slotAt = html.indexOf('id="sponsorSlot"');
check('the slot exists in the sidebar', slotAt !== -1);
check('the slot starts hidden', /class="section sponsor" id="sponsorSlot" hidden/.test(html));
// `.section` sets `display: flex`, and a class rule beats the browser's own
// `[hidden] { display: none }`. Without an explicit override the empty strip
// keeps its padding and would occupy space while the sponsor is off.
check('the hidden attribute truly hides the strip', /\.section\.sponsor\[hidden\] \{ display: none; \}/.test(css));
check('the slot is the last thing in the sidebar', (() => {
  if (slotAt === -1) return false;
  const asideEnd = html.indexOf('</aside>');
  const usageEnd = html.indexOf('id="refreshUsage"');
  return asideEnd > slotAt && slotAt > usageEnd;
})());
check('the slot is a button, so it is reachable by keyboard', /class="sponsor-card" id="sponsorCard"/.test(html));
// The creative is a real element now, but it is filled from a data URL by the
// renderer: an `src` written into the markup would be a remote fetch on boot,
// which is exactly what must not happen.
check('the media band exists', /class="sponsor-media" id="sponsorMedia"/.test(html));
check('the markup never carries a media source', !/id="sponsorMedia"[^>]*src=/.test(html));
check('the markup starts with the media band hidden', /id="sponsorMedia"[^>]*hidden/.test(html));

const sponsorRule = (() => {
  const at = css.indexOf('.section.sponsor {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the slot has a style', sponsorRule !== '');
check('the slot never grows', /flex:\s*0 0 auto/.test(sponsorRule));
check('the slot is separated from the status panel', /border-top:\s*1px/.test(sponsorRule));

const textRule = (() => {
  const at = css.indexOf('.sponsor-text {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the copy cannot wrap to a third line', /white-space:\s*nowrap/.test(textRule));
check('a too-long copy is ellipsised', /text-overflow:\s*ellipsis/.test(textRule));

const sponsorBlock = css.slice(css.indexOf('/* ---------------- sponsor strip'), css.indexOf('.usage { border-top'));
// A clip is allowed to play, but nothing loops for the sake of decoration, and
// no CSS animation may run behind the text.
check('the strip itself does not animate', !/animation|@keyframes/.test(sponsorBlock));

// The frame the creative is cropped into: 2:1 and cover, so every banner reads
// as the same size whatever shape the sponsor sent.
const mediaRule = (() => {
  const at = css.indexOf('.sponsor-media {');
  if (at === -1) return '';
  return css.slice(at, css.indexOf('}', at));
})();
check('the media band is a 2:1 frame', /aspect-ratio:\s*2\s*\/\s*1/.test(mediaRule));
check('the media never squashes', /object-fit:\s*cover/.test(css));
// Height comes from the ratio the feed asks for and the sidebar width, never
// from a number that would fight the resizer. A cap is allowed and wanted: it is
// what stops a tall 4:5 banner from eating the session list in a short window.
check('the strip takes its height from the ratio', !/(?<!max-)height:\s*\d+px/.test(sponsorBlock));
check('a tall banner is capped so it cannot eat the column', /max-height:\s*\d+px/.test(mediaRule));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll sponsor strip checks passed');
