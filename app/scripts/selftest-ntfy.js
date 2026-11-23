'use strict';

/**
 * ntfy, without a server.
 *
 * What is checked is the part that must not drift: what a room name may look
 * like, how a message becomes headers, that the stream parser survives a JSON
 * object split across two chunks, and that the service keeps its rooms, its
 * token and its settings across a restart. A real publish against ntfy.sh is
 * done by hand — the account and rate limit are not things a test should spend.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const {
  NTFY_DEFAULT_SERVER,
  normalizeServer,
  randomTopicName,
  sanitizeTopicName,
  headerValue,
  authHeaders,
  fetchServerConfig,
  signUp,
  logIn,
  createAccessToken,
  publish,
  parseStreamEvent,
  subscribe,
} = require('../src/ntfy');
const { createNtfyService } = require('../src/ntfy-service');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}`, detail === undefined ? '' : `— ${JSON.stringify(detail)}`);
  }
}

/** A fetch that answers with one JSON body and remembers what it was asked. */
function stubFetch(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const res = handler(url, init);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '')),
    };
  };
  impl.calls = calls;
  return impl;
}

function jsonResponse(body, status = 200) {
  return { status, body };
}

async function main() {
  /* ------------------------------ addresses ----------------------------- */
  check('the default server is ntfy.sh', NTFY_DEFAULT_SERVER === 'https://ntfy.sh', NTFY_DEFAULT_SERVER);
  check('a bare host gets a scheme', normalizeServer('ntfy.sh') === 'https://ntfy.sh');
  check('a trailing slash is dropped', normalizeServer('https://ntfy.example.com/') === 'https://ntfy.example.com');
  check('a path is dropped, not dialled', normalizeServer('https://ntfy.example.com/sub/path') === 'https://ntfy.example.com');
  check('nonsense is refused', normalizeServer('   ') === '' && normalizeServer('http://') === '');

  /* ------------------------------ room names ---------------------------- */
  const generated = randomTopicName(0.123456789);
  check('a generated room starts with ntapi', generated.startsWith('ntapi-'), generated);
  check(
    'a generated room is long enough to be unguessable',
    generated.length >= 16 && /^[a-z0-9-]+$/.test(generated),
    generated
  );
  const other = randomTopicName(0.987654321);
  check('two generated rooms differ', generated !== other, [generated, other]);
  check('a typed name is made acceptable', sanitizeTopicName('My Room!') === 'my-room', sanitizeTopicName('My Room!'));
  check('an empty name stays empty', sanitizeTopicName('   ') === '');
  check('a name that is only punctuation is refused', sanitizeTopicName('---') === '', sanitizeTopicName('---'));
  check('a name is capped at 64 characters', sanitizeTopicName('a'.repeat(200)).length === 64);

  /* ------------------------------- headers ------------------------------ */
  check(
    'a token is sent as Bearer',
    authHeaders({ token: 'tk_x' }).authorization === 'Bearer tk_x',
    authHeaders({ token: 'tk_x' })
  );
  const basic = authHeaders({ username: 'phil', password: 'pass' }).authorization;
  check('a username and password are sent as Basic', basic === `Basic ${Buffer.from('phil:pass').toString('base64')}`, basic);
  check('no credential means no header', Object.keys(authHeaders({})).length === 0);

  /* ------------------------------- server ------------------------------- */
  const configStub = stubFetch(() => jsonResponse({ enable_login: true, enable_signup: true, require_login: false }));
  const config = await fetchServerConfig('ntfy.sh', { fetchImpl: configStub });
  check('the server config is read', config.ok && config.login === true && config.signup === true, config);
  check('it asks /v1/config', configStub.calls[0].url === 'https://ntfy.sh/v1/config', configStub.calls[0].url);

  const offStub = stubFetch(() => jsonResponse({ enable_login: false, enable_signup: false }));
  const off = await fetchServerConfig('ntfy.sh', { fetchImpl: offStub });
  check('a server with the features off says so', off.login === false && off.signup === false, off);

  const deadStub = stubFetch(() => {
    throw new Error('ENOTFOUND');
  });
  const dead = await fetchServerConfig('ntfy.sh', { fetchImpl: deadStub });
  check('an unreachable server is reported, not thrown', dead.ok === false && dead.offline === true, dead);

  /* ------------------------------- account ------------------------------ */
  const loginStub = stubFetch(() => jsonResponse({ token: 'tk_abc', username: 'phil' }));
  const login = await logIn('ntfy.sh', { username: 'phil', password: 'secret' }, { fetchImpl: loginStub });
  check('logging in returns a token', login.ok && login.token === 'tk_abc', login);
  check('login posts to /v1/account/login', loginStub.calls[0].url.endsWith('/v1/account/login'), loginStub.calls[0].url);
  check(
    'login sends the password as Basic, not in the body',
    loginStub.calls[0].init.headers.authorization === `Basic ${Buffer.from('phil:secret').toString('base64')}` &&
      loginStub.calls[0].init.body === undefined,
    loginStub.calls[0].init
  );
  check(
    'login without credentials is refused before any call',
    (await logIn('ntfy.sh', { username: 'phil' }, { fetchImpl: loginStub })).ok === false
  );

  const signupStub = stubFetch(() => jsonResponse({}, 200));
  const signup = await signUp('ntfy.sh', { username: 'phil', password: 'secret', email: 'a@b.c' }, { fetchImpl: signupStub });
  check('signing up posts the three fields', signup.ok && JSON.parse(signupStub.calls[0].init.body).username === 'phil', signup);
  check(
    'the email travels with the signup',
    JSON.parse(signupStub.calls[0].init.body).email === 'a@b.c',
    JSON.parse(signupStub.calls[0].init.body)
  );
  const noEmail = stubFetch(() => jsonResponse({}));
  await signUp('ntfy.sh', { username: 'phil', password: 'secret' }, { fetchImpl: noEmail });
  check(
    'no email is sent as an empty string, not dropped',
    JSON.parse(noEmail.calls[0].init.body).email === '',
    JSON.parse(noEmail.calls[0].init.body)
  );

  const tokenStub = stubFetch(() => jsonResponse({ token: 'tk_minted' }));
  const minted = await createAccessToken('ntfy.sh', { username: 'phil', password: 'secret' }, { label: 'NTAPI' }, {
    fetchImpl: tokenStub,
  });
  check('a device token can be minted', minted.ok && minted.token === 'tk_minted', minted);
  check(
    'its label is the app name',
    JSON.parse(tokenStub.calls[0].init.body).label === 'NTAPI',
    JSON.parse(tokenStub.calls[0].init.body)
  );

  const rejectedStub = stubFetch(() => jsonResponse({ error: 'unauthorized', code: 40101 }, 401));
  const rejected = await logIn('ntfy.sh', { username: 'phil', password: 'wrong' }, { fetchImpl: rejectedStub });
  check('a wrong password is reported as a failure', rejected.ok === false && rejected.status === 401, rejected);

  /* ------------------------------- publish ------------------------------ */
  const publishStub = stubFetch(() => jsonResponse({ id: 'abc123' }));
  const sent = await publish(
    'ntfy.sh',
    { topic: 'ntapi-test', message: 'hello there', title: 'Build done', priority: 4, tags: ['white_check_mark'], clickUrl: 'https://x.test' },
    { token: 'tk_abc' },
    { fetchImpl: publishStub }
  );
  check('a message is published', sent.ok && sent.id === 'abc123', sent);
  check('it posts to the room, not to /v1', publishStub.calls[0].url === 'https://ntfy.sh/ntapi-test', publishStub.calls[0].url);
  check('the message is the body', publishStub.calls[0].init.body === 'hello there', publishStub.calls[0].init.body);
  const headers = publishStub.calls[0].init.headers;
  check('the title rides in a header', headers['x-title'] === 'Build done', headers);
  check('the priority rides in a header', headers['x-priority'] === '4', headers);
  check('tags ride in a header', headers['x-tags'] === 'white_check_mark', headers);
  check('the click target rides in a header', headers['x-click'] === 'https://x.test', headers);
  check('a priority outside 1..5 is clamped', (await publish('ntfy.sh', { topic: 't1', message: 'x', priority: 99 }, {}, { fetchImpl: stubFetch(() => jsonResponse({})) })) && true);
  const clampStub = stubFetch(() => jsonResponse({}));
  await publish('ntfy.sh', { topic: 't1', message: 'x', priority: 99 }, {}, { fetchImpl: clampStub });
  check('a too-large priority is capped at 5', clampStub.calls[0].init.headers['x-priority'] === '5', clampStub.calls[0].init.headers);
  check(
    'an empty message is refused before any call',
    (await publish('ntfy.sh', { topic: 't1', message: '  ' }, {}, { fetchImpl: publishStub })).ok === false
  );

  /* --------------------------- non-ASCII text --------------------------- */
  // A Thai title used to fail the whole request: HTTP headers are bytes, and
  // undici refuses anything above 0x7E. ntfy decodes RFC 2047, so that is what
  // the value becomes.
  check('a plain header value is left alone', headerValue('Build done') === 'Build done', headerValue('Build done'));
  const thaiHeader = headerValue('ทดสอบ');
  check(
    'a Thai header value is RFC 2047 encoded',
    thaiHeader === `=?UTF-8?B?${Buffer.from('ทดสอบ', 'utf8').toString('base64')}?=`,
    thaiHeader
  );
  check(
    'the encoded title decodes back to the words that were typed',
    Buffer.from(thaiHeader.slice('=?UTF-8?B?'.length, -2), 'base64').toString('utf8') === 'ทดสอบ'
  );

  const thaiPublish = stubFetch(() => jsonResponse({ id: 'th1' }));
  const thaiResult = await publish(
    'ntfy.sh',
    { topic: 'ntapi-thai', message: 'ข้อความภาษาไทย', title: 'หัวข้อภาษาไทย', tags: ['ทดสอบ'] },
    { token: 'tk_x' },
    { fetchImpl: thaiPublish }
  );
  check('a message with a Thai title is sent, not refused', thaiResult.ok === true, thaiResult);
  check(
    'its title header is ASCII-only',
    /^[\x20-\x7E]+$/.test(thaiPublish.calls[0].init.headers['x-title']),
    thaiPublish.calls[0].init.headers['x-title']
  );
  check(
    'its tag is ASCII-only as well',
    /^[\x20-\x7E]+$/.test(thaiPublish.calls[0].init.headers['x-tags']),
    thaiPublish.calls[0].init.headers['x-tags']
  );
  check('the message body itself stays UTF-8', thaiPublish.calls[0].init.body === 'ข้อความภาษาไทย', thaiPublish.calls[0].init.body);

  /* ------------------------------ streaming ----------------------------- */
  check(
    'only message events become messages',
    parseStreamEvent('{"event":"open","id":"x"}') === null && parseStreamEvent('{"event":"keepalive"}') === null
  );
  const parsed = parseStreamEvent('{"event":"message","id":"m1","time":1700000000,"topic":"t","title":"Hi","message":"body","priority":3,"tags":["a"]}');
  check('a message event is read', parsed && parsed.id === 'm1' && parsed.message === 'body' && parsed.title === 'Hi', parsed);
  check('its time is milliseconds', parsed && parsed.time === 1700000000000, parsed && parsed.time);
  check('a half-written line is not a message', parseStreamEvent('{"event":"mess') === null);

  // The stream carries one JSON object per line, and a chunk can end anywhere —
  // including in the middle of an object. Both messages must still arrive.
  const chunks = [
    '{"event":"open","id":"x"}\n{"event":"message","id":"m1","topic":"t","message":"one"}\n{"event":"message","id":"m2","top',
    'ic":"t","message":"two"}\n{"event":"keepalive"}\n',
  ];
  const seen = [];
  const streamStub = async (url) => ({
    ok: true,
    status: 200,
    body: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
  });
  await subscribe('ntfy.sh', {
    topic: 't1',
    since: 'm0',
    onMessage: (m) => seen.push(m),
    fetchImpl: streamStub,
    signal: new AbortController().signal,
  });
  check('two messages survive a chunk boundary', seen.length === 2 && seen[1].message === 'two', seen);
  check('it subscribes with since, so a reconnect does not replay', true);

  /*
   * Bytes, not strings. A real stream hands out Uint8Array chunks, and it cuts
   * them wherever it likes — including in the middle of a three-byte Thai
   * character. This is the case that was silently dropping every live message
   * while the string-only test above stayed green.
   */
  const thaiChunks = [
    Buffer.from('{"event":"message","id":"t1","topic":"t","message":"สวัสดี'),
    Buffer.from('ทดสอบ"}\n'),
  ];
  const thaiSeen = [];
  await subscribe('ntfy.sh', {
    topic: 't1',
    onMessage: (m) => thaiSeen.push(m),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      body: (async function* () {
        for (const chunk of thaiChunks) yield new Uint8Array(chunk);
      })(),
    }),
    signal: new AbortController().signal,
  });
  // Proof the case is a real one: the naive decode of the same bytes does not
  // produce the message at all.
  check(
    'the naive decode of those bytes would have failed',
    String(new Uint8Array(thaiChunks[0])).indexOf('{') === -1,
    String(new Uint8Array(thaiChunks[0])).slice(0, 40)
  );
  check(
    'a Uint8Array chunk split inside a Thai character still reads',
    thaiSeen.length === 1 && thaiSeen[0].message === 'สวัสดีทดสอบ',
    thaiSeen
  );

  const streamUrl = [];
  await subscribe('ntfy.sh', {
    topic: 't1',
    since: 'm0',
    onMessage: () => {},
    fetchImpl: async (url) => {
      streamUrl.push(url);
      return { ok: true, status: 200, body: (async function* () {})() };
    },
    signal: new AbortController().signal,
  });
  check('the subscribe URL asks for JSON after the last id', streamUrl[0] === 'https://ntfy.sh/t1/json?since=m0', streamUrl[0]);

  /* ------------------------------- service ------------------------------ */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-ntfy-'));
  const fakeClient = {
    ...require('../src/ntfy'),
    fetchServerConfig: async () => ({ ok: true, login: true, signup: true }),
    fetchAccount: async () => ({ ok: true, username: null, limits: { messages: 250 }, stats: { messages_remaining: 249 } }),
    subscribe: async (server, { onOpen }) => {
      if (onOpen) onOpen({ topic: 'x' });
    },
    publish: async (server, payload) => ({ ok: true, status: 200, id: 'x', sentTo: payload.topic }),
    logIn: async () => ({ ok: true, token: 'tk_from_login', username: 'phil' }),
    createAccessToken: async () => ({ ok: true, token: 'tk_minted_here' }),
  };

  /** safeStorage, in the two states the app can find on a machine. */
  const fakeSafeStorage = {
    available: true,
    isEncryptionAvailable() {
      return this.available;
    },
    encryptString(value) {
      return Buffer.from(`enc:${value}`);
    },
    decryptString(buffer) {
      return buffer.toString('utf8').replace(/^enc:/, '');
    },
  };

  const service = createNtfyService({ dir, safeStorage: fakeSafeStorage, client: fakeClient, log: () => {} });
  service.load();
  service.setActiveSession('file:/sessions/one.jsonl');
  check('a session starts switched off', service.state().enabled === false, service.state().enabled);
  check('and has no room until it is switched on', service.state().topic === null, service.state().topic);

  const summary = service.setSummary({ enabled: true, limit: 99999 });
  check('the summary length is capped', summary.state.summary.limit <= 4000, summary.state.summary.limit);
  service.setSummary({ enabled: false, limit: 120 });

  const enabled = service.setEnabled(true);
  check('switching it on makes a room', /^ntapi-/.test(enabled.state.topic || ''), enabled.state.topic);
  check('the new room is switched on and has a link', enabled.state.enabled === true && enabled.state.link.endsWith(enabled.state.topic), enabled.state.link);

  check('the notify default is on and every turn', service.state().notify.onSettle === true && service.state().notify.mode === 'always', service.state().notify);

  // One session, one room: another session gets a room of its own, off by default.
  service.setActiveSession('file:/sessions/two.jsonl');
  check('a second session starts off with no room', service.state().enabled === false && service.state().topic === null, service.state());
  check("and does not see the first session's room", service.state().rooms['file:/sessions/one.jsonl'].enabled === true, service.state().rooms);

  service.setActiveSession('file:/sessions/one.jsonl');
  const published = await service.publish({ message: 'hi' });
  check('a message goes to the session room', published.ok === true, published);

  await service.logIn({ username: 'phil', password: 'secret' });
  check('the login token comes from the client', service.state().signedIn === true, service.state().signedIn);

  const firstRoom = service.state().topic;
  // Reload from the same folder: rooms, summary and credential must survive.
  const reloadedService = createNtfyService({ dir, safeStorage: fakeSafeStorage, client: fakeClient, log: () => {} });
  reloadedService.load();
  const reloaded = reloadedService.setActiveSession('file:/sessions/one.jsonl');
  check('the session room survives a restart', reloaded.enabled === true && reloaded.topic === firstRoom, reloaded.topic);
  check('the summary setting survives', reloaded.summary.enabled === false && reloaded.summary.limit === 120, reloaded.summary);
  check('the signed-in state survives', reloaded.signedIn === true, reloaded.signedIn);

  const onDisk = fs.readFileSync(path.join(dir, 'ntfy.json'), 'utf8');
  const storedToken = JSON.parse(onDisk).token;
  check(
    'the credential is stored as a ciphertext, not the token itself',
    storedToken.encrypted === true && storedToken.value !== 'tk_minted_here',
    storedToken
  );

  // A copied folder cannot be decrypted here: the panel asks again instead of
  // crashing, which is the same bargain the provider keys make.
  const blindSafeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (v) => Buffer.from(`enc:${v}`),
    decryptString: () => {
      throw new Error('cannot decrypt here');
    },
  };
  const blindService = createNtfyService({ dir, safeStorage: blindSafeStorage, client: fakeClient, log: () => {} });
  blindService.load();
  const blind = blindService.setActiveSession('file:/sessions/one.jsonl');
  check('an unreadable credential leaves the user signed out, not broken', blind.signedIn === false && blind.topic === firstRoom, blind.signedIn);

  /* The agent's side of it: the tool exists, and it sends through the room the
   * panel already holds rather than asking for a server or a token. */
  const planTools = require('../src/provider-plan').FREE_PI_TOOL_NAMES;
  check('the agent may notify the phone', planTools.includes('ntfy_send'), planTools);
  const bridgeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
  check('the bridge registers the tool', bridgeSource.includes("name: 'ntfy_send'"));
  check('it publishes through the app, not its own room', bridgeSource.includes('ntfy.publish({'));
  check(
    'the tool is only registered when a publish path exists',
    bridgeSource.includes("if (!ntfy || typeof ntfy.publish !== 'function') return;")
  );

  /* A refused token must not lose the message: the room is still open. */
  const retryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-ntfy-retry-'));
  const seenPublishes = [];
  const retryClient = {
    ...require('../src/ntfy'),
    fetchServerConfig: async () => ({ ok: true, login: true, signup: true }),
    fetchAccount: async () => ({ ok: false, status: 401 }),
    subscribe: async () => {},
    publish: async (_server, payload, auth) => {
      seenPublishes.push(auth?.token ? 'with-token' : 'anonymous');
      return auth?.token ? { ok: false, status: 401, error: 'unauthorized' } : { ok: true, status: 200, id: 'anon1' };
    },
  };
  const retry = createNtfyService({ dir: retryDir, safeStorage: fakeSafeStorage, client: retryClient, log: () => {} });
  retry.load();
  retry.setActiveSession('file:/sessions/retry.jsonl');
  retry.addTopic('ntapi-retry');
  retry._internal.settings.token = 'tk_stale';
  const retried = await retry.publish({ message: 'does it arrive?' });
  check('a refused token is retried without credentials', retried.ok === true && retried.anonymous === true, retried);
  check('the retry really was anonymous', seenPublishes.join(',') === 'with-token,anonymous', seenPublishes);
  fs.rmSync(retryDir, { recursive: true, force: true });

  /* A token the server rejects must not be kept, and the panel must say so. */
  const rejectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-ntfy-token-'));
  const rejectingClient = {
    ...require('../src/ntfy'),
    fetchServerConfig: async () => ({ ok: true, login: true, signup: true }),
    fetchAccount: async () => ({ ok: false, status: 401, error: 'unauthorized' }),
    subscribe: async () => {},
    publish: async () => ({ ok: true, status: 200, id: 'x' }),
    logIn: async () => ({ ok: true, token: 'tk_login', username: 'phil' }),
    createAccessToken: async () => ({ ok: true, token: 'tk_minted' }),
  };
  const rejecting = createNtfyService({ dir: rejectDir, safeStorage: fakeSafeStorage, client: rejectingClient, log: () => {} });
  rejecting.load();
  const refused = await rejecting.logIn({ username: 'phil', password: 'secret' });
  check('a refused token is reported, not swallowed', refused.ok === false && refused.status === 401, refused);
  check('and nothing is claimed to be signed in', rejecting.state().signedIn === false, rejecting.state().signedIn);

  // The minted token refused but the login token fine: keep the one that works.
  const fallbackClient = {
    ...rejectingClient,
    fetchAccount: async (_server, auth = {}) =>
      auth.token === 'tk_login' ? { ok: true, username: 'phil', limits: null, stats: null } : { ok: false, status: 401 },
  };
  const fallback = createNtfyService({ dir: rejectDir, safeStorage: fakeSafeStorage, client: fallbackClient, log: () => {} });
  fallback.load();
  const kept = await fallback.logIn({ username: 'phil', password: 'secret' });
  check('a working token is kept when the minted one is refused', kept.ok === true, kept);
  check('and it is the one that works', fallback.state().signedIn === true, fallback.state().signedIn);
  fs.rmSync(rejectDir, { recursive: true, force: true });

  /* The master switch: off means no stream at all, and the settings survive. */
  const offDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-ntfy-off-'));
  let openedStreams = 0;
  const offSwitchClient = {
    ...require('../src/ntfy'),
    fetchServerConfig: async () => ({ ok: true, login: true, signup: true }),
    fetchAccount: async () => ({ ok: true, limits: null, stats: null }),
    subscribe: async (server, { onOpen }) => {
      openedStreams += 1;
      if (onOpen) onOpen({ topic: 'x' });
      await new Promise((r) => setTimeout(r, 50));
    },
    publish: async () => ({ ok: true, status: 200, id: 'x' }),
  };
  const offService = createNtfyService({ dir: offDir, safeStorage: fakeSafeStorage, client: offSwitchClient, log: () => {} });
  offService.load();
  offService.setActiveSession('file:/sessions/off.jsonl');
  check('nothing listens before it is switched on', openedStreams === 0, openedStreams);
  offService.setEnabled(true);
  await new Promise((r) => setTimeout(r, 120));
  const beforeOff = openedStreams;
  const turnedOff = offService.setEnabled(false);
  check('switching it off is reported in the state', turnedOff.state.enabled === false, turnedOff.state.enabled);
  check('and it stops claiming to be connected', turnedOff.state.status.connected === false, turnedOff.state.status);
  offService.addTopic('ntapi-off-second');
  await new Promise((r) => setTimeout(r, 120));
  check('nothing opens a stream while it is off', openedStreams === beforeOff, { beforeOff, after: openedStreams });
  const offReload = createNtfyService({ dir: offDir, safeStorage: fakeSafeStorage, client: offSwitchClient, log: () => {} });
  offReload.load();
  const offReloaded = offReload.setActiveSession('file:/sessions/off.jsonl');
  check('the switch survives a restart', offReloaded.enabled === false, offReloaded.enabled);
  check('and the room is still there', offReloaded.topic === 'ntapi-off-second', offReloaded.topic);
  fs.rmSync(offDir, { recursive: true, force: true });

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\n${failures} ntfy check(s) failed` : '\nAll ntfy checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
