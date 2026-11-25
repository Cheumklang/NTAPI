/**
 * A picture you sent must still be a picture when you come back to the chat, and
 * clicking any picture must open it here rather than in another program.
 *
 * Three reports, one file:
 *
 *   1. Switching chat away and back turned a sent picture into the text
 *      "[Attached image saved to: …]" plus a sentence telling the agent to read
 *      the file. That text is how the prompt is stored (the models are
 *      text-only), but it is not what the person typed and it is not the picture.
 *   2. Clicking that text, a thumbnail or an image the agent produced handed the
 *      file to Windows Photos. Checking an attachment meant leaving the app, and
 *      the only other way to see it was to cancel the attachment and pick it
 *      again.
 *   3. Reasoning longer than the thinking box's 320px cap arrived below the fold,
 *      so watching what the model was thinking meant scrolling by hand each turn.
 *
 * Run: node scripts/selftest-image-viewer.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

let failures = 0;
function check(name, ok) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    console.log(`FAIL ${name}`);
    failures += 1;
  }
}

/**
 * Function body by name, brace matched, so assertions read code and not prose.
 *
 * The parameter list is walked first: a default value such as `extra = {}` holds
 * braces of its own, and taking the first `{` after the name would stop inside
 * the signature and report an empty body.
 */
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
      if (pdepth === 0) {
        afterParams = i;
        break;
      }
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

