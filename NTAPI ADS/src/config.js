'use strict';

/**
 * Local, on-this-machine settings: which repo to publish to and the token that
 * is allowed to write there.
 *
 * The token lives in `app.getPath('userData')`, never in the repo and never in
 * the NTAPI app — a sponsor-publishing credential that shipped with the client
 * would let anyone rewrite the banner for every user. `normalize()` therefore
 * treats the token as opaque: it is trimmed and checked for shape, and nothing
 * else in the app ever logs it.
 */

const DEFAULTS = {
  owner: 'Cheumklang',
  repo: 'NTAPI-sponsor',
  branch: 'main',
};

/**
 * Fine-grained tokens start with these prefixes; classic ones are bare hex.
 * We do not try to be cleverer than that — an obviously wrong paste is caught
 * before a 6MB upload, everything else is left to GitHub's own 401.
 */
const TOKEN_PREFIXES = ['github_pat_', 'ghp_'];

function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const owner = cleanSlug(src.owner) || DEFAULTS.owner;
  const repo = cleanSlug(src.repo) || DEFAULTS.repo;
  const branch = cleanSlug(src.branch) || DEFAULTS.branch;
  const token = typeof src.token === 'string' ? src.token.trim() : '';
  return { owner, repo, branch, token, ...(src.lastPublish ? { lastPublish: String(src.lastPublish) } : {}) };
}

/** GitHub owner/repo/branch names: no spaces, no slashes inside a segment. */
function cleanSlug(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 100);
}

function tokenLooksReal(token) {
  const value = String(token || '').trim();
  if (value.length < 20) return false;
  return TOKEN_PREFIXES.some((p) => value.startsWith(p)) || /^[a-f0-9]{40,}$/i.test(value);
}

/** What the UI is allowed to show back: never the token itself. */
function maskConfig(config) {
  const token = String((config && config.token) || '');
  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    hasToken: Boolean(token),
    tokenHint: token ? `${token.slice(0, 11)}\u2026${token.slice(-4)}` : '',
    lastPublish: config.lastPublish || '',
  };
}

module.exports = { DEFAULTS, normalizeConfig, cleanSlug, tokenLooksReal, maskConfig };
