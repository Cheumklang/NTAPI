'use strict';
/**
 * Installs a provider's own mark as a model-picker logo.
 *
 * Same rule as the app icons: no redraw, no recolour. The vendor's artwork is
 * only cropped to a square and scaled down, so the picker shows the mark the
 * provider actually uses. A 400x400 favicon is overkill for a 16-20 px slot, so
 * the copy that ships is 128 px.
 *
 * It also prints the corner pixel, which says whether the mark carries its own
 * plate (a solid background) or needs to sit on the picker's dark tile.
 *
 * Run:  node_modules/electron/dist/electron.exe tools/make-provider-logo.js <src.png> <name> [size]
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const [src, name, sizeArg] = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (!src || !name) {
    console.error('usage: electron tools/make-provider-logo.js <src.png> <provider-name> [size]');
    app.exit(1);
    return;
  }
  const size = Number(sizeArg) > 0 ? Number(sizeArg) : 128;

  const img = nativeImage.createFromPath(src);
  const { width, height } = img.getSize();
  if (!width || !height) {
    console.error('could not read image:', src);
    app.exit(1);
    return;
  }

  const side = Math.min(width, height);
  const square = img.crop({
    x: Math.round((width - side) / 2),
    y: Math.round((height - side) / 2),
    width: side,
    height: side,
  });

  const dir = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'providers');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${name}.png`);
  fs.writeFileSync(out, square.resize({ width: size, height: size, quality: 'best' }).toPNG());

  // 1x1 bitmap is BGRA, so the first four bytes are the top-left pixel.
  const corner = [...square.resize({ width: 1, height: 1 }).toBitmap()].slice(0, 4);
  const [b, g, r, a] = corner;
  console.log(
    `source ${width}x${height} -> ${path.relative(process.cwd(), out)} ` +
      `(${size}px, ${fs.statSync(out).size} bytes)`
  );
  console.log(`corner rgba(${r}, ${g}, ${b}, ${a})${a === 0 ? ' — transparent, sits on the picker tile' : ''}`);
  app.quit();
});
