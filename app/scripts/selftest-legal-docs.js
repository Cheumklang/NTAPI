#!/usr/bin/env node
/*
 * The legal documents have to reach the person using the program.
 *
 * A licence that says "use is governed by TERMS.md and PRIVACY.md" is worthless
 * if the installer never carries those files and the program has no way to open
 * them: the reader agreed to something they were never shown. This checks the
 * whole path — file exists, ships in the installer, main process will open it,
 * About links to it with a working handler — without launching Electron.
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROOT = path.join(APP, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const pkg = JSON.parse(read(path.join(APP, 'package.json')));
const main = read(path.join(APP, 'src', 'main.js'));
const preload = read(path.join(APP, 'src', 'preload.js'));
const renderer = read(path.join(APP, 'src', 'renderer', 'app.js'));
const html = read(path.join(APP, 'src', 'renderer', 'index.html'));

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

const DOCS = ['LICENSE', 'TERMS.md', 'PRIVACY.md', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md'];

check('all five documents exist at the repository root', () => {
  for (const doc of DOCS) {
    const file = path.join(ROOT, doc);
    assert.ok(fs.existsSync(file), `${doc} is missing`);
    assert.ok(fs.statSync(file).size > 500, `${doc} is empty`);
  }
});

check('every document ships inside the installer', () => {
  const shipped = (pkg.build.extraResources || []).map((e) => e.to);
  for (const doc of DOCS) assert.ok(shipped.includes(doc), `${doc} is not in extraResources`);
});

check('the licence names the documents it is governed by', () => {
  const licence = read(path.join(ROOT, 'LICENSE'));
  assert.match(licence, /TERMS\.md/);
  assert.match(licence, /PRIVACY\.md/);
  assert.match(licence, /THIRD-PARTY-NOTICES\.md/);
});

check('the main process opens only the documents it ships', () => {
  const set = /const SHIPPED_DOCS = new Set\(\[([^\]]*)\]\)/.exec(main);
  assert.ok(set, 'no allowlist');
  for (const doc of DOCS) assert.ok(set[1].includes(`'${doc}'`), `${doc} is not allowed`);
  assert.match(main, /app:openDoc/);
  // A renderer-named path would be a way out of the resources folder.
  assert.ok(!/openShippedDoc\(doc\)[\s\S]{0,80}path\.join\([^)]*doc\)/.test(main) || /SHIPPED_DOCS\.has/.test(main));
  assert.match(main, /if \(!SHIPPED_DOCS\.has\(doc\)\)/);
});

check('the preload exposes openDoc and nothing wider', () => {
  assert.match(preload, /openDoc: \(name\) => ipcRenderer\.invoke\('app:openDoc'/);
});

check('About links to every document, with the right name', () => {
  for (const doc of DOCS) {
    assert.ok(html.includes(`data-doc="${doc}"`), `no link for ${doc}`);
  }
  assert.ok(html.includes('about-legal-links'), 'the links are not grouped');
});

check('the links are wired in the renderer', () => {
  assert.match(renderer, /querySelectorAll\('\.about-legal-links \.link-btn'\)/);
  assert.match(renderer, /api\.openDoc\?\.\(doc\)/);
});

check('the program shows its own copyright line', () => {
  assert.match(html, /about-copyright[^>]*>© 2026 Chanathip Cheumklang/, 'no © line in About');
});

check('every About link has a label in both languages', () => {
  for (const key of ['aboutTermsOpen', 'aboutPrivacyOpen', 'aboutLicenceOpen', 'aboutSecurityOpen', 'aboutNoticesOpen']) {
    const hits = renderer.split(`${key}:`).length - 1;
    assert.strictEqual(hits, 2, `${key} is not translated twice`);
  }
});

check('the privacy notice covers the browser extension', () => {
  const privacy = read(path.join(ROOT, 'PRIVACY.md'));
  assert.match(privacy, /ส่วนขยายเบราว์เซอร์/);
  assert.match(privacy, /<all_urls>/);
  assert.match(privacy, /Browser extension/);
});

check('the privacy notice reports facts the program actually keeps', () => {
  const privacy = read(path.join(ROOT, 'PRIVACY.md'));
  for (const fact of ['45 วินาที', 'NTAPI_DATA_DIR', 'safeStorage', 'ntapi-presence.onrender.com']) {
    assert.ok(privacy.includes(fact), `privacy notice does not mention ${fact}`);
  }
});

check('the terms say what the licence and the app say', () => {
  const terms = read(path.join(ROOT, 'TERMS.md'));
  for (const fact of ['ไม่มีส่วนเกี่ยวข้อง', 'คีย์ API ของคุณเอง', 'as is', 'กฎหมายไทย']) {
    assert.ok(terms.includes(fact), `terms do not mention ${fact}`);
  }
});

check('the terms are shown before the program is used, not only linked from About', () => {
  assert.ok(html.includes('id="termsOverlay"'), 'no first-run terms card');
  assert.ok(html.includes('id="termsAccept"'), 'no accept button');
  assert.ok(/data-doc="TERMS\.md"/.test(html), 'the card does not open the terms');
  assert.ok(/data-doc="PRIVACY\.md"/.test(html), 'the card does not open the privacy notice');
  // Dismissing it without accepting would make the recorded answer meaningless.
  assert.ok(!/id="termsOverlay"[\s\S]{0,400}?(settingsClose|dialog-close)/.test(html), 'the card has a close button');
  // Refusing has to be a real answer, not a dead end.
  assert.ok(html.includes('id="termsDecline"'), 'no decline button');
  for (const key of ['termsAccept', 'termsDecline', 'termsTitle']) {
    assert.strictEqual(renderer.split(`${key}:`).length - 1, 2, `${key} is not translated twice`);
  }
});

check('refusing the terms closes the program', () => {
  assert.match(renderer, /termsDecline[\s\S]{0,320}quitApp/, 'the button does nothing');
  assert.match(preload, /quitApp: \(\) => ipcRenderer\.invoke\('app:quit'\)/);
  assert.match(main, /ipcMain\.handle\('app:quit'[\s\S]{0,120}app\.quit\(\)/);
});

check('acceptance is remembered against the document date, and only that', () => {
  const date = /\*\*ปรับปรุงล่าสุด:\*\*[^\n]*\((\d{4}-\d{2}-\d{2})\)/.exec(read(path.join(ROOT, 'TERMS.md')));
  assert.ok(date, 'TERMS.md has no "ปรับปรุงล่าสุด" date');
  assert.ok(
    renderer.includes(`const TERMS_VERSION = '${date[1]}'`),
    `TERMS_VERSION does not match the document date ${date[1]}`,
  );
  assert.match(renderer, /termsAccepted: TERMS_VERSION/, 'acceptance is not written');
  assert.match(renderer, /if \(!termsAccepted\(\)\) showTerms\(\)/, 'the card is never shown');
  // prefs is a settings file: only a date may be stored, never free text.
  assert.match(main, /patch\.termsAccepted/);
  assert.match(main, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
});

check('the first-run guide waits until the terms are accepted', () => {
  const guide = /function maybeShowGuide\(\) \{[\s\S]{0,220}/.exec(renderer);
  assert.ok(guide, 'maybeShowGuide is gone');
  assert.ok(guide[0].includes('termsAccepted()'), 'the guide can start while the card is up');
});

check('the privacy notice states how long data is kept', () => {  const privacy = read(path.join(ROOT, 'PRIVACY.md'));
  assert.match(privacy, /ระยะเวลาเก็บรักษาข้อมูล/, 'no retention section');
  assert.match(privacy, /crash\.log/, 'retention does not cover the crash log');
  assert.match(privacy, /Retention:/, 'the English summary says nothing about retention');
});

check('the privacy notice lists the currency lookup the cost line needs', () => {
  const privacy = read(path.join(ROOT, 'PRIVACY.md'));
  assert.match(privacy, /open\.er-api\.com/, 'the USD→THB lookup is not disclosed');
  assert.match(privacy, /USD→THB/, 'the reason for the lookup is not stated');
  assert.match(privacy, /Currency:/, 'the English summary says nothing about the lookup');
});

check('the privacy notice uses the PDPA age rule, not the United States one', () => {
  const privacy = read(path.join(ROOT, 'PRIVACY.md'));
  assert.match(privacy, /มาตรา 20/, 'the age rule cites no PDPA section');
  assert.ok(!/13 ปีขึ้นไป/.test(privacy), 'still uses the 13-year COPPA rule');
});

check('the terms cap liability and carry the standard clauses', () => {
  const terms = read(path.join(ROOT, 'TERMS.md'));
  for (const fact of ['เพดานความรับผิด', 'การชดใช้ค่าเสียหาย', 'แยกส่วนได้', 'ข้อตกลงทั้งหมด', 'การโอนสิทธิ']) {
    assert.ok(terms.includes(fact), `terms do not mention ${fact}`);
  }
  assert.match(terms, /1,000 บาท/, 'the cap has no figure');
  assert.match(terms, /ขอให้คุณยอมรับอีกครั้ง/, 'a change of terms is never accepted again');
});

if (fail) {
  console.log(`\n${fail} check(s) failed`);
  process.exit(1);
}
console.log(`\n${pass} checks passed`);
