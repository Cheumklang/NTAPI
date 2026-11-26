'use strict';

/**
 * The ntfy side of the window: which server, which rooms, and the live streams.
 *
 * A room belongs to a session — one session, one room — so a reader never has to
 * pick between rooms that belong to chats they are not looking at. Sessions are
 * keyed by the chat's session file (its tab id until the file exists), and a
 * session that has never been switched on starts switched off.
 *
 * Everything this writes lives in the data root next to the other per-machine
 * files:
 *
 *   ntfy.json  server, username, credential, summary setting, and one room per
 *              session with its on/off switch and the id it last read
 *
 * The credential is encrypted with Electron's safeStorage when it is available
 * (the same protection the provider keys get). The file is written 0600.
 */

const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_FILE = 'ntfy.json';
const FILE_VERSION = 2;
const MODE = 0o600;
const RECONNECT_MS = 5000;
const MAX_SUMMARY = 4000;
const MAX_SESSIONS = 200;
const NOTIFY_MODES = ['always', 'away'];
/**
 * Tags this app puts on what it publishes. A message carrying one of them is
 * our own and must never run as a command: the stream hands it straight back,
 * and running it is what made the app answer itself in a loop.
 */
const OWN_TAGS = ['ntapi-reply', 'ntapi-done'];
/** Ids of messages this process published, remembered against a lost tag. */
const MAX_SENT_IDS = 500;

