'use strict';

/**
 * The GitHub half of publishing, kept pure so it can be tested offline.
 *
 * This tool talks to the Contents API instead of driving `git`: the user does
 * not have to install git, stage anything, or resolve a merge. One file in, one
 * file out. The cost is that every write needs the file's current `sha`, which
 * is why `parseContents()` exists — pushing without it silently fails with a
 * 422 and the user sees nothing change.
 */

const API = 'https://api.github.com';

function encodeBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(text) {
  return Buffer.from(String(text || '').replace(/\s+/g, ''), 'base64');
}

function contentsUrl({ owner, repo, branch }, filePath) {
  // Encode segment by segment: the slashes are the path, but a space in a file
  // name is not, and `encodeURIComponent` on the whole thing would eat them.
  const clean = String(filePath || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${clean}${ref}`;
}

function repoUrl({ owner, repo }) {
  return `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'NTAPI-ADS',
  };
}

/** A GET that answers 404 is "the file does not exist yet", not an error. */
function parseContents(status, body) {
  if (status === 404) return { exists: false, sha: '', text: '' };
  if (status < 200 || status >= 300) return { exists: false, sha: '', text: '', error: describe(status, body) };
  const data = typeof body === 'string' ? safeJson(body) : body;
  if (!data || typeof data !== 'object') return { exists: false, sha: '', text: '', error: 'empty response' };
  // Directories come back as an array; a file we can publish comes back as an object.
  if (Array.isArray(data) || typeof data.content !== 'string') {
    return { exists: false, sha: '', text: '', error: 'path is a directory' };
  }
  return { exists: true, sha: String(data.sha || ''), text: decodeBase64(data.content).toString('utf8') };
}

/**
 * `sha` is omitted when creating a file and required when replacing one. Sending
 * it when the file is new is also a 422, so the caller passes '' for new paths.
 */
function putPayload({ base64, sha, message, branch }) {
  const body = {
    message: message || 'sponsor: update',
    content: String(base64 || ''),
    ...(branch ? { branch } : {}),
    ...(sha ? { sha } : {}),
  };
  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * GitHub mostly answers with JSON, but a proxy in the way answers with HTML.
 * Echoing that HTML into the UI is how a 5-line dialog becomes unreadable.
 */
function describe(status, body) {
  const data = typeof body === 'string' ? safeJson(body) : body;
  const message = data && typeof data.message === 'string' ? data.message : '';
  if (message) return `HTTP ${status}: ${message}`;
  const flat = String(body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return flat ? `HTTP ${status}: ${flat.slice(0, 160)}` : `HTTP ${status}`;
}

/**
 * A publish is three or four files in a row; there is no transaction, so a
 * failure halfway leaves media uploaded and `sponsor.json` stale. That is the
 * safe order — NTAPI only ever reads `sponsor.json`, so an orphan media file is
 * harmless while a config pointing at missing media is a broken banner.
 */
function publishPlan(feed, files) {
  const steps = [];
  for (const file of files) {
    if (!file || !file.path || !file.base64) continue;
    steps.push({ path: file.path, base64: file.base64, kind: 'media' });
  }
  steps.push({ path: 'sponsor.json', base64: encodeBase64(JSON.stringify(feed, null, 2) + '\n'), kind: 'config' });
  return steps;
}

module.exports = {
  API,
  encodeBase64,
  decodeBase64,
  contentsUrl,
  repoUrl,
  headers,
  parseContents,
  putPayload,
  describe,
  safeJson,
  publishPlan,
};
