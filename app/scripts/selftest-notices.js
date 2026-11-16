/**
 * The installer carries the licences of what it ships, and every provider card
 * links to the shop as well as the key page.
 *
 * Why this is a test and not a note in a document: MIT is a condition — the notice
 * must travel with the program. And a buy link that exists only in one language, or
 * on only four of the five cards, is the kind of thing that silently rots.
 *
 * The rendered result is measured in `scripts/check-provider-buy-links.js`; this
 * keeps the wiring and the generated notices file from drifting.
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const ROOT = path.join(APP, '..');
const read = (p) => fs.readFileSync(path.join(APP, p), 'utf8');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

check('the notices file exists at the repo root', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md')));
});

check('the notices file matches what is installed', () => {
  const { build, OUT } = require('./gen-notices.js');
  // Compared with line endings normalised: the checkout on CI is CRLF and that is
  // git's doing, not a different document.
  const onDisk = fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  assert.strictEqual(onDisk, build(), 'run: npm run notices');
});

check('the MIT packages carry their licence text', () => {
  const text = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.ok(/### @earendil-works\/pi-coding-agent/.test(text), 'pi-coding-agent is missing');
  assert.ok(/Permission is hereby granted, free of charge/.test(text), 'no MIT text at all');
  assert.ok(/All rights reserved/.test(text), 'no copyright line');
});

check('the notice states there is no affiliation and no resale', () => {
  const text = fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.md'), 'utf8');
  assert.ok(/not affiliated with, endorsed by, or sponsored/i.test(text));
  assert.ok(/ข้อกำหนดการใช้บริการ/.test(text), 'the provider terms section is missing');
});

check('the installer ships the notices file', () => {
  const pkg = JSON.parse(read('package.json'));
  const extras = (pkg.build && pkg.build.extraResources) || [];
  assert.ok(
    extras.some((e) => String(e.from || '').includes('THIRD-PARTY-NOTICES.md')),
    'extraResources does not include THIRD-PARTY-NOTICES.md',
  );
});

check('the app can open the notices it ships', () => {
  assert.ok(/ipcMain\.handle\('app:openNotices'/.test(read('src/main.js')), 'main has no handler');
  assert.ok(/openNotices:/.test(read('src/preload.js')), 'preload does not expose it');
  // The buttons are a list now (terms, privacy, licence, security, notices), so the
  // wiring is one handler over `.about-legal-links` rather than one per button.
  assert.ok(
    /querySelectorAll\('\.about-legal-links \.link-btn'\)/.test(read('src/renderer/app.js')),
    'no button wiring',
  );
});

check('every provider card has a buy link that opens that provider', () => {
  const html = read('src/renderer/index.html');
  const js = read('src/renderer/app.js');
  const expected = {
    coarena: 'https://coarena.ai/account/api',
    zro: 'https://zro.moonmath.ai/pricing',
    nvidia: 'https://build.nvidia.com/pricing',
    tokenharbor: 'https://tokenharbor.ai/pricing',
    llm7: 'https://dash.llm7.io/',
  };
  for (const [pid, url] of Object.entries(expected)) {
    assert.ok(html.includes(`id="${pid}Buy"`), `${pid} has no buy button`);
    assert.ok(html.includes(`data-i18n="${pid}Buy"`), `${pid} buy button has no label key`);
    const at = js.indexOf(`el('${pid}Buy')?.addEventListener`);
    assert.notStrictEqual(at, -1, `${pid} buy button does nothing`);
    assert.ok(js.slice(at, at + 220).includes(`api.openExternal('${url}')`), `${pid} opens ${url}?`);
  }
});

check('buy labels exist in both languages and name the site', () => {
  const js = read('src/renderer/app.js');
  for (const pid of ['coarena', 'zro', 'nvidia', 'tokenharbor', 'llm7']) {
    const hits = js.match(new RegExp(`${pid}Buy: '[^']+'`, 'g')) || [];
    assert.strictEqual(hits.length, 2, `${pid}Buy needs an English and a Thai label`);
    assert.ok(/[ก-๙]/.test(hits.find((h) => /[ก-๙]/.test(h)) || ''), `${pid}Buy has no Thai label`);
  }
});

console.log(`\n${pass} checks passed`);
