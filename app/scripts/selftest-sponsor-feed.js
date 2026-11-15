'use strict';

/**
 * The live sponsor feed, offline.
 *
 * Everything here runs against a fake `fetch` and a temp folder, because the two
 * things worth proving are not "does the network work" but "does a hostile or
 * broken feed cost us anything": a slot that would be dropped must be dropped, a
 * media path that points outside the cache folder must be refused, and a feed
 * that fails must leave the previous one in place.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sponsor = require('../src/sponsor');
const feed = require('../src/sponsor-feed');

let pass = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    pass += 1;
  } catch (err) {
    console.error(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-'));

function slot(over = {}) {
  return {
    id: 'term24hr-2026-11',
    enabled: true,
    url: 'https://www.term24hr.in.th/',
    media: { type: 'image', file: 'media/term24hr-2026-11.webp', alt: 'Term24hr' },
    text: {
      th: { label: 'ผู้สนับสนุน', title: 'เติมเกมราคาถูก' },
      en: { label: 'Sponsor', title: 'Game top-ups' },
    },
    ...over,
  };
}

/** A fetch stand-in whose body is a real async iterable, like undici's. */
function response(body, status = 200) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  return {
    ok: status >= 200 && status < 300,
    status,
    body: (async function* iterate() {
      // Two chunks on purpose: the size guard has to count across chunks.
      const mid = Math.ceil(bytes.length / 2) || 0;
      yield bytes.subarray(0, mid);
      if (bytes.length > mid) yield bytes.subarray(mid);
    })(),
  };
}

/* ------------------------------ sponsor.js ------------------------------- */

check('readFeed keeps a good slot and reports the interval', () => {
  const out = sponsor.readFeed({ version: 1, rotateSeconds: 20, slots: [slot()] });
  assert.strictEqual(out.rotateSeconds, 20);
  assert.strictEqual(out.slots.length, 1);
  assert.strictEqual(out.slots[0].media.type, 'image');
});

check('readFeed refuses a slot with no https link', () => {
  assert.strictEqual(sponsor.readFeed({ slots: [slot({ url: 'http://x.com/' })] }), null);
  assert.strictEqual(sponsor.readFeed({ slots: [slot({ url: 'javascript:alert(1)' })] }), null);
});

check('readFeed refuses unknown media types and svg', () => {
  assert.strictEqual(
    sponsor.readFeed({ slots: [slot({ media: { type: 'image', file: 'media/a.svg' } })] }),
    null,
  );
  assert.strictEqual(
    sponsor.readFeed({ slots: [slot({ media: { type: 'video', file: 'media/a.webp' } })] }),
    null,
  );
});

check('readFeed drops duplicates and caps the list', () => {
  const many = [];
  for (let i = 0; i < 20; i += 1) many.push(slot({ id: `s${i}` }));
  many.push(slot({ id: 's0' }));
  const out = sponsor.readFeed({ slots: many });
  assert.strictEqual(out.slots.length, sponsor.MAX_SLOTS);
  assert.strictEqual(new Set(out.slots.map((s) => s.id)).size, sponsor.MAX_SLOTS);
});

check('readFeed falls back to Thai wording for English', () => {
  const out = sponsor.readFeed({ slots: [slot({ text: { th: { label: 'ผู้สนับสนุน', title: 'เติมเกม' } } })] });
  assert.strictEqual(out.slots[0].text.en.title, 'เติมเกม');
});

check('readFeed clamps a silly interval', () => {
  assert.strictEqual(sponsor.readFeed({ rotateSeconds: 0, slots: [slot()] }).rotateSeconds, sponsor.MIN_ROTATE);
  assert.strictEqual(sponsor.readFeed({ rotateSeconds: 1e6, slots: [slot()] }).rotateSeconds, sponsor.MAX_ROTATE);
});

check('the legacy single-sponsor file still normalizes', () => {
  // The bundled sponsor.json is a different shape and must keep working, or an
  // offline first start loses the strip it has always had.
  const legacy = sponsor.normalize({
    enabled: true,
    id: 'term24hr',
    url: 'https://www.term24hr.in.th/',
    text: { th: { label: 'ผู้สนับสนุน', title: 'เติมเกม' } },
  });
  assert.ok(legacy);
  assert.strictEqual(legacy.id, 'term24hr');
});

