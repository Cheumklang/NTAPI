'use strict';

/**
 * Deciding whether a file is allowed, before anything is uploaded.
 *
 * Pure on purpose: the limits are the only thing standing between a 40MB phone
 * video and every NTAPI user's next launch, so they get tested without a window.
 */

const {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MAX_POSTER_BYTES,
  IMAGE_EXT,
  VIDEO_EXT,
  mimeFor,
} = require('./feed');

/**
 * A sponsor usually sends a link, not a file. Downloading it here means the
 * browser part of the app never fetches arbitrary hosts, and the size cap is
 * applied before the bytes reach the canvas.
 */
const MAX_DOWNLOAD_BYTES = MAX_VIDEO_BYTES;

function extOf(nameOrUrl) {
  const flat = String(nameOrUrl || '').split('?')[0].split('#')[0];
  const last = flat.split('/').pop() || '';
  if (!last.includes('.')) return '';
  return last.slice(last.lastIndexOf('.') + 1).toLowerCase();
}

function kindOfExt(ext) {
  const value = String(ext || '').toLowerCase();
  if (IMAGE_EXT.includes(value)) return 'image';
  if (VIDEO_EXT.includes(value)) return 'video';
  return '';
}

/**
 * Only https, and only a host with a dot in it. A link on the local network
 * would make this tool fetch something we cannot reason about, and the result
 * would be published to every user.
 */
function mediaUrlAllowed(value) {
  const raw = String(value || '').trim();
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return false;
    if (!parsed.hostname.includes('.')) return false;
    return kindOfExt(extOf(parsed.pathname)) !== '';
  } catch {
    return false;
  }
}

/**
 * @returns {{ok:boolean, reason?:string, kind?:string, mime?:string}}
 */
function checkFile({ name, bytes, width, height, seconds }) {
  const ext = extOf(name);
  const kind = kindOfExt(ext);
  if (!kind) return { ok: false, reason: 'unsupported-type' };
  const mime = mimeFor(ext);
  if (!mime) return { ok: false, reason: 'unsupported-type' };

  if (kind === 'image') {
    // An image is re-encoded to 1024x512 WebP before upload, so the source size
    // only has to survive being decoded into a canvas once.
    if (Number(bytes) > MAX_IMAGE_BYTES) return { ok: false, reason: 'image-too-big' };
    if (Number(width) <= 0 || Number(height) <= 0) return { ok: false, reason: 'image-unreadable' };
    return { ok: true, kind, mime };
  }

  if (Number(bytes) > MAX_VIDEO_BYTES) return { ok: false, reason: 'video-too-big' };
  if (Number(seconds) > MAX_VIDEO_SECONDS) return { ok: false, reason: 'video-too-long' };
  // No transcoding happens here — what the sponsor sends is what NTAPI plays —
  // so a codec the window cannot decode has to be refused now, not shown broken.
  if (!Number(seconds) > 0) return { ok: false, reason: 'video-unreadable' };
  return { ok: true, kind, mime };
}

function checkPoster(bytes) {
  return Number(bytes) <= MAX_POSTER_BYTES ? { ok: true } : { ok: false, reason: 'poster-too-big' };
}

/**
 * What the crop does: centre-cover, never stretch. A 1:1 logo and a 21:9 banner
 * both come out filling the frame, cropped rather than squashed.
 */
function coverRect(srcW, srcH, dstW, dstH) {
  const w = Number(srcW) || 0;
  const h = Number(srcH) || 0;
  if (w <= 0 || h <= 0) return null;
  const scale = Math.max(dstW / w, dstH / h);
  const drawW = w * scale;
  const drawH = h * scale;
  return { x: (dstW - drawW) / 2, y: (dstH - drawH) / 2, w: drawW, h: drawH };
}

/** Bytes that a base64 data URL actually costs, for showing real sizes in the UI. */
function base64Bytes(base64) {
  const flat = String(base64 || '');
  const padding = flat.endsWith('==') ? 2 : flat.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((flat.length * 3) / 4) - padding);
}

module.exports = {
  MAX_DOWNLOAD_BYTES,
  extOf,
  kindOfExt,
  mediaUrlAllowed,
  checkFile,
  checkPoster,
  coverRect,
  base64Bytes,
};
