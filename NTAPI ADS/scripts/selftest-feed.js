'use strict';

/**
 * The published `sponsor.json` is the only contract between NTAPI ADS and NTAPI.
 * These checks pin both directions: what this tool agrees to write, and what the
 * reader will keep.
 */

const assert = require('node:assert');
const feed = require('../src/feed');

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

function slot(over = {}) {
  return {
    id: 'term24hr-2026-11',
    enabled: true,
    url: 'https://www.term24hr.in.th/',
    media: { type: 'image', file: 'media/term24hr-2026-11.webp', alt: 'Term24hr' },
    text: {
      th: { label: 'ผู้สนับสนุน', title: 'เติมเกมราคาถูก รับของใน 1–5 นาที' },
      en: { label: 'Sponsor', title: 'Game top-ups, delivered in 1–5 minutes' },
    },
    ...over,
  };
}

check('frame is 2:1', () => {
  assert.strictEqual(feed.FRAME_W / feed.FRAME_H, 2);
  assert.strictEqual(feed.MEDIA_W, feed.FRAME_W * 2);
  assert.strictEqual(feed.MEDIA_H, feed.FRAME_H * 2);
});

check('slug keeps it a file name', () => {
  assert.strictEqual(feed.slug('Term24hr 2026/11'), 'term24hr-2026-11');
  assert.strictEqual(feed.slug('  --x--  '), 'x');
  assert.strictEqual(feed.slug('เติมเกม'), '');
  assert.strictEqual(feed.slug('a'.repeat(80)).length, 48);
});

check('file paths stay inside media/', () => {
  assert.strictEqual(feed.fileFor('My Sponsor', 'image', 'WEBP'), 'media/my-sponsor.webp');
  assert.strictEqual(feed.posterFor('My Sponsor'), 'media/my-sponsor-poster.webp');
  // A dotted id must not escape the folder.
  assert.ok(!feed.fileFor('../evil', 'image', 'webp').includes('..'));
});

check('Thai text is cut by code point, not by UTF-16 unit', () => {
  const long = 'ก'.repeat(200);
  const out = feed.cleanText(long, 10);
  assert.strictEqual([...out].length, 10);
  assert.ok(out.endsWith('\u2026'));
  // No lone surrogate may survive the cut.
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(out));
});

check('a full slot survives normalizeSlot', () => {
  const out = feed.normalizeSlot(slot());
  assert.strictEqual(out.id, 'term24hr-2026-11');
  assert.strictEqual(out.media.type, 'image');
  assert.strictEqual(out.text.en.title, 'Game top-ups, delivered in 1–5 minutes');
});

check('http and javascript links are refused', () => {
  assert.strictEqual(feed.normalizeSlot(slot({ url: 'http://x.com' })).url, '');
  assert.strictEqual(feed.normalizeSlot(slot({ url: 'javascript:alert(1)' })).url, '');
  assert.strictEqual(feed.normalizeSlot(slot({ url: 'https://localhost/' })).url, '');
});

check('unknown media extension is refused outright', () => {
  assert.strictEqual(feed.normalizeSlot(slot({ media: { type: 'image', file: 'media/a.svg' } })), null);
  assert.strictEqual(feed.normalizeSlot(slot({ media: { type: 'image', file: 'media/a.exe' } })), null);
  // The kind decides which extension list applies: a video named .webp is wrong.
  assert.strictEqual(feed.normalizeSlot(slot({ media: { type: 'video', file: 'media/a.webp' } })), null);
});

check('a slot without a title is refused', () => {
  assert.strictEqual(feed.normalizeSlot(slot({ text: { th: { label: 'x', title: '' } } })), null);
  assert.strictEqual(feed.normalizeSlot(slot({ text: null })), null);
});

check('missing English wording falls back to Thai', () => {
  const out = feed.normalizeSlot(slot({ text: { th: { label: 'ผู้สนับสนุน', title: 'เติมเกม' } } }));
  assert.strictEqual(out.text.en.label, 'Sponsor');
  assert.strictEqual(out.text.en.title, 'เติมเกม');
});

check('a disabled slot is dropped, not published as false', () => {
  assert.strictEqual(feed.normalizeSlot(slot({ enabled: false })), null);
});

check('video keeps its poster, image does not invent one', () => {
  const video = feed.normalizeSlot(
    slot({ media: { type: 'video', file: 'media/a.mp4', poster: 'media/a-poster.webp', alt: 'v' } }),
  );
  assert.strictEqual(video.media.poster, 'media/a-poster.webp');
  const image = feed.normalizeSlot(slot());
  assert.strictEqual('poster' in image.media, false);
});

