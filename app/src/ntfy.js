'use strict';

/**
 * ntfy client: account, publishing and subscribing for one ntfy server.
 *
 * ntfy is a pub/sub notification service. A "room" is a topic: publishing to it
 * is a POST, and receiving from it is a long-lived GET that streams
 * newline-delimited JSON. Nothing here holds state — the window and the service
 * above it do — so every call takes the server and its credential as arguments
 * and can be exercised against a stub fetch.
 *
 * Endpoints, and how well they are pinned down:
 *   GET  /v1/config                  public; says whether login/signup are on
 *   GET  /v1/account                 Bearer; account, limits, usage
 *   POST /v1/account                 sign up  — NOT in ntfy's docs
 *   POST /v1/account/login           log in, Basic — NOT in ntfy's docs
 *   POST /v1/account/token           new access token — NOT in ntfy's docs
 *   POST /<topic>                    publish (documented)
 *   GET  /<topic>/json?since=<id>    subscribe, streaming NDJSON (documented)
 *
 * The three undocumented ones are what ntfy's own web app calls; they can change
 * without notice, which is why the signup/login buttons read `/v1/config` first
 * and disappear when the server says the feature is off. Sending and receiving
 * never depend on them: a topic needs no account at all.
 *
 * Topics are public on a public server — anyone who knows the name can read it.
 * Names are therefore generated long and random (`ntapi-<random>`); a private
 * room needs a self-hosted server with login enforced.
 */

const NTFY_DEFAULT_SERVER = 'https://ntfy.sh';
const NTFY_TOPIC_PREFIX = 'ntapi';
const REQUEST_TIMEOUT_MS = 12000;

/**
 * A server address as the client needs it: scheme, host, no trailing slash.
 * Returns '' for anything unusable, so a half-typed address is never dialled.
 */
function normalizeServer(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return '';
    return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * A topic name that cannot be guessed: `ntapi-` plus ten random characters.
 *
 * ntfy's own rules: letters, digits, `_` and `-`, at most 64 characters, and not
 * a bare `-` or `_`. A name that fails them is rejected by the server, so the
 * generator never produces one.
 */
function randomTopicName(rand = Math.random()) {
  const value = Number.isFinite(rand) ? Math.abs(rand) : 0.5;
  const random = value.toString(36).replace(/^0\./, '').padEnd(10, '0');
  return `${NTFY_TOPIC_PREFIX}-${random}${Date.now().toString(36).slice(-4)}`.slice(0, 64);
}

/** A name the user typed, made acceptable, or '' when nothing usable is left. */
function sanitizeTopicName(input) {
  const clean = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!clean || clean === '-' || clean === '_') return '';
  return clean;
}

/**
 * A header value the HTTP layer can carry.
 *
 * HTTP headers are bytes, and a Thai title or an emoji tag is not: undici refuses
 * the whole request (`Cannot convert argument to a ByteString`). ntfy decodes
 * RFC 2047 in any header, so that is what a non-ASCII value becomes — the phone
 * still shows the words that were typed.
 */
