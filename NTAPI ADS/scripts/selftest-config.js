'use strict';

/**
 * The token must never be shown back to the window and never written anywhere
 * but this machine's userData. These checks are small on purpose: they are the
 * ones that would embarrass us if they broke.
 */

const assert = require('node:assert');
const cfg = require('../src/config');

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

check('defaults point at the public sponsor repo', () => {
  const out = cfg.normalizeConfig(null);
  assert.strictEqual(out.owner, 'Cheumklang');
  assert.strictEqual(out.repo, 'NTAPI-sponsor');
  assert.strictEqual(out.branch, 'main');
  assert.strictEqual(out.token, '');
});

check('owner/repo/branch are stripped to safe characters', () => {
  assert.strictEqual(cfg.cleanSlug(' Cheumklang '), 'Cheumklang');
  assert.strictEqual(cfg.cleanSlug('a/b'), 'ab');
  assert.strictEqual(cfg.cleanSlug('a b'), 'ab');
  assert.strictEqual(cfg.cleanSlug(''), '');
});

check('a pasted token is trimmed but otherwise untouched', () => {
  const token = `  ghp_${'a'.repeat(36)}  `;
  assert.strictEqual(cfg.normalizeConfig({ token }).token, `ghp_${'a'.repeat(36)}`);
});

check('an obviously-wrong token is caught before any upload', () => {
  assert.strictEqual(cfg.tokenLooksReal('ghp_' + 'a'.repeat(36)), true);
  assert.strictEqual(cfg.tokenLooksReal('github_pat_' + 'b'.repeat(30)), true);
  assert.strictEqual(cfg.tokenLooksReal('a'.repeat(40)), true);
  assert.strictEqual(cfg.tokenLooksReal('hello'), false);
  assert.strictEqual(cfg.tokenLooksReal(''), false);
});

check('the window only ever sees a hint of the token', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  const masked = cfg.maskConfig(cfg.normalizeConfig({ token }));
  const json = JSON.stringify(masked);
  assert.strictEqual(masked.hasToken, true);
  assert.ok(!json.includes(token), 'full token leaked to the renderer');
  assert.ok(masked.tokenHint.length < token.length);
  assert.ok(masked.tokenHint.endsWith(token.slice(-4)));
});

check('mask with no token reports none and no hint', () => {
  const masked = cfg.maskConfig(cfg.normalizeConfig(null));
  assert.strictEqual(masked.hasToken, false);
  assert.strictEqual(masked.tokenHint, '');
});

console.log(`${pass} checks passed`);