/** A `const NAME = …;` declaration, including a value that wraps onto a second line. */
function constSource(src, name) {
  const at = src.indexOf(`const ${name} =`);
  if (at === -1) return '';
  for (let i = at; i < src.length; i += 1) {
    if (src[i] !== ';') continue;
    if (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n')) return src.slice(at, i + 1);
  }
  return '';
}

/** Load the real splitter so the stripping rule is tested, not just present. */
function loadSplit() {
  const note = constSource(main, 'ATTACHED_IMAGE_NOTE');
  const hint = constSource(main, 'ATTACHED_IMAGE_HINT');
  const fn = body(main, 'splitAttachmentNotes');
  if (!note || !hint || !fn) return null;
  // `body()` returns the braces only, so the signature is put back by hand.
  // eslint-disable-next-line no-new-func
  return new Function(`${note}\n${hint}\nreturn (function (raw) ${fn})`)();
}

/* ---------- 1. the attachment note is not part of the message ---------- */

const split = loadSplit();
check('the attachment-note splitter exists', typeof split === 'function');

if (typeof split === 'function') {
  const withImage =
    'ดูรูปนี้ให้หน่อย\n\n' +
    '[Attached image saved to: C:\\NTAPI\\outputs\\.ntapi-attachments\\image-2026-11-16T23-29-43-671Z-1.png]\n' +
    'The image is saved on disk. You cannot see images directly: call look_at_image with that path and a specific question to view it.';

  const r = split(withImage);
  check('the saved-path note is removed from the text', !/Attached image saved to/.test(r.text));
  check('the instruction to the agent is removed too', !/look_at_image/.test(r.text));
  check('the words the user typed survive exactly', r.text === 'ดูรูปนี้ให้หน่อย');
  check('one saved path comes back', r.imagePaths.length === 1);
  check(
    'the path points at the saved picture',
    r.imagePaths[0].endsWith('image-2026-11-16T23-29-43-671Z-1.png')
  );

  const two = split(
    'a\n[Attached image saved to: C:\\x\\one.png]\n[Attached image saved to: C:\\x\\two.png]\nThe image is saved on disk. You cannot see images directly: call look_at_image with that path and a specific question to view it.\nb'
  );
  check('two pictures are both returned', two.imagePaths.length === 2);
  check('the text around them is untouched', two.text === 'a\nb');

  const plain = split('สวัสดีครับ');
  check('a message with no attachment is unchanged', plain.text === 'สวัสดีครับ');
  check('a message with no attachment returns no paths', plain.imagePaths.length === 0);

  // Only the exact whole line this app writes is removed: a sentence that merely
  // mentions the note must not lose its words.
  const mentioned = split('what does [Attached image saved to: x.png] mean?');
  check('a sentence mentioning the note keeps its words', mentioned.text.includes('mean?'));
  check('a sentence mentioning the note is not treated as a picture', mentioned.imagePaths.length === 0);

  const onlyImage =
    '[Attached image saved to: C:\\x\\one.png]\nThe image is saved on disk. You cannot see images directly: call look_at_image with that path and a specific question to view it.';
  const only = split(onlyImage);
  check('an image-only message leaves no text behind', only.text === '');
  check('an image-only message still returns its picture', only.imagePaths.length === 1);
}

const messagesForUi = body(main, 'messagesForUi');
check(
  'the UI message builder strips the note',
  /splitAttachmentNotes\(skill\.text\)/.test(messagesForUi)
);
check('the UI message builder returns the saved paths', /imagePaths: split\.imagePaths/.test(messagesForUi));
check(
  'a message that had only a picture is still listed',
  /split\.text \|\| images\.length \|\| split\.imagePaths\.length/.test(messagesForUi)
);
check(
  'the UI message builder cuts the skill expansion away first',
  /splitSkillExpansion\(text\)/.test(messagesForUi)
);

/* ---------- 2. the picture can be read back from where it was saved ---------- */

const readImage = body(main, 'resolveReadableImage');
check('a reader for saved pictures exists', Boolean(readImage));
check('it reads inside the workspace', /resolveInsideWorkspace\(cwd, target\)/.test(readImage));
check('it also allows the chat attachment folder', /attachmentRoot\(cwd\)/.test(readImage));
check('it still refuses anything outside both', /abs\.startsWith\(root \+ path\.sep\) \? abs : null/.test(readImage));
check(
  'the image IPC uses that reader',
  /ipcMain\.handle\('fs:readImage'[\s\S]{0,120}resolveReadableImage\(cwd, target\)/.test(main)
);
check(
  'the attachment folder is the configured one',
  /function attachmentRoot\(cwd\) \{\s*\n\s*return path\.resolve\(resolveFolder\('attachments', cwd\)\);/.test(main)
);

const renderUser = body(app, 'renderUserMessage');
check(
  'the bubble accepts saved picture paths',
  /function renderUserMessage\(text, attachments, extra = \{\}\)/.test(app)
);
check('it draws pictures that are stored on disk', /paintStoredImages\(strip, stored, extra\.cwd\)/.test(renderUser));
check('the strip is still made for saved pictures', /imgs\.length \|\| stored\.length/.test(renderUser));

const paintStored = body(app, 'paintStoredImages');
check('saved pictures are read through the validated IPC', /api\.readImage\(cwd, rel\)/.test(paintStored));
check('a failed read leaves no broken thumbnail', /if \(res\?\.ok\) strip\.appendChild/.test(paintStored));

check(
  'a replayed message hands its paths and cwd to the bubble',
  /renderUserMessage\(m\.text, m\.images, \{ imagePaths: m\.imagePaths, cwd: view\.cwd \}\)/.test(app)
);

/* ---------- 3. any picture opens in place, never in another program ---------- */

check('the viewer element exists in the window', /id="imageViewer"/.test(html));
check('the viewer has a close button', /id="imageViewerClose"/.test(html));
check('the viewer has the picture', /id="imageViewerImg"/.test(html));
check('the viewer is in the accessibility tree as a dialog', /id="imageViewer"[\s\S]{0,120}role="dialog"/.test(html));
check('the viewer starts hidden', /id="imageViewer"[\s\S]{0,200}hidden/.test(html));

check('opening a picture is a function', /function openImageViewer\(/.test(app));
check('closing a picture is a function', /function closeImageViewer\(/.test(app));
const openViewer = body(app, 'openImageViewer');
check('opening shows the layer', /imageViewer\.hidden = false/.test(openViewer));
check('opening focuses the close button', /imageViewerClose\?\.focus\(\)/.test(openViewer));

const closeViewer = body(app, 'closeImageViewer');
check('closing hides the layer', /imageViewer\.hidden = true/.test(closeViewer));
check('closing drops the picture data', /removeAttribute\('src'\)/.test(closeViewer));

check('the × closes the picture', /imageViewerClose\?\.addEventListener\('click', closeImageViewer\)/.test(app));
check(
  'a click that is not the picture closes it',
  /imageViewer\?\.addEventListener\('click', \(e\) => \{\s*\n\s*if \(e\.target === imageViewerImg\) return;\s*\n\s*closeImageViewer\(\);/.test(app)
);
check(
  'Escape closes it before the chat sees the key',
  /'keydown',[\s\S]{0,400}e\.key !== 'Escape'[\s\S]{0,400}closeImageViewer\(\);[\s\S]{0,120}true\s*\n\)/.test(app)
);
check(
  'every picture in a bubble or the composer is clickable',
  /target\.closest\('#transcript, #attachments'\)/.test(app)
);
check('the viewer picture itself does not re-open the viewer', /target\.id === 'imageViewerImg'/.test(app));

// Thumbnails must not hand the file to the operating system any more.
check('image previews no longer open the system viewer', !/api\.openPath/.test(body(app, 'appendImagePreviews')));
check('all thumbnails are built the same way', /function galleryImage\(/.test(app));
check('the bubble images use that builder', /galleryImage\(img\.dataUri/.test(renderUser));

check('the viewer layer is styled', /\.image-viewer \{/.test(css));
check('the viewer layer can be hidden', /\.image-viewer\[hidden\] \{ display: none; \}/.test(css));
check('the close button is styled', /\.image-viewer-close \{/.test(css));
check('a thumbnail reads as clickable', /\.msg \.bubble-images img \{[\s\S]{0,220}cursor: zoom-in/.test(css));
check('an empty image strip takes no space', /\.msg-images:empty \{ display: none; \}/.test(css));

/* ---------- 4. reasoning follows its own newest line ---------- */

const pin = body(app, 'pinThinkingScroll');
check('the thinking box can be pinned to its newest line', Boolean(pin));
check('pinning scrolls to the bottom of the box', /box\.scrollTop = box\.scrollHeight/.test(pin));
check('a reader who scrolled up is not dragged down', /box\.__fpFollow === false\) return/.test(pin));

const follow = body(app, 'followThinkingScroll');
check('the box tracks whether the reader took over', /box\.__fpFollow = box\.scrollHeight - box\.scrollTop - box\.clientHeight > 8/.test(follow));
check('the tracking listener is passive', /passive: true/.test(follow));

check(
  'the box starts following when it is created',
  /thinking\.className = 'thinking';[\s\S]{0,200}followThinkingScroll\(thinking\)/.test(app)
);
check(
  'incoming reasoning stays at its newest line',
  /th\.textContent \+= p\.delta;\s*\n\s*pinThinkingScroll\(th\);/.test(app)
);
check(
  'a replayed reasoning block is positioned at its newest line',
  /th\.textContent = m\.thinking;\s*\n\s*pinThinkingScroll\(th\);/.test(app)
);
// The collapse/expand toggle is deliberately untouched.
check('thinking is still collapsible', /toggle\.hidden = false/.test(app) && /thinkingHide/.test(app));

console.log(
  failures === 0
    ? '\nAll image-viewer checks passed.'
    : `\n${failures} image-viewer check(s) failed.`
);
process.exit(failures === 0 ? 0 : 1);