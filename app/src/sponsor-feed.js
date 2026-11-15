'use strict';

/**
 * The live sponsor feed.
 *
 * `sponsor.json` next to this file is the sponsor that ships with a build; this
 * module is the one that can change without a release. It reads a small feed
 * published by NTAPI ADS, caches it in userData, and downloads each creative
 * once into `sponsor-media/` so a banner is a local file by the time it is
 * shown.
 *
 * Three properties matter more than speed here:
 *
 * - **Nothing user-specific goes out.** The only requests are for static files;
 *   there is no id in the URL and no query string. A sponsor can count how many
 *   copies of a banner were fetched, not who fetched it.
 * - **No network means no breakage.** A missing feed falls back to the last
 *   cache, then to the bundled config, then to a hidden strip. Every path ends
 *   in something the sidebar can draw.
 * - **Bounded by construction.** The feed is capped at 256KB and a creative at
 *   8MB; both are enforced while the bytes are still streaming, because `Content-
 *   Length` is a claim and the stream is the truth.
 */

const path = require('node:path');
const fs = require('node:fs');

const { readFeed } = require('./sponsor');

/**
 * Raw GitHub first, jsDelivr second. jsDelivr caches a branch for up to twelve
 * hours, which is longer than a sponsor is willing to wait to go live; raw
 * revalidates in minutes and has no rate limit for this traffic level. jsDelivr
 * stays as the fallback for networks where raw.githubusercontent.com is blocked.
 */
const FEED_URLS = [
  'https://raw.githubusercontent.com/Cheumklang/NTAPI-sponsor/main/sponsor.json',
  'https://cdn.jsdelivr.net/gh/Cheumklang/NTAPI-sponsor@main/sponsor.json',
];

const MAX_FEED_BYTES = 256 * 1024;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Six hours. Long enough that a laptop opened five times a day makes one request,
 * short enough that a sponsor added in the morning is live the same afternoon.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

const MIME_BY_EXT = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

