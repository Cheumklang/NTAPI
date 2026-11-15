'use strict';

/**
 * The shape of `sponsor.json` — the file this tool publishes and NTAPI reads.
 *
 * Everything here is pure: no fs, no network, no Electron. That is deliberate,
 * for the same reason NTAPI keeps `sponsor.js` pure — the file this tool writes
 * is the only contract between two separate programs, so it has to be testable
 * without launching either one.
 *
 * The reader on the other side is `app/src/sponsor.js`. If you change a field
 * name here, change it there in the same commit, or every installed copy of
 * NTAPI silently drops the strip (a malformed slot is hidden, never rendered
 * half-way).
 */

/**
 * The shapes a creative may be published in. NTAPI reserves room for the tallest
 * one in the feed and centres each creative inside it, so the strip never
 * changes height while it rotates — a banner that resizes every 15 seconds would
 * shove the whole conversation up and down.
 *
 * The presets are the common cases. A custom frame is allowed too, but only
 * inside `RATIO_*` bounds: an open ratio would let one bad file claim a 400px
 * band and eat the session list, so anything outside the band is 2:1.
 */
const RATIO_ORDER = ['2:1', '16:9', '1:1', '4:5', '9:16'];
const RATIOS = {
  '2:1': [2, 1],
  '16:9': [16, 9],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '9:16': [9, 16],
};
const DEFAULT_RATIO = '2:1';

/** A custom frame: integers up to 64 a side, never taller than 2.5x its width. */
const RATIO_SIDES_MAX = 64;
const RATIO_TALL_MAX = 2.5;
const RATIO_WIDE_MAX = 5;

/** `[w, h]` for a preset or a legal custom `"w:h"`; null when out of band. */
function parseRatio(value) {
  const key = String(value === null || value === undefined ? '' : value).trim();
  if (Object.prototype.hasOwnProperty.call(RATIOS, key)) return RATIOS[key].slice();
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(key);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!w || !h || w > RATIO_SIDES_MAX || h > RATIO_SIDES_MAX) return null;
  const tall = h / w;
  if (tall > RATIO_TALL_MAX || tall < 1 / RATIO_WIDE_MAX) return null;
  return [w, h];
}

/**
 * Encoded media is 2x the frame so it stays sharp on a HiDPI laptop while the
 * sidebar itself is only ~268px wide. The *long* edge is fixed, which is what
 * makes a 4000x4000 logo and a 600x800 photo end up the same size on screen.
 */
const FRAME_LONG = 536;
const MEDIA_LONG = FRAME_LONG * 2;

function ratioOf(value) {
  const key = String(value === null || value === undefined ? '' : value).trim();
  if (Object.prototype.hasOwnProperty.call(RATIOS, key)) return key;
  return parseRatio(key) ? key : DEFAULT_RATIO;
}

/** `"3:2"` from two numbers the operator typed; null when it is out of band. */
function ratioFromSides(w, h) {
  const width = Math.round(Number(w));
  const height = Math.round(Number(h));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  const key = `${width}:${height}`;
  return parseRatio(key) ? key : null;
}

function sizeFor(ratioName, longEdge) {
  const [w, h] = parseRatio(ratioOf(ratioName));
  return w >= h
    ? { w: longEdge, h: Math.round((longEdge * h) / w) }
    : { w: Math.round((longEdge * w) / h), h: longEdge };
}

/** The box NTAPI draws, in CSS pixels, for a given ratio. */
function frameSize(ratioName) {
  return sizeFor(ratioName, FRAME_LONG);
}

/** What we upload: the same box at 2x. */
function mediaSize(ratioName) {
  return sizeFor(ratioName, MEDIA_LONG);
}

/** The default 2:1 frame, kept for the preview harness and older callers. */
const FRAME_W = frameSize(DEFAULT_RATIO).w;
const FRAME_H = frameSize(DEFAULT_RATIO).h;
const MEDIA_W = mediaSize(DEFAULT_RATIO).w;
const MEDIA_H = mediaSize(DEFAULT_RATIO).h;

/**
 * GitHub refuses a single file above 100MB and warns above 50MB. These caps are
 * far below that because a sponsor strip is fetched by every user on every
 * refresh: past a few hundred KB the banner costs more than it earns.
 */
const MAX_IMAGE_BYTES = 1_200_000;

/**
 * A clip goes to GitHub as-is (this tool has no ffmpeg by design), and GitHub
 * refuses any single file over 100MB. So that is the ceiling, not a round number
 * we picked: a bigger creative cannot be published at all.
 */
const MAX_VIDEO_BYTES = 100 * 1000 * 1000;
const MAX_POSTER_BYTES = 400_000;

/** Sidebar-height budget. A loop longer than this reads as an ad takeover. */
const MAX_VIDEO_SECONDS = 10;

/**
 * Text caps, matching the reader. Counted in code points: slicing Thai by
 * UTF-16 units detaches a tone mark from its consonant and renders a different
 * word.
 */
const MAX_LABEL = 40;
const MAX_TITLE = 80;
const MAX_ALT = 120;

const MAX_SLOTS = 8;
const MIN_ROTATE = 5;
const MAX_ROTATE = 120;
const DEFAULT_ROTATE = 15;

const IMAGE_EXT = ['webp', 'png', 'jpg', 'jpeg', 'gif'];
const VIDEO_EXT = ['mp4', 'webm'];

