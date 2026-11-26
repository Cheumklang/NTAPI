/**
 * The chat background: a picture the user picks, and nothing else.
 *
 * The risk here is not the wallpaper — it is the pref behind it. A stored path
 * would let the renderer name any file on the disk and have the main process read
 * it back into the window. The picture is therefore copied into the app's own
 * folder and prefs only ever holds a name this process made.
 *
 * Run from app/:   node scripts/selftest-chat-background.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src/preload.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/renderer/styles.css'), 'utf8');

/* ------------------------------------------------------------ the picker */

check('the picker and its removal are exposed to the window', /pickChatBackground:/.test(preload) && /clearChatBackground:/.test(preload));
check(
  'both reach a real handler in the main process',
  /ipcMain\.handle\('fs:pickChatBackground'/.test(main) && /ipcMain\.handle\('fs:clearChatBackground'/.test(main)
);
check('the dialog only offers pictures', /filters: \[\{ name: 'Images', extensions: \['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'\] \}\]/.test(main));
check('the dialog is opened in the app theme first', /nativeTheme\.themeSource = readTheme\(\);/.test(main));

/* --------------------------------------------- what prefs is allowed to say */

const nameRule = /const CHAT_BACKGROUND_NAME = (\/[^/]+\/[a-z]*);/.exec(main);
check('prefs values are checked against a name rule', Boolean(nameRule));
if (nameRule) {
  // Built the way main.js builds it, so the test uses the real pattern.
  const rule = new RegExp(nameRule[1].replace(/^\/|\/\w*$/g, ''), '');
  check('a name this app made is accepted', rule.test('background-mf3k2.jpg') && rule.test('background-1a2b.webp'));
  check(
    'a path, a traversal or a foreign file is refused',
    !rule.test('/etc/passwd') &&
      !rule.test('../background-1.png') &&
      !rule.test('background-1.png/../../secret') &&
      !rule.test('secrets.json') &&
      !rule.test('background-1.svg'),
    String(rule)
  );
}
check(
  'the pref is written with the name this process made, never with a path',
  /await fs\.promises\.copyFile\(src, path\.join\(CHAT_BACKGROUND_DIR, name\)\);[\s\S]{0,400}?writePrefs\(\{ chatBackground: name \}\);/.test(main)
);
check('the renderer cannot set it through prefs:set', !/allowed\.chatBackground/.test(main));
check('a picture bigger than the cap is refused instead of read', /if \(stat\.size > CHAT_BACKGROUND_MAX_BYTES\) return null;/.test(main));

/* ------------------------------------------------ reaching the window */

check('boot carries the picture so it is there at first paint', /chatBackground: readChatBackground\(\),/.test(main) && /applyChatBackground\(info\.chatBackground\);/.test(app));
check('Settings offers it under Appearance', /data-section="appearance"/.test(html) && /id="settingsPanelAppearance"/.test(html));
check('with a pick, a clear and a preview', /id="chatBgPick"/.test(html) && /id="chatBgClear"/.test(html) && /id="chatBgPreview"/.test(html));
check('and both buttons are wired', /el\('chatBgPick'\)\?\.addEventListener/.test(app) && /el\('chatBgClear'\)\?\.addEventListener/.test(app));
check(
  'the picture is drawn on the wrapper, which does not scroll',
  /html\.has-chat-bg \.transcript-wrap \{/.test(css) && !/html\.has-chat-bg \.transcript \{/.test(css)
);
check(
  'a scrim keeps the text readable in both themes',
  /color-mix\(in srgb, var\(--bg\) 45%, transparent\)/.test(css) && !/--chat-scrim/.test(css)
);

/* ---------------------------------------------------------- the words */

const strings = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
for (const key of ['appearanceTab', 'chatBackground', 'chatBackgroundHint', 'chooseImage', 'removeBackground']) {
  const hits = strings.match(new RegExp(`\\n    ${key}:`, 'g')) || [];
  check(`'${key}' exists in both languages`, hits.length === 2, `found ${hits.length}`);
}

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the chat background is a copied picture, chosen by name only');
