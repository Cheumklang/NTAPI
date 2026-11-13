/**
 * Diagnostic: a long agent run must not keep every image it ever looked at.
 *
 * Providers cap images per request (Coarena: 8). pi stores tool-result images in
 * the conversation, so without pruning the ninth look breaks the whole session.
 *
 * Run from app/:   node scripts/selftest-image-history.js
 */
'use strict';

const { pruneImages } = require('../src/image-history');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const image = (n) => ({ type: 'image', data: `data-${n}`, mimeType: 'image/png' });
const text = (t) => ({ type: 'text', text: t });
const countImages = (messages) =>
  messages.reduce(
    (sum, m) => sum + (m.content || []).filter((b) => b && b.type === 'image').length,
    0
  );

// Newest images stay; older ones become text so the model still knows it looked.
const many = [
  { role: 'toolResult', content: [image(1), text('first')] },
  { role: 'toolResult', content: [image(2)] },
  { role: 'toolResult', content: [image(3)] },
];
const pruned = pruneImages(many, 2);
check('keeps only the newest images', countImages(pruned) === 2, JSON.stringify(pruned));
check('drops the oldest image', pruned[0].content[0].type === 'text');
check('keeps the newest two', pruned[1].content[0].type === 'image' && pruned[2].content[0].type === 'image');
check('leaves the other block alone', pruned[0].content[1].text === 'first');
check('does not mutate the input', countImages(many) === 3);

// A message with several images is trimmed block by block.
const multi = [{ role: 'user', content: [image(1), image(2), image(3), image(4)] }];
check('trims inside one message', countImages(pruneImages(multi, 1)) === 1);
check('keeps the last block', pruneImages(multi, 1)[0].content[3].type === 'image');
check('trims to zero', countImages(pruneImages(multi, 0)) === 0);

// Nothing to do: the same shape comes back unchanged.
const clean = [{ role: 'user', content: [text('hello')] }];
check('clean history unchanged', JSON.stringify(pruneImages(clean, 6)) === JSON.stringify(clean));

// Mixed message types and a missing content array are safe.
const mixed = [
  { role: 'assistant', content: [text('answer')] },
  { role: 'toolResult' },
  { role: 'user', content: [image(1)] },
];
const mixedOut = pruneImages(mixed, 1);
check('messages without content survive', mixedOut.length === 3 && mixedOut[1].content === undefined);
check('image in the last message kept', countImages(mixedOut) === 1);

// The placeholder is honest about why the picture is gone.
const only = pruneImages([{ role: 'toolResult', content: [image(1)] }], 0);
check(
  'placeholder explains the omission',
  only[0].content[0].type === 'text' && /image/i.test(only[0].content[0].text)
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: history keeps at most the allowed number of images');