/* ---------------------------- sponsor-feed.js ---------------------------- */

check('media names cannot escape the cache folder', () => {
  assert.strictEqual(feed.mediaKey('media/a.webp'), 'a.webp');
  // A path is stripped to its base name, and a base name that is not a media
  // file we serve is refused outright — so this is the friendly half of the
  // guard, not the whole of it.
  assert.strictEqual(feed.mediaKey('../../prefs.json'), '');
  assert.strictEqual(feed.mediaKey('media/..%2f..%2fprefs.json'), '');
  assert.strictEqual(feed.mediaKey('media/../evil.webp'), 'evil.webp');
  assert.strictEqual(feed.mediaKey('media/a.exe'), '');
  assert.strictEqual(feed.mediaKey('.webp'), '');
  assert.strictEqual(feed.mediaKey(''), '');
});

check('mime is decided by extension, never by the feed', () => {
  assert.strictEqual(feed.mimeFor('a.webp'), 'image/webp');
  assert.strictEqual(feed.mimeFor('a.MP4'), 'video/mp4');
  assert.strictEqual(feed.mimeFor('a.exe'), '');
});

check('a cached feed round-trips through disk', () => {
  const built = sponsor.readFeed({ updated: 'v1', rotateSeconds: 12, slots: [slot()] });
  feed.writeCache(tmpDir, built, 12345);
  const back = feed.readCache(tmpDir);
  assert.strictEqual(back.fetchedAt, 12345);
  assert.strictEqual(back.feed.slots[0].id, 'term24hr-2026-11');
  assert.strictEqual(back.feed.rotateSeconds, 12);
});

check('a corrupt cache reads as nothing rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-bad-'));
  fs.writeFileSync(path.join(dir, 'sponsor-feed.json'), '{not json');
  assert.strictEqual(feed.readCache(dir), null);
  fs.writeFileSync(path.join(dir, 'sponsor-feed.json'), JSON.stringify({ feed: { slots: [] } }));
  assert.strictEqual(feed.readCache(dir), null);
});

check('freshness is a window, not a flag', () => {
  assert.strictEqual(feed.isFresh({ fetchedAt: 1000 }, 1000 + 1000), true);
  assert.strictEqual(feed.isFresh({ fetchedAt: 1000 }, 1000 + feed.TTL_MS + 1), false);
  assert.strictEqual(feed.isFresh(null), false);
  assert.strictEqual(feed.isFresh({ fetchedAt: 0 }), false);
});

check('the live revalidate tick is 30 seconds, not the 6-hour cache lifetime', () => {
  // A sponsor published while the app is open has to appear without a restart,
  // and the user picked 30 seconds over five minutes. Guard both ends: a tick
  // that fell back to TTL_MS is the bug this exists to prevent.
  assert.strictEqual(feed.REVALIDATE_MS, 30 * 1000);
  assert.ok(feed.REVALIDATE_MS < feed.TTL_MS);
});

check('two different feeds never share a fingerprint', () => {
  // The published `updated` stamp is not enough on its own: two publishes inside
  // the same second, or a hand-edited file, reuse it. A republished slot with
  // the same stamp still has to register as a change, or the app keeps showing
  // yesterday's picture under today's caption.
  const a = sponsor.readFeed({ updated: 'same', slots: [slot({ id: 'a' })] });
  const b = sponsor.readFeed({ updated: 'same', slots: [slot({ id: 'b' })] });
  assert.strictEqual(a.updated, b.updated);
  assert.notStrictEqual(feed.feedFingerprint(a), feed.feedFingerprint(b));
  assert.strictEqual(feed.feedFingerprint(a), feed.feedFingerprint(sponsor.readFeed({ updated: 'same', slots: [slot({ id: 'a' })] })));
  assert.strictEqual(feed.feedFingerprint(null), '');
});

