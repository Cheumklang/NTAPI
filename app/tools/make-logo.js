'use strict';
/**
 * NTAPI logo — vector redraw of the approved "NT" mark.
 *
 * The source was a 556px JPEG: soft edges, flat colour. This rebuilds it as
 * SVG so it stays sharp at any size, and adds depth the bitmap never had:
 * an extruded side, a drop shadow, a soft backlight and a bevelled sparkle.
 *
 * Run with:  node tools/make-logo.js
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const BUILD = path.join(__dirname, '..', 'build');
const ASSETS = path.join(__dirname, '..', 'src', 'renderer', 'assets');
fs.mkdirSync(BUILD, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

/** Pointy-top hexagon path. */
function hex(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/** Four-point sparkle with concave sides. */
function sparkle(cx, cy, s) {
  const k = s * 0.16;
  return (
    `M${cx} ${cy - s} Q${cx + k} ${cy - k} ${cx + s} ${cy} ` +
    `Q${cx + k} ${cy + k} ${cx} ${cy + s} ` +
    `Q${cx - k} ${cy + k} ${cx - s} ${cy} ` +
    `Q${cx - k} ${cy - k} ${cx} ${cy - s} Z`
  );
}

/** The N + T ligature. Kept in one place so the side and the face match. */
const glyphs = (fill, stroke, extra = '') => `
  <rect x="176" y="206" width="108" height="568" rx="54" fill="${fill}" ${extra}/>
  <rect x="558" y="260" width="108" height="514" rx="54" fill="${fill}" ${extra}/>
  <rect x="452" y="206" width="364" height="108" rx="54" fill="${fill}" ${extra}/>
  <path d="M232 250 L520 640" fill="none" stroke="${stroke}" stroke-width="108"
        stroke-linecap="round" ${extra}/>`;

const MARK = `
  <!-- side wall: a dark copy shifted down reads as thickness -->
  <g transform="translate(0,18)">${glyphs('url(#side)', 'url(#side)')}</g>
  <!-- face -->
  ${glyphs('url(#face)', 'url(#face)')}`;

function svg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="plate" cx="0.5" cy="0.4" r="0.78">
      <stop offset="0" stop-color="#35383c"/>
      <stop offset="0.65" stop-color="#26282b"/>
      <stop offset="1" stop-color="#141619"/>
    </radialGradient>
    <linearGradient id="face" x1="0.12" y1="0.96" x2="0.88" y2="0.04">
      <stop offset="0" stop-color="#54e88f"/>
      <stop offset="0.32" stop-color="#2fdcc4"/>
      <stop offset="0.62" stop-color="#33bcf7"/>
      <stop offset="1" stop-color="#3c86f7"/>
    </linearGradient>
    <linearGradient id="side" x1="0.12" y1="0.96" x2="0.88" y2="0.04">
      <stop offset="0" stop-color="#187a4d"/>
      <stop offset="0.5" stop-color="#15657f"/>
      <stop offset="1" stop-color="#1a3f85"/>
    </linearGradient>
    <linearGradient id="spark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9bf7ff"/>
      <stop offset="1" stop-color="#3f8dff"/>
    </linearGradient>
    <linearGradient id="toplight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottomshade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#04121c" stop-opacity="0"/>
      <stop offset="1" stop-color="#04121c" stop-opacity="0.34"/>
    </linearGradient>

    <filter id="drop" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="20" stdDeviation="22" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    <filter id="backlight" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
    <filter id="softglow" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>

    <!-- how the molecule cut-outs punch through the letters -->
    <clipPath id="markClip">
      <rect x="176" y="206" width="108" height="568" rx="54"/>
      <rect x="558" y="260" width="108" height="514" rx="54"/>
      <rect x="452" y="206" width="364" height="108" rx="54"/>
      <path d="M188.5 282.1 L275.5 217.9 L563.5 607.9 L476.5 672.1 Z"/>
      <circle cx="232" cy="250" r="54"/>
      <circle cx="520" cy="640" r="54"/>
    </clipPath>
  </defs>

  <rect width="1024" height="1024" rx="230" fill="url(#plate)"/>
  <rect x="4" y="4" width="1016" height="1016" rx="226" fill="none"
        stroke="#ffffff" stroke-opacity="0.07" stroke-width="8"/>

  <!-- soft backlight so the mark lifts off the plate -->
  <g filter="url(#backlight)" opacity="0.5">
    <rect x="176" y="206" width="108" height="568" rx="54" fill="#2fdcc4"/>
    <rect x="452" y="206" width="364" height="108" rx="54" fill="#3c86f7"/>
    <rect x="558" y="260" width="108" height="514" rx="54" fill="#33bcf7"/>
  </g>

  <g filter="url(#drop)">${MARK}</g>

  <!-- top light along the upper edges of the face -->
  <g clip-path="url(#markClip)">
    <rect x="176" y="206" width="640" height="120" fill="url(#toplight)"/>
    <!-- and a quiet shade at the bottom, so the slabs read as round, not flat -->
    <rect x="176" y="520" width="640" height="260" fill="url(#bottomshade)"/>
  </g>

  <!-- molecule: dark cut-outs through the glyphs, like the original -->
  <g stroke="#23262a" stroke-width="18" stroke-linecap="round">
    <path d="M392 560 L522 682"/>
    <path d="M522 682 L676 656"/>
    <path d="M676 656 L684 478"/>
  </g>
  <path d="${hex(392, 560, 46)}" fill="#23262a"/>
  <path d="${hex(684, 478, 46)}" fill="#23262a"/>
  <circle cx="522" cy="682" r="38" fill="#23262a"/>
  <circle cx="676" cy="656" r="38" fill="#23262a"/>
  <!-- a little light inside the first node keeps it from reading as a hole -->
  <path d="${sparkle(392, 560, 22)}" fill="url(#spark)"/>
  <circle cx="676" cy="656" r="11" fill="#2fdcc4" opacity="0.85"/>

  <!-- sparkle, with its own glow -->
  <g filter="url(#softglow)" opacity="0.75">
    <path d="${sparkle(414, 158, 78)}" fill="url(#spark)"/>
  </g>
  <path d="${sparkle(414, 158, 78)}" fill="url(#spark)"/>
  <path d="${sparkle(414, 158, 78)}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>
</svg>`;
}

const png = (svgText, size) =>
  new Resvg(svgText, { fitTo: { mode: 'width', value: size } }).render().asPng();

const artwork = svg();
fs.writeFileSync(path.join(BUILD, 'icon.png'), png(artwork, 1024));
fs.writeFileSync(path.join(ASSETS, 'icon.png'), png(artwork, 256));
console.log('wrote build/icon.png (1024) and src/renderer/assets/icon.png (256)');

// Sheet for review: big mark plus real taskbar sizes, dark and light.
const b64 = png(artwork, 512).toString('base64');
const img = (size, x, y) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/png;base64,${b64}"/>`;
const label = (t, x, y, s = 12, f = '#8b93a7') =>
  `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${s}" fill="${f}">${t}</text>`;

const sheet =
  '<svg xmlns="http://www.w3.org/2000/svg" width="860" height="640" viewBox="0 0 860 640">' +
  '<rect width="860" height="640" fill="#0f1115"/>' +
  label('NTAPI logo — vector redraw with depth', 28, 34, 14, '#e6e9ef') +
  img(420, 28, 56) +
  label('64', 500, 82, 11) +
  img(64, 500, 90) +
  label('32', 590, 82, 11) +
  img(32, 590, 90) +
  label('16', 650, 82, 11) +
  img(16, 650, 90) +
  label('256 on light', 500, 200, 11, '#5a6274') +
  '<rect x="496" y="212" width="300" height="300" rx="16" fill="#f4f5f7"/>' +
  img(256, 518, 234) +
  '</svg>';

fs.writeFileSync(path.join(BUILD, 'logo-preview.png'), png(sheet, 860));
console.log('wrote build/logo-preview.png');