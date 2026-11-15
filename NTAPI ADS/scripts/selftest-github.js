'use strict';

/**
 * The Contents API is the only thing between "the user pressed publish" and
 * "every NTAPI shows the new sponsor", so the request shapes are pinned here.
 * Wrong `sha` handling is the failure that looks like success: GitHub answers
 * 422, nothing changes, and the banner keeps the old creative.
 */

const assert = require('node:assert');
const gh = require('../src/github');
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

const target = { owner: 'Cheumklang', repo: 'NTAPI-sponsor', branch: 'main' };

check('contents URL encodes the path and pins the branch', () => {
  const url = gh.contentsUrl(target, 'media/a b.webp');
  assert.ok(url.includes('/repos/Cheumklang/NTAPI-sponsor/contents/'), url);
  assert.ok(url.includes('media/a%20b.webp'), url);
  assert.ok(url.endsWith('?ref=main'), url);
  // A leading slash would make GitHub read an absolute path.
  assert.ok(!gh.contentsUrl(target, '/media/a.webp').includes('/contents//'));
});

check('a 404 means "new file", not an error', () => {
  const out = gh.parseContents(404, '{"message":"Not Found"}');
  assert.strictEqual(out.exists, false);
  assert.strictEqual(out.sha, '');
  assert.strictEqual(out.error, undefined);
});

check('an existing file yields its sha and decoded text', () => {
  const body = JSON.stringify({
    sha: 'abc123',
    content: Buffer.from('{"version":1}').toString('base64'),
  });
  const out = gh.parseContents(200, body);
  assert.strictEqual(out.exists, true);
  assert.strictEqual(out.sha, 'abc123');
  assert.strictEqual(out.text, '{"version":1}');
});

check('a directory is refused instead of read as a file', () => {
  const out = gh.parseContents(200, JSON.stringify([{ name: 'a.webp' }]));
  assert.strictEqual(out.exists, false);
  assert.strictEqual(out.error, 'path is a directory');
});

check('a failing status carries a readable reason', () => {
  const out = gh.parseContents(401, '{"message":"Bad credentials"}');
  assert.strictEqual(out.exists, false);
  assert.ok(out.error.includes('401'));
  assert.ok(out.error.includes('Bad credentials'));
});

check('sha is sent only when replacing', () => {
  const fresh = gh.putPayload({ base64: 'AAA', sha: '', message: 'm', branch: 'main' });
  assert.strictEqual('sha' in fresh, false);
  assert.strictEqual(fresh.branch, 'main');
  const replace = gh.putPayload({ base64: 'AAA', sha: 'abc', message: 'm', branch: 'main' });
  assert.strictEqual(replace.sha, 'abc');
});

check('media is uploaded before the config', () => {
  const built = feed.buildFeed([
    {
      id: 'x',
      url: 'https://a.com/',
      media: { type: 'image', file: 'media/x.webp' },
      text: { th: { title: 'hi' } },
    },
  ]);
  const plan = gh.publishPlan(built, [
    { path: 'media/x.webp', base64: 'AAAA' },
    { path: 'media/x-poster.webp', base64: 'BBBB' },
  ]);
  assert.deepStrictEqual(plan.map((s) => s.path), [
    'media/x.webp',
    'media/x-poster.webp',
    'sponsor.json',
  ]);
  // The config is the only file NTAPI reads: if it lands while media is missing,
  // every client points at a 404.
  assert.strictEqual(plan[plan.length - 1].kind, 'config');
  const text = Buffer.from(plan[2].base64, 'base64').toString('utf8');
  assert.ok(text.endsWith('\n'));
  assert.strictEqual(JSON.parse(text).slots.length, 1);
});

check('an empty upload is skipped instead of creating a zero-byte file', () => {
  const plan = gh.publishPlan({ version: 1, slots: [] }, [{ path: 'media/a.webp', base64: '' }]);
  assert.deepStrictEqual(plan.map((s) => s.path), ['sponsor.json']);
});

check('base64 round-trips bytes unchanged', () => {
  const bytes = Buffer.from([0, 1, 2, 250, 255]);
  assert.deepStrictEqual(gh.decodeBase64(gh.encodeBase64(bytes)), bytes);
});

check('an HTML error page does not become the dialog text', () => {
  const text = gh.describe(502, '<html><body><h1>Bad gateway</h1></body></html>');
  assert.ok(text.startsWith('HTTP 502: Bad gateway'), text);
  assert.ok(!text.includes('<'), text);
});

check('an empty body still names the status', () => {
  assert.strictEqual(gh.describe(500, ''), 'HTTP 500');
});

console.log(`${pass} checks passed`);
