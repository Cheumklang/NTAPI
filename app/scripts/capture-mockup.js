'use strict';

/**
 * Render an HTML mockup to a PNG, so a design can be reviewed as a picture
 * instead of a description.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/capture-mockup.js <input.html> <output.png> [width]
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const [, , input, output, widthArg] = process.argv;
const width = Number(widthArg) || 1240;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  if (!input || !output) {
    console.error('usage: capture-mockup.js <input.html> <output.png> [width]');
    app.quit();
    return;
  }
  const win = new BrowserWindow({
    width,
    height: 900,
    show: false,
    backgroundColor: '#0c0d12',
    webPreferences: { offscreen: false },
  });
  await win.loadFile(path.resolve(input));
  // Let fonts and gradients settle before the shot.
  await new Promise((r) => setTimeout(r, 700));
  const height = await win.webContents.executeJavaScript(
    'Math.ceil(document.body.getBoundingClientRect().height)'
  );
  win.setContentSize(width, Math.min(4000, height + 8));
  await new Promise((r) => setTimeout(r, 400));
  const image = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  fs.writeFileSync(path.resolve(output), image.toPNG());
  console.log('wrote', output, image.getSize());
  app.quit();
});