function headerValue(value) {
  const text = String(value ?? '');
  if (!/[^\x20-\x7E]/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

/** `Basic` for a username and password, `Bearer` for an access token. */
function authHeaders({ token, username, password } = {}) {
  const clean = String(token || '').trim();
  if (clean) return { authorization: `Bearer ${clean}` };
  const user = String(username || '').trim();
  if (user && password !== undefined && password !== null) {
    const basic = Buffer.from(`${user}:${password}`).toString('base64');
    return { authorization: `Basic ${basic}` };
  }
  return {};
}

async function callJson(url, { method = 'GET', headers = {}, body, rawBody, fetchImpl, timeoutMs } = {}) {
  const doFetch = fetchImpl || fetch;
  const init = { method, headers: { accept: 'application/json', ...headers } };
  if (body !== undefined) {
    // ntfy takes the message itself as the body; everything else here is a JSON
    // API.  is the switch between the two.
    if (rawBody) {
      init.body = String(body);
    } else {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  if (doFetch === fetch) init.signal = AbortSignal.timeout(timeoutMs || REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, offline: true, status: 0, error: `Could not reach ${url} (${message}).` };
  }

  let parsed = null;
  const text = await res.text().catch(() => '');
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (res.ok) return { ok: true, status: res.status, body: parsed, text };
  const message =
    parsed?.error || parsed?.message || (text ? text.slice(0, 200) : `HTTP ${res.status}`);
  return { ok: false, status: res.status, code: parsed?.code || null, error: String(message), body: parsed };
}

/** Which features this server offers: `login`, `signup`, `requireLogin`. */
async function fetchServerConfig(server, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  const res = await callJson(`${base}/v1/config`, { fetchImpl });
  if (!res.ok) return res;
  const body = res.body || {};
  return {
    ok: true,
    status: res.status,
    server: base,
    login: body.enable_login !== false,
    signup: body.enable_signup !== false,
    requireLogin: body.require_login === true,
  };
}

/** Account and its limits. Answers for an anonymous caller too. */
async function fetchAccount(server, auth, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  const res = await callJson(`${base}/v1/account`, { headers: authHeaders(auth), fetchImpl });
  if (!res.ok) return res;
  const body = res.body || {};
  return {
    ok: true,
    status: res.status,
    username: body.username || null,
    limits: body.limits || null,
    stats: body.stats || null,
  };
}

/** Create an account. Only works on a server with signup enabled. */
async function signUp(server, { username, password, email } = {}, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  const user = String(username || '').trim();
  if (!user || !password) return { ok: false, error: 'A username and a password are required.' };
  const res = await callJson(`${base}/v1/account`, {
    method: 'POST',
    body: { username: user, password: String(password), email: String(email || '') },
    fetchImpl,
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, username: user };
}

/** Log in and return the access token the rest of the calls use. */
async function logIn(server, { username, password } = {}, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  const user = String(username || '').trim();
  if (!user || !password) return { ok: false, error: 'A username and a password are required.' };
  const res = await callJson(`${base}/v1/account/login`, {
    method: 'POST',
    headers: authHeaders({ username: user, password }),
    fetchImpl,
  });
  if (!res.ok) return res;
  const token = res.body?.token;
  if (!token) return { ok: false, error: 'The server did not return a token.' };
  return { ok: true, status: res.status, token, username: res.body?.username || user };
}

/** A second credential for a device, so the password never has to be stored. */
async function createAccessToken(server, auth, { label = 'NTAPI', expiresSeconds = 0 } = {}, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  const res = await callJson(`${base}/v1/account/token`, {
    method: 'POST',
    headers: authHeaders(auth),
    body: {
      label: String(label || 'NTAPI'),
      expires: Number(expiresSeconds) > 0 ? Math.floor(Date.now() / 1000) + Number(expiresSeconds) : 0,
    },
    fetchImpl,
  });
  if (!res.ok) return res;
  const token = res.body?.token;
  if (!token) return { ok: false, error: 'The server did not return a token.' };
  return { ok: true, status: res.status, token };
}

/**
 * Send one message.
 *
 * ntfy takes the message as the plain request body and everything else from
 * headers, which is what this does: one POST, no multipart, nothing to encode
 * twice. An attachment is a URL the server fetches, not bytes we upload.
 */
async function publish(server, { topic, message, title, priority, tags, clickUrl, attachUrl, delay } = {}, auth = {}, { fetchImpl } = {}) {
  const base = normalizeServer(server);
  const clean = sanitizeTopicName(topic);
  if (!base) return { ok: false, error: 'Enter a server address first.' };
  if (!clean) return { ok: false, error: 'That room name is not usable.' };
  const body = String(message ?? '');
  if (!body.trim() && !attachUrl) return { ok: false, error: 'Write a message first.' };

  const headers = { ...authHeaders(auth), 'content-type': 'text/plain' };
  if (title) headers['x-title'] = headerValue(String(title).slice(0, 250));
  if (Number(priority) > 0) headers['x-priority'] = String(Math.min(5, Math.max(1, Number(priority))));
  if (Array.isArray(tags) && tags.length) headers['x-tags'] = tags.slice(0, 5).map(headerValue).join(',');
  if (clickUrl) headers['x-click'] = headerValue(clickUrl);
  if (attachUrl) headers['x-attach'] = headerValue(attachUrl);
  if (delay) headers['x-delay'] = headerValue(delay);

  const res = await callJson(`${base}/${encodeURIComponent(clean)}`, {
    method: 'POST',
    headers,
    body,
    rawBody: true,
    fetchImpl,
  });
  if (!res.ok) return res;
  return { ok: true, status: res.status, id: res.body?.id || null };
}

/** One line of the JSON stream, or null when it is not a message. */
function parseStreamEvent(line) {
  const text = String(line || '').trim();
  if (!text || text[0] !== '{') return null;
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return null;
  }
  if (event?.event !== 'message') return null;
  const topic = event.topic;
  return {
    id: event.id || null,
    time: Number(event.time) ? Number(event.time) * 1000 : Date.now(),
    topic: typeof topic === 'string' ? topic : '',
    title: event.title || '',
    message: typeof event.message === 'string' ? event.message : '',
    priority: Number(event.priority) || 0,
    tags: Array.isArray(event.tags) ? event.tags : [],
    click: event.click || '',
  };
}

/**
 * Subscribe to a topic until `signal` aborts.
 *
 * `since` is the last message id already held, so a reconnect does not replay
 * the whole cache; `all` asks for the cache on the first connection. Resolves
 * when the stream ends — aborted, or the server closed it — and never rejects:
 * a dropped stream is an event the panel draws, not an exception to catch.
 */
async function subscribe(server, { topic, since = 'all', signal, onMessage, onOpen, onError, fetchImpl } = {}) {
  const base = normalizeServer(server);
  const clean = sanitizeTopicName(topic);
  if (!base || !clean) {
    if (onError) onError({ error: 'No room to listen to.' });
    return;
  }
  const query = since ? `?since=${encodeURIComponent(since)}` : '';
  const url = `${base}/${encodeURIComponent(clean)}/json${query}`;
  const doFetch = fetchImpl || fetch;

  let res;
  try {
    res = await doFetch(url, { headers: { accept: 'application/x-ndjson' }, signal });
  } catch (err) {
    if (!signal?.aborted && onError) onError({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!res.ok) {
    if (onError) onError({ status: res.status, error: `HTTP ${res.status}` });
    return;
  }
  if (onOpen) onOpen({ topic: clean });

  // A body that hands out lines: JSON objects are one per line, and a chunk can
  // hold half a line, so the tail is carried into the next chunk.
  //
  // The bytes are decoded as UTF-8 with `stream: true` because a Thai character
  // is three bytes and a chunk boundary can fall inside one; decoding each chunk
  // on its own would replace it with a question mark. (`String(chunk)` would have
  // been worse still: a Uint8Array stringifies to "1,2,3,…".)
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const emit = (line) => {
    const message = parseStreamEvent(line);
    if (message && onMessage) onMessage(message);
  };
  try {
    for await (const chunk of res.body) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) emit(line);
    }
    buffer += decoder.decode();
    if (buffer) emit(buffer);
  } catch (err) {
    if (!signal?.aborted && onError) onError({ error: err instanceof Error ? err.message : String(err) });
  }
}

module.exports = {
  NTFY_DEFAULT_SERVER,
  NTFY_TOPIC_PREFIX,
  normalizeServer,
  randomTopicName,
  sanitizeTopicName,
  headerValue,
  authHeaders,
  fetchServerConfig,
  fetchAccount,
  signUp,
  logIn,
  createAccessToken,
  publish,
  parseStreamEvent,
  subscribe,
};
