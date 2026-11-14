'use strict';

/**
 * Build the installer artwork from the app's own logo.
 *
 * NSIS asks for bitmaps, not vector or PNG: a 164×314 sidebar, a 150×57 header
 * and .ico files. Painting them here keeps the installer, the update splash and
 * the app in one palette without adding an image library.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/build-installer-assets.js
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const LOGO = path.join(BUILD, 'icon.png');

app.disableHardwareAcceleration();

/** Paint one canvas and hand back raw RGBA so Node can encode a BMP or an ICO. */
function paintScript() {
  return `
  (async () => {
    const logo = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = window.__logo;
    });

    const BG = '#12131a';
    const ACCENT = '#7c5cff';
    const ACCENT2 = '#5aa9ff';

    function backdrop(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#191c28');
      g.addColorStop(0.55, BG);
      g.addColorStop(1, '#0a0b10');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // two soft glows, same as the splash card
      const glow = (x, y, r, color) => {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, color);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      };
      glow(w * 0.3, h * 0.14, Math.max(w, h) * 0.75, 'rgba(124,92,255,.55)');
      glow(w * 0.85, h * 0.95, Math.max(w, h) * 0.7, 'rgba(90,169,255,.30)');

      // dot grid, faint
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      for (let y = 6; y < h; y += 14) {
        for (let x = 6; x < w; x += 14) {
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    /** Draw the logo at a size, keeping its aspect ratio. */
    function mark(ctx, cx, cy, size) {
      ctx.drawImage(logo, cx - size / 2, cy - size / 2, size, size);
    }

    function sidebar(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      backdrop(ctx, w, h);

      mark(ctx, w / 2, 74, 76);

      // wordmark
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8e9f2';
      ctx.font = '600 22px "Segoe UI", system-ui, sans-serif';
      ctx.letterSpacing = '2px';
      ctx.fillText('NTAPI', w / 2, 150);
      ctx.letterSpacing = '0px';

      // accent rule
      const rule = ctx.createLinearGradient(w * 0.22, 0, w * 0.78, 0);
      rule.addColorStop(0, 'rgba(124,92,255,0)');
      rule.addColorStop(0.5, ACCENT);
      rule.addColorStop(1, 'rgba(90,169,255,0)');
      ctx.fillStyle = rule;
      ctx.fillRect(w * 0.22, 164, w * 0.56, 2);

      ctx.fillStyle = '#8b93a7';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('free models', w / 2, 190);
      ctx.fillText('on your own machine', w / 2, 206);

      // footer bar
      ctx.fillStyle = 'rgba(124,92,255,.18)';
      ctx.fillRect(0, h - 34, w, 34);
      ctx.fillStyle = '#b9b3ff';
      ctx.font = '10px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('ntapi.app', w / 2, h - 13);

      return canvas.toDataURL('image/png');
    }

    /**
     * NSIS pins the header image at 150×57 in the top-left of a *white* page and
     * never stretches it. A dark tile there reads as a stray rectangle, so this
     * one is painted light: it continues the page instead of floating on it.
     */
    function header(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#f4f5f9';
      ctx.fillRect(0, 0, w, h);
      const wash = ctx.createLinearGradient(0, 0, w, h);
      wash.addColorStop(0, 'rgba(124,92,255,.10)');
      wash.addColorStop(1, 'rgba(90,169,255,.05)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(124,92,255,.16)';
      for (let y = 8; y < h; y += 12) {
        for (let x = 8; x < w; x += 12) {
          ctx.beginPath();
          ctx.arc(x, y, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      mark(ctx, 29, h / 2, 30);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#1d2130';
      ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
      ctx.letterSpacing = '1.6px';
      ctx.fillText('NTAPI', 52, h / 2 - 1);

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, ACCENT);
      grad.addColorStop(1, ACCENT2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, h - 3, w, 3);
      return canvas.toDataURL('image/png');
    }

    return {
      sidebar: sidebar(164, 314),
      header: header(150, 57),
    };
  })()
  `;
}

/* ------------------------------ BMP / ICO ------------------------------ */

/** Decode a PNG data URL into { width, height, data: RGBA } using the window. */
async function decode(win, dataUrl) {
  return win.webContents.executeJavaScript(`
    (async () => {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = ${JSON.stringify(dataUrl)};
      });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      return { width: c.width, height: c.height, data: Array.from(d.data) };
    })()
  `);
}