check('buildFeed reports a version and a timestamp', () => {
  const out = feed.buildFeed([slot()], new Date('2026-11-16T03:00:00Z'));
  assert.strictEqual(out.version, 1);
  assert.strictEqual(out.updated, '2026-11-16T03:00:00.000Z');
  assert.strictEqual(out.slots.length, 1);
});

check('buildFeed drops duplicate ids and caps the list', () => {
  const many = [];
  for (let i = 0; i < 20; i += 1) many.push(slot({ id: `s${i}` }));
  many.push(slot({ id: 's0' }));
  const out = feed.buildFeed(many);
  assert.strictEqual(out.slots.length, feed.MAX_SLOTS);
  assert.strictEqual(new Set(out.slots.map((s) => s.id)).size, feed.MAX_SLOTS);
});

check('buildFeed needs at least one usable slot', () => {
  assert.strictEqual(feed.buildFeed([]), null);
  assert.strictEqual(feed.buildFeed([{ id: 'x' }]), null);
});

check('rotation is clamped to something a human can read', () => {
  assert.strictEqual(feed.clampRotate(0), feed.MIN_ROTATE);
  assert.strictEqual(feed.clampRotate(9999), feed.MAX_ROTATE);
  assert.strictEqual(feed.clampRotate('abc'), feed.DEFAULT_ROTATE);
  assert.strictEqual(feed.clampRotate(20), 20);
});

check('readFeed tolerates junk from a hand-edited file', () => {
  assert.strictEqual(feed.readFeed(null), null);
  assert.strictEqual(feed.readFeed('[]'), null);
  assert.strictEqual(feed.readFeed({ slots: [{ id: 'x' }] }), null);
  const ok = feed.readFeed({ version: 1, rotateSeconds: 30, slots: [slot()] });
  assert.strictEqual(ok.rotateSeconds, 30);
  assert.strictEqual(ok.slots.length, 1);
});

check('the reader base is https on both hosts', () => {
  for (const base of feed.READ_BASE) {
    assert.ok(base.startsWith('https://'), base);
    assert.ok(base.endsWith('/'), base);
  }
});

/* ------------------------------ frame ratios ------------------------------ */

check('only the four agreed shapes are selectable', () => {
  assert.deepStrictEqual(feed.RATIO_ORDER, ['2:1', '16:9', '1:1', '4:5']);
  for (const name of feed.RATIO_ORDER) {
    assert.ok(feed.frameSize(name).w > 0, name);
  }
});

check('an unknown ratio falls back to 2:1, never to something arbitrary', () => {
  assert.strictEqual(feed.ratioOf('3:1'), feed.DEFAULT_RATIO);
  assert.strictEqual(feed.ratioOf(''), feed.DEFAULT_RATIO);
  assert.strictEqual(feed.ratioOf(undefined), feed.DEFAULT_RATIO);
  assert.strictEqual(feed.ratioOf('1:1'), '1:1');
  // Prototype keys must not sneak through `in`-style lookups.
  assert.strictEqual(feed.ratioOf('toString'), feed.DEFAULT_RATIO);
});

check('every frame keeps its shape and its long edge', () => {
  const expected = {
    '2:1': [1072, 536],
    '16:9': [1072, 603],
    '1:1': [1072, 1072],
    '4:5': [858, 1072],
  };
  for (const [name, [w, h]] of Object.entries(expected)) {
    const size = feed.mediaSize(name);
    assert.strictEqual(size.w, w, `${name} width`);
    assert.strictEqual(size.h, h, `${name} height`);
    // The CSS frame is half of the uploaded file, exactly.
    const frame = feed.frameSize(name);
    assert.ok(Math.abs(frame.w / frame.h - w / h) < 0.01, `${name} shape`);
    assert.ok(Math.abs(frame.w * 2 - w) <= 1 && Math.abs(frame.h * 2 - h) <= 1, `${name} 2x`);
  }
});

check('a slot remembers the shape it was published in', () => {
  const out = feed.readFeed({ slots: [slot({ media: { type: 'image', file: 'media/a.webp', ratio: '1:1' } })] });
  assert.strictEqual(out.slots[0].media.ratio, '1:1');
  const legacy = feed.readFeed({ slots: [slot()] });
  assert.strictEqual(legacy.slots[0].media.ratio, '2:1');
});

console.log(`${pass} checks passed`);
