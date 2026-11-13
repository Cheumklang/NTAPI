'use strict';
/**
 * NTAPI presence — "how many people are using the app right now".
 *
 * The desktop app posts its anonymous session id here every 45 s. An id counts
 * as online while it was seen inside ONLINE_WINDOW_MS, so one dropped request
 * (laptop sleep, wifi blip) does not flicker the number.
 *
 * State lives in memory on purpose: no database, no signup, no cost. If the
 * service restarts, every running app re-reports within a minute and the count
 * corrects itself. Nothing is stored about a user beyond a random id that the
 * app throws away when it closes.
 */
const http = require('http');

const PORT = Number(process.env.PORT) || 3000;
const ONLINE_WINDOW_MS = 90_000; // heartbeat is 45 s, so allow one miss
const RETENTION_MS = 24 * 60 * 60 * 1000; // forget stale ids after a day

/** sessionId -> last seen (epoch ms) */
const seen = new Map();

function prune(now) {
  for (const [id, at] of seen) {
    if (now - at > RETENTION_MS) seen.delete(id);
  }
}

function stats(now = Date.now()) {
  let online = 0;
  for (const at of seen.values()) if (now - at <= ONLINE_WINDOW_MS) online += 1;
  return { online, total: seen.size, now };
}

function send(res, code, body, type = 'application/json') {
  const payload = type === 'application/json' ? JSON.stringify(body) : String(body);
  res.writeHead(code, {
    'content-type': type,
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');

  const now = Date.now();
  const url = new URL(req.url, 'http://localhost.local');

  if (url.pathname === '/beat' && req.method === 'POST') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) req.destroy();
    });
    req.on('end', () => {
      let id = '';
      try {
        id = String(JSON.parse(raw || '{}').id || '').slice(0, 64);
      } catch {}
      if (!id) return send(res, 400, { error: 'missing id' });
      seen.set(id, now);
      prune(now);
      send(res, 200, stats(now));
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/count') {
    prune(now);
    return send(res, 200, stats(now));
  }

  send(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`NTAPI presence listening on ${PORT}`);
});