/**
 * 24-bit BMP. NSIS has no alpha channel for these images, so the artwork is
 * painted onto an opaque background instead of being composited at runtime.
 */
function encodeBmp({ width, height, data }) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const fileSize = 54 + pixelBytes;
  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22); // negative-free: rows written bottom-up
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelBytes, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);

  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    let o = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const i = (srcY * width + x) * 4;
      buf[o] = data[i + 2]; // B
      buf[o + 1] = data[i + 1]; // G
      buf[o + 2] = data[i]; // R
      o += 3;
    }
  }
  return buf;
}

/** One 32-bit icon entry: DIB header, BGRA bottom-up pixels, empty AND mask. */
function icoEntry({ width, height, data }) {
  const headerSize = 40;
  const xorSize = width * height * 4;
  const andRow = Math.ceil(width / 32) * 4;
  const andSize = andRow * height;
  const buf = Buffer.alloc(headerSize + xorSize + andSize);

  buf.writeUInt32LE(headerSize, 0);
  buf.writeInt32LE(width, 4);
  buf.writeInt32LE(height * 2, 8);
  buf.writeUInt16LE(1, 12);
  buf.writeUInt16LE(32, 14);
  buf.writeUInt32LE(xorSize, 20);

  let o = headerSize;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      buf[o] = data[i + 2];
      buf[o + 1] = data[i + 1];
      buf[o + 2] = data[i];
      buf[o + 3] = data[i + 3];
      o += 4;
    }
  }
  return buf;
}

function encodeIco(entries) {
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  const blobs = [];
  entries.forEach((entry, index) => {
    const blob = icoEntry(entry.image);
    const p = 6 + index * 16;
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, p);
    header.writeUInt8(entry.size >= 256 ? 0 : entry.size, p + 1);
    header.writeUInt8(0, p + 2);
    header.writeUInt8(0, p + 3);
    header.writeUInt16LE(1, p + 4);
    header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(blob.length, p + 8);
    header.writeUInt32LE(offset, p + 12);
    offset += blob.length;
    blobs.push(blob);
  });
  return Buffer.concat([header, ...blobs]);
}

/* -------------------------------- main -------------------------------- */

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 600, height: 400 });
  await win.loadURL('data:text/html,<html><body></body></html>');

  const logoDataUrl = `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`;
  await win.webContents.executeJavaScript(`window.__logo = ${JSON.stringify(logoDataUrl)};`);
  const art = await win.webContents.executeJavaScript(paintScript());

  const sidebar = await decode(win, art.sidebar);
  const header = await decode(win, art.header);

  fs.writeFileSync(path.join(BUILD, 'installerSidebar.bmp'), encodeBmp(sidebar));
  // The uninstaller gets the same art: a second design would be noise, and the
  // sidebar already carries the product name.
  fs.writeFileSync(path.join(BUILD, 'uninstallerSidebar.bmp'), encodeBmp(sidebar));
  fs.writeFileSync(path.join(BUILD, 'installerHeader.bmp'), encodeBmp(header));

  // Icons: sizes Windows actually asks for, plus 256 for the big tile.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const logoImage = await decode(win, logoDataUrl);
  const entries = [];
  for (const size of sizes) {
    const scaled = await win.webContents.executeJavaScript(`
      (async () => {
        const img = await new Promise((resolve, reject) => {
          const i = new Image(); i.onload = () => resolve(i); i.onerror = reject;
          i.src = ${JSON.stringify(logoDataUrl)};
        });
        const c = document.createElement('canvas');
        c.width = ${size}; c.height = ${size};
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ${size}, ${size});
        const d = ctx.getImageData(0, 0, ${size}, ${size});
        return { width: ${size}, height: ${size}, data: Array.from(d.data) };
      })()
    `);
    entries.push({ size, image: scaled });
  }
  const ico = encodeIco(entries);
  fs.writeFileSync(path.join(BUILD, 'installerIcon.ico'), ico);
  fs.writeFileSync(path.join(BUILD, 'uninstallerIcon.ico'), ico);
  fs.writeFileSync(path.join(BUILD, 'installerHeaderIcon.ico'), encodeIco(entries.slice(0, 3)));

  console.log(
    'wrote',
    ['installerSidebar.bmp', 'uninstallerSidebar.bmp', 'installerHeader.bmp', 'installerIcon.ico', 'uninstallerIcon.ico', 'installerHeaderIcon.ico'],
    '| logo',
    `${logoImage.width}x${logoImage.height}`
  );
  app.quit();
});