function mimeFor(file) {
  const ext = String(file || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || '';
}

/**
 * Only the base name is used. `media.file` comes from a file we do not control,
 * and `../../prefs.json` written to disk would be a small disaster.
 */
function mediaKey(file) {
  const base = String(file || '').split('/').pop() || '';
  const safe = base.replace(/[^A-Za-z0-9._-]/g, '');
  if (!safe || safe.startsWith('.')) return '';
  if (!mimeFor(safe)) return '';
  return safe;
}

function cacheFile(dir) {
  return path.join(dir, 'sponsor-feed.json');
}

function mediaDir(dir) {
  return path.join(dir, 'sponsor-media');
}

function readCache(dir) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(dir), 'utf8'));
    const feed = readFeed(raw && raw.feed);
    if (!feed) return null;
    const fetchedAt = Number(raw && raw.fetchedAt) || 0;
    return { feed, fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(dir, feed, fetchedAt = Date.now()) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile(dir), JSON.stringify({ fetchedAt, feed }, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function isFresh(cached, now = Date.now(), ttl = TTL_MS) {
  if (!cached || !cached.fetchedAt) return false;
  return now - cached.fetchedAt < ttl;
}

/**
 * A new feed means old creatives are dead weight, so the media folder is emptied
 * when the published timestamp changes. Files are re-downloaded on demand, which
 * is cheap because only the slot being shown is ever fetched.
 */
function clearMedia(dir) {
  try {
    fs.rmSync(mediaDir(dir), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function readBodyCapped(res, cap) {
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > cap) throw new Error('too-big');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @param {{urls?:string[], fetchImpl?:Function, timeoutMs?:number}} options
 * @returns {Promise<{feed:object, fetchedAt:number, source:string}|null>}
 */
async function fetchFeed(options = {}) {
  const urls = Array.isArray(options.urls) && options.urls.length ? options.urls : FEED_URLS;
  const doFetch = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 6000;

  for (const url of urls) {
    if (!/^https:\/\//i.test(url)) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res || !res.ok) continue;
      const bytes = await readBodyCapped(res, MAX_FEED_BYTES);
      const feed = readFeed(JSON.parse(bytes.toString('utf8')));
      if (!feed) continue;
      return { feed, fetchedAt: Date.now(), source: url };
    } catch {
      // A CDN that is wrong about a file pushed a minute ago, or a laptop with no
      // network: the next URL, or the cache, is the answer. Never a dialog.
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Downloads one creative into the media folder and returns it as a data URL.
 *
 * `base` is the host the feed came from, so media resolves on the same CDN and
 * cannot be pointed somewhere else by the feed's contents.
 */
async function ensureMedia({ dir, base, slot, fetchImpl, timeoutMs = 10000 }) {
  const media = (slot && slot.media) || {};
  const key = mediaKey(media.file);
  if (!key) return { ok: false, reason: 'bad-media' };
  if (typeof base !== 'string' || !/^https:\/\//i.test(base)) return { ok: false, reason: 'bad-base' };

  const folder = mediaDir(dir);
  const target = path.join(folder, key);
  const mime = mimeFor(key);

  let bytes = null;
  try {
    bytes = fs.readFileSync(target);
  } catch {
    bytes = null;
  }

  if (!bytes) {
    const fetched = await fetchToFile({ base, relative: media.file, fetchImpl, timeoutMs });
    if (!fetched.ok) return { ok: false, reason: fetched.reason };
    bytes = fetched.bytes;
    try {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(target, bytes);
    } catch {
      // A read-only profile still gets the banner: the bytes are in hand.
    }
  }

  const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  let poster = null;
  if (media.type === 'video' && media.poster) {
    const posterKey = mediaKey(media.poster);
    if (posterKey) {
      // The poster is a second file the feed mentions, so it is cached the same
      // way: read it if it is already here, otherwise fetch and keep it. Without
      // this the clip would show a black rectangle until the first frame, and
      // nothing at all under reduced motion.
      const posterTarget = path.join(folder, posterKey);
      let posterBytes = null;
      try {
        posterBytes = fs.readFileSync(posterTarget);
      } catch {
        posterBytes = null;
      }
      if (!posterBytes) {
        const fetchedPoster = await fetchToFile({
          base,
          relative: media.poster,
          fetchImpl,
          timeoutMs,
          cap: MAX_MEDIA_BYTES,
        });
        if (fetchedPoster.ok) {
          posterBytes = fetchedPoster.bytes;
          try {
            fs.mkdirSync(folder, { recursive: true });
            fs.writeFileSync(posterTarget, posterBytes);
          } catch {}
        }
      }
      if (posterBytes) poster = `data:${mimeFor(posterKey)};base64,${posterBytes.toString('base64')}`;
    }
  }

  return { ok: true, type: media.type === 'video' ? 'video' : 'image', dataUrl, poster, bytes: bytes.length };
}

/**
 * One capped GET, from a host the feed chose to a file path the feed chose.
 * Shared by creative and poster so both obey the same ceiling.
 */
async function fetchToFile({ base, relative, fetchImpl, timeoutMs = 10000, cap = MAX_MEDIA_BYTES }) {
  if (typeof base !== 'string' || !/^https:\/\//i.test(base)) return { ok: false, reason: 'bad-base' };
  const url = `${base.replace(/\/+$/, '')}/${String(relative).replace(/^\/+/, '')}`;
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: 'bad-base' };
  const doFetch = fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: controller.signal });
    if (!res || !res.ok) return { ok: false, reason: `http-${res ? res.status : 'none'}` };
    const bytes = await readBodyCapped(res, cap);
    return { ok: true, bytes };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The feed's own timer says when to swap, but the swap is computed rather than
 * counted: a renderer that slept through three rotations (laptop lid closed) must
 * land on the slot it would have reached, not replay them.
 */
function slotIndexAt(rotateSeconds, count, elapsedMs) {
  if (!count || count < 1) return 0;
  const period = Math.max(5, Number(rotateSeconds) || 15) * 1000;
  const ticks = Math.floor(Math.max(0, Number(elapsedMs) || 0) / period);
  return ticks % count;
}

module.exports = {
  FEED_URLS,
  MAX_FEED_BYTES,
  MAX_MEDIA_BYTES,
  TTL_MS,
  mimeFor,
  mediaKey,
  cacheFile,
  mediaDir,
  readCache,
  writeCache,
  isFresh,
  clearMedia,
  fetchFeed,
  ensureMedia,
  slotIndexAt,
};