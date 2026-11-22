/**
 * Light and dark themes.
 *
 * Dark is the theme this app was drawn in, and it stays the default: a fresh
 * install must open dark. Light is a choice, remembered per machine like the
 * language, and it is not a second stylesheet — every colour is a token, so light
 * re-points the tokens and no rule is duplicated.
 *
 * Two things are worth failing a build over:
 *
 *   1. A token the light theme forgets to re-point. It keeps its dark value, which
 *      is how you get dark text on a dark surface in a "light" window.
 *   2. Contrast. A theme is a set of promises about legibility, so the pairs below
 *      are measured with the WCAG 2.2 formula rather than eyeballed — 4.5:1 for
 *      body text, 3:1 for large text and for the borders that carry meaning.
 *
 * Run: node scripts/selftest-theme.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const boot = fs.readFileSync(path.join(root, 'renderer', 'theme-boot.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/* ---------------------------- colour maths --------------------------------- */

/** `#rrggbb` (or `#rgb`) to {r,g,b} in 0..255, or null. */
function parseHex(value) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** WCAG relative luminance. */
function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. */
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The declaration block of a selector, or '' when it has none. */
function block(selector) {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return close === -1 ? '' : css.slice(open + 1, close);
}

/** Every `--token: value;` pair declared inside a block. */
function tokens(selector) {
  const body = block(selector);
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const dark = tokens(':root');
const light = tokens("html[data-theme='light']");

/* ---------------------------- 1. dark is the default ---------------------- */

check('the dark palette is the base :root', Object.keys(dark).length > 15);
check('light is an override, not a second stylesheet', Object.keys(light).length > 5);
check(
  'the light block is keyed on an attribute the app can set',
  /html\[data-theme='light'\]/.test(css)
);
check('native widgets follow the app theme', /color-scheme:\s*dark/.test(block(':root')));
check('and switch with it', /color-scheme:\s*light/.test(block("html[data-theme='light']")));

// A token the light theme forgets keeps its dark value: dark text on a dark
// surface, or a code block that stays night-coloured in a white window.
const colourTokens = Object.keys(dark).filter((k) => parseHex(dark[k]));
const missed = colourTokens.filter((k) => !(k in light));
check('every colour token is re-pointed for light', missed.length === 0);
if (missed.length) console.log(`     (missing: ${missed.join(', ')})`);

for (const [name, value] of Object.entries(light)) {
  check(`light --${name} is a colour or a keyword`, Boolean(parseHex(value)) || /^[a-z-]+$/.test(value));
}

/* --------------------------- 2. contrast, measured ------------------------ */

/** Resolve a token name through a palette, following `var(--x)` once. */
function resolve(palette, name) {
  const raw = palette[name];
  if (!raw) return null;
  const varRef = /var\(--([a-z0-9-]+)\)/.exec(raw);
  if (varRef) return resolve(palette, varRef[1]);
  return parseHex(raw);
}

/** The pairs the app actually paints, and the ratio each one needs. */
const PAIRS = [
  // Body text on the two surfaces it is read on.
  ['text', 'bg', 4.5],
  ['text', 'bg-2', 4.5],
  // Muted text: timestamps, hints, the status line. Small, so AA for body text.
  ['muted', 'bg', 4.5],
  ['muted', 'bg-2', 4.5],
  ['muted-2', 'bg', 4.5],
  ['muted-soft', 'bg-2', 4.5],
  // Accents used as text: the brand name, links, the copy button label.
  ['accent', 'bg', 4.5],
  ['accent', 'bg-2', 4.5],
  ['accent-2', 'bg', 4.5],
  // The chip glyphs (EN / browser / settings / theme).
  ['chip-fg', 'bg-2', 4.5],
  // Status colours read as text in notices.
  ['danger', 'bg', 4.5],
  ['warn', 'bg', 4.5],
  ['gold', 'bg-2', 4.5],
  // Text on a raised surface: code blocks, popovers, hovered rows.
  ['text', 'surface-1', 4.5],
  ['text', 'surface-3', 4.5],
  ['muted', 'surface-2', 4.5],
  // Text on a filled control: white on a saturated fill, so the fill is its own
  // token. Without it the accent (chosen to read as text) left 3.5:1 under white.
  ['on-accent', 'accent-fill', 4.5],
  ['on-accent', 'danger-fill', 4.5],
  // Text that used to be a light literal: the window buttons, the mono text in
  // tool chips and shell headers, the guide body, and the empty-state line.
  ['titlebar-fg', 'bg-2', 4.5],
  ['titlebar-fg-hover', 'bg-2', 4.5],
  ['code-accent', 'bg-3', 4.5],
  ['file-fg', 'bg-3', 4.5],
  ['dim-fg', 'bg-2', 4.5],
];

for (const [fgName, bgName, need] of PAIRS) {
  for (const [label, palette] of [
    ['dark', dark],
    ['light', light],
  ]) {
    const fg = resolve(palette, fgName);
    const bg = resolve(palette, bgName);
    if (!fg || !bg) {
      check(`${label}: ${fgName} on ${bgName} resolves`, false);
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= need;
    check(`${label}: ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1 (needs ${need})`, ok);
  }
}

/* ----------------------- 3. the window opens in the theme ------------------ */

check('the theme is applied before the first paint', /<script src="theme-boot.js"><\/script>/.test(html));
check(
  'and before the stylesheet is parsed',
  html.indexOf('theme-boot.js') < html.indexOf('styles.css')
);
check('boot reads it synchronously', /getThemeSync\(\)/.test(boot));
// The preload exposes the bridge as `freepi`, not `api`: reading the wrong name
// made a saved theme silently ignored, which is exactly how the dark flash came
// back and how the light theme looked broken. scripts/check-shell-usable.js
// catches it in a real window; this pins the name in the source as well.
check('boot uses the name the preload actually exposes', /window\.freepi \|\| window\.api/.test(boot));
check('boot never throws on a broken prefs file', /catch\s*\{/.test(boot));
check('a value from a future version leaves dark in place', /else if \(theme === 'dark'\)/.test(boot));

check('the bridge exposes a synchronous read', /getThemeSync: \(\) =>/.test(preload));
// The theme reaches the window as a renderer argument. An earlier version asked main
// over a synchronous IPC, which deadlocked every page loaded without a main process
// answering — that is how the window checks in scripts/ load it, and they hung for a
// minute apiece. The preload must never make that call.
check('the preload never blocks on a synchronous IPC', !/sendSync/.test(preload));
check('main passes the theme as a renderer argument', /additionalArguments: \[`--ntapi-theme=\$\{readTheme\(\)\}`\]/.test(main));
check('the preload reads that argument', /--ntapi-theme=/.test(preload));
check('the window background matches the theme', /backgroundColor: readTheme\(\) === 'light'/.test(main));

/* ------------------------------ 4. prefs --------------------------------- */

check('only two themes are accepted', /const THEMES = \['dark', 'light'\];/.test(main));
check('dark is the default', /const DEFAULT_THEME = 'dark';/.test(main));
check(
  'anything else falls back to the default',
  /return THEMES\.includes\(saved\) \? saved : DEFAULT_THEME;/.test(main)
);
check('prefs:set only stores a known theme', /if \(THEMES\.includes\(patch\.theme\)\) allowed\.theme = patch\.theme;/.test(main));
check('boot reports the saved theme', /theme: readTheme\(\),/.test(main));

/* ------------------------------ 5. the button ---------------------------- */

check('the theme button exists', /id="themeBtn"/.test(html));
check('it has a moon glyph', /id="themeIconMoon"/.test(html));
check('it has a sun glyph', /id="themeIconSun"/.test(html));
check('it announces its state', /id="themeBtn"[\s\S]{0,220}aria-pressed="false"/.test(html));
check(
  'it sits in the brand row, before the Settings button',
  html.indexOf('id="themeBtn"') < html.indexOf('id="settingsBtn"') &&
    /<div class="brand">/.test(html)
);
check('that row is styled', /\.sidebar-tools \{/.test(css));
check('the row does not widen the column', /\.sidebar-tools \{[\s\S]{0,200}margin-top: -8px/.test(css));

check('clicking it switches theme', /el\('themeBtn'\)\?\.addEventListener\('click', \(\) => setTheme\(/.test(app));
check('there is a keyboard shortcut', /e\.key !== 't' && e\.key !== 'T'/.test(app));
check('the shortcut needs a modifier', /e\.ctrlKey \|\| e\.metaKey/.test(app));
check('it does not fire while typing', /\^\(INPUT\|TEXTAREA\)\$/.test(app) && /isContentEditable/.test(app));

check('the choice is saved', /await api\.setPrefs\(\{ theme \}\)/.test(app));
check('the icon shows the theme you would get', /moon\.hidden = light/.test(app) && /sun\.hidden = !light/.test(app));
check('the tooltip is translated', /themeToLight/.test(app) && /themeToDark/.test(app));
check(
  'both tooltips exist in both languages',
  (app.match(/themeToLight:/g) || []).length === 2 && (app.match(/themeToDark:/g) || []).length === 2
);

/* --------------------------- 6. no stray literals ------------------------ */

// The point of the tokens is that a theme can re-point them. A rule that paints a
// hard-coded dark hex would stay dark in a light window.
const SURFACE_LITERALS = ['#0b0e14', '#10131a', '#171b24', '#1a2030', '#202635', '#2a3143', '#8b93a7'];
const stray = SURFACE_LITERALS.filter((hex) => new RegExp(hex, 'i').test(css.slice(css.indexOf('html[data-theme=') + 2000)));
check('no rule paints a hard-coded dark surface after the palettes', stray.length === 0);
if (stray.length) console.log(`     (stray: ${stray.join(', ')})`);

/* --------- 7. no text colour may be a literal that ignores the theme -------- */

// The report was bold text and buttons that stayed white in light mode: a literal
// #fff is opaque to the palette. Only --on-accent may be white, and only because
// it is declared in both palettes.
const literalWhite = [...css.matchAll(/color:\s*#(?:fff|ffffff)\b/gi)].length;
check('no rule paints a literal white text colour', literalWhite === 0);
if (literalWhite) console.log(`     (${literalWhite} occurrence(s))`);
check('the white used on filled controls is a token', /--on-accent:\s*#ffffff/.test(css));

// The same failure in a runtime style: a hard-coded grey in app.js ignored the
// theme and made the empty-state line pale on pale.
check('app.js sets no literal text colour', !/color:\s*#[0-9a-f]{6}/i.test(app));

console.log(failures === 0 ? '\nAll theme checks passed.' : `\n${failures} theme check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);