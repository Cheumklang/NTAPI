'use strict';
/**
 * Draws the NTAPI icon candidates and a contact sheet.
 *
 * Uses @resvg/resvg-js (dev dependency) so this is a plain `node` script — the
 * earlier Electron/capturePage route hung on hidden windows. Output lands in
 * build/candidates/, and the chosen file is copied to build/icon.png.
 *
 * Run with:  node tools/make-icons.js
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'build', 'candidates');
fs.mkdirSync(OUT, { recursive: true });

const BG =
  '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#1c2433"/><stop offset="1" stop-color="#0a0d14"/></linearGradient>';
const GRAD = (id, a, b, c) =>
  `<linearGradient id="${id}" x1="0.05" y1="1" x2="0.95" y2="0">` +
  `<stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/>` +
  `<stop offset="1" stop-color="${c}"/></linearGradient>`;

const TILE =
  '<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>' +
  '<rect x="8" y="8" width="1008" height="1008" rx="224" fill="none" ' +
  'stroke="#ffffff" stroke-opacity="0.07" stroke-width="16"/>';

/** A — gradient "N" monogram with a spark. */
const A =
  '<defs>' +
  BG +
  GRAD('mark', '#46d39a', '#59cfd6', '#8b74ff') +
  '<radialGradient id="glow" cx="0.5" cy="0.52" r="0.55">' +
  '<stop offset="0" stop-color="#46d39a" stop-opacity="0.28"/>' +
  '<stop offset="1" stop-color="#46d39a" stop-opacity="0"/></radialGradient>' +
  '</defs>' +
  TILE +
  '<circle cx="512" cy="530" r="430" fill="url(#glow)"/>' +
  '<path d="M372 726 V298 L652 726 V298" fill="none" stroke="url(#mark)" ' +
  'stroke-width="118" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M818 158 l22 56 56 22 -56 22 -22 56 -22 -56 -56 -22 56 -22z" fill="#8b74ff"/>';

/** B — hexagon node with a terminal caret. */
const HEX = 'M812 512 L662 252 L362 252 L212 512 L362 772 L662 772 Z';
const nodes = [
  [812, 512],
  [662, 252],
  [362, 252],
  [212, 512],
  [362, 772],
  [662, 772],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="27" fill="#46d39a"/>`)
  .join('');
const B =
  '<defs>' +
  BG +
  GRAD('mark', '#46d39a', '#59cfd6', '#8b74ff') +
  '</defs>' +
  TILE +
  `<path d="${HEX}" fill="none" stroke="url(#mark)" stroke-width="46" stroke-linejoin="round"/>` +
  nodes +
  '<path d="M400 415 L548 512 L400 609" fill="none" stroke="#8b74ff" ' +
  'stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>';

/** C — terminal window with a prompt. */
const C =
  '<defs>' +
  BG +
  GRAD('mark', '#46d39a', '#59cfd6', '#8b74ff') +
  '</defs>' +
  TILE +
  '<rect x="176" y="232" width="672" height="560" rx="70" fill="#121a28" ' +
  'stroke="#2b3546" stroke-width="12"/>' +
  '<line x1="182" y1="342" x2="842" y2="342" stroke="#2b3546" stroke-width="12"/>' +
  '<circle cx="248" cy="287" r="17" fill="#46d39a"/>' +
  '<circle cx="300" cy="287" r="17" fill="#ffb020"/>' +
  '<circle cx="352" cy="287" r="17" fill="#8b74ff"/>' +
  '<path d="M286 452 L392 522 L286 592" fill="none" stroke="#46d39a" ' +
  'stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<rect x="446" y="500" width="230" height="44" rx="22" fill="#8b74ff" opacity="0.85"/>' +
  '<rect x="286" y="646" width="330" height="40" rx="20" fill="#3a465c"/>';

const VARIANTS = [
  ['A', 'N + spark', A],
  ['B', 'hex node + caret', B],
  ['C', 'terminal window', C],
];

const doc = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" ` +
  `viewBox="0 0 1024 1024">${body}</svg>`;

/** Rasterise an SVG string to PNG bytes. `scale` = output width in px. */
function png(svg, scale) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: scale } }).render().asPng();
}

for (const [id, , body] of VARIANTS) {
  fs.writeFileSync(path.join(OUT, `${id}.png`), png(doc(body), 1024));
}

// Contact sheet: each mark large, at real taskbar sizes, and on a light strip.
const b64 = {};
for (const [id] of VARIANTS) b64[id] = fs.readFileSync(path.join(OUT, `${id}.png`)).toString('base64');

const img = (id, size, x, y) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" ` +
  `href="data:image/png;base64,${b64[id]}"/>`;
const label = (txt, x, y, size = 12, fill = '#8b93a7') =>
  `<text x="${x}" y="${y}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" ` +
  `fill="${fill}">${txt}</text>`;

const COLS = [24, 274, 524];
let sheet =
  '<svg xmlns="http://www.w3.org/2000/svg" width="872" height="470" viewBox="0 0 872 470">' +
  '<rect width="872" height="470" fill="#0f1115"/>' +
  label('NTAPI icon candidates — pick one', 24, 22, 13, '#e6e9ef');

VARIANTS.forEach(([id, name], i) => {
  const x = COLS[i];
  sheet += label(`${id} · ${name}`, x, 44);
  sheet += img(id, 220, x, 52);
  const smalls = [
    [48, 0],
    [32, 62],
    [16, 108],
  ];
  for (const [size, dx] of smalls) {
    sheet += label(String(size), x + dx, 290, 10, '#666f83');
    sheet += img(id, size, x + dx, 296);
  }
});

sheet +=
  '<rect x="24" y="368" width="824" height="82" rx="12" fill="#f4f5f7"/>' +
  VARIANTS.map(([id], i) => label(`${id} at 56 on light`, 40 + i * 270, 392, 10, '#5a6274') + img(id, 56, 40 + i * 270, 394)).join('') +
  '</svg>';

fs.writeFileSync(path.join(OUT, 'preview.png'), png(sheet, 872));
console.log('wrote', path.join(OUT, 'preview.png'));
