'use strict';

/**
 * The ntfy side of the window: which server, which rooms, what arrived, and the
 * one live subscription.
 *
 * Kept apart from `ntfy.js` (which is only HTTP and knows nothing) so the state
 * can be exercised with a stub client and a temporary folder. Everything it
 * writes lives in the data root next to the other per-machine files:
 *
 *   ntfy.json           server, username, credential, rooms, summary setting
 *   ntfy-messages.json  the last messages received, newest last
 *
 * The credential is encrypted with Electron's safeStorage when it is available
 * (the same protection the provider keys get). Messages are not encrypted: they
 * are the user's own notifications, they are only ever read back by this panel,
 * and the file is written 0600.
 */

const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_FILE = 'ntfy.json';
const MESSAGES_FILE = 'ntfy-messages.json';
const FILE_VERSION = 1;
const MODE = 0o600;
const MAX_MESSAGES = 100;
const RECONNECT_MS = 5000;
const MAX_SUMMARY = 4000;

function createNtfyService({ dir, safeStorage, log = () => {}, client } = {}) {
  const api = client || require('./ntfy');
  const settingsPath = path.join(dir, SETTINGS_FILE);
  const messagesPath = path.join(dir, MESSAGES_FILE);

  /** @type {{server: string, username: string|null, token: string|null, topics: Array, activeTopic: string|null, summary: {enabled: boolean, limit: number}}} */
  let settings = {
    server: api.NTFY_DEFAULT_SERVER,
    username: null,
    token: null,
    topics: [],
    activeTopic: null,
    summary: { enabled: true, limit: 200, source: 'local' },
    // One line to the phone when a turn ends, whatever started it. Off by
    // default: a notification for every answer is a notification nobody reads.
    notify: { onSettle: false, mode: 'long' },
  };
  /**
   * Whether the whole integration is switched on. Off means: no stream, no
   * commands, no replies — the panel stays where it is, so sitting at the
   * computer does not require signing out of anything.
   */
  let enabled = true;
  let messages = [];
  let config = { login: true, signup: true, checked: false };
  let account = null;
  let status = { connected: false, topic: null, error: null };
  let streamAbort = null;
  let streamSince = 'all';
  let reconnectTimer = null;
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
    if (saved && typeof saved === 'object') {
      settings = {
        server: api.normalizeServer(saved.server) || api.NTFY_DEFAULT_SERVER,
        username: saved.username || null,
        token: unpackToken(saved.token),
        topics: Array.isArray(saved.topics)
          ? saved.topics.filter((t) => t && api.sanitizeTopicName(t.name)).slice(0, 50)
          : [],
        activeTopic: api.sanitizeTopicName(saved.activeTopic) || null,
        summary: {
          enabled: saved.summary?.enabled !== false,
          limit: clampLimit(saved.summary?.limit),
          source: saved.summary?.source === 'provider' ? 'provider' : 'local',
        },
        notify: {
          onSettle: saved.notify?.onSettle === true,
          mode: NOTIFY_MODES.includes(saved.notify?.mode) ? saved.notify.mode : 'long',
        },
      };
      enabled = saved.enabled !== false;
    }
    const savedMessages = readJson(messagesPath, null);
    if (Array.isArray(savedMessages)) messages = savedMessages.slice(-MAX_MESSAGES);
    if (settings.activeTopic && !settings.topics.some((t) => t.name === settings.activeTopic)) {
      settings.activeTopic = settings.topics[0]?.name || null;
    }
  }

  const NOTIFY_MODES = ['always', 'long', 'away'];

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
      topics: settings.topics,
      activeTopic: settings.activeTopic,
      summary: settings.summary,
      notify: settings.notify,
      enabled,
    });
  }

  function saveMessages() {
    writeJson(messagesPath, messages.slice(-MAX_MESSAGES));
  }

  function snapshot() {
    return {
      server: settings.server,
      username: settings.username,
      signedIn: Boolean(settings.token),
      topics: settings.topics.map((t) => ({ name: t.name, label: t.label || t.name })),
      activeTopic: settings.activeTopic,
      summary: { ...settings.summary },
      notify: { ...settings.notify },
      enabled,
      messages: messages.slice(-MAX_MESSAGES),
      config: { ...config },
      account,
      status: { ...status },
    };
  }

  function announce(type, payload) {
    emit(type, payload);
  }

  function setStatus(next) {
    status = { ...status, ...next };
    announce('status', { ...status });
  }

  /* --------------------------- the live stream --------------------------- */

  function stopStream() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (streamAbort) {
      try {
        streamAbort.abort();
      } catch {}
      streamAbort = null;
    }
    if (status.connected) setStatus({ connected: false, error: null });
  }

  /**
   * Listen to the active room, and keep listening.
   *
   * A dropped stream is normal — the server restarts, a laptop sleeps — so it
   * reconnects with `since` set to the last id already held, which is what stops
   * a reconnect from replaying the room's whole cache into the panel.
   */
  function startStream() {
    stopStream();
    const topic = settings.activeTopic;
    if (!topic || stopped || !enabled) return;
    streamSince = messages.length ? messages[messages.length - 1].id || 'all' : 'all';
    const controller = new AbortController();
    streamAbort = controller;
    setStatus({ topic, error: null });

    api
      .subscribe(settings.server, {
        topic,
        since: streamSince,
        signal: controller.signal,
        onOpen: () => setStatus({ connected: true, topic, error: null }),
        onMessage: (message) => {
          messages = [...messages, message].slice(-MAX_MESSAGES);
          saveMessages();
          streamSince = message.id || streamSince;
          announce('message', { message, state: snapshot() });
        },
        onError: (err) => {
          setStatus({ connected: false, topic, error: err?.error || 'The stream stopped.' });
        },
      })
      .catch(() => {})
      .then(() => {
        if (stopped || controller.signal.aborted || settings.activeTopic !== topic) return;
        reconnectTimer = setTimeout(startStream, RECONNECT_MS);
        if (reconnectTimer.unref) reconnectTimer.unref();
      });
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
      stopStream();
      readConfig().catch(() => {});
      refreshAccount().catch(() => {});
      startStream();
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

    /**
     * When the phone hears about a finished turn. `mode`: 'always' every turn,
     * 'long' only a turn that took a while, 'away' only when the window is not
     * in front of anyone.
     */
    setNotify({ onSettle, mode } = {}) {
      settings.notify = {
        onSettle: onSettle === undefined ? settings.notify.onSettle : Boolean(onSettle),
        mode: NOTIFY_MODES.includes(mode) ? mode : settings.notify.mode,
      };
      save();
      return { ok: true, state: snapshot() };
    },

    /** The master switch: off stops the stream and every command with it. */
    setEnabled(next) {
      enabled = next !== false;
      save();
      if (!enabled) {
        stopStream();
        setStatus({ connected: false, topic: settings.activeTopic, error: null });
      } else if (settings.activeTopic) {
        startStream();
      }
      return { ok: true, state: snapshot() };
    },

    addTopic(name, label) {
      const clean = api.sanitizeTopicName(name) || api.randomTopicName();
      const existing = settings.topics.find((t) => t.name === clean);
      if (!existing) {
        settings.topics = [...settings.topics, { name: clean, label: String(label || clean).slice(0, 60) }];
      }
      settings.activeTopic = clean;
      save();
      startStream();
      return { ok: true, topic: { name: clean, label: label || clean }, state: snapshot() };
    },

    removeTopic(name) {
      const clean = api.sanitizeTopicName(name);
      settings.topics = settings.topics.filter((t) => t.name !== clean);
      if (settings.activeTopic === clean) {
        settings.activeTopic = settings.topics[0]?.name || null;
        startStream();
      }
      save();
      return { ok: true, state: snapshot() };
    },

    setActiveTopic(name) {
      const clean = api.sanitizeTopicName(name);
      if (!clean || !settings.topics.some((t) => t.name === clean)) {
        return { ok: false, error: 'That room is not in the list.' };
      }
      settings.activeTopic = clean;
      save();
      startStream();
      return { ok: true, state: snapshot() };
    },

    clearMessages() {
      messages = [];
      saveMessages();
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

    async publish(message) {
      if (!settings.activeTopic) return { ok: false, error: 'Pick a room first.' };
      const payload = { ...message, topic: settings.activeTopic };
      const auth = { token: settings.token, username: settings.username, password: message?.password };
      const res = await api.publish(settings.server, payload, auth);
      if (res.ok || res.status !== 401 || !auth.token) return res;
      // A token the server refuses must not lose the message: the room itself is
      // open, so the same send goes again without credentials and says so.
      const anonymous = await api.publish(settings.server, payload, {});
      return anonymous.ok ? { ...anonymous, anonymous: true } : res;
    },

    async init() {
      stopped = false;
      await readConfig().catch(() => {});
      if (settings.activeTopic) startStream();
      await refreshAccount().catch(() => {});
      return snapshot();
    },

    stop() {
      stopped = true;
      stopStream();
    },

    /** Test hook: a service with no timers or fetch left behind. */
    _internal: { get settings() { return settings; }, startStream, stopStream },
  };
}

module.exports = { createNtfyService, SETTINGS_FILE, MESSAGES_FILE, MAX_MESSAGES };
