/**
 * The window's markup has to nest correctly.
 *
 * A single stray `</div>` closes its parent early, and everything after it becomes
 * a sibling of the app shell instead of a child: the sidebar ended right after the
 * theme button, so the workspace picker, the chat list, the status panel and the
 * composer all fell out of the layout, and the window opened with nothing that
 * could be clicked or typed into. Nothing in the CSS was wrong and every script
 * ran; only the markup was.
 *
 * That is cheap to check and expensive to miss, so this test walks index.html with
 * a tag stack and then asserts where the few elements that must nest actually are.
 *
 * Run: node scripts/selftest-markup-structure.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Elements that never take a closing tag. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Walk every tag outside comments, keeping a stack of open elements and recording
 * the chain of ancestors for the elements that carry an id or a class of interest.
 *
 * @returns {{ errors: string[], ancestors: Map<string, string[]>, tagCount: number }}
 */
function walk(source) {
  const errors = [];
  const stack = [];
  const ancestors = new Map();
  let tagCount = 0;

  // Strip comments first: they hold markup examples that are not part of the tree.
  const clean = source.replace(/<!--[\s\S]*?-->/g, '');

  const tagRe = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const attrs = m[3] || '';
    tagCount += 1;

    if (VOID.has(name)) continue;
    // A self-closed tag (`<div />`) is legal in JSX and parsed as a child here.
    if (attrs.trimEnd().endsWith('/')) continue;

    if (!closing) {
      // Remember where the interesting elements live, by id and by class.
      const chain = stack.map((s) => s.label).filter(Boolean);
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
      const cls = /\bclass="([^"]+)"/.exec(attrs)?.[1];
      if (id) ancestors.set(`#${id}`, chain);
      if (cls) {
        for (const c of cls.split(/\s+/).filter(Boolean)) {
          if (!ancestors.has(`.${c}`)) ancestors.set(`.${c}`, chain);
        }
      }
      stack.push({ name, label: id ? `#${id}` : cls ? `.${cls.split(/\s+/)[0]}` : '' });
    } else {
      const top = stack.pop();
      if (!top) {
        errors.push(`a closing </${name}> appears with nothing open`);
        continue;
      }
      if (top.name !== name) {
        errors.push(`</${name}> closes <${top.name}${top.label ? ` ${top.label}` : ''}> instead`);
      }
    }
  }

  for (const open of stack) errors.push(`<${open.name}${open.label ? ` ${open.label}` : ''}> is never closed`);
  return { errors, ancestors, tagCount };
}

const { errors, ancestors, tagCount } = walk(html);

check('the file has markup to walk', tagCount > 200);
check('every tag nests and closes', errors.length === 0);
if (errors.length) for (const e of errors.slice(0, 8)) console.log(`     ${e}`);

/** True when `child` sits somewhere inside `parent`. */
function inside(child, parent) {
  const chain = ancestors.get(child);
  return Boolean(chain && chain.includes(parent));
}

/* ---------- the shell has to stay the shell ---------- */

check('the sidebar is inside the app shell', inside('#sidebar', '#app'));
check('the main column is a sibling of the sidebar, not a child of it', !inside('#main', '#sidebar'));
check('the composer is inside the main column', inside('#composer', '#main'));
check('the composer is not inside the sidebar', !inside('#composer', '#sidebar'));
check('the transcript is inside the main column', inside('#transcript', '#main'));

// The failure that started this: the sidebar used to close right after the theme
// button, taking every control below it out of the column.
check('the workspace picker is still in the sidebar', inside('#pickFolder', '#sidebar'));
check('the saved-chat list is still in the sidebar', inside('#sessionList', '#sidebar'));
check('the status panel is still in the sidebar', inside('#browserBtn', '#sidebar'));

/* ---------- the theme and browser chips' homes ---------- */

// The user asked for these two to trade places: the light/dark toggle went up to
// the brand row beside the language chip, and the browser control came down to
// the tools row beside the workspace chip.
check('the theme button exists once', (html.match(/id="themeBtn"/g) || []).length === 1);
check('the browser button exists once', (html.match(/id="browserBtn"/g) || []).length === 1);
check('the theme button lives in the brand row', inside('#themeBtn', '.brand'));
check('the theme button is not in the tools row', !inside('#themeBtn', '.sidebar-tools'));
check('the browser button lives in the tools row', inside('#browserBtn', '.sidebar-tools'));
check('the browser button is not in the brand row', !inside('#browserBtn', '.brand'));
check('the tools row sits right after the brand row', inside('.sidebar-tools', '#sidebar'));
check(
  'the tools row comes after the Settings button',
  html.indexOf('id="settingsBtn"') < html.indexOf('class="sidebar-tools"')
);

/* ---------- the scripts that must load ---------- */

check(
  'the theme boot script is inside <head>',
  html.indexOf('theme-boot.js') < html.indexOf('</head>') && html.indexOf('theme-boot.js') > 0
);
check('it loads before the app script', html.indexOf('theme-boot.js') < html.indexOf('src="app.js"'));
check(
  'the app script loads last',
  html.indexOf('<script', html.indexOf('src="app.js"')) === -1
);

console.log(
  failures === 0 ? '\nAll markup-structure checks passed.' : `\n${failures} markup-structure check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);