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

check('the four published shapes are understood, anything else is 2:1', () => {
  assert.deepStrictEqual(Object.keys(sponsor.RATIOS), ['2:1', '16:9', '1:1', '4:5']);
  for (const name of Object.keys(sponsor.RATIOS)) {
    assert.strictEqual(sponsor.ratioOf(name), name);
  }
  assert.strictEqual(sponsor.ratioOf('9:16'), '2:1');
  assert.strictEqual(sponsor.ratioOf(undefined), '2:1');
  assert.strictEqual(sponsor.ratioOf('toString'), '2:1');
});

check('ratioValue is height per width, so a bigger number is a shorter band', () => {
  assert.strictEqual(sponsor.ratioValue('2:1'), 0.5);
  assert.strictEqual(sponsor.ratioValue('1:1'), 1);
  assert.strictEqual(sponsor.ratioValue('4:5'), 1.25);
  assert.ok(Math.abs(sponsor.ratioValue('16:9') - 9 / 16) < 1e-9);
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
    assert.ok(first.dataUrl.startsWith('data:image/webp;base64,'));
    assert.strictEqual(downloads, 1);

    const second = await feed.ensureMedia({ dir, base: 'https://cdn.test/gh/x@main/', slot: built.slots[0], fetchImpl });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(downloads, 1, 'second read hit the network');
    assert.strictEqual(first.dataUrl, second.dataUrl);
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
    const built = sponsor.readFeed({ slots: [slot({ media: { type: 'video', file: 'media/a.mp4' } })] });
    const out = await feed.ensureMedia({
      dir,
      base: 'https://cdn.test/',
      slot: built.slots[0],
      fetchImpl: async () => response(Buffer.alloc(feed.MAX_MEDIA_BYTES + 32)),
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
    assert.ok(out.poster.startsWith('data:image/webp;base64,'));
  });

  await checkAsync('a new feed clears the old creatives', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-sponsor-media-'));
    fs.mkdirSync(feed.mediaDir(dir), { recursive: true });
    fs.writeFileSync(path.join(feed.mediaDir(dir), 'old.webp'), 'x');
    feed.clearMedia(dir);
    assert.strictEqual(fs.existsSync(feed.mediaDir(dir)), false);
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(`${pass} checks passed`);
})();