const MIME_BY_EXT = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function mimeFor(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || null;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}\u2026` : flat;
}

/**
 * A slot id doubles as the file name, so it goes through the same filter as any
 * other URL-ish token: lowercase, ascii only. Thai in a file name would need
 * percent-encoding in the raw URL and is impossible to type when debugging.
 */
function slug(value) {
  const base = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '');
  return base.slice(0, 48);
}

/** Rewrites the same name onto a new extension: `a/b.webp` -> `b.mp4`. */
function replaceExt(file, ext) {
  const name = String(file || '').split('/').pop() || '';
  const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${stem}.${ext}`;
}

function fileFor(id, kind, ext) {
  const stem = slug(id) || 'sponsor';
  return `media/${stem}.${String(ext).toLowerCase()}`;
}

function posterFor(id) {
  const stem = slug(id) || 'sponsor';
  return `media/${stem}-poster.webp`;
}

/**
 * An id is what NTAPI counts clicks under (`prefs.sponsorClicks`). Reusing an id
 * for a different sponsor would carry the old click count over to them, which is
 * the one number this whole exercise exists to report honestly — so ids end up
 * dated, e.g. `term24hr-2026-11`.
 */
function normalizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.enabled === false) return null;
  const id = slug(raw.id);
  if (!id) return null;

  const kind = raw.media && raw.media.type === 'video' ? 'video' : 'image';
  const allowed = kind === 'video' ? VIDEO_EXT : IMAGE_EXT;
  const file = String((raw.media && raw.media.file) || '');
  const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  if (!allowed.includes(ext)) return null;

  const alt = cleanText(raw.media && raw.media.alt, MAX_ALT) || 'Sponsor';
  const poster = raw.media && typeof raw.media.poster === 'string' ? raw.media.poster : '';
  const ratio = ratioOf(raw.media && raw.media.ratio);

  const th = raw.text && raw.text.th;
  const labelTh = cleanText(th && th.label, MAX_LABEL) || 'ผู้สนับสนุน';
  const titleTh = cleanText(th && th.title, MAX_TITLE);
  if (!titleTh) return null;
  const en = raw.text && raw.text.en;
  const labelEn = cleanText(en && en.label, MAX_LABEL) || 'Sponsor';
  const titleEn = cleanText(en && en.title, MAX_TITLE) || titleTh;

  return {
    id,
    enabled: true,
    url: cleanUrl(raw.url),
    media: {
      type: kind,
      file,
      ratio,
      ...(kind === 'video' && poster ? { poster } : {}),
      alt,
    },
    text: {
      th: { label: labelTh, title: titleTh },
      en: { label: labelEn, title: titleEn },
    },
  };
}

/**
 * Only https is accepted. NTAPI hands this to the real browser, so an `http:` or
 * `javascript:` entry is one click away from a user who trusts the app.
 */
function cleanUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return '';
    if (!parsed.hostname.includes('.')) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function clampRotate(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_ROTATE;
  return Math.min(MAX_ROTATE, Math.max(MIN_ROTATE, n));
}

/**
 * @returns {{version:1, updated:string, rotateSeconds:number, slots:object[]}|null}
 */
function buildFeed(slots, now = new Date()) {
  if (!Array.isArray(slots)) return null;
  const kept = [];
  const seen = new Set();
  for (const raw of slots) {
    const slot = normalizeSlot(raw);
    if (!slot) continue;
    if (!slot.url) continue;
    if (seen.has(slot.id)) continue;
    seen.add(slot.id);
    kept.push(slot);
    if (kept.length >= MAX_SLOTS) break;
  }
  if (!kept.length) return null;
  const rotateSeconds = clampRotate(
    slots.find((s) => s && typeof s.rotateSeconds === 'number')?.rotateSeconds,
  );
  return {
    version: 1,
    updated: now.toISOString(),
    rotateSeconds,
    slots: kept,
  };
}

/** The reader's own check, kept here so the tool refuses what NTAPI would drop. */
function readFeed(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  const kept = slots.map(normalizeSlot).filter((s) => s && s.url);
  if (!kept.length) return null;
  return {
    version: 1,
    updated: typeof raw.updated === 'string' ? raw.updated : '',
    rotateSeconds: clampRotate(raw.rotateSeconds),
    slots: kept,
  };
}

/**
 * Where NTAPI reads from. jsDelivr first because it caches at the edge and has
 * no anonymous rate limit; the raw host is the fallback when the CDN is wrong
 * about a file that was pushed a minute ago.
 */
const READ_BASE = [
  'https://raw.githubusercontent.com/Cheumklang/NTAPI-sponsor/main/',
  'https://cdn.jsdelivr.net/gh/Cheumklang/NTAPI-sponsor@main/',
];

module.exports = {
  FRAME_W,
  FRAME_H,
  MEDIA_W,
  MEDIA_H,
  RATIO_ORDER,
  RATIOS,
  DEFAULT_RATIO,
  RATIO_SIDES_MAX,
  RATIO_TALL_MAX,
  RATIO_WIDE_MAX,
  parseRatio,
  ratioOf,
  ratioFromSides,
  frameSize,
  mediaSize,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_POSTER_BYTES,
  MAX_VIDEO_SECONDS,
  MAX_LABEL,
  MAX_TITLE,
  MAX_ALT,
  MAX_SLOTS,
  MIN_ROTATE,
  MAX_ROTATE,
  DEFAULT_ROTATE,
  IMAGE_EXT,
  VIDEO_EXT,
  READ_BASE,
  mimeFor,
  cleanText,
  slug,
  replaceExt,
  fileFor,
  posterFor,
  cleanUrl,
  normalizeSlot,
  clampRotate,
  buildFeed,
  readFeed,
};
