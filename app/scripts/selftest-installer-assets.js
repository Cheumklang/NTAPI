/**
 * Offline check for the installer artwork.
 *
 * NSIS is strict about these files: the sidebar must be 164×314 and the header
 * 150×57, both 24-bit BMP with no alpha, or the installer silently falls back to
 * its grey default. The header also has to be *light*, because it sits on the
 * white page and a dark tile there reads as a stray rectangle.
 *
 * Regenerate with:
 *   node_modules/electron/dist/electron.exe scripts/build-installer-assets.js
 *
 * Run: node scripts/selftest-installer-assets.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const build = path.join(__dirname, '..', 'build');
const readBmp = (file) => {
  const buf = fs.readFileSync(path.join(build, file));
  return {
    buf,
    magic: buf.toString('ascii', 0, 2),
    width: buf.readUInt32LE(18),
    height: buf.readUInt32LE(22),
    bpp: buf.readUInt16LE(28),
  };
};

const sidebar = readBmp('installerSidebar.bmp');
const unSidebar = readBmp('uninstallerSidebar.bmp');
const header = readBmp('installerHeader.bmp');

check('sidebar exists and is a BMP', sidebar.magic === 'BM');
check('sidebar is 164×314', sidebar.width === 164 && sidebar.height === 314, `${sidebar.width}×${sidebar.height}`);
check('sidebar is 24-bit (NSIS has no alpha)', sidebar.bpp === 24, `${sidebar.bpp}bpp`);
check('sidebar has real pixels', sidebar.buf.length > 50000, `${sidebar.buf.length} bytes`);

check('uninstaller sidebar matches the installer', unSidebar.width === 164 && unSidebar.height === 314 && unSidebar.bpp === 24);

check('header is 150×57', header.width === 150 && header.height === 57, `${header.width}×${header.height}`);
check('header is 24-bit', header.bpp === 24, `${header.bpp}bpp`);

// BMP rows are stored bottom-up, so sample the *last* stored row for the top edge.
const rowSize = Math.ceil((header.width * 3) / 4) * 4;
const topRow = 54 + (header.height - 1) * rowSize;
const b = header.buf[topRow];
const g = header.buf[topRow + 1];
const r = header.buf[topRow + 2];
const brightness = (r + g + b) / 3;
check(
  'header background is light so it blends with the page',
  brightness > 200,
  `corner rgb(${r},${g},${b})`
);

const readIco = (file) => {
  const buf = fs.readFileSync(path.join(build, file));
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i += 1) {
    const p = 6 + i * 16;
    sizes.push(buf[p] === 0 ? 256 : buf[p]);
  }
  return { buf, count, sizes };
};

const icon = readIco('installerIcon.ico');
check('installer icon has several sizes', icon.count >= 5, `${icon.count}`);
check('installer icon includes 256px', icon.sizes.includes(256), icon.sizes.join(','));
check('installer icon includes 16px', icon.sizes.includes(16), icon.sizes.join(','));
check('uninstaller icon exists', readIco('uninstallerIcon.ico').count >= 5);
check('header icon exists', readIco('installerHeaderIcon.ico').count >= 2);

/* ------------------------------- wiring ------------------------------- */

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const nsis = pkg.build?.nsis || {};
check('the installer uses our sidebar', nsis.installerSidebar === 'build/installerSidebar.bmp');
check('the installer uses our header', nsis.installerHeader === 'build/installerHeader.bmp');
check('the installer uses our icon', nsis.installerIcon === 'build/installerIcon.ico');
check('the uninstaller uses our sidebar', nsis.uninstallerSidebar === 'build/uninstallerSidebar.bmp');
check('the uninstaller uses our icon', nsis.uninstallerIcon === 'build/uninstallerIcon.ico');
check('an assisted installer is kept', nsis.oneClick === false);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: installer artwork is the right size, depth and shade, and it is wired into the build');