check('the cache remembers the validator across a restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-etag-'));
  const built = sponsor.readFeed({ updated: 'v9', slots: [slot()] });
  feed.writeCache(dir, built, 42, 'W/"abc123"');
  const back = feed.readCache(dir);
  assert.strictEqual(back.etag, 'W/"abc123"');
  // An old cache file with no validator must still load — every installed copy
  // has one on disk already.
  fs.writeFileSync(path.join(dir, 'sponsor-feed.json'), JSON.stringify({ fetchedAt: 7, feed: built }));
  const legacy = feed.readCache(dir);
  assert.strictEqual(legacy.etag, '');
  assert.strictEqual(legacy.fetchedAt, 7);
  fs.rmSync(dir, { recursive: true, force: true });
});

check('rotation lands on the slot it would have reached', () => {
  assert.strictEqual(feed.slotIndexAt(15, 1, 0), 0);
  assert.strictEqual(feed.slotIndexAt(15, 3, 0), 0);
  assert.strictEqual(feed.slotIndexAt(15, 3, 15_000), 1);
  assert.strictEqual(feed.slotIndexAt(15, 3, 30_000), 2);
  assert.strictEqual(feed.slotIndexAt(15, 3, 45_000), 0);
  // A laptop that slept through several rotations must not replay them.
  assert.strictEqual(feed.slotIndexAt(15, 3, 15_000 * 7), 1);
  assert.strictEqual(feed.slotIndexAt(0, 4, 5_000), 0);
});

check('the five published shapes are understood, plus a bounded custom frame', () => {
  assert.deepStrictEqual(Object.keys(sponsor.RATIOS), ['2:1', '16:9', '1:1', '4:5', '9:16']);
  for (const name of Object.keys(sponsor.RATIOS)) {
    assert.strictEqual(sponsor.ratioOf(name), name);
  }
  // A custom frame inside the band survives; one outside it becomes 2:1.
  assert.strictEqual(sponsor.ratioOf('3:2'), '3:2');
  assert.deepStrictEqual(sponsor.parseRatio('3:2'), [3, 2]);
  assert.strictEqual(sponsor.ratioOf('1:20'), '2:1');
  assert.strictEqual(sponsor.ratioOf('20:1'), '2:1');
  assert.strictEqual(sponsor.ratioOf(undefined), '2:1');
  assert.strictEqual(sponsor.ratioOf('toString'), '2:1');
});

check('ratioValue is height per width, so a bigger number is a shorter band', () => {
  assert.strictEqual(sponsor.ratioValue('2:1'), 0.5);
  assert.strictEqual(sponsor.ratioValue('1:1'), 1);
  assert.strictEqual(sponsor.ratioValue('4:5'), 1.25);
  assert.ok(Math.abs(sponsor.ratioValue('16:9') - 9 / 16) < 1e-9);
  assert.ok(Math.abs(sponsor.ratioValue('9:16') - 16 / 9) < 1e-9);
  assert.ok(Math.abs(sponsor.ratioValue('3:2') - 2 / 3) < 1e-9);
  // Unknown → the default, never NaN: a NaN would reach CSS and blank the band.
  assert.strictEqual(sponsor.ratioValue('nope'), 0.5);
});

check('a feed keeps the shape each slot was published in', () => {
  const out = sponsor.readFeed({
    slots: [
      slot({ id: 'a', media: { type: 'image', file: 'media/a.webp', ratio: '1:1' } }),
      slot({ id: 'b', media: { type: 'image', file: 'media/b.webp', ratio: '4:5' } }),
      slot({ id: 'c', media: { type: 'image', file: 'media/c.webp' } }),
    ],
  });
  assert.deepStrictEqual(out.slots.map((s) => s.media.ratio), ['1:1', '4:5', '2:1']);
});



