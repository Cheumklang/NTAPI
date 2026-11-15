'use strict';

/**
 * The sponsor strip at the bottom of the sidebar.
 *
 * The sponsor lives in `sponsor.json` next to main.js rather than being baked
 * into the renderer, so changing who appears there — or dropping the strip for a
 * while — is an edit and not a release. That also makes the file untrusted
 * input: a hand-edited typo must leave the sidebar exactly as it was, never take
 * the window down on start. `normalize()` therefore returns `null` whenever it
 * is not certain, and the caller hides the strip.
 *
 * Only https is accepted. The address is handed to the real browser, so an
 * `http:` or `javascript:` entry here would put something we cannot inspect one
 * click away from a user who trusts the app.
 *
 * The text is capped rather than wrapped: the strip sits in a 268px sidebar
 * above the status panel, and a sponsor who pastes a paragraph would push the
 * controls around instead of describing themselves.
 */

const MAX_TEXT = 80;

function cleanText(value) {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  // Count code points, not UTF-16 units — slicing Thai mid-mark detaches a tone
  // mark from its consonant and the word renders as a different one.
  const chars = [...flat];
  return chars.length > MAX_TEXT ? `${chars.slice(0, MAX_TEXT - 1).join('')}\u2026` : flat;
}

function cleanSlot(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const label = cleanText(node.label);
  const title = cleanText(node.title);
  if (!label || !title) return null;
  return { label, title };
}

/**
 * @returns {{enabled:true,id:string,url:string,text:{th:object,en:object}}|null}
 */
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.enabled !== true) return null;

  const id = cleanText(raw.id);
  if (!id || id.length > 64) return null;

  const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  // A bare host with no dot would resolve inside whatever network this machine
  // is on; a sponsor link is never that.
  if (!parsed.hostname.includes('.')) return null;

  const text = raw.text && typeof raw.text === 'object' ? raw.text : {};
  const th = cleanSlot(text.th);
  if (!th) return null;

  return {
    enabled: true,
    id,
    url: parsed.href,
    text: { th, en: cleanSlot(text.en) || th },
  };
}

/**
 * The live feed shape, produced by NTAPI ADS (`NTAPI ADS/src/feed.js`).
 *
 * Kept in step with that file by hand, because the two programs are built and
 * shipped separately: the tool must refuse a slot this reader would drop, and
 * this reader must not depend on the publishing tool being installed. A change
 * to a field name belongs in both files in one commit.
 *
 * Everything here duplicates a rule for the same reason `normalize()` does: the
 * feed arrives from a public repo, so it is untrusted input, and one bad slot
 * must cost that slot and not the sidebar.
 */
const MAX_SLOTS = 8;
const MIN_ROTATE = 5;
const MAX_ROTATE = 120;
const DEFAULT_ROTATE = 15;
const MAX_ALT = 120;
const IMAGE_EXT = ['webp', 'png', 'jpg', 'jpeg', 'gif'];
const VIDEO_EXT = ['mp4', 'webm'];

/**
 * The frame shapes the publisher can choose, mirrored from NTAPI ADS.
 * A slot whose ratio is missing or unknown falls back to 2:1, so an old
 * feed — and the bundled one — keeps working untouched.
 *
 * A custom frame is allowed too, but only inside the same band the publisher
 * enforces: integers up to 64 a side, never taller than 2.5x its width nor
 * wider than 5x its height. Outside that it is 2:1, so a hand-edited feed
 * still cannot claim a 400px band and push the session list away.
 */
const RATIOS = {
  '2:1': [2, 1],
  '16:9': [16, 9],
  '1:1': [1, 1],
  '4:5': [4, 5],
  '9:16': [9, 16],
};
const DEFAULT_RATIO = '2:1';
const RATIO_SIDES_MAX = 64;
const RATIO_TALL_MAX = 2.5;
const RATIO_WIDE_MAX = 5;

/** `[w, h]` for a preset or a legal custom `"w:h"`; null when out of band. */
function parseRatio(value) {
  const key = typeof value === 'string' ? value.trim() : '';
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

function ratioOf(value) {
  const key = typeof value === 'string' ? value.trim() : '';
  if (Object.prototype.hasOwnProperty.call(RATIOS, key)) return key;
  return parseRatio(key) ? key : DEFAULT_RATIO;
}

/** Height per unit of width — 0.5 for 2:1, 1 for a square, 16/9 for 9:16. */
function ratioValue(name) {
  const [w, h] = parseRatio(ratioOf(name));
  return h / w;
}

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

function normalizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.enabled === false) return null;
  const id = cleanText(raw.id);
  if (!id || id.length > 64) return null;

  const media = raw.media && typeof raw.media === 'object' ? raw.media : {};
  const kind = media.type === 'video' ? 'video' : 'image';
  const file = String(media.file || '');
  const ext = file.includes('.') ? file.split('.').pop().toLowerCase() : '';
  if (!(kind === 'video' ? VIDEO_EXT : IMAGE_EXT).includes(ext)) return null;
  const url = cleanUrl(raw.url);
  if (!url) return null;

  const th = cleanSlot(raw.text && raw.text.th);
  if (!th) return null;
  const en = cleanSlot(raw.text && raw.text.en) || th;

  return {
    id,
    enabled: true,
    url,
    media: {
      type: kind,
      file,
      ratio: ratioOf(media.ratio),
      ...(kind === 'video' && typeof media.poster === 'string' && media.poster ? { poster: media.poster } : {}),
      alt: cleanText(media.alt, MAX_ALT) || 'Sponsor',
    },
    text: { th, en },
  };
}

function clampRotate(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_ROTATE;
  return Math.min(MAX_ROTATE, Math.max(MIN_ROTATE, n));
}

/**
 * @returns {{version:1, updated:string, rotateSeconds:number, slots:object[]}|null}
 */
function readFeed(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const list = Array.isArray(raw.slots) ? raw.slots : [];
  const kept = [];
  const seen = new Set();
  for (const item of list) {
    const slot = normalizeSlot(item);
    if (!slot || seen.has(slot.id)) continue;
    seen.add(slot.id);
    kept.push(slot);
    if (kept.length >= MAX_SLOTS) break;
  }
  if (!kept.length) return null;
  return {
    version: 1,
    updated: typeof raw.updated === 'string' ? raw.updated : '',
    rotateSeconds: clampRotate(raw.rotateSeconds),
    slots: kept,
  };
}

module.exports = {
  normalize,
  MAX_TEXT,
  MAX_SLOTS,
  MIN_ROTATE,
  MAX_ROTATE,
  DEFAULT_ROTATE,
  MAX_ALT,
  IMAGE_EXT,
  VIDEO_EXT,
  RATIOS,
  DEFAULT_RATIO,
  RATIO_SIDES_MAX,
  RATIO_TALL_MAX,
  RATIO_WIDE_MAX,
  parseRatio,
  ratioOf,
  ratioValue,
  normalizeSlot,
  readFeed,
  clampRotate,
  cleanUrl,
};
