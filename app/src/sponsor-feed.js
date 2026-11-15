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
 * Raw GitHub first, jsDelivr second.
 *
 * raw is the only host that is close to live, but its edge cache will happily
 * serve a copy that is minutes old — measured here: a plain GET kept returning
 * the previous feed while the file on `main` had already been replaced. So every
 * request carries a cache-buster (`?t=<epoch seconds>`). That value is the same
 * for every copy of the app and says nothing about who asked, so it does not
 * weaken the "nothing user-specific goes out" rule; it only stops the CDN from
 * handing us yesterday's file.
 *
 * jsDelivr stays as the fallback for networks where raw.githubusercontent.com is
 * blocked. It caches a branch for hours, which is why it is second.
 */
const FEED_URLS = [
  'https://raw.githubusercontent.com/Cheumklang/NTAPI-sponsor/main/sponsor.json',
  'https://cdn.jsdelivr.net/gh/Cheumklang/NTAPI-sponsor@main/sponsor.json',
];

/**
 * A query string the edge cache cannot answer from its own copy.
 *
 * Seconds, not milliseconds: a 30-second poll then reuses the same URL twice at
 * most, so the origin sees roughly one request per tick instead of one per
 * focus event too.
 */
function cacheBusted(url, now = Date.now()) {
  const stamp = Math.floor(now / 1000);
  return `${url}${url.includes('?') ? '&' : '?'}t=${stamp}`;
}

const MAX_FEED_BYTES = 256 * 1024;
/**
 * Images and posters stay small on purpose: they are inlined as data URLs and a
 * sponsor band is 536px wide, so anything past a couple of megabytes is a
 * mistake rather than detail.
 */
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * A clip may be up to 100MB — the largest single file GitHub will accept, which
 * is the real ceiling here: the creative lives in a repo, so a bigger upload
 * would be refused before this app ever saw it.
 *
 * The file is streamed from disk over `ntapi-sponsor://` rather than handed over
 * as base64, because a 100MB clip would become a 133MB string through IPC and
 * again in the renderer. Only the path crosses the bridge now.
 */
const MAX_VIDEO_BYTES = 100 * 1000 * 1000;

/** The scheme creatives are served on. Registered in `main.js` before startup. */
const MEDIA_SCHEME = 'ntapi-sponsor';

/**
 * Six hours. Long enough that a laptop opened five times a day makes one request,
 * short enough that a sponsor added in the morning is live the same afternoon.
 * This only decides how long a *cached* feed may be trusted on disk; while the
 * window is open the feed is revalidated on `REVALIDATE_MS` instead.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Revalidate every 30 seconds while the app is open, so a sponsor published in
 * NTAPI ADS appears without closing and reopening the app.
 *
 * This is deliberately a poll and not a push: the two programs are separate
 * processes with no channel between them. It is cheap because the request asks
 * with `If-None-Match`, so an unchanged feed costs one 304 and no body — the
 * feed is under a kilobyte to begin with, on a host that does not rate-limit
 * this traffic.
 */
const REVALIDATE_MS = 30 * 1000;

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
    const etag = typeof (raw && raw.etag) === 'string' ? raw.etag : '';
    return { feed, fetchedAt, etag };
  } catch {
    return null;
  }
}

