const fs = require('node:fs');
const path = require('node:path');

/**
 * A tool that makes a sound file must leave something you can play, not a path
 * you have to hunt for. These checks read the three files that have to agree —
 * main (what may be read), the renderer (the card) and the stylesheet — because
 * a card with no IPC is exactly the kind of half-wiring that ships broken.
 */
function main() {
  const root = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const mainJs = read('src/main.js');
  const preload = read('src/preload.js');
  const app = read('src/renderer/app.js');
  const css = read('src/renderer/styles.css');

  let failed = 0;
  const check = (label, ok) => {
    if (ok) console.log(`PASS ${label}`);
    else {
      failed += 1;
      console.log(`FAIL ${label}`);
    }
  };

  /* ---- main: what the renderer is allowed to read ---- */
  check('main: audio and video are read only inside the workspace', /fs:readMedia'[\s\S]{0,400}resolveInsideWorkspace/.test(mainJs));
  check('main: the reader knows the formats we advertise', ['.wav', '.mp3', '.mp4', '.webm'].every((ext) => mainJs.includes(`['${ext}',`)));
  check('main: a huge file is refused instead of freezing the window', /MEDIA_MAX_BYTES/.test(mainJs) && /tooLarge/.test(mainJs));
  check('main: a file can be shown in its folder', /fs:revealPath'[\s\S]{0,300}showItemInFolder/.test(mainJs));

  /* ---- preload: the bridge both sides need ---- */
  check('preload: readMedia and revealPath are exposed', /readMedia:/.test(preload) && /revealPath:/.test(preload));

  /* ---- renderer: the path in the words is the control ---- */
  check('renderer: a path in the reply becomes a control', /function linkFilePaths\(/.test(app) && /linkFilePaths\(body, view\.cwd\)/.test(app));
  check('renderer: nothing is drawn under the reply any more', !/appendMediaPreviews|msg-media|media-chip/.test(app));
  check('renderer: the menu offers play, open and the folder', /t\('playFile'\)/.test(app) && /api\.openPath\(cwd, rel\)/.test(app) && /api\.revealPath\(cwd, rel\)/.test(app));
  check('renderer: an image path opens the picture in place', /api\.readImage\(cwd, rel\)[\s\S]{0,60}openImageViewer/.test(app));
  check('renderer: a sound plays under the line that names it', /createElement\('audio'\)[\s\S]{0,400}media-inline/.test(app));
  check('renderer: a path inside inline code is still a control, a fenced block is not', /closest\('pre, a, \.file-link'\)/.test(app));
  check('renderer: the menu closes on Escape and on a click away', /key === 'Escape'\) closeFileMenus/.test(app));
  check(
    'renderer: the labels are translated',
    /viewFile: 'View'/.test(app) && /viewFile: 'ดู'/.test(app) && /revealFile: 'แสดงในโฟลเดอร์'/.test(app)
  );

  /* ---- stylesheet ---- */
  check(
    'css: the path looks like text until you reach for it',
    /\.file-link \{/.test(css) && /\.file-link:hover/.test(css) && /var\(--accent\)/.test(css)
  );
  check('css: the menu floats over the chat', /\.file-menu \{/.test(css) && /position: fixed/.test(css));
  check('css: the inline player cannot overflow the bubble', /\.media-inline \{/.test(css) && /max-width: 320px/.test(css));
  check('css: no chip or card styles are left behind', !/\.media-chip|\.media-card|\.msg-media/.test(css));

  if (failed) {
    console.log(`\n${failed} media-card check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll media-card checks passed.');
}

main();
