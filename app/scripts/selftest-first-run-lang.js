/**
 * The first-run language, checked against the source.
 *
 * Two things must hold for a machine that has never run NTAPI: the window has to
 * pick Thai on a Thai Windows, and the terms card — the first thing on screen —
 * has to be switchable without leaving it. Both are wiring rather than logic, so
 * this reads the files. The mapping itself cannot run here: `main.js` needs
 * Electron to load.
 *
 * Run: node scripts/selftest-first-run-lang.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'renderer', 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/** Function body by name, brace matched. */
function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return '';
}

const initial = body(main, 'initialLang');

check('the boot answer asks for a language instead of hard-coding English', /lang: initialLang\(prefs\)/.test(main));
check('a saved choice wins', /prefs\.lang === 'en' \|\| prefs\.lang === 'th'/.test(initial));
check('an unchosen machine follows the Windows display language', /app\.getLocale\(\)/.test(initial));
check('only Thai is matched, everything else gets English', /startsWith\('th'\)/.test(initial) && /return 'en';/.test(initial));
check('a broken locale call cannot break the boot', /catch \{\}/.test(initial));

// --- the terms card can switch language without being dismissed -------------
check('the terms card has a Thai chip', /id="termsLangTh"/.test(html));
check('the terms card has an English chip', /id="termsLangEn"/.test(html));
check('the chips are inside the terms dialog', /terms-lang"[\s\S]{0,400}?id="termsLangTh"/.test(html));
check('a chip asks the app to switch language', /termsLangTh'\)\?\.addEventListener\('click', \(\) => setLanguage\('th'\)\)/.test(app.replace(/\s+/g, ' ')) || /setLanguage\('th'\)/.test(app));
check('the pressed state is painted, not left to CSS alone', /function paintTermsLang/.test(app) && /aria-pressed/.test(app));
check('the card paints its chips every time it opens', /function showTerms[\s\S]{0,400}?paintTermsLang\(\)/.test(app));
check('switching language repaints the chips too', /applyLanguage[\s\S]{0,1200}?paintTermsLang\(\)/.test(app));
check('the chips are styled and show which is active', /\.terms-lang-btn\[aria-pressed="true"\]/.test(css));

console.log(failures === 0 ? '\nAll first-run language checks passed.' : `\n${failures} first-run language check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);