function createNtfyService({ dir, safeStorage, log = () => {}, client } = {}) {
  const api = client || require('./ntfy');
  const settingsPath = path.join(dir, SETTINGS_FILE);

  /**
   * @type {{server: string, username: string|null, token: string|null,
   *   sessions: Record<string, {topic: string|null, enabled: boolean, since?: string, at?: number}>,
   *   summary: {enabled: boolean, limit: number, source: string},
   *   notify: {onSettle: boolean, mode: string}}}
   */
  let settings = {
    server: api.NTFY_DEFAULT_SERVER,
    username: null,
    token: null,
    sessions: {},
    summary: { enabled: true, limit: 200, source: 'local' },
    // Commands and the turn-end line are both on by default: switching a
    // session's room on is the one decision the reader is making.
    notify: { onSettle: true, mode: 'always' },
  };
  /** The session whose room the panel shows; set by the main process. */
  let activeKey = null;
  /** A room inherited from a pre-session settings file, adopted once. */
  let legacy = null;
  let config = { login: true, signup: true, checked: false };
  let account = null;
  let statuses = new Map();
  /** sessionKey -> { controller, timer } */
  let streams = new Map();
  /** Ids published here, newest last, so the echo is recognised by id too. */
  let sentIds = new Set();
  let stopped = false;
  let emit = () => {};

  function readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return fallback;
    }
  }

  function writeJson(file, value) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(value, null, 2), { mode: MODE });
    } catch (err) {
      log(`ntfy: could not write ${path.basename(file)} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The credential as it sits on disk: encrypted when the platform can. */
  function packToken(token) {
    if (!token) return null;
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return { encrypted: true, value: safeStorage.encryptString(token).toString('base64') };
    }
    return { encrypted: false, value: token };
  }

  function unpackToken(record) {
    if (!record || typeof record.value !== 'string') return null;
    if (!record.encrypted) return record.value;
    try {
      return safeStorage.decryptString(Buffer.from(record.value, 'base64'));
    } catch {
      // A copied data folder cannot be decrypted here; asking again for the
      // password is the honest outcome, not a crash on startup.
      return null;
    }
  }

  function load() {
    const saved = readJson(settingsPath, null);
    settings = {
      server: api.normalizeServer(saved?.server) || api.NTFY_DEFAULT_SERVER,
      username: saved?.username || null,
      token: unpackToken(saved?.token),
      sessions: {},
      summary: {
        enabled: saved?.summary?.enabled !== false,
        limit: clampLimit(saved?.summary?.limit),
        source: saved?.summary?.source === 'provider' ? 'provider' : 'local',
      },
      notify: {
        onSettle: saved?.notify?.onSettle !== false,
        // "Over a minute" is gone; an old file that chose it now means every
        // turn, which is what a reader who turned this on was asking for.
        mode: NOTIFY_MODES.includes(saved?.notify?.mode) ? saved.notify.mode : 'always',
      },
    };
    const savedSessions = saved?.sessions && typeof saved.sessions === 'object' ? saved.sessions : null;
    if (savedSessions) {
      for (const [key, value] of Object.entries(savedSessions)) {
        const topic = api.sanitizeTopicName(value?.topic) || null;
        if (!key) continue;
        settings.sessions[key] = {
          topic,
          enabled: Boolean(topic) && value?.enabled === true,
          since: typeof value?.since === 'string' ? value.since : 'all',
          at: Number(value?.at) || 0,
        };
        if (Object.keys(settings.sessions).length >= MAX_SESSIONS) break;
      }
    } else if (Array.isArray(saved?.topics) && saved.topics.length) {
      // Settings written before rooms were per-session: the room the reader was
      // using is handed to the first session that opens, so it keeps working.
      const name = api.sanitizeTopicName(saved.activeTopic) || api.sanitizeTopicName(saved.topics[0]?.name);
      if (name) legacy = { topic: name, enabled: saved.enabled !== false };
    }
  }

  function clampLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 200;
    return Math.min(MAX_SUMMARY, Math.max(20, Math.floor(n)));
  }

  function save() {
    writeJson(settingsPath, {
      v: FILE_VERSION,
      server: settings.server,
      username: settings.username,
      token: packToken(settings.token),
      sessions: settings.sessions,
      summary: settings.summary,
      notify: settings.notify,
    });
  }

  /** The record for one session; a session seen for the first time is off. */
  function sessionOf(key) {
    if (!key) return null;
    let record = settings.sessions[key];
    if (!record) {
      // One room per chat, off until its own switch is turned on: two chats must
      // never share a topic, or a command typed for one would arrive in the
      // other (2026-11-26).
      record = { topic: null, enabled: false, since: 'all', at: 0 };
      if (legacy?.topic) {
        record.topic = legacy.topic;
        record.enabled = legacy.enabled;
        record.at = Date.now();
        legacy = null;
      }
      settings.sessions[key] = record;
      save();
    }
    return record;
  }

  /** Keep a published id so the copy that comes back is not run as a command. */
  function rememberSent(res) {
    if (!res?.ok || !res.id) return;
    sentIds.add(String(res.id));
    if (sentIds.size > MAX_SENT_IDS) {
      sentIds = new Set([...sentIds].slice(-MAX_SENT_IDS));
    }
  }

  function statusOf(key) {
    const room = key ? settings.sessions[key] : null;
    return statuses.get(key) || { connected: false, topic: room?.topic || null, error: null };
  }

  function snapshot() {
    const room = activeKey ? settings.sessions[activeKey] || null : null;
    const topic = room?.topic || null;
    return {
      server: settings.server,
      username: settings.username,
      signedIn: Boolean(settings.token),
      sessionKey: activeKey,
      topic,
      link: topic ? `${settings.server}/${topic}` : null,
      enabled: Boolean(room?.enabled),
      // Every session's switch, so a turn ending in a background chat knows
      // whether its own room is on without asking again.
      rooms: Object.fromEntries(
        Object.entries(settings.sessions).map(([key, value]) => [
          key,
          { topic: value.topic || null, enabled: Boolean(value.enabled && value.topic) },
        ])
      ),
      summary: { ...settings.summary },
      notify: { ...settings.notify },      config: { ...config },
      account,
      status: statusOf(activeKey),
    };
  }

  function announce(type, payload) {
    emit(type, payload);
  }

  function setStatus(key, next) {
    if (!key) return;
    statuses.set(key, { ...statusOf(key), ...next });
    if (key === activeKey) announce('status', { ...statusOf(key), sessionKey: key });
  }

  /* --------------------------- the live streams --------------------------- */

  function stopStream(key) {
    const entry = streams.get(key);
    if (!entry) return;
    streams.delete(key);
    if (entry.timer) clearTimeout(entry.timer);
    try {
      entry.controller.abort();
    } catch {}
    if (statusOf(key).connected) setStatus(key, { connected: false, error: null });
  }

  /**
   * Listen to one session's room, and keep listening.
   *
   * A dropped stream is normal — the server restarts, a laptop sleeps — so it
   * reconnects from the last id already seen, which is what stops a reconnect
   * from replaying the room's whole cache into the panel.
   */
  function startStream(key) {
    stopStream(key);
    const room = settings.sessions[key];
    if (!room?.topic || !room.enabled || stopped) return;
    const controller = new AbortController();
    const entry = { controller, timer: null };
    streams.set(key, entry);
    setStatus(key, { topic: room.topic, error: null });
    const roomAt = room.at || 0;

    api
      .subscribe(settings.server, {
        topic: room.topic,
        since: room.since || 'all',
        signal: controller.signal,
        onOpen: () => setStatus(key, { connected: true, topic: room.topic, error: null }),
        onMessage: (message) => {
          // A room made a moment ago must not replay its cache as commands.
          if (roomAt && message.time && message.time < roomAt) return;
          // Our own answer or notification coming back down the same stream.
          // The tag is the durable half of the guard; the id covers a server
          // that drops tags.
          if (Array.isArray(message.tags) && message.tags.some((tag) => OWN_TAGS.includes(tag))) return;
          if (message.id && sentIds.has(message.id)) return;
          const current = settings.sessions[key];
          if (!current) return;
          current.since = message.id || current.since;
          save();
          announce('message', { sessionKey: key, message, state: key === activeKey ? snapshot() : null });
        },
        onError: (err) => setStatus(key, { connected: false, topic: room.topic, error: err?.error || 'The stream stopped.' }),
      })
      .catch(() => {})
      .then(() => {
        if (stopped || controller.signal.aborted || !streams.has(key)) return;
        entry.timer = setTimeout(() => startStream(key), RECONNECT_MS);
        if (entry.timer.unref) entry.timer.unref();
      });
  }

  /** Start the streams of every session that is switched on. */
  function startEnabled() {
    for (const [key, room] of Object.entries(settings.sessions)) {
      if (room.enabled && room.topic) startStream(key);
    }
  }

  /* ------------------------------- actions ------------------------------- */

  async function readConfig() {
    const res = await api.fetchServerConfig(settings.server);
    if (res.ok) {
      config = { login: res.login, signup: res.signup, checked: true };
      announce('config', { ...config });
    } else {
      config = { ...config, checked: false };
      announce('config', { ...config, error: res.error });
    }
    return config;
  }

  async function refreshAccount() {
    if (!settings.token) {
      // Anonymous accounts still report a rate limit, and the panel is honest
      // about which of the two it is showing.
      const anon = await api.fetchAccount(settings.server, {});
      account = anon.ok ? { username: null, anonymous: true, limits: anon.limits, stats: anon.stats } : null;
      announce('account', { account });
      return account;
    }
    const res = await api.fetchAccount(settings.server, { token: settings.token });
    account = res.ok
      ? { username: res.username, anonymous: false, limits: res.limits, stats: res.stats }
      : { username: settings.username, anonymous: false, error: res.error };
    announce('account', { account });
    return account;
  }

  return {
    state: snapshot,

    load() {
      load();
      return snapshot();
    },

    setEmitter(fn) {
      emit = typeof fn === 'function' ? fn : () => {};
    },

    /**
     * Follow a session: its room is what the panel shows, and its room is what
     * the agent's own `ntfy_send` publishes to. Other switched-on sessions keep
     * their streams, so a message to one of them still arrives.
     */
    setActiveSession(key) {
      const next = key ? String(key) : null;
      if (next === activeKey) return snapshot();
      activeKey = next;
      sessionOf(next);
      if (next) startStream(next);
      return snapshot();
    },

    /** Stop listening to a session whose tab is gone; its room is kept. */
    stopSession(key) {
      if (key) stopStream(String(key));
    },

    /** A chat that gained a session file keeps the room it already had. */
    rekey(fromKey, toKey) {
      if (!fromKey || !toKey || fromKey === toKey) return snapshot();
      // An untouched placeholder is not a room: following a tab that has no file
      // yet creates one, and that placeholder used to block the move, so the room
      // the reader switched on was left behind and the panel showed off
      // (2026-11-26).
      const dest = settings.sessions[toKey];
      const destEmpty = !dest || (!dest.topic && !dest.enabled);
      if (settings.sessions[fromKey] && destEmpty) {
        const wasStreaming = streams.has(fromKey);
        stopStream(fromKey);
        settings.sessions[toKey] = settings.sessions[fromKey];
        delete settings.sessions[fromKey];
        const status = statuses.get(fromKey);
        statuses.delete(fromKey);
        if (status) statuses.set(toKey, status);
        if (activeKey === fromKey) activeKey = toKey;
        save();
        if (wasStreaming) startStream(toKey);
      }
      return snapshot();
    },

    setServer(input) {
      const server = api.normalizeServer(input);
      if (!server) return { ok: false, error: 'That does not look like a server address.' };
      if (server === settings.server) return { ok: true, state: snapshot() };
      settings.server = server;
      // A token belongs to the server that issued it.
      settings.token = null;
      settings.username = null;
      account = null;
      config = { login: true, signup: true, checked: false };
      save();
      for (const key of [...streams.keys()]) stopStream(key);
      readConfig().catch(() => {});
      refreshAccount().catch(() => {});
      startEnabled();
      return { ok: true, state: snapshot() };
    },

    setSummary({ enabled, limit, source } = {}) {
      settings.summary = {
        enabled: enabled === undefined ? settings.summary.enabled : Boolean(enabled),
        limit: limit === undefined ? settings.summary.limit : clampLimit(limit),
        // 'local' shortens with the model in this machine (free, GPU seconds);
        // 'provider' asks the provider that wrote the answer (a few tokens).
        source: source === 'provider' ? 'provider' : source === 'local' ? 'local' : settings.summary.source,
      };
      save();
      return { ok: true, state: snapshot() };
    },

    /** When the phone hears about a finished turn: 'always', or 'away'. */
    setNotify({ onSettle, mode } = {}) {
      settings.notify = {
        onSettle: onSettle === undefined ? settings.notify.onSettle : Boolean(onSettle),
        mode: NOTIFY_MODES.includes(mode) ? mode : settings.notify.mode,
      };
      save();
      return { ok: true, state: snapshot() };
    },

    /**
     * The switch for this session's room. Turning it on with no room yet makes
     * one — the session and the room are the same decision.
     */
    setEnabled(next) {
      const room = sessionOf(activeKey);
      if (!room) return { ok: false, error: 'No chat is open yet.', state: snapshot() };
      room.enabled = next !== false;
      if (room.enabled && !room.topic) {
        room.topic = api.randomTopicName();
        room.since = 'all';
        room.at = Date.now();
      }
      save();
      if (room.enabled) startStream(activeKey);
      else stopStream(activeKey);
      setStatus(activeKey, { connected: false, topic: room.topic || null, error: null });
      return { ok: true, state: snapshot() };
    },

    /** Give this session's room a name of its own (empty = generate one). */
    addTopic(name) {
      const room = sessionOf(activeKey);
      if (!room) return { ok: false, error: 'Open a session first.' };
      const clean = api.sanitizeTopicName(name) || api.randomTopicName();
      const same = clean === room.topic;
      room.topic = clean;
      room.since = same ? room.since : 'all';
      room.at = same ? room.at : Date.now();
      save();
      if (room.enabled) startStream(activeKey);
      return { ok: true, topic: { name: clean }, state: snapshot() };
    },

    /** Forget this session's room and switch it off. */
    removeTopic() {
      const room = sessionOf(activeKey);
      if (!room) return { ok: true, state: snapshot() };
      stopStream(activeKey);
      room.topic = null;
      room.enabled = false;
      room.since = 'all';
      room.at = 0;
      save();
      setStatus(activeKey, { connected: false, topic: null, error: null });
      return { ok: true, state: snapshot() };
    },

    async signUp({ username, password, email } = {}) {
      const res = await api.signUp(settings.server, { username, password, email });
      if (!res.ok) return res;
      // Signing up is not signing in on every server version, so log in right
      // away and keep the token it returns.
      return this.logIn({ username, password });
    },

    async logIn({ username, password } = {}) {
      const res = await api.logIn(settings.server, { username, password });
      if (!res.ok) return res;

      // The password is only used to obtain a token; what gets stored is a token,
      // and a token is only worth storing if the server accepts it. A freshly
      // minted one is tried first (so the password never has to be kept), then
      // the login token itself.
      const minted = await api.createAccessToken(settings.server, { token: res.token }, { label: 'NTAPI' });
      const candidates = [minted.ok ? minted.token : null, res.token].filter(Boolean);
      let working = null;
      for (const candidate of candidates) {
        const probe = await api.fetchAccount(settings.server, { token: candidate });
        if (probe.ok) {
          working = candidate;
          break;
        }
      }
      if (!working) {
        // Said plainly: the panel must not show "signed in" for a token the
        // server rejects on the very next call. Rooms still work without an
        // account, so this is a downgrade, not a dead end.
        settings.token = null;
        settings.username = null;
        save();
        return {
          ok: false,
          status: 401,
          error: 'The server accepted the password but refused every token it issued. Try signing in again — rooms work without an account too.',
          state: snapshot(),
        };
      }

      settings.token = working;
      settings.username = res.username;
      save();
      await refreshAccount();
      return { ok: true, username: settings.username, state: snapshot() };
    },

    logout() {
      settings.token = null;
      settings.username = null;
      account = null;
      save();
      refreshAccount().catch(() => {});
      return { ok: true, state: snapshot() };
    },

    /** Send to a session's room; the active one unless a key is given. */
    async publish(message = {}) {
      const key = message.sessionKey || activeKey;
      const room = key ? settings.sessions[key] : null;
      // A room the reader has not opened for this chat stays closed: every chat
      // has its own topic so two chats never answer each other (2026-11-26).
      if (!room?.topic) return { ok: false, error: 'Switch notifications on for this session first.' };
      const payload = { ...message, topic: room.topic };
      const auth = { token: settings.token, username: settings.username, password: message.password };
      let res = await api.publish(settings.server, payload, auth);
      if (!res.ok && res.status === 401 && auth.token) {
        // A token the server refuses must not lose the message: the room itself
        // is open, so the same send goes again without credentials and says so.
        const anonymous = await api.publish(settings.server, payload, {});
        if (anonymous.ok) res = { ...anonymous, anonymous: true };
      }
      rememberSent(res);
      return res;
    },

    async init() {
      stopped = false;
      await readConfig().catch(() => {});
      startEnabled();
      await refreshAccount().catch(() => {});
      return snapshot();
    },

    stop() {
      stopped = true;
      for (const key of [...streams.keys()]) stopStream(key);
    },

    /** Test hook: a service with no timers or fetch left behind. */
    _internal: {
      get settings() {
        return settings;
      },
      get activeKey() {
        return activeKey;
      },
      startStream,
      stopStream,
    },
  };
}

module.exports = { createNtfyService, SETTINGS_FILE };
