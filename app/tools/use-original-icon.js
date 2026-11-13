'use strict';
/**
 * Installs the user's original artwork as the app icon, untouched.
 *
 * No redraw, no recolour, no sharpening: the JPEG is only cropped to a centred
 * square (Windows .ico needs a square) and scaled down once. Anything else
 * would be "editing" the design the user asked to keep as-is.
 *
 * Run:  node_modules/electron/dist/electron.exe tools/use-original-icon.js <src.jpg>
 */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();
app.whenReady().then(() => {
  const src = process.argv[process.argv.length - 1];
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

  const build = path.join(__dirname, '..', 'build');
  const assets = path.join(__dirname, '..', 'src', 'renderer', 'assets');
  fs.mkdirSync(build, { recursive: true });
  fs.mkdirSync(assets, { recursive: true });

  // 512 keeps almost every source pixel (531 -> 512) instead of inventing a
  // 2x upscale, so the .ico stays as sharp as the original allows.
  fs.writeFileSync(path.join(build, 'icon.png'), square.resize({ width: 512, height: 512, quality: 'best' }).toPNG());
  fs.writeFileSync(path.join(assets, 'icon.png'), square.resize({ width: 256, height: 256, quality: 'best' }).toPNG());

  console.log(`source ${width}x${height} -> cropped ${side}x${side} -> build/icon.png (512), assets/icon.png (256)`);
  app.quit();
});