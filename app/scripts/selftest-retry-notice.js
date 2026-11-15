'use strict';

/**
 * A 503 that retries successfully used to leave two things on screen for good:
 *
 *   1. "Retrying (1/3): 503: {"message":...}" above the composer — the notice was
 *      shown without a lifetime and nothing cleared it when the turn ended.
 *   2. "Error: The service is busy right now... (HTTP 503 · service_busy)
 *      (HTTP 503 · service_busy)" in the transcript — the renderer appended the
 *      HTTP suffix to a sentence that already carried one.
 *
 * Both are wiring between `main.js`, the renderer and `provider-errors.js`, so
 * they are pinned by reading those sources plus the pure module. A window is not
 * needed and would not make the assertions stronger.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { parseProviderError, friendlyProviderError } = require('../src/provider-errors');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');

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

/**
 * The exact body free-pi answered with while the service was busy — the one the
 * bug report quotes.
 */
const busyRaw =
  '503: {"message":"The service is busy right now. Please retry in a few seconds.","type":"service_busy","code":"service_busy"}';

check('the 503 body is parsed as a busy service', () => {
  const parsed = parseProviderError(busyRaw);
  assert.strictEqual(parsed.status, '503');
  assert.strictEqual(parsed.code, 'service_busy');
  assert.match(parsed.message, /service is busy/i);
});

check('the friendly text carries the HTTP suffix exactly once', () => {
  const out = friendlyProviderError(busyRaw);
  const hits = out.text.match(/\(HTTP 503 · service_busy\)/g) || [];
  assert.strictEqual(hits.length, 1, out.text);
});

check('a sentence with no translation is sent with its suffix already attached', () => {
  // This is exactly why the banner must not append another one: `text` is the
  // fallback the renderer prints when `key` is null.
  const out = friendlyProviderError(busyRaw);
  assert.strictEqual(out.key, null);
  assert.ok(out.text.includes('(HTTP 503 · service_busy)'), out.text);
});

check('the error banner appends the suffix only to a translated sentence', () => {
  assert.match(renderer, /const suffix = p\.key && p\.status \?/);
  // The old unconditional form is what printed the suffix twice.
  assert.ok(!/const suffix = p\.status \?/.test(renderer), 'suffix is appended unconditionally');
});

check('the retry notice is remembered as a passing state', () => {
  assert.match(renderer, /let noticeIsRetry = false;/);
  assert.match(renderer, /noticeIsRetry = p\.key === 'notice\.retrying'/);
});

check('the retry notice has a ceiling on its age', () => {
  assert.match(renderer, /noticeIsRetry \? \d+ : undefined/);
});

check('the end of a turn clears the retry notice', () => {
  assert.match(renderer, /if \(payloadTabIsActive\(view\) && noticeIsRetry\) showNotice\(null\)/);
});

check('clearing the notice resets the retry flag too', () => {
  assert.match(renderer, /if \(!text\) \{\s*noticeIsRetry = false;\s*hideNotice\(\);/);
});

check('the retry notice is worded, not a raw JSON body', () => {
  assert.match(main, /const retryError = friendlyProviderError\(event\.errorMessage/);
  // The old line interpolated `event.errorMessage` straight into the notice.
  assert.ok(
    !/Retrying \(\$\{event\.attempt\}\/\$\{event\.maxAttempts\}\): \$\{event\.errorMessage/.test(main),
    'the retry notice still prints the raw provider body',
  );
});

console.log(`${pass} checks passed`);