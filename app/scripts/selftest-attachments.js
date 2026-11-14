/**
 * Any file can be attached, and a video is not read as if it were a picture.
 *
 * The bug: mimeFor() returned 'image/png' for every extension it did not know, so
 * choosing a .mp4 read the whole file into memory, base64-encoded it, and handed
 * the renderer a data URI that claimed to be a PNG. A 5 MB clip became a ~7 MB
 * string that could never decode, so attaching one did not work at all. Dropping
 * the same file worked, because that path asks the OS for the real type.
 *
 * Now only the raster formats the model can open are inlined; everything else
 * goes by path, and the prompt tells the agent what kind of file it is and to
 * solve the problem itself if it cannot open the format directly.
 *
 * Run: node scripts/selftest-attachments.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/** Function body by name, brace matched after the parameter list. */
function body(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  const sig = src.indexOf('(', start);
  let pdepth = 0;
  let afterParams = -1;
  for (let i = sig; i < src.length; i += 1) {
    if (src[i] === '(') pdepth += 1;
    else if (src[i] === ')') {
      pdepth -= 1;
      if (pdepth === 0) { afterParams = i; break; }
    }
  }
  if (afterParams === -1) return '';
  const open = src.indexOf('{', afterParams);
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

// --- 1. the regression: unknown extensions are not images -----------------

const mimeBody = body(main, 'mimeFor');
check('mimeFor exists', mimeBody !== '');
check('mimeFor no longer defaults to image/png', !/return 'image\/png';\s*\}$/.test(mimeBody.trim()));
check('mimeFor returns null for anything it does not know', /return null;/.test(mimeBody));
check('png is still recognised', /ext === '\.png'/.test(mimeBody));

// Run the real function over the formats that matter.
const mimeFn = (() => {
  const params = '(file)';
  // eslint-disable-next-line no-new-func
  return new Function('path', `return (function ${params} ${mimeBody})`)(require('node:path'));
})();

check('a png is an image', mimeFn('a.png') === 'image/png');
check('a jpeg is an image', mimeFn('a.JPG') === 'image/jpeg');
check('a video is not an image', mimeFn('clip.mp4') === null);
check('a zip is not an image', mimeFn('a.zip') === null);
check('a pdf is not an image', mimeFn('doc.pdf') === null);
check('a file with no extension is not an image', mimeFn('LICENSE') === null);

// --- 2. the dialog offers every file -------------------------------------

const pick = (() => {
  const start = main.indexOf("ipcMain.handle('fs:pickImages'");
  return start === -1 ? '' : main.slice(start, start + 1600);
})();
check('the picker exists', pick !== '');
check('the picker allows any extension', /extensions:\s*\['\*'\]/.test(pick));
check('the picker is no longer limited to a short allowlist',
  !/extensions:\s*\['png'/.test(pick));
check('an unknown type is passed by path', /if \(!mime\)/.test(pick));
check('the path branch keeps the real path', /kind: 'file', path: file/.test(pick));

// --- 3. the renderer only inlines real raster images ---------------------

check('the renderer has an explicit inline allowlist', /INLINE_IMAGE_TYPES/.test(app));
check('the renderer no longer trusts any image/* type', !/file\.type\.startsWith\('image\/'\)/.test(app));
check('svg is not inlined', !/INLINE_IMAGE_TYPES[\s\S]{0,200}svg/.test(app));

// --- 4. the agent is told what the file is ------------------------------

check('a file kind describes the format', /function describeFile\(/.test(main));
const describeBody = body(main, 'describeFile');
const describeFn = (() => {
  // eslint-disable-next-line no-new-func
  return new Function('path', `return (function (file) ${describeBody})`)(require('node:path'));
})();
check('a video is described as a video', describeFn('a.mp4') === 'video');
check('audio is described as audio', describeFn('a.mp3') === 'audio');
check('a pdf is described as a pdf', describeFn('a.pdf') === 'pdf');
check('source code is described', describeFn('a.py') === 'source code');
check('an unknown extension still gets a label', /file$/.test(describeFn('a.zzz')));

check('the prompt names the kind of file', /describeFile\(f\)/.test(main));
check('the prompt tells the agent to solve an unopenable format itself',
  /cannot be opened directly/.test(main) && /work out how to handle it yourself/.test(main));

// --- 5. nothing regressed in the image path ------------------------------

check('images are still saved and referenced by path', /\[Attached image saved to:/.test(main));
check('images still point at look_at_image', /look_at_image/.test(main));

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll attachment checks passed');