(async () => {
  await checkAsync('fetchFeed takes the first host that answers with a real feed', async () => {
    const body = JSON.stringify({ version: 1, rotateSeconds: 10, slots: [slot()] });
    const out = await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json', 'https://b.test/sponsor.json'],
      fetchImpl: async (url) => (url.includes('a.test') ? response(body) : response('', 500)),
    });
    assert.ok(out);
    assert.strictEqual(out.source, 'https://a.test/sponsor.json');
    assert.strictEqual(out.feed.slots.length, 1);
  });

  await checkAsync('a broken first host falls through to the second', async () => {
    const body = JSON.stringify({ slots: [slot()] });
    const out = await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json', 'https://b.test/sponsor.json'],
      fetchImpl: async (url) => (url.includes('a.test') ? response('{oops') : response(body)),
    });
    assert.strictEqual(out.source, 'https://b.test/sponsor.json');
  });

  await checkAsync('every host failing yields null, never a throw', async () => {
    const out = await feed.fetchFeed({
      urls: ['https://a.test/x', 'https://b.test/x'],
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    assert.strictEqual(out, null);
  });

  await checkAsync('a feed bigger than the cap is refused', async () => {
    const huge = JSON.stringify({ slots: [slot()], pad: 'x'.repeat(feed.MAX_FEED_BYTES + 64) });
    const out = await feed.fetchFeed({ urls: ['https://a.test/x'], fetchImpl: async () => response(huge) });
    assert.strictEqual(out, null);
  });

  await checkAsync('a non-https feed URL is never requested', async () => {
    let called = 0;
    const out = await feed.fetchFeed({
      urls: ['http://a.test/x', 'file:///c:/x'],
      fetchImpl: async () => {
        called += 1;
        return response('{}');
      },
    });
    assert.strictEqual(out, null);
    assert.strictEqual(called, 0);
  });

  await checkAsync('ensureMedia downloads once, then reads from disk', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    const bytes = Buffer.from('fake-webp-bytes');
    let downloads = 0;
    const fetchImpl = async () => {
      downloads += 1;
      return response(bytes);
    };
    const built = sponsor.readFeed({ slots: [slot()] });

    const first = await feed.ensureMedia({ dir, base: 'https://cdn.test/gh/x@main/', slot: built.slots[0], fetchImpl });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.type, 'image');
    // A creative is handed over as an address on our own scheme, not as base64:
    // a 100MB clip as a data URL would be three copies of itself in memory.
    assert.strictEqual(first.url, `${feed.MEDIA_SCHEME}://media/${first.file}`);
    assert.strictEqual(first.dataUrl, undefined);
    assert.strictEqual(downloads, 1);

    const second = await feed.ensureMedia({ dir, base: 'https://cdn.test/gh/x@main/', slot: built.slots[0], fetchImpl });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(downloads, 1, 'second read hit the network');
    assert.strictEqual(first.url, second.url);
  });

  await checkAsync('ensureMedia refuses a non-https host', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    const built = sponsor.readFeed({ slots: [slot()] });
    const out = await feed.ensureMedia({
      dir,
      base: 'http://cdn.test/',
      slot: built.slots[0],
      fetchImpl: async () => response('x'),
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, 'bad-base');
  });

  await checkAsync('ensureMedia refuses an oversized creative', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    // Images keep the small ceiling; the video ceiling is the GitHub limit and is
    // checked separately below (allocating 100MB here would just slow the suite).
    const built = sponsor.readFeed({ slots: [slot({ media: { type: 'image', file: 'media/a.webp' } })] });
    const out = await feed.ensureMedia({
      dir,
      base: 'https://cdn.test/',
      slot: built.slots[0],
      fetchImpl: async () => response(Buffer.alloc(feed.MAX_MEDIA_BYTES + 32)),
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, 'too-big');
  });

  await checkAsync('a video may be as big as GitHub allows, and no bigger', async () => {
    // 100MB is not a preference: GitHub refuses a larger single file, so the app
    // and the publisher have to agree on the same number or one of them lies.
    assert.strictEqual(feed.MAX_VIDEO_BYTES, 100 * 1000 * 1000);
    assert.ok(feed.MAX_VIDEO_BYTES > feed.MAX_MEDIA_BYTES * 10);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    const built = sponsor.readFeed({ slots: [slot({ media: { type: 'video', file: 'media/a.mp4' } })] });
    // One byte over the ceiling, refused without ever holding 100MB.
    const out = await feed.ensureMedia({
      dir,
      base: 'https://cdn.test/',
      slot: built.slots[0],
      fetchImpl: async () => {
        const chunk = Buffer.alloc(1024 * 1024);
        let sent = 0;
        return {
          ok: true,
          status: 200,
          body: (async function* iterate() {
            // 101 chunks of 1MB: past the ceiling, but only one chunk in memory.
            while (sent <= 100) {
              sent += 1;
              yield chunk;
            }
          })(),
        };
      },
    });
    assert.strictEqual(out.ok, false);
    assert.strictEqual(out.reason, 'too-big');
  });

  await checkAsync('a video also brings its poster', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    const built = sponsor.readFeed({
      slots: [
        slot({
          media: { type: 'video', file: 'media/a.mp4', poster: 'media/a-poster.webp', alt: 'v' },
        }),
      ],
    });
    const out = await feed.ensureMedia({
      dir,
      base: 'https://cdn.test/',
      slot: built.slots[0],
      fetchImpl: async (url) => response(url.endsWith('a-poster.webp') ? 'poster-bytes' : 'video-bytes'),
    });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.type, 'video');
    assert.strictEqual(out.poster, `${feed.MEDIA_SCHEME}://media/a-poster.webp`);
  });

  await checkAsync('a new feed clears the old creatives', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    fs.mkdirSync(feed.mediaDir(dir), { recursive: true });
    fs.writeFileSync(path.join(feed.mediaDir(dir), 'old.webp'), 'x');
    feed.clearMedia(dir);
    assert.strictEqual(fs.existsSync(feed.mediaDir(dir)), false);
  });

  await checkAsync('a 304 is "nothing changed", not a failure', async () => {
    // The ordinary answer on a 30-second poll. Treating it as an error would
    // fall through to jsDelivr, which caches a branch for hours — the exact
    // stale-copy bug this poll exists to avoid.
    const out = await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json', 'https://b.test/sponsor.json'],
      etag: 'W/"v1"',
      fetchImpl: async (url) => (url.includes('a.test') ? response('', 304) : response('{}')),
    });
    assert.ok(out, 'a 304 produced null');
    assert.strictEqual(out.unchanged, true);
    assert.strictEqual(out.source, 'https://a.test/sponsor.json');
    assert.strictEqual(out.feed, undefined);
  });

  await checkAsync('the validator is offered back to the host', async () => {
    let seen = null;
    await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json'],
      etag: 'W/"v1"',
      fetchImpl: async (_url, init) => {
        seen = init && init.headers ? init.headers['If-None-Match'] : null;
        return response(JSON.stringify({ slots: [slot()] }));
      },
    });
    assert.strictEqual(seen, 'W/"v1"');
  });

  await checkAsync('a response header supplies the next validator', async () => {
    const body = JSON.stringify({ slots: [slot()] });
    const out = await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json'],
      fetchImpl: async () => ({
        ...response(body),
        headers: { get: (name) => (String(name).toLowerCase() === 'etag' ? 'W/"next"' : null) },
      }),
    });
    assert.strictEqual(out.etag, 'W/"next"');
  });

  await checkAsync('every request busts the edge cache, and reports the clean host', async () => {
    // Measured on the real feed: raw.githubusercontent.com kept answering with
    // the previous sponsor.json for minutes, so a publish looked like it never
    // happened. The busting value is a bare timestamp — identical for every
    // install — and `source` stays clean, because it is what media resolves
    // against.
    let requested = '';
    const out = await feed.fetchFeed({
      urls: ['https://a.test/sponsor.json'],
      fetchImpl: async (url) => {
        requested = url;
        return response(JSON.stringify({ slots: [slot()] }));
      },
    });
    assert.match(requested, /^https:\/\/a\.test\/sponsor\.json\?t=\d+$/);
    assert.strictEqual(out.source, 'https://a.test/sponsor.json');
    assert.strictEqual(feed.cacheBusted('https://a.test/x?y=1', 5000), 'https://a.test/x?y=1&t=5');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`${pass} checks passed`);
})();