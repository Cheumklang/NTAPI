'use strict';
/**
 * Rounds the corners of the installed app icon.
 *
 * The desktop shortcut, taskbar and NSIS installer take `build/icon.png`
 * verbatim, so a square file shows a square icon next to the rounded mark the
 * app draws in its sidebar (`.brand-icon`, border-radius 8px on 28px ≈ 28.6%).
 * This clips the artwork to a rounded rectangle with a transparent surround so
 * every place Windows shows the icon matches the in-app mark. Only the outside
 * changes — the artwork itself is untouched.
 *
 * Idempotent: rounding an already-rounded icon leaves it unchanged.
 *
 * Run:  node tools/round-icon.js
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build', 'icon.png');
const ASSETS = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'icon.png');

// Same proportion as `.brand-icon` in styles.css (8 / 28).
const RADIUS_RATIO = 8 / 28;

/** Width/height from the PNG IHDR (bytes 16..23). */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function roundPng(file) {
  const original = fs.readFileSync(file);
  const { width, height } = pngSize(original);
  const rx = Math.round(Math.min(width, height) * RADIUS_RATIO);
  const b64 = original.toString('base64');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<defs><clipPath id="r"><rect x="0" y="0" width="${width}" height="${height}" ` +
    `rx="${rx}" ry="${rx}"/></clipPath></defs>` +
    `<image href="data:image/png;base64,${b64}" x="0" y="0" width="${width}" ` +
    `height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#r)"/>` +
    `</svg>`;
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
  fs.writeFileSync(file, png);
  return `${path.relative(path.join(__dirname, '..'), file)} ${width}x${height} rx=${rx}`;
}

for (const file of [BUILD, ASSETS]) {
  if (!fs.existsSync(file)) {
    console.error('missing', file);
    process.exit(1);
  }
  console.log('rounded', roundPng(file));
}