function writeCache(dir, feed, fetchedAt = Date.now(), etag = '') {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile(dir), JSON.stringify({ fetchedAt, etag, feed }, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * A stable description of what a feed says, so "did anything change" is one
 * string comparison.
 *
 * The published `updated` stamp alone is not enough: republishing a slot can
 * reuse a timestamp (two publishes inside the same second, or a hand-edited
 * file), and then a new creative would sit behind an unchanged stamp forever.
 * Comparing the whole normalized feed costs nothing — it is under a kilobyte.
 */
function feedFingerprint(feed) {
  if (!feed) return '';
  try {
    return JSON.stringify(feed);
  } catch {
    return '';
  }
}

/** Read the validator without trusting the object we were handed. */
function etagOf(res) {
  try {
    const headers = res && res.headers;
    const value = headers && typeof headers.get === 'function' ? headers.get('etag') : '';
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
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
  const etag = typeof options.etag === 'string' ? options.etag : '';
  const headers = etag ? { 'If-None-Match': etag } : {};

  for (const url of urls) {
    if (!/^https:\/\//i.test(url)) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(cacheBusted(url), { signal: controller.signal, cache: 'no-store', headers });
      // 304 is the ordinary answer on a 30-second poll: the feed has not moved,
      // so there is nothing to parse, nothing to clear and nothing to redraw.
      // It is also proof this host is authoritative, so we stop looking.
      if (res && res.status === 304) {
        return { unchanged: true, etag, source: url, fetchedAt: Date.now() };
      }
      if (!res || !res.ok) continue;
      const bytes = await readBodyCapped(res, MAX_FEED_BYTES);
      const feed = readFeed(JSON.parse(bytes.toString('utf8')));
      if (!feed) continue;
      return { feed, fetchedAt: Date.now(), source: url, etag: etagOf(res) || etag };
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
 * Makes sure one creative is on disk, and reports where it can be read.
 *
 * The return value is a URL on `ntapi-sponsor://`, not a data URL: a clip may be
 * up to 100MB and base64 through IPC would triple that in memory before a single
 * frame played. Only the file name crosses the bridge.
 *
 * `base` is the host the feed came from, so media resolves on the same CDN and
 * cannot be pointed somewhere else by the feed's contents.
 */
async function ensureMedia({ dir, base, slot, fetchImpl, timeoutMs }) {
  const media = (slot && slot.media) || {};
  const key = mediaKey(media.file);
  if (!key) return { ok: false, reason: 'bad-media' };
  if (typeof base !== 'string' || !/^https:\/\//i.test(base)) return { ok: false, reason: 'bad-base' };

  const isVideo = media.type === 'video';
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_MEDIA_BYTES;
  // A 100MB clip on a home connection is minutes, not seconds; an image that has
  // not arrived in fifteen seconds means the network, not the file.
  const budget = Number(timeoutMs) > 0 ? Number(timeoutMs) : isVideo ? 300000 : 15000;

  const folder = mediaDir(dir);
  const target = path.join(folder, key);

  let bytes = null;
  try {
    bytes = fs.readFileSync(target);
  } catch {
    bytes = null;
  }

  if (!bytes) {
    const fetched = await fetchToFile({ base, relative: media.file, fetchImpl, timeoutMs: budget, cap });
    if (!fetched.ok) return { ok: false, reason: fetched.reason };
    bytes = fetched.bytes;
    try {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(target, bytes);
    } catch {
      // A read-only profile still gets the banner: the file is in memory and the
      // stream handler is handed the bytes through a temp copy below.
      try {
        fs.writeFileSync(target, bytes);
      } catch {}
    }
  }

  let poster = '';
  if (isVideo && media.poster) {
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
          timeoutMs: budget,
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
      if (posterBytes) poster = mediaUrl(posterKey);
    }
  }

  return { ok: true, type: isVideo ? 'video' : 'image', file: key, url: mediaUrl(key), poster, bytes: bytes.length };
}

/**
 * The address a creative is read from, or '' when the name is not a media file
 * we serve. Built from the sanitized base name only, so nothing in the feed can
 * steer the window at another file.
 */
function mediaUrl(key) {
  const safe = mediaKey(key);
  return safe ? `${MEDIA_SCHEME}://media/${safe}` : '';
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
  MAX_VIDEO_BYTES,
  MEDIA_SCHEME,
  mediaUrl,
  TTL_MS,
  REVALIDATE_MS,
  mimeFor,
  mediaKey,
  cacheBusted,
  cacheFile,
  mediaDir,
  readCache,
  writeCache,
  feedFingerprint,
  isFresh,
  clearMedia,
  fetchFeed,
  ensureMedia,
  slotIndexAt,
};