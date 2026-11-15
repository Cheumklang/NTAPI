'use strict';

/**
 * The limits in front of the upload. Every check here is a size or a type, and
 * each one exists because the alternative is a broken strip on someone else's
 * machine that we cannot reach to fix.
 */

const assert = require('node:assert');
const media = require('../src/media');
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

check('extension is read past query and hash', () => {
  assert.strictEqual(media.extOf('banner.webp'), 'webp');
  assert.strictEqual(media.extOf('banner.WEBP?v=3'), 'webp');
  assert.strictEqual(media.extOf('https://a.com/x/clip.mp4#t=1'), 'mp4');
  assert.strictEqual(media.extOf('https://a.com/noext'), '');
});

check('kind comes from the extension list, not from the caller', () => {
  assert.strictEqual(media.kindOfExt('webp'), 'image');
  assert.strictEqual(media.kindOfExt('mp4'), 'video');
  assert.strictEqual(media.kindOfExt('svg'), '');
  assert.strictEqual(media.kindOfExt(''), '');
});

check('a sponsor link may be downloaded; http and odd hosts may not', () => {
  assert.strictEqual(media.mediaUrlAllowed('https://cdn.a.com/x/b.webp'), true);
  assert.strictEqual(media.mediaUrlAllowed('https://cdn.a.com/x/b.mp4'), true);
  assert.strictEqual(media.mediaUrlAllowed('http://cdn.a.com/x/b.webp'), false);
  assert.strictEqual(media.mediaUrlAllowed('https://localhost/b.webp'), false);
  assert.strictEqual(media.mediaUrlAllowed('https://cdn.a.com/x/b.exe'), false);
  assert.strictEqual(media.mediaUrlAllowed('https://cdn.a.com/noext'), false);
  assert.strictEqual(media.mediaUrlAllowed(''), false);
});

check('images are checked for bytes and for being decodable', () => {
  assert.strictEqual(
    media.checkFile({ name: 'a.webp', bytes: 1000, width: 1024, height: 512 }).ok,
    true,
  );
  assert.strictEqual(
    media.checkFile({ name: 'a.webp', bytes: feed.MAX_IMAGE_BYTES + 1, width: 10, height: 10 }).reason,
    'image-too-big',
  );
  assert.strictEqual(
    media.checkFile({ name: 'a.webp', bytes: 10, width: 0, height: 0 }).reason,
    'image-unreadable',
  );
  assert.strictEqual(media.checkFile({ name: 'a.svg', bytes: 10, width: 1, height: 1 }).reason, 'unsupported-type');
});

check('videos are checked for bytes, length and decodability', () => {
  assert.strictEqual(media.checkFile({ name: 'a.mp4', bytes: 1000, seconds: 5 }).ok, true);
  assert.strictEqual(
    media.checkFile({ name: 'a.mp4', bytes: feed.MAX_VIDEO_BYTES + 1, seconds: 1 }).reason,
    'video-too-big',
  );
  assert.strictEqual(
    media.checkFile({ name: 'a.mp4', bytes: 10, seconds: feed.MAX_VIDEO_SECONDS + 0.5 }).reason,
    'video-too-long',
  );
  // NaN seconds is what an undecodable file reports.
  assert.strictEqual(media.checkFile({ name: 'a.mp4', bytes: 10, seconds: NaN }).reason, 'video-unreadable');
});

check('a poster has its own, smaller, ceiling', () => {
  assert.strictEqual(media.checkPoster(feed.MAX_POSTER_BYTES).ok, true);
  assert.strictEqual(media.checkPoster(feed.MAX_POSTER_BYTES + 1).reason, 'poster-too-big');
});

check('cover fills the frame by cropping, never by stretching', () => {
  // Wider than the frame: full width, cropped top and bottom, centred.
  const wide = media.coverRect(1000, 250, 1024, 512);
  assert.strictEqual(wide.w, 2048);
  assert.strictEqual(wide.h, 512);
  assert.strictEqual(wide.x, (1024 - 2048) / 2);
  assert.strictEqual(wide.y, 0);

  // Taller than the frame: full height, cropped left and right.
  const tall = media.coverRect(500, 1000, 1024, 512);
  assert.strictEqual(tall.h, 2048);
  assert.strictEqual(tall.w, 1024);
  assert.strictEqual(tall.y, (512 - 2048) / 2);

  // Already the right shape: no crop at all.
  const exact = media.coverRect(1024, 512, 1024, 512);
  assert.deepStrictEqual(exact, { x: 0, y: 0, w: 1024, h: 512 });

  assert.strictEqual(media.coverRect(0, 10, 1024, 512), null);
});

check('base64 size is reported honestly in the UI', () => {
  assert.strictEqual(media.base64Bytes(''), 0);
  assert.strictEqual(media.base64Bytes(Buffer.from('abcd').toString('base64')), 4);
  assert.strictEqual(media.base64Bytes(Buffer.from('abcde').toString('base64')), 5);
});

console.log(`${pass} checks passed`);
