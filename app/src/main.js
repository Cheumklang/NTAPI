'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, safeStorage, Notification } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

/**
 * Update splash: the update replaces this .exe, so the app has to quit, and the
 * user was left staring at an empty desktop wondering whether to reopen it. The
 * installer spawns this same executable with `--ntapi-splash`; that copy owns a
 * small "updating" window and outlives the app.
 *
 * This has to happen before the single-instance lock below, otherwise the splash
 * would hand its argv to the running app and quit. A top-level `return` is legal
 * in a CommonJS module and stops the rest of this file from loading.
 */
if (process.argv.includes('--ntapi-splash')) {
  require('./update-splash').run();
  return;
}

/**
 * Keep the internal app name as "FreePi" even though the product is branded
 * NTAPI.
 *
 * Electron's safeStorage (Windows app-bound encryption) ties the encryption key
 * to the app name / userData folder. Renaming the app to "NTAPI" silently made
 * every saved provider key (Coarena, Zro, NVIDIA, Token Harbor) undecryptable,
 * so those providers dropped out of the model list and only FreePi was left.
 * Setting the old name here keeps existing keys readable; the UI, window title
 * and installer still say NTAPI.
 */
app.setName('FreePi');
// Windows only shows toasts for an app whose AppUserModelID matches its
// shortcut/installer entry; electron-builder stamps this same id.
app.setAppUserModelId('ai.ntapi.desktop');

const bridge = require('./freepi-bridge');
const { resetFreePiSession } = require('./session-reset');
const {
  createBrowserBridge,
  EXTENSION_ID,
  DEFAULT_PORT,
  CHROME_EXTENSIONS_URL,
} = require('./browser-bridge');
const { createClaims } = require('./browser-claims');
const { createAutopilot } = require('./browser-autopilot');
const {
  isPolicy,
  normalizePolicy,
  policyFromLegacy,
  needsDialog,
} = require('./approval-policy');
const { formatSystemInfo, safeErrorMessage } = require('./system-info');
const { sdkCandidatePaths } = require('./sdk-path');
const {
  isLimitError,
  isTransientThrottle,
  turnFailure,
} = require('./model-fallback');

/**
 * Keep a crash on disk so a report can reference it, and let the window offer
 * "copy system info" instead of dying silently. Deliberately does not quit: the
 * app stays usable and the log can be read.
 */
function logCrash(kind, detail) {
  try {
    const line = `[${new Date().toISOString()}] ${kind}: ${String(detail).slice(0, 8000)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch {}
}

/**
 * A line the renderer asked us to keep.
 *
 * The transcript has one failure mode that is invisible from here: a repaint that
 * stops halfway leaves the DOM showing a prefix of the chat, and the next launch
 * looks fine again. Without a line on disk there is nothing to debug afterwards,
 * so the renderer reports the gap and this writes it next to the real crashes.
 */
function logUi(line) {
  logCrash('ui', line);
}
process.on('uncaughtException', (err) => logCrash('uncaughtException', safeErrorMessage(err)));
process.on('unhandledRejection', (reason) => logCrash('unhandledRejection', safeErrorMessage(reason)));
app.on('render-process-gone', (_event, _contents, details) =>
  logCrash('render-process-gone', JSON.stringify(details))
);
const { diffLines } = require('./diff');
const { sessionDirName } = require('./session-paths');
const {
  COLORS: SESSION_COLORS,
  applyMark: applySessionMark,
  readMark: readSessionMark,
  sortByMark: sortSessionsByMark,
  pruneMarks: pruneSessionMarks,
  markKey: sessionMarkKey,
} = require('./session-marks');
const { friendlyProviderError } = require('./provider-errors');
const { isUpgradeRequired: isUpgradeRequiredText, resolveClientVersionFloor } = require('./client-version');
const { normalize: normalizeSponsor } = require('./sponsor');
const sponsorFeed = require('./sponsor-feed');

/*
 * Creatives are read from disk through their own scheme.
 *
 * This has to be registered before the app is ready, which is why it sits at the
 * top level rather than inside a handler: Electron decides what a scheme is
 * allowed to do (stream, be fetched, be shown by an <img>/<video>) during startup
 * and ignores registrations made after that.
 */
const { protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');

try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: sponsorFeed.MEDIA_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
    },
  ]);
} catch {}
const { createProviderKeyStore } = require('./provider-key');
const { installSseErrorGuard } = require('./sse-error-guard');
const { readCoarenaKeyInfo, COARENA_PROVIDER } = require('./coarena');

// Some OpenAI-compatible gateways answer a streaming request with 200 and the
// failure inside the SSE body; without this pi would wait forever for a turn
// that already failed. Installed before any provider request can run.
installSseErrorGuard();
const { checkZroKey } = require('./zro');
const { checkNvidiaKey } = require('./nvidia');
const { checkTokenHarborKey } = require('./tokenharbor');
const { checkLlm7Key } = require('./llm7');
const { checkDeepSeekKey } = require('./deepseek');
const { checkAnthropicKey } = require('./anthropic');
const { checkGoogleKey } = require('./google-ai');
const { focusExistingWindow } = require('./single-instance');
const { isUserAbort } = require('./turn-abort');
const { promptOptionsFor } = require('./prompt-mode');
const { usageTotals } = require('./usage-totals');
const { fetchUsdThb } = require('./fx-rate');

/**
 * One copy of NTAPI at a time.
 *
 * A second launch (taskbar icon, shortcut, installer's "run now") used to start
 * a whole extra process: two windows, two sets of in-memory tabs, and two writers
 * fighting over the same session/config files and the presence port. Now the
 * newcomer quits and the window that is already open comes back to the front.
 */
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusExistingWindow(win);
  });
}

/**
 * Turn pi's own display diff into the shape the renderer draws.
 * Format is ` 1 alpha` / `-2 beta` / `+2 BETA CHANGED` (sign, line number, space, text).
 */
function parseUnifiedDiff(text, filePath) {
  const lines = String(text || '').split('\n');
  const ops = [];
  let added = 0;
  let removed = 0;

  for (const line of lines) {
    if (!line) continue;
    const m = /^([ +-])(\d*) ?(.*)$/.exec(line);
    if (!m) continue;
    const sign = m[1];
    const num = m[2] ? Number(m[2]) : undefined;
    const body = m[3] ?? '';
    if (sign === '+') {
      added += 1;
      ops.push({ type: 'ins', text: body, bLine: num });
    } else if (sign === '-') {
      removed += 1;
      ops.push({ type: 'del', text: body, aLine: num });
    } else {
      ops.push({ type: 'eq', text: body, aLine: num, bLine: num });
    }
  }

  if (!added && !removed) return null;
  return {
    path: filePath || '',
    file: filePath ? path.basename(filePath) : '',
    added,
    removed,
    hunks: ops.length ? [{ ops }] : [],
    truncated: false,
  };
}

/** Files changed by the tool call currently running: toolCallId -> {path, before}. */
const editSnapshots = new Map();

/** Only edit/write touch one file whose diff we can show. */
function fileToolTarget(toolName, args) {
  if (toolName !== 'edit' && toolName !== 'write') return null;
  const p = args?.path || args?.file_path || args?.filename;
  return typeof p === 'string' && p ? p : null;
}

/**
 * Locate the free-pi-cli entry script on this machine, if installed.
 * Returns null when the CLI is not present.
 */
function findFreePiCli() {
  const home = app.getPath('home');
  const candidates = [
    path.join(home, 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'),
  ];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    try {
      for (const dir of fs.readdirSync(base)) {
        const p = path.join(base, dir, 'node_modules', 'free-pi-cli', 'dist', 'index.js');
        if (fs.existsSync(p)) return p;
      }
    } catch {}
  }
  return null;
}

// pi SDK ships inside the free-pi-cli npx cache. Resolve it at runtime so the
// app works on a machine that already ran `npx free-pi-cli`.
function resolveSdk() {
  // Bundled first (a fresh machine has no npx cache), then the env overrides,
  // then the CLI's npx cache. Each candidate is a package directory — the SDK is
  // ESM-only with no `require` export, so requiring the directory works when
  // resolving it by name does not. See `src/sdk-path.js`.
  const candidates = sdkCandidatePaths({
    appDir: path.join(__dirname, '..'),
    home: app.getPath('home'),
    env: process.env,
  });

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    try {
      return require(dir);
    } catch {}
  }

  throw new Error(
    'Could not find @earendil-works/pi-coding-agent. Reinstall NTAPI, or run `npx free-pi-cli@latest` once in a terminal, then reopen this app.'
  );
}

let sdk;
let win = null;
/** Resolves when the main window has painted its first frame. */
let winUiReady = null;
/** Set while the window is loading; the renderer calls it through `ui:ready`. */
let uiReadyResolver = null;
/**
 * How long to keep the update splash up waiting for the first painted frame.
 * Generous — a cold start with a large session can take a few seconds — but short
 * enough that a stuck renderer does not leave a box floating over the desktop.
 */
const UI_READY_TIMEOUT_MS = 15_000;

/**
 * After the data folder is renamed, any absolute path saved inside it still
 * points at the old name. Only prefs.json keeps such paths (the open tab's
 * session file), so it is rewritten here; chat files are left untouched.
 */
function rewriteLegacyPathsInPrefs(root, from, to) {
  const file = path.join(root, 'prefs.json');
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(from)) return;
    // JSON on disk escapes backslashes, so patch both the raw and the escaped form.
    const next = text.split(from).join(to).split(from.replace(/\\/g, '\\\\')).join(to.replace(/\\/g, '\\\\'));
    if (next !== text) fs.writeFileSync(file, next);
  } catch {}
}

/**
 * App data root: one obvious folder people can find, back up, or copy to
 * another machine. `C:\NTAPI` by default; override with NTAPI_DATA_DIR
 * (FREEPI_DATA_DIR still works, for setups that set it before the rename).
 *
 * Upgrading from the old build: when `C:\NTAPI` does not exist yet but the old
 * `C:\Freepiai` does, the old folder is renamed to `C:\NTAPI` once, at startup.
 * That folder holds the provider keys and every saved chat, so moving it is what
 * makes an existing install both keep its data and end up with the new name.
 * The rename is only attempted before any session touches a file; if Windows
 * refuses (a lock, a permission), the old folder is used in place instead so the
 * app still opens with everything intact.
 *
 * Deliberately NOT inside the workspace, so switching projects never strands
 * settings, and NOT inside `~/.free-pi`, because that folder belongs to the CLI
 * and to every other agent on the machine.
 *
 * If the drive refuses to be written (UAC, read-only, missing drive letter) we
 * quietly fall back to the standard per-user location so the app still opens.
 */
function resolveDataRoot() {
  const LEGACY_ROOT = 'C:\\Freepiai';
  const NEW_ROOT = 'C:\\NTAPI';
  const explicit = process.env.NTAPI_DATA_DIR || process.env.FREEPI_DATA_DIR;

  // One-time rename of the old data folder. Only when nothing overrides the
  // location and the new folder has not been created yet.
  if (!explicit && !fs.existsSync(NEW_ROOT) && fs.existsSync(LEGACY_ROOT)) {
    try {
      fs.renameSync(LEGACY_ROOT, NEW_ROOT);
      // prefs.json remembers the open tab's session file by absolute path; without
      // this rewrite the app would reopen and fail to find its own session.
      rewriteLegacyPathsInPrefs(NEW_ROOT, LEGACY_ROOT, NEW_ROOT);
    } catch {
      // Locked or read-only: keep using the old folder below.
    }
  }

  const candidates = [
    explicit,
    NEW_ROOT,
    LEGACY_ROOT,
    path.join(app.getPath('userData'), 'data'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      // mkdir succeeding is not proof on Windows: verify with a real write.
      const probe = path.join(dir, '.write-test');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
      return dir;
    } catch {}
  }
  return app.getPath('userData');
}

const DATA_ROOT = resolveDataRoot();


/**
 * The Coarena key is per-machine state, never part of prefs.json: it is
 * encrypted by the OS through safeStorage and stays in the main process. The
 * renderer only ever sees `status()` (configured / readable / last four chars).
 */
const coarenaKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'coarena.json' });
const zroKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'zro.json' });
const nvidiaKeys = createProviderKeyStore({ dir: DATA_ROOT, safeStorage, fileName: 'nvidia.json' });
const tokenharborKeys = createProviderKeyStore({
  dir: DATA_ROOT,
  safeStorage,
  fileName: 'tokenharbor.json',
});
const llm7Keys = createProviderKeyStore({
  dir: DATA_ROOT,
  safeStorage,
  fileName: 'llm7.json',
});
const deepseekKeys = createProviderKeyStore({
  dir: DATA_ROOT,
  safeStorage,
  fileName: 'deepseek.json',
});
const anthropicKeys = createProviderKeyStore({
  dir: DATA_ROOT,
  safeStorage,
  fileName: 'anthropic.json',
});
const googleKeys = createProviderKeyStore({
  dir: DATA_ROOT,
  safeStorage,
  fileName: 'google.json',
});
/** 60 s cache for GET /key so opening Settings does not burn the rate limit. */
let coarenaInfoCache = { at: 0, key: null, status: null };

/**
 * Where the agent's generated files land. Users can repoint each of these from
 * Settings; relative values resolve against the current workspace.
 *
 * Defaults live under the app data root so everything this app writes sits in
 * one place, even when the user opens a new workspace.
 */
const FOLDER_DEFAULTS = {
  images: 'images',
  attachments: '.ntapi-attachments',
  downloads: 'downloads',
};

/**
 * The theme, and the only two values prefs will accept for it.
 *
 * Dark is the default: it is the theme this app was drawn in and what a new
 * install should look like. Light is a choice, stored per machine in prefs.json
 * beside the language.
 */
const THEMES = ['dark', 'light'];
const DEFAULT_THEME = 'dark';

/** The saved theme, or the default when nothing valid is stored. */
function readTheme() {
  const saved = readPrefs().theme;
  return THEMES.includes(saved) ? saved : DEFAULT_THEME;
}

/**
 * Where chat history and skills live.
 *
 * Both sit under the app data root so a fresh install on someone else's machine
 * starts clean inside one findable folder — nothing to configure, nothing left
 * behind in a hidden dot-directory.
 *
 * Note: free-pi-cli keeps its history in `~/.free-pi/agent/sessions`. This app
 * deliberately does not share that store any more, so app chats and terminal
 * chats are separate lists.
 */
const SESSIONS_ROOT = path.join(DATA_ROOT, 'sessions');
const SKILLS_ROOT = path.join(DATA_ROOT, 'skills');

/** Absolute default folder for a kind, outside any workspace. */
function defaultFolder(kind) {
  return path.join(DATA_ROOT, 'outputs', FOLDER_DEFAULTS[kind]);
}

function resolveFolder(kind, cwd) {
  const prefs = readPrefs();
  const configured = prefs.folders?.[kind];

  // A custom folder is only honoured while it belongs to the workspace it was
  // set for. An absolute path pointing elsewhere would silently scatter output
  // across the disk when the user switches projects, so fall back to default.
  if (configured) {
    const abs = path.isAbsolute(configured) ? configured : path.join(cwd, configured);
    const owner = prefs.foldersOwner;
    if (!path.isAbsolute(configured) || !owner || path.resolve(owner) === path.resolve(cwd)) {
      return abs;
    }
  }

  return defaultFolder(kind);
}

/**
 * Create every output folder for a workspace so the user never has to guess
 * where files will land. Safe to call repeatedly.
 */
function ensureWorkspaceFolders(cwd) {
  const created = [];
  const failed = [];
  for (const kind of Object.keys(FOLDER_DEFAULTS)) {
    const abs = resolveFolder(kind, cwd);
    try {
      fs.mkdirSync(abs, { recursive: true });
      created.push(abs);
    } catch (err) {
      failed.push({ path: abs, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { created, failed };
}

/**
 * Small JSON store for app preferences (last workspace, open tabs).
 *
 * Lives at `<data root>/prefs.json` so anyone can open it in Notepad and see
 * what the app remembers, instead of hunting through %APPDATA%.
 */
const prefsPath = () => path.join(DATA_ROOT, 'prefs.json');

/**
 * Which language the window opens in on a machine that has never chosen one.
 *
 * A fresh install used to open in English regardless, which put the terms card
 * and the first-run guide in front of a Thai reader in a language they may not
 * read — and agreeing to text you cannot read is not consent worth recording.
 * Windows already knows the answer, so the first guess comes from its display
 * language; only `th` is matched, because English is the safer guess for every
 * other locale. A choice made in the app wins from then on.
 */
function initialLang(prefs) {
  if (prefs.lang === 'en' || prefs.lang === 'th') return prefs.lang;
  try {
    if (String(app.getLocale() || '').toLowerCase().startsWith('th')) return 'th';
  } catch {}
  return 'en';
}

/**
 * The sponsor config that ships with the build.
 *
 * It is the fallback, not the source of truth: the live list comes from the feed
 * published by NTAPI ADS (see `sponsor-feed.js`). This file answers only "what do
 * we show a machine that has never been online", and a build with no sponsor at
 * all is a perfectly normal state.
 */
const SPONSOR_PATH = path.join(__dirname, 'sponsor.json');

/*
 * Where the live feed is cached. Under DATA_ROOT so it travels with the rest of
 * this install's state, and because a read-only install directory must not stop
 * a banner from being remembered.
 */
const SPONSOR_CACHE_DIR = path.join(DATA_ROOT, 'sponsor');

/**
 * Serve one cached creative, by base name only.
 *
 * The name is re-sanitised here rather than trusted from the renderer: this
 * handler is the boundary between a file name and `fs`, so `mediaKey` (which
 * strips any path and accepts only image/video extensions) is the only thing
 * that may turn a request into a read. A miss answers 404 and nothing else
 * happens — a banner that cannot load is decoration, not an error dialog.
 */
function registerSponsorMedia() {
  try {
    protocol.handle(sponsorFeed.MEDIA_SCHEME, async (request) => {
      try {
        const url = new URL(request.url);
        const key = sponsorFeed.mediaKey(decodeURIComponent(url.pathname.split('/').pop() || ''));
        if (!key) return new Response('', { status: 400 });
        const folder = sponsorFeed.mediaDir(SPONSOR_CACHE_DIR);
        const target = path.join(folder, key);
        if (!target.startsWith(folder + path.sep)) return new Response('', { status: 400 });
        if (!fs.existsSync(target)) return new Response('', { status: 404 });
        // `net.fetch` on a file URL streams from disk, so a 100MB clip never
        // becomes one string in this process.
        return await net.fetch(pathToFileURL(target).toString());
      } catch {
        return new Response('', { status: 404 });
      }
    });
  } catch {
    // A scheme that fails to register costs the banner, never the app.
  }
}

/**
 * The feed as last understood, plus the host it came from. Media is resolved
 * against that same host, so the feed cannot point a creative at somewhere else.
 */
const sponsorState = {
  feed: null,
  base: '',
  checkedAt: 0,
  source: '',
  etag: '',
  fingerprint: '',
};

let sponsorRefreshTimer = null;

function sponsorBaseOf(url) {
  const value = String(url || '');
  const cut = value.lastIndexOf('/');
  return cut > 0 ? value.slice(0, cut + 1) : '';
}

/**
 * Loads whatever we already know, then refreshes in the background.
 *
 * The order matters: the sidebar is drawn from cache on the very first frame, so
 * a slow or missing network never delays the window. Nothing here throws — a
 * sponsor is decoration, and decoration must not be able to stop the app.
 */
function primeSponsorCache() {
  const cached = sponsorFeed.readCache(SPONSOR_CACHE_DIR);
  if (cached) {
    sponsorState.feed = cached.feed;
    sponsorState.checkedAt = cached.fetchedAt;
    sponsorState.etag = cached.etag;
    sponsorState.fingerprint = sponsorFeed.feedFingerprint(cached.feed);
    sponsorState.base = sponsorFeed.FEED_URLS[0];
    sponsorState.base = sponsorBaseOf(sponsorState.base);
  }
}

/**
 * Ask the feed whether anything moved.
 *
 * Runs every 30 seconds while the window is open (and again when the window
 * comes back to the front), because a sponsor published in NTAPI ADS has to
 * appear without the user closing and reopening the app. The request carries
 * the validator from the last body, so an unchanged feed costs a 304 and
 * nothing else — no bytes, no parsing, no repaint.
 *
 * `force` skips the freshness gate and is used at startup only.
 */
async function refreshSponsorFeed({ force = false } = {}) {
  const now = Date.now();
  // Focus events can arrive in bursts; there is no reason to ask twice within
  // a few seconds, and no reason for the first ask to be older than the poll.
  const floorMs = Math.min(sponsorFeed.REVALIDATE_MS, 5000);
  if (!force && sponsorState.checkedAt && now - sponsorState.checkedAt < floorMs) return sponsorState.feed;

  const fetched = await sponsorFeed.fetchFeed({ etag: sponsorState.etag });
  if (!fetched) return sponsorState.feed;

  if (fetched.unchanged) {
    // 304: exactly the feed we already drew. Remember when we last heard that,
    // so the burst floor also applies to empty answers.
    sponsorState.checkedAt = fetched.fetchedAt;
    if (fetched.etag) sponsorState.etag = fetched.etag;
    return sponsorState.feed;
  }

  const fingerprint = sponsorFeed.feedFingerprint(fetched.feed);
  const changed = !sponsorState.feed || fingerprint !== sponsorState.fingerprint;
  sponsorState.feed = fetched.feed;
  sponsorState.base = sponsorBaseOf(fetched.source);
  sponsorState.checkedAt = fetched.fetchedAt;
  sponsorState.source = fetched.source;
  sponsorState.etag = fetched.etag;
  sponsorState.fingerprint = fingerprint;
  sponsorFeed.writeCache(SPONSOR_CACHE_DIR, fetched.feed, fetched.fetchedAt, fetched.etag);
  // New creatives make the old files dead weight; they are re-downloaded on
  // demand, and only the slot being shown is ever fetched.
  if (changed) {
    sponsorFeed.clearMedia(SPONSOR_CACHE_DIR);
    // The window is already showing the previous feed, so tell it to repaint.
    // Without this a publish would only show up on the *next* launch.
    send('sponsor:changed', { updated: fetched.feed.updated });
  }
  return sponsorState.feed;
}

/**
 * What the sidebar draws: the feed, without any bytes.
 *
 * Media travels separately (`sponsor:media`) because eight videos would be 60MB
 * of base64 through IPC on every start. Only the slot on screen is ever loaded.
 */
function sponsorPayload() {
  const feed = sponsorState.feed;
  if (!feed || !feed.slots.length) return { enabled: false };
  return {
    enabled: true,
    rotateSeconds: feed.rotateSeconds,
    updated: feed.updated,
    slots: feed.slots.map((slot) => ({
      id: slot.id,
      url: slot.url,
      text: slot.text,
      media: {
        type: slot.media.type,
        // The published frame has to reach the renderer or every creative is
        // drawn in the 2:1 default and the shape chosen in NTAPI ADS is lost.
        ratio: slot.media.ratio,
        alt: slot.media.alt,
        ...(slot.media.poster ? { hasPoster: true } : {}),
      },
      clicks: sponsorClicks(slot.id),
    })),
  };
}

function findSlot(rawId) {
  if (!sponsorState.feed) return null;
  const id = String(rawId || '');
  return sponsorState.feed.slots.find((slot) => slot.id === id) || null;
}

/**
 * Older builds kept prefs in %APPDATA%/freepi. Copy them across once so
 * language, sidebar width, folder choices and open tabs survive the move.
 */
function migrateLegacyPrefs() {
  const legacy = path.join(app.getPath('userData'), 'prefs.json');
  if (path.resolve(legacy) === path.resolve(prefsPath())) return;
  if (fs.existsSync(prefsPath())) return;
  try {
    if (!fs.existsSync(legacy)) return;
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.copyFileSync(legacy, prefsPath());
    console.log('[freepi] migrated prefs from', legacy);
  } catch (err) {
    console.log('[freepi] prefs migration skipped:', err.message);
  }
}

/** Who the app says it belongs to, shown in the title bar. */
const PROFILE_DEFAULTS = {
  owner: 'NTAPI',
  subtitle: 'DeepSeek v4.1 Flash',
  brand: 'NTAPI',
};
function readPrefs() {
  try {
    return JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
  } catch {
    return {};
  }
}
function writePrefs(patch) {
  try {
    const next = { ...readPrefs(), ...patch };
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), JSON.stringify(next, null, 2));
  } catch {}
}

/* --------------------------- pins and colours ---------------------------
 * Stored in prefs.json, keyed by the session file's absolute path. The pi
 * session files stay untouched: the SDK owns that format. See session-marks.js
 * for why marks follow the file and not the tab.
 */

/** Every pin and colour, as stored. */
function sessionMarks() {
  const marks = readPrefs().sessionMarks;
  return marks && typeof marks === 'object' ? marks : {};
}

/** Write one chat's pin/colour. Returns the saved mark for that chat. */
function saveSessionMark(sessionPath, patch) {
  const next = applySessionMark(sessionMarks(), sessionPath, patch);
  writePrefs({ sessionMarks: next });
  return readSessionMark(next, sessionPath);
}

/**
 * Forget marks whose chat is gone.
 *
 * Deleting a conversation, or clearing it (which replaces the file) would
 * otherwise leave rows in prefs forever. Pruning is lazy — it runs whenever the
 * sidebar lists a folder — because there is no reliable "file deleted" hook for
 * every path (an external delete, a synced folder).
 */
function pruneSessionMarkStore() {
  const current = sessionMarks();
  if (!Object.keys(current).length) return;
  const next = pruneSessionMarks(current, (file) => fs.existsSync(file));
  if (Object.keys(next).length !== Object.keys(current).length) {
    writePrefs({ sessionMarks: next });
  }
}

/* --------------------------- browser control ---------------------------
 * Drives the user's own Chrome through the companion extension. Nothing
 * listens until the chip in the toolbar is switched on, and the pairing code
 * is the only thing that lets the extension in.
 */

/** Six digits, created once and kept in prefs so pairing survives a restart. */
function ensureBrowserToken() {
  const existing = readPrefs().browserBridge && readPrefs().browserBridge.token;
  if (typeof existing === 'string' && /^\d{6}$/.test(existing)) return existing;
  const token = String(Math.floor(100000 + Math.random() * 900000));
  writePrefs({ browserBridge: { ...(readPrefs().browserBridge || {}), token } });
  return token;
}

const browserBridge = createBrowserBridge({
  extensionId: EXTENSION_ID,
  token: ensureBrowserToken(),
  auditPath: path.join(DATA_ROOT, 'browser-audit.log'),
  log: (line) => console.log('[browser]', line),
});

browserBridge.onStatus((status) => send('browser:status', status));

/**
 * The tab the user handed over, and the mode that lets the agent work in it
 * without a dialog per step. Neither survives a restart: a blank cheque that
 * outlives the session is how people end up surprised at what the agent did.
 */
const browserClaims = createClaims({});
const browserAutopilot = createAutopilot({});
browserBridge.setClaims(browserClaims);

function pushClaimState() {
  send('browser:claimState', { claim: browserClaims.get() });
}

function pushAutopilotState() {
  send('browser:autopilotState', { state: browserAutopilot.state() });
}

/**
 * Every browser command's outcome passes through here, which is what keeps the
 * idle clock and the failure streak honest — including the failures that never
 * reached an approval dialog.
 */
browserBridge.onActivity((entry) => {
  const wasOn = browserAutopilot.state().on;
  if (entry.ok) browserAutopilot.noteAction();
  else browserAutopilot.noteFailure();
  send('browser:activity', { entry });
  if (wasOn && !browserAutopilot.state().on) pushAutopilotState();
});

/** The user pressed "use this tab" in the extension popup. */
browserBridge.onExtensionEvent((event) => {
  if (!event) return;
  if (event.event === 'claim') {
    claimBrowserTab({ tabId: event.tabId, url: event.url, title: event.title });
    return;
  }
  // Trust ends the moment the page goes somewhere else, or the tab goes away.
  if (event.event === 'navigate') {
    if (browserAutopilot.shouldExpire({ type: 'navigate', tabId: event.tabId, url: event.url })) pushAutopilotState();
    return;
  }
  if (event.event === 'tabClosed') {
    if (browserAutopilot.shouldExpire({ type: 'tabClosed', tabId: event.tabId })) pushAutopilotState();
    const claim = browserClaims.get();
    if (claim && claim.tabId === event.tabId) releaseBrowserTab('tabClosed');
  }
});

/** Hand one tab to the agent. Nothing restores a claim on its own. */
function claimBrowserTab({ tabId, url, title } = {}) {
  try {
    const previous = browserClaims.get();
    if (previous && previous.tabId !== tabId && browserAutopilot.state().on) {
      browserAutopilot.stop('released');
      pushAutopilotState();
    }
    const claim = browserClaims.claim({ tabId, url, title });
    // Put the user in front of the page the agent is about to work on.
    browserBridge.call('tabs-real', { focus: true, tab: claim.tabId }, { timeoutMs: 8000 }).catch(() => {});
    pushClaimState();
    return { ok: true, claim };
  } catch (err) {
    // This catch used to be silent, so a failed hand-over looked exactly like
    // one that never happened: no dialog, no message, no clue.
    console.log('[browser] claim failed:', err && err.message ? err.message : err, `(tab ${tabId}, url ${url})`);
    sendTab(null, 'app:log', {
      text: `มอบแท็บไม่สำเร็จ: ${err && err.message ? err.message : err}`,
    });
    return { ok: false, error: err.message };
  }
}

function releaseBrowserTab(reason) {
  if (!browserClaims.get()) return { ok: true };
  browserClaims.release();
  if (browserAutopilot.state().on) {
    browserAutopilot.stop(reason || 'released');
    pushAutopilotState();
  }
  pushClaimState();
  return { ok: true };
}

/** Nothing may run quiet forever: this is what ends an idle hand-over run. */
setInterval(() => {
  if (browserAutopilot.shouldExpire({ type: 'tick' })) pushAutopilotState();
}, 60000);

/** Path of the app's own MCP config, next to the rest of the data. */
function mcpConfigPath() {
  return path.join(DATA_ROOT, 'mcp.json');
}

/** The raw mcp.json text, or '' when the file does not exist yet. */
function readMcpConfigText() {
  try {
    return fs.readFileSync(mcpConfigPath(), 'utf8');
  } catch {
    return '';
  }
}

/** Parse and shape-check an mcp.json string before it is written to disk. */
function parseMcpConfig(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { ok: true, value: {} };
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${err.message}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'The top level must be a JSON object.' };
  }
  const servers = parsed.mcpServers;
  if (
    servers !== undefined &&
    (servers === null || typeof servers !== 'object' || Array.isArray(servers))
  ) {
    return { ok: false, error: '"mcpServers" must be an object.' };
  }
  return { ok: true, value: parsed };
}

/**
 * Live sessions, keyed by a tab id. Each entry owns its own pi AgentSession, so
 * turns in different tabs run concurrently and independently.
 */
const tabs = new Map();
let tabSeq = 0;
let activeTabId = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Events from every tab are tagged with the tab id so the UI can route them. */
function sendTab(tabId, channel, payload) {
  send(channel, { tabId, ...payload });
}

/**
 * Keep tool payloads small before they cross IPC to the renderer.
 *
 * `look_at_image` returns the picture itself as an `image` content part, and a
 * screenshot can be a multi-megabyte base64 string. The renderer only ever
 * shows tool *text*, so serialising that image through IPC (and then into a DOM
 * text node) froze the window. Replace image parts with a short marker and cap
 * runaway text (a `bash` dump) at the same time.
 */
const MAX_TOOL_TEXT = 200_000;
function sanitizeToolPayload(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
    return result;
  }
  let budget = MAX_TOOL_TEXT;
  const content = result.content.map((part) => {
    if (!part || typeof part !== 'object') return part;
    if (part.type === 'image') {
      const bytes = typeof part.data === 'string' ? part.data.length : 0;
      const kb = bytes ? `, ~${Math.round((bytes * 3) / 4 / 1024)} KB` : '';
      return { type: 'text', text: `[image${kb}]` };
    }
    if (part.type === 'text' && typeof part.text === 'string') {
      if (budget <= 0) return { type: 'text', text: '… [truncated]' };
      if (part.text.length > budget) {
        const slice = part.text.slice(0, budget) + '\n… [truncated]';
        budget = 0;
        return { ...part, text: slice };
      }
      budget -= part.text.length;
      return part;
    }
    return part;
  });
  return { ...result, content };
}

function newTabId() {
  tabSeq += 1;
  return `tab-${tabSeq}`;
}

/**
 * Pending tool approvals, keyed by request id. The agent blocks in the bridge's
 * `tool_call` handler until the renderer answers, so this is the bridge between
 * a pi callback and an IPC round trip.
 */
const approvals = new Map();
let approvalSeq = 0;

/**
 * One switch decides every approval question: ask, always allow, or always
 * deny. Stored in prefs so the answer is the same after a restart — the old
 * in-memory grants are why the same command asked on one launch and ran
 * silently on the next.
 *
 * Loaded lazily on first use so an upgrade from the old switches is read once
 * the prefs file is available.
 */
let approvalPolicy = null;

function getApprovalPolicy() {
  if (approvalPolicy === null) {
    const prefs = readPrefs();
    approvalPolicy = isPolicy(prefs.approvalPolicy)
      ? prefs.approvalPolicy
      : policyFromLegacy({ allowEverything: prefs.allowEverything, allowedTools: prefs.allowedTools });
  }
  return approvalPolicy;
}

function setApprovalPolicy(next) {
  approvalPolicy = normalizePolicy(next);
  writePrefs({ approvalPolicy });
  return approvalPolicy;
}

/**
 * Pending `ask_user` questions, keyed by request id. The agent's tool call blocks
 * on the promise until the window answers, so it cannot guess instead of asking.
 */
const questions = new Map();
let questionSeq = 0;

function askUserDialog(tabId, { question, options }) {
  questionSeq += 1;
  const id = `question-${questionSeq}`;
  return new Promise((resolve) => {
    questions.set(id, { resolve, tabId });
    sendTab(tabId, 'agent:question', { id, question, options });
  });
}

/** The tab the agent's own `browser_claim` request is about, once it is named. */
let pendingClaimTarget = null;

function hostOfUrl(url) {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
}

/** The tab the agent would get if it asked for one right now. */
async function resolveClaimTarget() {
  try {
    const listed = await browserBridge.call('tabs-real', {}, { timeoutMs: 8000 });
    return pickClaimTarget(listed.tabs);
  } catch {
    return null;
  }
}

async function askApproval(tabId, { toolName, args, label, kind }) {
  // When the agent asks for a tab, name the tab it would get. Being asked to
  // hand over "something" is not a question anyone can answer.
  if (toolName === 'browser_claim') {
    const target = await resolveClaimTarget();
    if (!target) {
      // Returning false here without a word is what made a missing tab look like
      // the user refusing: no dialog appeared, yet the agent reported a refusal.
      // Say so, and leave the agent no way to mistake it for consent.
      console.log('[browser] claim refused: no usable tab to hand over (agent window and blank tabs excluded)');
      // Tell the window as well: silence here looked exactly like a refusal.
      sendTab(tabId, 'app:log', {
        text: 'ไม่มีแท็บให้มอบให้ agent — เปิดหน้าที่ต้องการใน Chrome ก่อน แล้วกดปุ่ม «ใช้แท็บที่เปิดอยู่» อีกครั้ง',
      });
      return false;
    }
    pendingClaimTarget = target;
    label = `${target.title || target.url} — ${hostOfUrl(target.url)}`;
  }

  const claim = browserClaims.get();
  // The one switch decides. Nothing here looks at the model, the provider, the
  // tool, the tab or the autopilot state: all of that used to change the answer
  // silently, which is exactly the "sometimes it asks" bug this replaces.
  if (!needsDialog(getApprovalPolicy())) {
    const allowed = getApprovalPolicy() === 'allow';
    if (!allowed) pendingClaimTarget = null;
    console.log(`[approval] ${toolName} settled by policy "${getApprovalPolicy()}": ${allowed ? 'allowed' : 'denied'}`);
    return allowed;
  }
  console.log(`[approval] asking for ${toolName} on tab ${tabId} (claim ${claim ? claim.tabId : 'none'})`);

  approvalSeq += 1;
  const id = `approval-${approvalSeq}`;
  const answer = new Promise((resolve) => {
    approvals.set(id, { resolve, tabId, toolName });
    sendTab(tabId, 'approval:request', {
      id,
      toolName,
      // A readable name for the dialog (e.g. an MCP server tool); `toolName`
      // stays the raw id used to name the tool in the prompt.
      label: label || toolName,
      kind: kind || 'tool',
      args,
    });
  });
  return answer.then((allowed) => {
    if (!allowed) pendingClaimTarget = null;
    return allowed;
  });
}

function sessionDirFor(cwd) {
  const resolved = path.resolve(cwd);
  // One store for every workspace, so history survives a folder change.
  return path.join(SESSIONS_ROOT, sessionDirName(resolved));
}

/** Workspace path stored in the first session file of a history folder. */
function sessionFolderCwd(dir) {
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return null;
  }
  for (const f of files) {
    try {
      const first = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')[0];
      const meta = JSON.parse(first);
      if (meta?.type === 'session' && typeof meta.cwd === 'string' && meta.cwd) return meta.cwd;
    } catch {}
  }
  return null;
}

/** Move every file from one history folder into another, never overwriting. */
function mergeSessionDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.existsSync(dst)) continue;
    fs.renameSync(src, dst);
  }
  if (fs.readdirSync(from).length === 0) fs.rmdirSync(from);
}

/**
 * Give every history folder the readable name the current build creates.
 *
 * Folders written by older builds can be mangled in two ways: encoded
 * "--C--Users-..." paths, or Thai names with the combining marks stripped
 * ("เดสก-ท-อป"). The real workspace path is read from the session file itself,
 * so even folders that are not open in a tab get repaired.
 */
async function migrateSessionDirs() {
  let entries = [];
  try {
    entries = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return;
  }

  const renamed = new Map(); // old folder name -> new folder name
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const from = path.join(SESSIONS_ROOT, entry.name);
    let cwd = sessionFolderCwd(from);
    if (!cwd && entry.name.startsWith('--')) {
      // Older builds encoded the path in the folder name.
      const guess = entry.name.slice(2, -2).replace(/-/g, path.sep);
      const candidates = [guess, `${guess[0]}:${guess.slice(1)}`];
      cwd = candidates.find((p) => {
        try {
          return fs.statSync(p).isDirectory();
        } catch {
          return false;
        }
      });
    }
    if (!cwd) continue;
    const name = sessionDirName(cwd);
    if (name === entry.name) continue;
    const to = path.join(SESSIONS_ROOT, name);
    try {
      if (!fs.existsSync(to)) fs.renameSync(from, to);
      else mergeSessionDir(from, to);
      renamed.set(entry.name, name);
    } catch {}
  }

  // Prefs still point at the old folder; retarget them so a restored tab opens
  // the same conversation instead of silently starting a new one.
  const prefs = readPrefs();
  const openTabs = Array.isArray(prefs.openTabs) ? prefs.openTabs : [];
  const next = openTabs
    .map((t) => {
      if (!t?.sessionFile) return null;
      const target = renamed.get(path.basename(path.dirname(t.sessionFile)));
      if (!target) return t;
      return { ...t, sessionFile: path.join(SESSIONS_ROOT, target, path.basename(t.sessionFile)) };
    })
    // A tab whose file never made it to disk (empty tab from an older launch)
    // would only create a new blank session on restore.
    .filter((t) => t && fs.existsSync(t.sessionFile));
  if (JSON.stringify(next) !== JSON.stringify(openTabs)) writePrefs({ openTabs: next });

  // Empty history folders serve no purpose; a new session recreates its folder.
  try {
    for (const entry of fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(SESSIONS_ROOT, entry.name);
      try {
        if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
      } catch {}
    }
  } catch {}
}

/**
 * Parsed chat lists, keyed by session folder. Dropped when the folder's own
 * timestamp changes, and explicitly after a rename (which rewrites a file but
 * not the folder).
 */
const sessionListCache = new Map();

function sessionDirStamp(dir) {
  try {
    return String(fs.statSync(dir).mtimeMs);
  } catch {
    return '';
  }
}

async function listSessions(cwd) {
  const dir = sessionDirFor(cwd);
  // Marks whose file disappeared are dropped here, so prefs does not grow with
  // rows for conversations deleted in an earlier run.
  pruneSessionMarkStore();
  const marks = sessionMarks();
  /*
   * Reading the list means parsing every chat file in the folder — ~50 ms for
   * two long conversations, and it grows with each one saved. The sidebar asks
   * for it on every tab switch and after every turn, so the parsed rows are
   * remembered until the folder itself changes: a chat is created, deleted or
   * renamed. Pins and colours live in prefs, not in the folder, so they are
   * applied to every reply.
   */
  const stamp = sessionDirStamp(dir);
  const cached = sessionListCache.get(dir);
  let infos = cached && cached.stamp === stamp ? cached.infos : null;
  if (!infos) {
    try {
      infos = await sdk.SessionManager.list(path.resolve(cwd), dir);
    } catch {
      return [];
    }
    sessionListCache.set(dir, { stamp, infos });
  }
  {
    const listed = infos
      .slice()
      // Newest conversation on top, by *creation* time. Creation never changes,
      // so the sidebar order stays put while you chat. Sorting by `modified`
      // used to reshuffle the list every time a session was written to, which
      // made two sessions trade places under the cursor.
      // `id` breaks ties so sessions made in the same millisecond never swap.
      .sort((a, b) => {
        const ta = new Date(a.created).getTime() || new Date(a.modified).getTime() || 0;
        const tb = new Date(b.created).getTime() || new Date(b.modified).getTime() || 0;
        return tb - ta || String(b.id).localeCompare(String(a.id));
      })
      .map((i) => {
        const mark = readSessionMark(marks, i.path);
        return {
          id: i.id,
          path: i.path,
          created: i.created,
          modified: i.modified,
          // A user-set name (session:rename) wins over the derived first message.
          name: i.name || null,
          firstMessage: (i.firstMessage || '').slice(0, 120),
          messageCount: i.messageCount ?? null,
          // The sidebar reads these two to draw the pin and colour stripe.
          pinned: mark.pinned,
          color: mark.color,
        };
      });
    // Pinning is the only thing that moves a row; everything else keeps the
    // creation-time order above.
    return sortSessionsByMark(marks, listed);
  }
}

/**
 * Ask the bridge to move to a client version the backend will accept, after it
 * answered 426 `upgrade_required`. Best effort: a failure here must never mask
 * the original error the user is about to read.
 */
async function refreshFreePiClientVersion(tabId, tab) {
  const handle = tab && tab.handle;
  if (!handle || typeof handle.refreshClientVersion !== 'function') return;
  const next = await handle.refreshClientVersion();
  if (!next) return;
  sendTab(tabId, 'agent:clientVersion', { version: next });
}

/**
 * Store the free-tier names a Coarena 402 named. Returns the merged list when
 * something new was learned, null when it was already known — so the caller can
 * skip a repaint that would change nothing.
 */
function rememberCoarenaFreeTier(names) {
  const fresh = (names || []).filter((name) => typeof name === 'string' && name.trim());
  if (!fresh.length) return null;
  const previous = Array.isArray(readPrefs().coarenaFreeTier) ? readPrefs().coarenaFreeTier : [];
  const merged = [...new Set([...previous, ...fresh.map((name) => name.trim())])];
  if (merged.length === previous.length) return null;
  writePrefs({ coarenaFreeTier: merged });
  return merged;
}

/** Re-label Coarena rows in every open tab, then repaint the dropdown. */
function relabelCoarenaModels(names) {
  for (const [tabId, tab] of tabs) {
    const res = safeCall(() => tab.handle.applyCoarenaFreeTier(names), null);
    if (!res || !res.models) continue;
    // Same channel a key swap uses: the tab state carries the model list.
    sendTab(tabId, 'agent:history', { state: tabState(tabId) });
  }
}

/**
 * One failure can surface twice (the assistant message and the rejected
 * prompt), so report each distinct failure once per few seconds.
 */
function reportTabError(tabId, raw) {
  const tab = tabs.get(tabId);
  /*
   * A stop the user asked for is not a provider failure.
   *
   * Pressing Stop — or the Cancel row under a message that was just sent — ends
   * the request, and pi reports that as an abort. Left alone, "abort" matched the
   * stall wording and the window said "Token Harbor stopped responding" under a
   * message the person had just cancelled, with a working model selected.
   */
  if (isUserAbort({ raw, seq: tab?.promptSeq, userAbort: tab?.userAbort })) return;
  const provider = tab?.handle?.session?.model?.provider;
  const { text, code, key: messageKey, status, freeModels } = friendlyProviderError(raw, { provider });
  const dedupe = `${code || ''}|${messageKey || text}`;
  const now = Date.now();
  if (tab?.lastError && tab.lastError.key === dedupe && now - tab.lastError.at < 10000) return;
  // The prompt number rides along: a failure counts as "already shown for this
  // turn" only when it was reported while this same prompt was running.
  if (tab) tab.lastError = { key: dedupe, at: now, seq: tab.promptSeq || 0 };

  // A 426 `upgrade_required` is the backend rejecting our version header, not a
  // problem with the user's message. When the installed CLI — or the `min` the
  // backend just published — is newer than what we sent, re-register the
  // provider with the refreshed header and let the user press Send once. This
  // is only attempted once per tab so a genuine mismatch cannot loop.
  if (isUpgradeRequiredText(raw) && tab && !tab.upgradeRetry) {
    tab.upgradeRetry = true;
    refreshFreePiClientVersion(tabId, tab).catch(() => {});
  }
  // `key` is the translatable version of `text`: the renderer shows the message
  // in the language the user picked, and falls back to `text` when it has no
  // translation for a raw provider sentence.
  sendTab(tabId, 'agent:error', { text, code, key: messageKey || null, status: status || null });
  // Coarena's 402 for a model outside the free tier names the ones inside it.
  // Keep that sentence: it is the only free/paid signal its catalog lacks, and
  // it lets the picker stop advertising Claude to a free key.
  if (provider === COARENA_PROVIDER && freeModels.length) {
    const known = rememberCoarenaFreeTier(freeModels);
    if (known) relabelCoarenaModels(known);
  }
}

/**
 * LLM7's free lane intermittently serves a trimmed route: it reports an absurdly
 * small prompt (`usage.prompt_tokens: 32`) and hard-caps the reply at 128 tokens.
 * A reasoning model then spends the whole cap thinking and finishes with
 * `finish_reason: "length"` and no answer at all.
 *
 * Nothing is retried or switched on the user's behalf: a model changing under
 * them mid-conversation was confusing, so the window says what happened and they
 * decide. Saying it is still required — an empty turn with no notice reads as a
 * hang.
 */
function announceEmptyAnswer(tabId) {
  sendTab(tabId, 'agent:notice', {
    text:
      'The model used its whole output limit on reasoning and never answered. ' +
      'Retry, or pick another model — a non-reasoning one is more reliable here.',
    // The renderer owns the wording: a sentence baked in here could only ever be
    // English, and this notice sits right under a Thai composer.
    key: 'noticeReasoningOverflow',
  });
}

/**
 * Never let a failed turn end with nothing on screen.
 *
 * `message_end` is the normal reporter, but it is not guaranteed to have the
 * last word: pi can decide to retry before the turn settles, and the abort this
 * process sends to cancel that retry rewrites the failure into a bare
 * "aborted". The window then flipped back to "พร้อมใช้งาน" with no banner and no
 * notice — the complaint from a session whose last three turns died on a
 * provider 429.
 *
 * So the settle path asks the source that cannot lose it: the agent's own
 * message list. A turn that ends on an error never reported for this prompt is
 * reported here.
 *
 * That list is not enough on its own. When pi schedules a retry it drops the
 * failed attempt from the projection, and the abort above is what ends the run —
 * so by settle time the list already looks like a normal turn. `turnFailure`
 * falls back to the limit this process wrote down before cancelling.
 */
function announceIfUnreported(tabId, tab) {
  const seq = tab.promptSeq || 0;
  if (tab.lastError?.seq === seq) return;
  const messages = tab.handle?.session?.agent?.state?.messages || [];
  const failure = turnFailure({ messages, limitFailure: tab.limitFailure, seq });
  if (!failure || !failure.text) return;
  reportTabError(tabId, failure.text);
}

/*
 * Put back a turn the session stopped carrying.
 *
 * When a run dies because the allowance is spent or the context overflowed, pi
 * persists the failed attempt and then drops it again: `_omitRecoveryAttempt()`
 * writes a `context_edit` with a null replacement for the assistant message and
 * its tool results, and the overflow compaction that follows replaces everything
 * before `firstKeptEntryId` with a summary. `session.messages` — the one source
 * the transcript is drawn from *and* the next request is built from — therefore
 * comes back without the question, without the half-written answer, or without
 * both. The reader watched those words stream in and then lose them, and the
 * model that runs next has nothing to take over from.
 *
 * The words only exist in this process at that point, so they are remembered
 * while they stream (`tab.turnDraft`) and, once the run settles, written back as
 * a displayed custom message. Writing it into the session — not just into the
 * window — is what lets the *next* model continue the work.
 *
 * Only what is actually gone is put back, so a turn that survived never shows up
 * twice, and a Stop or a take-back the user asked for is never undone.
 */
const RECOVERED_TURN_CUSTOM_TYPE = 'ntapi.interrupted-turn';

/** Plain text of a stored message, whatever shape its content has. */
function messageTextOf(m) {
  const content = m?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c && c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/** The opening words of a text, folded enough to survive whitespace rewrites. */
function searchKey(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 80);
}

/**
 * Decide, once the run is over, whether its words are still in the session.
 * A tick of delay first: the settle event fires while the SDK is still finishing
 * its own post-run work (compaction included), and reading the projection from
 * inside that emit would see the state it is about to replace.
 */
function scheduleTurnRecovery(tabId, tab, event) {
  const draft = tab?.turnDraft;
  if (!draft || draft.done) return;
  // A stop the user asked for is not a lost turn — and after a take-back the
  // message is meant to be gone.
  if (event?.aborted && tab.userAbort && tab.userAbort.seq === (tab.promptSeq || 0)) return;
  setTimeout(() => {
    recoverInterruptedTurn(tabId, tab).catch(() => {});
  }, 400);
}

async function recoverInterruptedTurn(tabId, tab) {
  const draft = tab?.turnDraft;
  const session = tab?.handle?.session;
  if (!draft || draft.done || !session) return;
  if (typeof session.sendCustomMessage !== 'function') return;
  if (session.isStreaming) {
    // A queued prompt has already started; give it room instead of writing into
    // the middle of a turn. Bounded, so a session that never idles cannot loop.
    draft.waits = (draft.waits || 0) + 1;
    if (draft.waits > 12) return;
    setTimeout(() => {
      recoverInterruptedTurn(tabId, tab).catch(() => {});
    }, 500);
    return;
  }

  const messages = session.messages || [];
  const userText = draft.prompts.join('\n\n').trim();
  const partialText = (draft.assistant || '').trim() || (draft.thinking || '').trim();
  const userKey = searchKey(userText);
  const partialKey = searchKey(partialText);
  const userLost =
    Boolean(userKey) &&
    !messages.some((m) => m.role === 'user' && searchKey(messageTextOf(m)).includes(userKey));
  const answerLost =
    Boolean(partialKey) &&
    !messages.some((m) => m.role === 'assistant' && searchKey(messageTextOf(m)).includes(partialKey));

  draft.done = true;
  if (!userLost && !answerLost) return;

  const parts = [
    'A turn earlier in this conversation was cut short — the provider ran out of allowance, or the context overflowed — and the session dropped what it had already produced. It is restored here so the work can continue.',
  ];
  if (userLost) parts.push(`The user asked:\n${userText}`);
  if (answerLost) {
    parts.push(`The assistant had already written this (incomplete — cut off mid-stream):\n${partialText}`);
    if (draft.tools && draft.tools.length) parts.push(`Tools it had already run: ${draft.tools.join(', ')}`);
  }
  parts.push('Continue from that point instead of starting the task over.');

  try {
    await session.sendCustomMessage(
      {
        customType: RECOVERED_TURN_CUSTOM_TYPE,
        content: [{ type: 'text', text: parts.join('\n\n') }],
        display: true,
        // The window draws the two bubbles this turn stood for, not a note.
        details: {
          user: userLost ? userText : '',
          assistant: answerLost ? partialText : '',
        },
      },
      { triggerTurn: false }
    );
  } catch {
    return;
  }
  sendTab(tabId, 'agent:recovered', {});
}

/*
 * A prompt that carried a picture is stored as text, not as an image block.
 *
 * free-pi's models take text only, so `prompt:send` writes each picture into the
 * chat attachment folder and appends two lines to what it hands the agent:
 *
 *   [Attached image saved to: C:\NTAPI\outputs\.ntapi-attachments\image-….png]
 *   The image is saved on disk. You cannot see images directly: call look_at_image…
 *
 * Those two lines are instructions for the agent, not words the user typed. On a
 * replay they were drawn as prose — so after switching chats away and back, a
 * message that had a picture in it showed the note instead of the picture, and
 * the person reading it was left looking at a file path where their image had
 * been. The note is stripped back out here and the saved path is returned beside
 * the text, so the window can draw the picture it still has on disk.
 */
const ATTACHED_IMAGE_NOTE = /^\[Attached image saved to:\s*([^\]\r\n]+)\]$/;
const ATTACHED_IMAGE_HINT =
  /^The image is saved on disk\. You cannot see images directly: call look_at_image with that path and a specific question to view it\.$/;

/**
 * Split a stored prompt into what the user typed and the pictures it attached.
 *
 * Only the exact lines this app writes are removed, and only whole lines: a
 * message that happens to mention "Attached image" in a sentence keeps it.
 */
function splitAttachmentNotes(raw) {
  const imagePaths = [];
  const kept = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    const note = ATTACHED_IMAGE_NOTE.exec(trimmed);
    if (note) {
      imagePaths.push(note[1].trim());
      continue;
    }
    if (ATTACHED_IMAGE_HINT.test(trimmed)) continue;
    kept.push(line);
  }
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), imagePaths };
}

function messagesForUi(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m || m.role === 'system') continue;

    if (m.role === 'custom') {
      // A turn put back after a limit or an overflow dropped it. Drawn as the two
      // bubbles it stood for, so the reader gets back exactly the words they
      // watched stream in.
      if (m.customType === RECOVERED_TURN_CUSTOM_TYPE) {
        const details = m.details || {};
        if (details.user) out.push({ kind: 'user', text: details.user, images: [], ts: m.timestamp });
        if (details.assistant) {
          out.push({
            kind: 'assistant',
            text: details.assistant,
            thinking: '',
            tools: [],
            ts: m.timestamp,
            // The window draws this answer as cut off — it is not a finished turn.
            recovered: true,
          });
        }
      }
      continue;
    }

    if (m.role === 'user') {
      const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
      const text = parts.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const images = parts
        .filter((c) => c.type === 'image')
        .map((c) => ({ dataUri: `data:${c.mimeType};base64,${c.data}`, mimeType: c.mimeType }));
      // The attachment note is not part of the message: it is the path to a file
      // that is still on disk. Returned separately so the bubble can draw the
      // picture without the window ever reading the path as words.
      const split = splitAttachmentNotes(text);
      if (split.text || images.length || split.imagePaths.length) {
        out.push({
          kind: 'user',
          text: split.text,
          images,
          imagePaths: split.imagePaths,
          ts: m.timestamp,
        });
      }
      continue;
    }

    if (m.role === 'assistant') {
      const content = Array.isArray(m.content) ? m.content : [];
      const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('');
      const thinking = content.filter((c) => c.type === 'thinking').map((c) => c.thinking).join('');
      const tools = content
        .filter((c) => c.type === 'toolCall')
        .map((c) => ({ id: c.id, name: c.name, args: c.arguments }));
      if (text || thinking || tools.length) {
        out.push({ kind: 'assistant', text, thinking, tools, ts: m.timestamp });
      } else if (m.stopReason === 'error') {
        // A failed turn has no content at all. Without this the transcript just
        // shows the user's message and then nothing, which looks like a hang.
        out.push({
          kind: 'error',
          text: friendlyProviderError(m.errorMessage, { provider: m.provider }).text,
          ts: m.timestamp,
        });
      }
      continue;
    }

    if (m.role === 'toolResult') {
      const text = (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      // Keep the file diff available after a restart so the transcript can show
      // "what changed", not just the tool's text output.
      const details = m.details || {};
      const diff =
        typeof details.diff === 'string'
          ? parseUnifiedDiff(details.diff, details.path || m.path || '')
          : null;
      out.push({
        kind: 'tool',
        id: m.toolCallId,
        name: m.toolName,
        text,
        isError: Boolean(m.isError),
        durationMs: m.durationMs,
        diff,
        ts: m.timestamp,
      });
    }
  }
  return out;
}

function tabSummary(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return null;
  const s = tab.handle.session;
  return {
    tabId,
    cwd: tab.cwd,
    sessionId: s.sessionId,
    sessionFile: s.sessionFile,
    name: s.sessionName || tab.fallbackName || null,
    model: s.model ? { provider: s.model.provider, id: s.model.id, name: s.model.name } : null,
    busy: tab.busy,
    guest: Boolean(tab.handle.auth?.guest),
  };
}

function tabState(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return null;
  const messages = messagesForUi(tab.handle.session.messages);
  // A failed attempt that pi dropped from its projection still has to be visible
  // after a repaint: `messagesForUi` reads that same projection, so without this
  // the turn redraws as "user asked, nothing came back". Only the last failure of
  // the current prompt is added, and only while the turn did not recover — a
  // successful reply below it means the story already ended well.
  const failure = turnFailure({
    messages: tab.handle.session.messages,
    limitFailure: tab.limitFailure,
    seq: tab.promptSeq || 0,
  });
  const lastDrawn = messages[messages.length - 1];
  // A recovered answer is a *cut-off* answer: the reason it stopped still belongs
  // under it, so it cannot count as "the story already ended well".
  const alreadyShown =
    lastDrawn && (lastDrawn.kind === 'error' || (lastDrawn.kind === 'assistant' && !lastDrawn.recovered));
  if (failure && failure.text && !alreadyShown) {
    messages.push({
      kind: 'error',
      text: friendlyProviderError(failure.text, { provider: failure.provider }).text,
      ts: Date.now(),
    });
  }
  return {
    ...tabSummary(tabId),
    models: tab.handle.modelList,
    messages,
    stats: safeCall(() => tab.handle.stats(), null),
    todos: safeCall(() => tab.handle.todoItems(), []),
    thinking: safeCall(() => tab.handle.thinking(), null),
    tools: safeCall(() => tab.handle.toolNames(), []),
    changes: tab.changes || [],
    // What this conversation has spent so far. Computed here, from the same
    // messages the transcript is drawn from, so a compaction resets it: the
    // numbers describe the conversation that is running, not the session file.
    usage: safeCall(() => usageTotals(tab.handle.session.messages, { free: tabIsFreePi(tab) }), null),
    // A resumed chat can point at a model this account no longer has.
    modelFallback: safeCall(() => tab.handle.modelFallback, null),
  };
}

/** Ads and the usage meter belong to FreePi models only. */
function tabIsFreePi(tab) {
  const provider = tab?.handle?.session?.model?.provider || '';
  return provider === 'free-pi' || provider === 'free-pi-defense';
}

/** Read optional handle data without letting one failure blank the whole state. */
function safeCall(fn, fallback) {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

/** Wire a tab's session events into targeted IPC messages. */
function subscribeTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;

  tab.handle.session.subscribe(async (event) => {
    switch (event.type) {
      case 'agent_start':
        tab.busy = true;
        sendTab(tabId, 'agent:busy', { busy: true });
        break;

      // A new turn begins after any mid-run steer has been delivered. The
      // renderer uses this boundary to start the reply below the user's
      // mid-run message instead of growing it in above.
      case 'turn_start':
        sendTab(tabId, 'agent:turnStart', {});
        break;

      case 'agent_settled':
        tab.busy = false;
        sendTab(tabId, 'agent:busy', { busy: false });
        sendTab(tabId, 'agent:settled', { aborted: Boolean(event.aborted) });
        // An abort is normally the user pressing Stop, and nothing should be
        // re-sent after that. The exception is the abort *this* process sends to
        // stop pi retrying a spent free route — that turn still has to say why it
        // ended, or the window goes silent and the app looks broken.
        const ownAbort =
          Boolean(event.aborted) && tab.limitFailure && tab.limitFailure.seq === (tab.promptSeq || 0);
        if (!event.aborted || ownAbort) {
          announceIfUnreported(tabId, tab);
        }
        scheduleTurnRecovery(tabId, tab, event);
        break;

      case 'message_update': {
        const e = event.assistantMessageEvent;
        if (!e) break;
        if (e.type === 'text_delta') {
          // Kept for the same reason as the user's words: a spent allowance can
          // take this text off the session (see recoverInterruptedTurn).
          if (tab.turnDraft && !tab.turnDraft.done) tab.turnDraft.assistant += e.delta;
          sendTab(tabId, 'agent:delta', { channel: 'text', delta: e.delta });
        } else if (e.type === 'thinking_delta') {
          if (tab.turnDraft && !tab.turnDraft.done) tab.turnDraft.thinking += e.delta;
          sendTab(tabId, 'agent:delta', { channel: 'thinking', delta: e.delta });
        } else if (e.type === 'text_end') {
          sendTab(tabId, 'agent:textEnd', { text: e.content });
        }
        break;
      }

      case 'tool_execution_start': {
        // Snapshot the target file so we can show a diff when the tool finishes.
        const rawPath = fileToolTarget(event.toolName, event.args);
        const snapPath = rawPath
          ? path.isAbsolute(rawPath)
            ? rawPath
            : path.join(tab.cwd, rawPath)
          : null;
        if (snapPath) {
          let before = '';
          let existed = true;
          try {
            before = await fs.promises.readFile(snapPath, 'utf8');
          } catch {
            // New file — remember that it did not exist.
            existed = false;
          }
          editSnapshots.set(event.toolCallId, { path: snapPath, before });
          // Keep the first version the agent saw, so the review panel can undo
          // every change this tab made, not just the last edit.
          if (!tab.fileBackup.has(snapPath)) {
            tab.fileBackup.set(snapPath, { before, existed });
          }
        }
        sendTab(tabId, 'agent:toolStart', {
          id: event.toolCallId,
          name: event.toolName,
          args: event.args,
        });
        break;
      }

      case 'tool_execution_update':
        sendTab(tabId, 'agent:toolUpdate', {
          id: event.toolCallId,
          name: event.toolName,
          partial: sanitizeToolPayload(event.partialResult),
        });
        break;

      case 'tool_execution_end': {
        const snap = editSnapshots.get(event.toolCallId);
        editSnapshots.delete(event.toolCallId);
        let diff = null;

        // pi's own edit tool already returns a ready-made unified patch in
        // `details.diff` — prefer it, since it handles fuzzy matching.
        const details = event.result?.details;
        const ownDiff = typeof details?.diff === 'string' ? details.diff : null;
        if (ownDiff && !event.isError) {
          diff = parseUnifiedDiff(ownDiff, snap?.path || details?.path || '');
        }

        if (!diff && snap && !event.isError) {
          try {
            const after = await fs.promises.readFile(snap.path, 'utf8');
            const d = diffLines(snap.before, after);
            if (d.added || d.removed) {
              diff = {
                path: snap.path,
                file: path.basename(snap.path),
                added: d.added,
                removed: d.removed,
                hunks: d.hunks,
                truncated: d.truncated,
              };
            }
          } catch {}
        }

        if (diff?.path) recordChange(tab, diff);
        // Named in a recovered turn, so the next model knows what already ran.
        if (tab.turnDraft && !tab.turnDraft.done && tab.turnDraft.tools.length < 20) {
          tab.turnDraft.tools.push(event.toolName);
        }

        sendTab(tabId, 'agent:toolEnd', {
          id: event.toolCallId,
          name: event.toolName,
          result: sanitizeToolPayload(event.result),
          isError: Boolean(event.isError),
          durationMs: event.durationMs,
          diff,
        });
        break;
      }

      case 'message_end': {
        const m = event.message;
        if (m?.role === 'assistant' && m.stopReason === 'error') {
          // A spent allowance is worth remembering even when the sentence pi ends
          // up reporting is not the one it started with: the abort below rewrites
          // the failure to "aborted", and "aborted" is on the list of errors that
          // are never a limit. Without this copy the turn ends in silence.
          if (isLimitError({ text: m.errorMessage })) {
            tab.limitFailure = {
              seq: tab.promptSeq || 0,
              text: m.errorMessage || '',
              provider: m.provider || null,
              model: m.model || m.responseModel || null,
            };
          }
          reportTabError(tabId, m.errorMessage);
        } else if (m?.role === 'assistant' && m.stopReason === 'length') {
          // A reasoning model can spend the whole output cap thinking and return
          // no answer at all. Without a notice the window just goes quiet, which
          // reads as a hang rather than a truncated turn.
          const answered = (m.content || []).some((c) => c.type === 'text' && c.text.trim());
          if (!answered) announceEmptyAnswer(tabId);
        }
        break;
      }

      case 'auto_retry_start': {
        // The retry streams the answer again from the start. Keeping the aborted
        // attempt's text would show it twice in the recovered turn.
        if (tab.turnDraft && !tab.turnDraft.done) {
          tab.turnDraft.assistant = '';
          tab.turnDraft.thinking = '';
        }
        // pi treats a 429 as a throttle and re-asks the same model with backoff.
        // A spent free allowance will not come back in two seconds, so skip the
        // wait and let the turn end on the failure `message_end` already reported.
        // Nothing is switched behind the user's back: the model they picked stays
        // picked, and the banner says the allowance is gone.
        //
        // The abort has to land on the next microtask: this event fires *before*
        // pi creates the abort controller. Only a route that is *spent* gets that
        // treatment. A per-minute 429 ("Limit: 10 … try again in 21s") is
        // precisely what the backoff is for: cancelling it ended the turn for a
        // limit that had cleared by the time the next attempt could run — and the
        // abort hid the reason, so the window said "พร้อมใช้งาน" with no warning.
        if (
          isLimitError({ text: event.errorMessage }) &&
          !isTransientThrottle({ text: event.errorMessage })
        ) {
          const session = tab.handle.session;
          // Record the reason before aborting: the abort is ours, and it hides the
          // 429 that caused it. The settle path and a repainted transcript read
          // this copy, because pi has already dropped the failed attempt from its
          // own projection by the time they run.
          const current = tab.handle?.session?.model || null;
          tab.limitFailure = {
            seq: tab.promptSeq || 0,
            text: event.errorMessage || '',
            provider: current?.provider || null,
            model: current?.id || null,
          };
          const stop = () => {
            try {
              session?.abortRetry?.();
            } catch {}
          };
          stop();
          queueMicrotask(stop);
          break;
        }
        // pi hands back the raw body (`503: {"message":...}`). Run it through the
        // same wording the error banner uses, so the notice reads like a sentence
        // instead of a crash dump — and the reader is not shown JSON twice.
        const retryError = friendlyProviderError(event.errorMessage, {
          provider: tab?.handle?.session?.model?.provider,
        }).text;
        sendTab(tabId, 'agent:notice', {
          text: `Retrying (${event.attempt}/${event.maxAttempts}): ${retryError}`,
          key: 'notice.retrying',
          params: {
            attempt: event.attempt,
            max: event.maxAttempts,
            error: retryError,
          },
        });
        break;
      }

      case 'compaction_start':
        sendTab(tabId, 'agent:notice', { text: 'Compacting conversation…', key: 'notice.compacting' });
        break;

      case 'session_info_changed':
        sendTab(tabId, 'session:name', { name: event.name || null });
        break;

      default:
        break;
    }
  });
}

async function attachTab(tabId, manager, cwd) {
  const existing = tabs.get(tabId);
  if (existing) {
    try {
      existing.handle.dispose();
    } catch {}
    tabs.delete(tabId);
  }

  const handle = await bridge.createFreePiSession({
    cwd,
    sessionManager: manager,
    sdk,
    log: (line) => sendTab(tabId, 'app:log', { text: line }),
    requestApproval: (req) => askApproval(tabId, req),
    claimTab: async () => {
      const target = pendingClaimTarget || (await resolveClaimTarget());
      pendingClaimTarget = null;
      if (!target) return { ok: false, error: 'No browser tab was open to hand over.' };
      return claimBrowserTab({ tabId: target.id, url: target.url, title: target.title });
    },
    browserBridge,
    imagesDir: resolveFolder('images', cwd),
    downloadsDir: resolveFolder('downloads', cwd),
    // One ad per turn is what unlocks free completions. Keep the last one so
    // switching tabs does not blank the banner while the ad is still live.
    onAd: (ad) => {
      // Only the fields the window draws: the impression URL carries a signed
      // token and has no business in the renderer.
      const shown = { ad_id: ad.ad_id, creative: ad.creative, click_url: ad.click_url };
      const current = tabs.get(tabId);
      if (current) {
        current.ad = shown;
        current.adAt = Date.now();
      }
      sendTab(tabId, 'ads:show', { ad: shown });
    },
    // Skills come from the app data root, so a portable copy carries its own
    // skills and never touches ~/.agents on someone else's machine.
    skillsAgentDir: DATA_ROOT,
    // MCP is opt-in and its config lives at <DATA_ROOT>/mcp.json, easy to find.
    mcpEnabled: Boolean(readPrefs().mcpEnabled),
    mcpConfigDir: DATA_ROOT,
    extraSkillPaths: (() => {
      // Every existing root, plus the folder that holds each skill the palette
      // found. The SDK only looks one level into a root, so a skill that lives in
      // a pack (`skills/<pack>/<name>/SKILL.md`) would show up in `/skill` and
      // still be invisible to the model — adding its parent folder fixes that
      // without moving the user's files around.
      const roots = skillRoots(cwd).filter((dir) => {
        try {
          return fs.statSync(dir).isDirectory();
        } catch {
          return false;
        }
      });
      const seen = new Set(roots);
      for (const skill of scanSkills(roots)) {
        const container = path.dirname(path.dirname(skill.path));
        if (!seen.has(container)) {
          seen.add(container);
          roots.push(container);
        }
      }
      return roots;
    })(),
    // Live checklist the model keeps for multi-step work.
    onTodo: (items) => sendTab(tabId, 'agent:todos', { items }),
    // The agent may ask a question instead of guessing; the window answers it.
    askUser: (q) => askUserDialog(tabId, q),
    thinkingLevel: readPrefs().thinkingLevel || 'off',
    // A saved, readable key registers Coarena in this same session. A key that
    // cannot be decrypted is treated as absent rather than failing the tab.
    coarenaKey: coarenaKeys.read(),
    // What a past 402 taught us about Coarena's free tier. Its catalog prices
    // every route at zero, so this list is the only thing keeping the picker
    // from calling a Claude route free.
    coarenaFreeTier: Array.isArray(readPrefs().coarenaFreeTier) ? readPrefs().coarenaFreeTier : null,
    // Provider folders the model picker was left closed, so a folded Coarena
    // stays folded after a restart.
    collapsedProviders: Array.isArray(readPrefs().collapsedProviders) ? readPrefs().collapsedProviders : null,
    // Zro's key works the same way; its catalog is static and DeepSeek-only.
    zroKey: zroKeys.read(),
    // NVIDIA's catalog is text-only and re-resolved against /v1/models.
    nvidiaKey: nvidiaKeys.read(),
    // Token Harbor's free route rotates; also re-resolved per session.
    tokenharborKey: tokenharborKeys.read(),
    // LLM7's catalog is public, so one token reaches its free-turbo models and
    // the paid pro ones alike; re-resolved per session.
    llm7Key: llm7Keys.read(),
    // DeepSeek is the first-party paid endpoint: the key is the whole account,
    // and its catalog is two ids that are intersected with /models per session.
    deepseekKey: deepseekKeys.read(),
    // Claude and Gemini are first-party paid endpoints too; each catalog is the
    // API's own /models list intersected with the families this app offers.
    anthropicKey: anthropicKeys.read(),
    googleKey: googleKeys.read(),
  });

  // Every new workspace gets its output folders up front.
  ensureWorkspaceFolders(cwd);

  tabs.set(tabId, {
    handle,
    cwd,
    busy: false,
    fallbackName: null,
    ad: null,
    adAt: Date.now(),
    adRotating: false,
    adManualAt: 0,
    // Review panel: first version of each file this tab changed + what changed.
    fileBackup: new Map(),
    changes: [],
  });
  subscribeTab(tabId);

  // A resumed tab whose session has no name yet gets a readable one.
  if (!handle.session.sessionName) {
    tabs.get(tabId).fallbackName = deriveName(handle.session.messages, cwd);
  }

  return tabState(tabId);
}

/** Upsert one file's diff summary into the tab's review list. */
function recordChange(tab, diff) {
  if (!tab || !diff?.path) return;
  const rel = path.relative(tab.cwd, diff.path) || path.basename(diff.path);
  const existing = tab.changes.find((c) => c.path === diff.path);
  const entry = {
    path: diff.path,
    rel: rel.split(path.sep).join('/'),
    added: diff.added || 0,
    removed: diff.removed || 0,
    hunks: diff.hunks || [],
    at: Date.now(),
  };
  if (existing) Object.assign(existing, entry);
  else tab.changes.push(entry);
  sendTab(tabIdForTab(tab), 'agent:changes', { changes: tab.changes });
}

/** Reverse lookup: the tab id that owns this tab object. */
function tabIdForTab(target) {
  for (const [id, tab] of tabs) if (tab === target) return id;
  return null;
}

/**
 * Every place a SKILL.md may live on this machine.
 *
 * The app's own data root is searched by the pi SDK already; the rest are shared
 * with the CLI and with the user's global ~/.agents folder so the agent is not
 * blind to installed skills. The workspace is included too: a project that ships
 * its own `skills/` folder is the normal case for people who never installed
 * anything globally, and leaving it out made `/skill` look empty on a machine
 * that did have skills.
 */
function skillRoots(cwd) {
  const roots = [
    path.join(DATA_ROOT, 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.free-pi', 'agent', 'skills'),
    path.join(os.homedir(), '.pi', 'agent', 'skills'),
    path.join(os.homedir(), '.claude', 'skills'),
  ];
  if (cwd) {
    roots.push(
      path.join(cwd, 'skills'),
      path.join(cwd, '.agents', 'skills'),
      path.join(cwd, '.pi', 'skills'),
      path.join(cwd, '.claude', 'skills'),
    );
  }
  return roots;
}

/** Read `name:` and `description:` out of a SKILL.md frontmatter block. */
function readSkillMeta(file) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8').slice(0, 4000);
  } catch {
    return null;
  }
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const head = block ? block[1] : text;
  const name = /^name:\s*(.+)$/m.exec(head)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  const description = /^description:\s*(.+)$/m.exec(head)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  return { name: name || path.basename(path.dirname(file)), description: description || '' };
}

/**
 * Collect every skill under `roots`.
 *
 * Walks a few levels instead of exactly one: skills usually arrive as
 * `skills/<name>/SKILL.md`, but also as `skills/<pack>/<name>/SKILL.md` when a
 * whole bundle is dropped in. A folder that is a symlink — or a Windows junction,
 * which is how many people "install" a skill — reported `isDirectory() === false`
 * and disappeared from the list; `statSync` follows the link. A directory holding
 * its own SKILL.md is claimed as a skill, so its subfolders (`references/`,
 * `scripts/`) are never mistaken for more skills.
 */
const SKILL_SCAN_DEPTH = 3;
const SKILL_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function scanSkills(roots) {
  const found = new Map();
  const seenReal = new Set();
  const scanned = [];

  const claim = (dir, root) => {
    const file = path.join(dir, 'SKILL.md');
    let real = file;
    try {
      real = fs.realpathSync(file);
    } catch {
      /* keep the plain path: realpath fails on a broken link, and the read will too */
    }
    if (seenReal.has(real)) return true;
    const meta = readSkillMeta(file);
    if (!meta) return false;
    seenReal.add(real);
    if (!found.has(meta.name)) found.set(meta.name, { ...meta, path: file, root });
    return true;
  };

  const walk = (dir, root, depth) => {
    if (claim(dir, root)) return;
    if (depth <= 0) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKILL_SKIP_DIRS.has(entry.name)) continue;
      const child = path.join(dir, entry.name);
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) {
        try {
          isDir = fs.statSync(child).isDirectory();
        } catch {
          isDir = false;
        }
      }
      if (isDir) walk(child, root, depth - 1);
    }
  };

  for (const root of roots) {
    try {
      if (!fs.statSync(root).isDirectory()) continue;
    } catch {
      continue;
    }
    scanned.push(root);
    walk(root, root, SKILL_SCAN_DEPTH);
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

ipcMain.handle('skills:list', async (_event, opts) => {
  const cwd = typeof opts?.cwd === 'string' ? opts.cwd : '';
  return scanSkills(skillRoots(cwd));
});


function deriveName(messages, cwd) {
  for (const m of messages || []) {
    if (m?.role !== 'user') continue;
    const text =
      typeof m.content === 'string'
        ? m.content
        : (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ');
    if (text && text.trim()) return text.trim().replace(/\s+/g, ' ').slice(0, 60);
  }
  return path.basename(cwd) || 'Session';
}

/** Locate a saved session file in this workspace, accepting a name or full path. */
function resolveSessionFile(cwd, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.endsWith('.jsonl')) return null;
  // Prefs store the full path, but the file may live in a renamed folder now.
  const byName = path.join(sessionDirFor(cwd), path.basename(sessionId));
  if (fs.existsSync(byName)) return byName;
  if (fs.existsSync(sessionId)) return sessionId;
  return null;
}

function openExisting(cwd, sessionId) {
  const dir = sessionDirFor(cwd);
  const file = resolveSessionFile(cwd, sessionId);
  if (file) return sdk.SessionManager.open(file, path.dirname(file));
  return sdk.SessionManager.continueRecent(path.resolve(cwd), dir);
}

function tabFor(id) {
  const tabId = id || activeTabId;
  const tab = tabId ? tabs.get(tabId) : null;
  if (!tab) throw new Error('no such session tab');
  return { tabId, tab };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 1240,
    minHeight: 840,
    backgroundColor: readTheme() === 'light' ? '#f5f6fa' : '#0f1115',
    title: 'NTAPI',
    // electron-builder stamps the packaged .exe; this covers unpackaged runs.
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    // Custom dark title bar: we draw the caption ourselves in the renderer.
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /*
       * The saved theme, handed to the preload as an argument.
       *
       * The renderer needs it in <head>, before the first paint, or a light-mode
       * window opens dark and flashes. A synchronous IPC would do that, but it
       * deadlocks anything that loads the page without a main process answering —
       * which is exactly what the window checks in scripts/ do, and they hung for
       * a minute apiece before this. An argument costs nothing and cannot hang.
       */
      additionalArguments: [`--ntapi-theme=${readTheme()}`],
      // The "finished" chime plays without a click, so do not wait for a
      // user gesture the way a browser would.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Resolves once the UI has painted, so the update splash stays up until there is
  // something to look at behind it. `did-finish-load` is too early — the document
  // is loaded but the window is still empty while boot() talks to this process, so
  // the splash used to vanish onto a blank frame. The renderer says when it is
  // ready; the timeout keeps a broken renderer from pinning the splash forever.
  winUiReady = new Promise((resolve) => {
    let settled = false;
    const finish = (why) => {
      if (settled) return;
      settled = true;
      uiReadyResolver = null;
      if (why) console.log(`[update] splash closed: ${why}`);
      resolve();
    };
    uiReadyResolver = () => finish('ui ready');
    win.webContents.once('did-finish-load', () => setTimeout(() => finish('timeout'), UI_READY_TIMEOUT_MS));
    win.once('closed', () => finish('window closed'));
  });
  win.on('closed', () => {
    win = null;
  });

  // Keep the custom caption's maximize/restore icon in sync with the real state.
  const pushWinState = () => win?.webContents.send('win:state', winState());
  win.on('maximize', pushWinState);
  win.on('unmaximize', pushWinState);
  win.on('enter-full-screen', pushWinState);
  win.on('leave-full-screen', pushWinState);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ------------------------------- IPC ------------------------------- */

ipcMain.handle('fs:pickFolder', async () => {
  const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

/**
 * A short word for what an attachment is, so the agent knows what it is dealing
 * with before it opens the file.
 */
function describeFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.wmv', '.mpg', '.mpeg'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.opus'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.tif', '.tiff', '.heic'].includes(ext)) return 'image';
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'].includes(ext)) return 'archive';
  if (['.csv', '.tsv'].includes(ext)) return 'table';
  if (['.json', '.yaml', '.yml', '.xml', '.toml', '.ini'].includes(ext)) return 'data';
  if (['.md', '.txt', '.log', '.rst'].includes(ext)) return 'text';
  const code = ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.php', '.swift', '.sh', '.ps1', '.bat', '.css', '.html', '.sql'];
  if (code.includes(ext)) return 'source code';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt'].includes(ext)) return 'office document';
  return ext ? `${ext.slice(1)} file` : 'file';
}

ipcMain.handle('fs:pickImages', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    // Deliberately no extension list: any file can be attached. Images are
    // inlined for the model to look at; everything else (video, audio, archives,
    // source) is passed by path and the agent opens it with its own tools.
    filters: [{ name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled) return [];
  const out = [];
  for (const file of res.filePaths) {
    const mime = mimeFor(file);
    if (!mime) {
      // Anything that is not a plain image goes by path.
      try {
        const stat = await fs.promises.stat(file);
        out.push({ kind: 'file', path: file, name: path.basename(file), bytes: stat.size });
      } catch {}
      continue;
    }
    try {
      const buf = await fs.promises.readFile(file);
      out.push({
        kind: 'image',
        name: path.basename(file),
        dataUri: `data:${mime};base64,${buf.toString('base64')}`,
        mimeType: mime,
        bytes: buf.length,
      });
    } catch {}
  }
  return out;
});

/** Attachments are pasted or dropped as data URIs; keep only a whitelist. */
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

/**
 * The MIME type for an image, or null when the file is not an image we can read
 * inline.
 *
 * This used to return 'image/png' for anything it did not recognise, so a video
 * was read whole into memory, base64-encoded, and handed to the renderer as a
 * PNG data URI — a 5 MB clip became a ~7 MB string that could never be decoded,
 * which is why attaching one simply did not work. Anything that is not a real
 * image now takes the "file" path instead: the agent gets the path and opens it
 * with its own tools, exactly as it does for a video sent from a shell.
 */
function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.png') return 'image/png';
  return null;
}

/*
 * Declining the terms ends the program. Nothing was accepted, so nothing may
 * keep running — the presence heartbeat included. `app.quit()` closes the
 * window, the agent tabs and the timers together.
 */
ipcMain.handle('app:quit', async () => {
  app.quit();
  return { ok: true };
});

/**
 * The theme, answered synchronously.
 *
 * Called from <head> in the renderer before the first paint, which is the only
 * way a light-mode window opens light instead of flashing dark and switching. It
 * reads one key out of prefs.json and returns a string; the renderer draws nothing
 * until it answers, so the handler must never do work.
 */
// The theme travels in webPreferences.additionalArguments (see createWindow), so the
// renderer can read it before the first paint without a synchronous IPC — which
// deadlocks any page loaded without a main process behind it.
ipcMain.handle('app:boot', async () => {
  migrateLegacyPrefs();
  const prefs = readPrefs();
  const lastCwd = prefs.lastCwd && fs.existsSync(prefs.lastCwd) ? prefs.lastCwd : null;
  return {
    lastCwd,
    version: app.getVersion(),
    sessions: lastCwd ? await listSessions(lastCwd) : [],
    openTabs: Array.isArray(prefs.openTabs) ? prefs.openTabs : [],
    lang: initialLang(prefs),
    theme: readTheme(),
    // Fixed identity — never read from prefs so it cannot be edited.
    profile: {
      owner: PROFILE_DEFAULTS.owner,
      subtitle: PROFILE_DEFAULTS.subtitle,
      brand: PROFILE_DEFAULTS.brand,
    },
    prefs,
  };
});

ipcMain.handle('prefs:set', async (_e, patch = {}) => {
  const allowed = {};
  if (patch.lang === 'en' || patch.lang === 'th') allowed.lang = patch.lang;
  // Theme: two known values only. Anything else keeps the current theme rather
  // than writing a value the stylesheet has no block for.
  if (THEMES.includes(patch.theme)) allowed.theme = patch.theme;
  // The first-run guide is shown once per install; a fresh install has fresh
  // prefs, so this is exactly the "show it again only if reinstalled" flag.
  if (typeof patch.guideDone === 'boolean') allowed.guideDone = patch.guideDone;
  /*
   * Which wording of the terms the person accepted, stored as the date printed
   * on TERMS.md. Only a date is accepted — the renderer may echo the document
   * date back, never invent a value or write free text into prefs.
   */
  if (typeof patch.termsAccepted === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(patch.termsAccepted)) {
    allowed.termsAccepted = patch.termsAccepted;
  }
  /*
   * The conversation the window was last on, written by the renderer whenever a
   * tab becomes active. Only a path inside the app's own sessions folder is
   * accepted, so prefs cannot be turned into a general-purpose path store.
   */
  if (patch.activeSession === '') allowed.activeSession = '';
  else if (typeof patch.activeSession === 'string') {
    const p = path.resolve(patch.activeSession.trim());
    if (p.toLowerCase().startsWith(SESSIONS_ROOT.toLowerCase() + path.sep)) {
      allowed.activeSession = p;
    }
  }
  // The title-bar identity is fixed: this app is always credited to its two
  // authors, so there is deliberately no way to change it through prefs.
  if (typeof patch.sidebarWidth === 'number' && Number.isFinite(patch.sidebarWidth)) {
    allowed.sidebarWidth = Math.round(Math.min(520, Math.max(200, patch.sidebarWidth)));
  }
  if (patch.folders && typeof patch.folders === 'object') {
    const next = { ...(readPrefs().folders || {}) };
    for (const kind of Object.keys(FOLDER_DEFAULTS)) {
      const v = patch.folders[kind];
      if (typeof v === 'string') next[kind] = v.trim();
    }
    allowed.folders = next;
    // Remember which workspace these overrides belong to.
    const w = patch.workspace || readPrefs().lastCwd;
    if (w) allowed.foldersOwner = path.resolve(w);
  }
  // Browser control: the renderer may flip the switch, never set the code.
  if (patch.browserBridge && typeof patch.browserBridge === 'object') {
    const current = readPrefs().browserBridge || {};
    if (typeof patch.browserBridge.enabled === 'boolean') {
      allowed.browserBridge = { ...current, enabled: patch.browserBridge.enabled };
    }
  }
  /*
   * Coarena's free-tier model names, learned from its own 402 refusal. Plain
   * display names only, capped in count and length, so prefs stays a settings
   * file and not a general string store.
   */
  if (Array.isArray(patch.coarenaFreeTier)) {
    allowed.coarenaFreeTier = patch.coarenaFreeTier
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => name.trim().slice(0, 60))
      .slice(0, 40);
  }
  /*
   * Which provider folders the model picker was left closed.
   *
   * Provider ids, not display names: capped the same way, so prefs stays a
   * settings file. Nothing outside the picker reads it.
   */
  if (Array.isArray(patch.collapsedProviders)) {
    allowed.collapsedProviders = patch.collapsedProviders
      .filter((id) => typeof id === 'string' && id.trim())
      .map((id) => id.trim().slice(0, 40))
      .slice(0, 30);
  }
  if (Object.keys(allowed).length) writePrefs(allowed);
  return readPrefs();
});

/** Everything the Settings panel needs to render itself. */
/**
 * What the renderer may know about the key: whether one exists, whether it can
 * be read here, and (when it can) the account's limits. The key itself never
 * crosses the IPC boundary.
 */
async function coarenaStatus() {
  const status = coarenaKeys.status();
  if (!status.configured || !status.readable) return { ...status, info: null, infoError: null };

  const key = coarenaKeys.read();
  const now = Date.now();
  if (coarenaInfoCache.status && coarenaInfoCache.key === key && now - coarenaInfoCache.at < 60_000) {
    return coarenaInfoCache.status;
  }

  const res = await readCoarenaKeyInfo(key);
  const next = { ...status, info: res.ok ? res.info : null, infoError: res.ok ? null : res.error };
  coarenaInfoCache = { at: now, key, status: next };
  return next;
}

/**
 * Push a new key (or its removal) into every open tab. Registration is live, so
 * a tab on that provider keeps working without reopening; a tab left on a
 * removed provider is moved to a model that still exists and told why.
 */
async function applyKeyToTabs({ provider, label, key, apply }) {
  let applied = 0;
  for (const [tabId, tab] of tabs) {
    try {
      const res = await apply(tab.handle, key);
      if (res?.ok) applied += 1;

      if (!key && tab.handle.session?.model?.provider === provider) {
        const fallback = (res.models || []).find((m) => m.provider !== provider) || (res.models || [])[0] || null;
        if (fallback) {
          await tab.handle.setModel(fallback.provider, fallback.id);
          sendTab(tabId, 'agent:notice', {
            text: `${label} key removed — switched to ${fallback.provider}/${fallback.id}.`,
            key: 'notice.keyRemoved',
            params: { label, provider: fallback.provider, id: fallback.id },
          });
        } else {
          sendTab(tabId, 'agent:notice', {
            text: `${label} key removed — this tab has no provider left. Add a key or sign in to FreePi.`,
            key: 'notice.keyRemovedNoProvider',
            params: { label },
          });
        }
      }

      sendTab(tabId, 'model:changed', { model: tab.handle.session?.model || null });
      sendTab(tabId, 'agent:history', { state: tabState(tabId) });
    } catch {}
  }
  return applied;
}

function applyCoarenaKeyToTabs(key) {
  return applyKeyToTabs({
    provider: COARENA_PROVIDER,
    label: 'Coarena',
    key,
    apply: (handle, next) => handle.applyCoarenaKey(next),
  });
}

function applyZroKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'zro',
    label: 'Zro',
    key,
    apply: (handle, next) => handle.applyZroKey(next),
  });
}

function applyNvidiaKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'nvidia',
    label: 'NVIDIA',
    key,
    apply: (handle, next) => handle.applyNvidiaKey(next),
  });
}

function applyTokenHarborKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'tokenharbor',
    label: 'Token Harbor',
    key,
    apply: (handle, next) => handle.applyTokenHarborKey(next),
  });
}

function applyLlm7KeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'llm7',
    label: 'LLM7.io',
    key,
    apply: (handle, next) => handle.applyLlm7Key(next),
  });
}

function applyDeepSeekKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'deepseek',
    label: 'DeepSeek',
    key,
    apply: (handle, next) => handle.applyDeepSeekKey(next),
  });
}

function applyAnthropicKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'anthropic',
    label: 'Claude',
    key,
    apply: (handle, next) => handle.applyAnthropicKey(next),
  });
}

function applyGoogleKeyToTabs(key) {
  return applyKeyToTabs({
    provider: 'google',
    label: 'Gemini',
    key,
    apply: (handle, next) => handle.applyGoogleKey(next),
  });
}

ipcMain.handle('coarena:status', async () => coarenaStatus());

ipcMain.handle('coarena:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) return { ok: false, status: coarenaKeys.status(), error: 'Enter a Coarena API key first.' };

  // A wrong key is rejected before anything touches the disk. An unreachable
  // API is not a wrong key: save it and mark it unverified.
  const check = await readCoarenaKeyInfo(raw);
  if (!check.ok && !check.offline) {
    return { ok: false, status: coarenaKeys.status(), error: check.error };
  }

  try {
    coarenaKeys.save(raw);
    coarenaInfoCache = { at: 0, key: null, status: null };
    const applied = await applyCoarenaKeyToTabs(raw);
    return { ok: true, status: await coarenaStatus(), unverified: Boolean(check.offline), applied };
  } catch (err) {
    return {
      ok: false,
      status: coarenaKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('coarena:clearKey', async () => {
  try {
    coarenaKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: coarenaKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  coarenaInfoCache = { at: 0, key: null, status: null };
  const applied = await applyCoarenaKeyToTabs(null);
  return { ok: true, status: await coarenaStatus(), applied };
});

/** Zro has no key-metadata endpoint: the status is the store's own state. */
async function zroStatus() {
  return zroKeys.status();
}

ipcMain.handle('zro:status', async () => zroStatus());

ipcMain.handle('zro:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) return { ok: false, status: zroKeys.status(), error: 'Enter a Zro API key first.' };

  // A wrong key is rejected before anything touches the disk. An unreachable
  // API is not a wrong key: save it and mark it unverified.
  const check = await checkZroKey(raw);
  if (!check.ok && !check.offline) {
    return { ok: false, status: zroKeys.status(), error: check.error };
  }

  try {
    zroKeys.save(raw);
    const applied = await applyZroKeyToTabs(raw);
    return { ok: true, status: zroKeys.status(), unverified: Boolean(check.offline), applied };
  } catch (err) {
    return {
      ok: false,
      status: zroKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('zro:clearKey', async () => {
  try {
    zroKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: zroKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyZroKeyToTabs(null);
  return { ok: true, status: zroKeys.status(), applied };
});

/**
 * NVIDIA publishes no per-key usage endpoint; the status is the store's own
 * state. SetKey also reports whether a DeepSeek Flash id is still served.
 */
async function nvidiaStatus() {
  return nvidiaKeys.status();
}

ipcMain.handle('nvidia:status', async () => nvidiaStatus());

ipcMain.handle('nvidia:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) return { ok: false, status: nvidiaKeys.status(), error: 'Enter an NVIDIA API key first.' };

  // A wrong key is rejected before anything touches the disk. An unreachable
  // API is not a wrong key: save it and mark it unverified.
  const check = await checkNvidiaKey(raw);
  if (!check.ok && !check.offline) {
    return { ok: false, status: nvidiaKeys.status(), error: check.error };
  }

  try {
    nvidiaKeys.save(raw);
    const applied = await applyNvidiaKeyToTabs(raw);
    // A valid key with no DeepSeek Flash id means NVIDIA retired the endpoint.
    const modelMissing =
      check.ok && !(check.ids || []).some((id) => String(id).startsWith('deepseek-ai/deepseek-v4'));
    return {
      ok: true,
      status: nvidiaKeys.status(),
      unverified: Boolean(check.offline),
      modelMissing,
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: nvidiaKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('nvidia:clearKey', async () => {
  try {
    nvidiaKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: nvidiaKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyNvidiaKeyToTabs(null);
  return { ok: true, status: nvidiaKeys.status(), applied };
});

/** Token Harbor exposes no usage endpoint: the status is the store's state. */
async function tokenharborStatus() {
  return tokenharborKeys.status();
}

ipcMain.handle('tokenharbor:status', async () => tokenharborStatus());

ipcMain.handle('tokenharbor:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) {
    return { ok: false, status: tokenharborKeys.status(), error: 'Enter a Token Harbor key first.' };
  }

  // A wrong key is rejected before anything touches the disk. An unreachable
  // API is not a wrong key: save it and mark it unverified.
  const check = await checkTokenHarborKey(raw);
  if (!check.ok && !check.offline) {
    return { ok: false, status: tokenharborKeys.status(), error: check.error, code: check.code || null };
  }

  try {
    tokenharborKeys.save(raw);
    const applied = await applyTokenHarborKeyToTabs(raw);
    // A working key with no free id means the dashboard has free models off.
    const modelMissing =
      check.ok && !(check.ids || []).includes('deepseek-v4.1-flash:free');
    return {
      ok: true,
      status: tokenharborKeys.status(),
      unverified: Boolean(check.offline),
      modelMissing,
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: tokenharborKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('tokenharbor:clearKey', async () => {
  try {
    tokenharborKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: tokenharborKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyTokenHarborKeyToTabs(null);
  return { ok: true, status: tokenharborKeys.status(), applied };
});

/**
 * LLM7 exposes balance only in its dashboard, so the status is the key store's
 * own state.
 */
async function llm7Status() {
  return llm7Keys.status();
}

ipcMain.handle('llm7:status', async () => llm7Status());

ipcMain.handle('llm7:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) {
    return { ok: false, status: llm7Keys.status(), error: 'Enter an LLM7 API token first.' };
  }

  // Only LLM7 saying the key itself is wrong refuses it. A rate limit or an
  // unreachable API is inconclusive, so the key is saved and marked unverified.
  const check = await checkLlm7Key(raw);
  if (!check.ok && !check.unverified) {
    return { ok: false, status: llm7Keys.status(), error: check.error, code: check.code || null };
  }

  try {
    llm7Keys.save(raw);
    const applied = await applyLlm7KeyToTabs(raw);
    return {
      ok: true,
      status: llm7Keys.status(),
      unverified: Boolean(check.unverified),
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: llm7Keys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('llm7:clearKey', async () => {
  try {
    llm7Keys.clear();
  } catch (err) {
    return {
      ok: false,
      status: llm7Keys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyLlm7KeyToTabs(null);
  return { ok: true, status: llm7Keys.status(), applied };
});

/**
 * DeepSeek publishes no per-key usage endpoint; the status is the store's own
 * state. SetKey also proves the key and learns which ids are still served.
 */
async function deepseekStatus() {
  return deepseekKeys.status();
}

ipcMain.handle('deepseek:status', async () => deepseekStatus());

ipcMain.handle('deepseek:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) {
    return { ok: false, status: deepseekKeys.status(), error: 'Enter a DeepSeek API key first.' };
  }

  // A rejected key never touches the disk. A 402 or an unreachable API is not a
  // wrong key, so the key is saved and the balance is left to the first turn.
  const check = await checkDeepSeekKey(raw);
  if (!check.ok && !check.offline && check.status !== 402) {
    return { ok: false, status: deepseekKeys.status(), error: check.error, code: check.code || null };
  }

  try {
    deepseekKeys.save(raw);
    const applied = await applyDeepSeekKeyToTabs(raw);
    return {
      ok: true,
      status: deepseekKeys.status(),
      unverified: Boolean(check.offline),
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: deepseekKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('deepseek:clearKey', async () => {
  try {
    deepseekKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: deepseekKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyDeepSeekKeyToTabs(null);
  return { ok: true, status: deepseekKeys.status(), applied };
});

/**
 * Claude publishes no per-key usage endpoint; the status is the store's own
 * state. SetKey also proves the key and learns which model ids this account can
 * reach.
 */
async function anthropicStatus() {
  return anthropicKeys.status();
}

ipcMain.handle('anthropic:status', async () => anthropicStatus());

ipcMain.handle('anthropic:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) {
    return { ok: false, status: anthropicKeys.status(), error: 'Enter a Claude API key first.' };
  }

  // A rejected key never touches the disk. A rate limit or an unreachable API
  // is not a wrong key, so the key is saved and marked unverified.
  const check = await checkAnthropicKey(raw);
  if (!check.ok && !check.offline && check.status !== 429) {
    return { ok: false, status: anthropicKeys.status(), error: check.error };
  }

  try {
    anthropicKeys.save(raw);
    const applied = await applyAnthropicKeyToTabs(raw);
    return {
      ok: true,
      status: anthropicKeys.status(),
      unverified: Boolean(check.offline || check.status === 429),
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: anthropicKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('anthropic:clearKey', async () => {
  try {
    anthropicKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: anthropicKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyAnthropicKeyToTabs(null);
  return { ok: true, status: anthropicKeys.status(), applied };
});

/**
 * Gemini exposes no per-key usage endpoint either; the status is the store's
 * own state. SetKey also proves the key and learns which ids it can generate
 * with.
 */
async function googleStatus() {
  return googleKeys.status();
}

ipcMain.handle('google:status', async () => googleStatus());

ipcMain.handle('google:setKey', async (_e, { key } = {}) => {
  const raw = String(key || '').trim();
  if (!raw) {
    return { ok: false, status: googleKeys.status(), error: 'Enter a Gemini API key first.' };
  }

  // Only Google saying the key itself is wrong refuses it. A quota error or an
  // unreachable API is inconclusive, so the key is saved and marked unverified.
  const check = await checkGoogleKey(raw);
  if (!check.ok && !check.offline && check.status !== 429) {
    return { ok: false, status: googleKeys.status(), error: check.error };
  }

  try {
    googleKeys.save(raw);
    const applied = await applyGoogleKeyToTabs(raw);
    return {
      ok: true,
      status: googleKeys.status(),
      unverified: Boolean(check.offline || check.status === 429),
      applied,
    };
  } catch (err) {
    return {
      ok: false,
      status: googleKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('google:clearKey', async () => {
  try {
    googleKeys.clear();
  } catch (err) {
    return {
      ok: false,
      status: googleKeys.status(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const applied = await applyGoogleKeyToTabs(null);
  return { ok: true, status: googleKeys.status(), applied };
});

ipcMain.handle('app:systemInfo', () => {
  const active = activeTabId ? tabs.get(activeTabId) : null;
  const info = {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    locale: app.getLocale(),
    dataDir: DATA_ROOT,
    packaged: app.isPackaged,
    provider: active?.handle?.session?.model?.provider || '',
  };
  return { ...info, text: formatSystemInfo(info) };
});

ipcMain.handle('mcp:get', () => ({
  enabled: Boolean(readPrefs().mcpEnabled),
  path: mcpConfigPath(),
  content: readMcpConfigText(),
}));

ipcMain.handle('mcp:set', (_e, { enabled, content } = {}) => {
  const check = parseMcpConfig(content);
  if (!check.ok) return { ok: false, error: check.error };
  try {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
    fs.writeFileSync(mcpConfigPath(), `${JSON.stringify(check.value, null, 2)}\n`, 'utf8');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  writePrefs({ mcpEnabled: Boolean(enabled) });
  return { ok: true };
});

ipcMain.handle('settings:get', async (_e, { cwd } = {}) => {
  const prefs = readPrefs();
  // Settings describes a workspace. With no tab and no remembered folder there
  // is none — do not pretend the app's own installation folder is one.
  const workspace = cwd || prefs.lastCwd || null;
  const base = workspace || process.cwd();
  // Make the folders real before reporting them, so "exists" is always honest
  // and the agent never has to create them itself.
  if (workspace) ensureWorkspaceFolders(base);
  const folders = {};
  for (const kind of Object.keys(FOLDER_DEFAULTS)) {
    const configured = prefs.folders?.[kind];
    const abs = resolveFolder(kind, base);
    folders[kind] = {
      value: configured || FOLDER_DEFAULTS[kind],
      resolved: abs,
      isDefault: !configured || abs === defaultFolder(kind),
      exists: fs.existsSync(abs),
    };
  }
  // Chat history is stored per workspace, so show this workspace's own folder
  // rather than the shared parent — the user should never have to guess.
  const wsSessionsDir = workspace ? sessionDirFor(base) : null;

  return {
    workspace,
    hasWorkspace: Boolean(workspace),
    folders,
    defaults: FOLDER_DEFAULTS,
    skillsDirs: [SKILLS_ROOT].filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    }),
    sessionsDir: wsSessionsDir,
    sessionsRoot: SESSIONS_ROOT,
    prefsPath: prefsPath(),
    // Shown at the top of Settings so it is obvious where this app keeps things.
    dataRoot: DATA_ROOT,
    coarena: await coarenaStatus(),
    zro: await zroStatus(),
    nvidia: await nvidiaStatus(),
    tokenharbor: await tokenharborStatus(),
    llm7: await llm7Status(),
    deepseek: await deepseekStatus(),
    anthropic: await anthropicStatus(),
    google: await googleStatus(),
  };
});

/** Let the user pick a destination folder for one kind of generated file. */
ipcMain.handle('settings:pickFolder', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose where these files go',
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

/** Open a folder in Explorer so the user can tidy up. */
ipcMain.handle('settings:reveal', async (_e, target) => {
  const p = String(target || '');
  if (!p) return { ok: false, error: 'No path' };
  try {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    await shell.openPath(p);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// ---- window caption buttons (custom frameless title bar) ----
function winState() {
  return {
    maximized: Boolean(win && win.isMaximized()),
    fullScreen: Boolean(win && win.isFullScreen()),
  };
}

ipcMain.on('ui:log', (_e, line) => logUi(String(line || '').slice(0, 2000)));
ipcMain.on('ui:ready', () => {
  const resolve = uiReadyResolver;
  uiReadyResolver = null;
  if (resolve) resolve();
});

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:toggleMaximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win:close', () => win?.close());
ipcMain.handle('win:state', () => winState());

ipcMain.handle('tab:open', async (_e, opts = {}) => {
  const cwd = path.resolve(opts.cwd || readPrefs().lastCwd || process.cwd());
  // Restoring a saved tab must not move the default workspace: only a folder the
  // user picked (or a new tab they opened) updates `lastCwd`.
  if (!opts.restore) writePrefs({ lastCwd: cwd });

  // Restoring must never invent an empty conversation when the saved file is
  // gone; the caller skips that tab instead.
  if (opts.restore && opts.sessionId && !resolveSessionFile(cwd, opts.sessionId)) {
    throw new Error('saved session file not found');
  }

  /**
   * Reattach instead of duplicating.
   *
   * A window reload (Ctrl+R / Ctrl+Shift+R) throws the renderer away but leaves
   * this process — and every running agent turn — alive. The renderer then
   * boots and asks for the tabs in prefs. If we always made a new tab here, the
   * reloaded window would open a *second* tab on the same session file while
   * the first kept streaming into nothing: the reply would be written to disk
   * eventually, but the window would show the state from before, and the turn
   * would look lost.
   *
   * So when a tab is already open on the requested session, hand back that same
   * tab. The turn keeps streaming into the pane you are looking at.
   */
  if (opts.sessionId) {
    const wanted = resolveSessionFile(cwd, opts.sessionId) || opts.sessionId;
    for (const [liveId, liveTab] of tabs) {
      const liveFile = liveTab?.handle?.session?.sessionFile;
      if (!liveFile) continue;
      if (path.resolve(liveFile) === path.resolve(wanted)) {
        activeTabId = liveId;
        return { tabId: liveId, state: tabState(liveId), reused: true };
      }
    }
  }

  const tabId = opts.tabId && !tabs.has(opts.tabId) ? opts.tabId : newTabId();

  const manager = opts.sessionId
    ? openExisting(cwd, opts.sessionId)
    : sdk.SessionManager.create(cwd, sessionDirFor(cwd));

  const state = await attachTab(tabId, manager, cwd);
  activeTabId = tabId;
  persistTabs();
  return { tabId, state };
});

ipcMain.handle('tab:resumeRecent', async (_e, cwd) => {
  const target = path.resolve(cwd || readPrefs().lastCwd || process.cwd());
  const tabId = newTabId();
  const state = await attachTab(
    tabId,
    sdk.SessionManager.continueRecent(target, sessionDirFor(target)),
    target
  );
  activeTabId = tabId;
  persistTabs();
  return { tabId, state };
});

ipcMain.handle('tab:activate', async (_e, tabId) => {
  const tab = tabs.get(tabId);
  if (!tab) throw new Error('unknown tab');
  activeTabId = tabId;
  if (!tabIsFreePi(tab)) {
    // Coarena has no ads; clearing the slot also clears whatever the previous
    // tab left there.
    sendTab(tabId, 'ads:show', { ad: null });
  } else if (tab.ad) {
    sendTab(tabId, 'ads:show', { ad: tab.ad });
  } else if (!tab.busy && !tab.adRotating) {
    // The launch ad may have arrived before the window was ready to show it.
    // Fetching one here keeps the sponsored bar from staying empty.
    tab.adRotating = true;
    tab.handle
      .rotateAd()
      .catch(() => {})
      .finally(() => {
        tab.adRotating = false;
      });
  }
  return tabState(tabId);
});

ipcMain.handle('tab:close', async (_e, tabId) => {
  const tab = tabs.get(tabId);
  if (tab) {
    try {
      await tab.handle.session.abort();
    } catch {}
    try {
      tab.handle.dispose();
    } catch {}
    tabs.delete(tabId);
  }
  if (activeTabId === tabId) activeTabId = tabs.keys().next().value || null;
  persistTabs();
  return { activeTabId };
});

ipcMain.handle('tab:list', async () => [...tabs.keys()].map(tabSummary).filter(Boolean));

ipcMain.handle('tab:state', async (_e, tabId) => tabState(tabId || activeTabId));

ipcMain.handle('session:list', async (_e, cwd) => listSessions(cwd || readPrefs().lastCwd || process.cwd()));

/** The colours the user may choose, in display order. */
ipcMain.handle('session:colors', async () => SESSION_COLORS);

/**
 * Pin, unpin, colour or un-colour one saved chat.
 *
 * Addressed by session *file*, not tab: a chat in the sidebar may not be open,
 * and `/clear` replaces its tab anyway. Out-of-range values are rejected by
 * session-marks.js rather than stored.
 */
ipcMain.handle('session:mark', async (_e, { sessionPath, pinned, color } = {}) => {
  const key = sessionMarkKey(sessionPath);
  if (!key) return { ok: false, error: 'a session file is required' };
  // Refuse paths outside the store: prefs is not a general-purpose side table.
  // Compare in lower case because `markKey` lower-cases the path on Windows.
  const root = path.resolve(SESSIONS_ROOT).toLowerCase();
  if (!key.startsWith(root + path.sep)) {
    return { ok: false, error: 'session file is outside the session store' };
  }

  const patch = {};
  if (pinned !== undefined) patch.pinned = pinned === true;
  if (color !== undefined) patch.color = color;
  if (!Object.keys(patch).length) return { ok: false, error: 'nothing to change' };

  const mark = saveSessionMark(sessionPath, patch);
  return { ok: true, sessionPath, mark };
});

/**
 * Delete a saved session from disk. Any open tab using that session is closed
 * first so pi stops writing to the file before it disappears.
 */
ipcMain.handle('session:delete', async (_e, { cwd, sessionPath } = {}) => {
  const target = path.resolve(String(sessionPath || ''));
  // Only ever delete inside this workspace's session store.
  const root = path.resolve(SESSIONS_ROOT);
  if (!target.startsWith(root) || !target.endsWith('.jsonl')) {
    return { ok: false, error: 'Refusing to delete a path outside the session store.' };
  }

  for (const [tabId, tab] of [...tabs.entries()]) {
    const file = tab.handle?.session?.sessionFile;
    if (file && path.resolve(file) === target) {
      try { await tab.handle.session.abort(); } catch {}
      try { tab.handle.dispose(); } catch {}
      tabs.delete(tabId);
      if (activeTabId === tabId) activeTabId = tabs.keys().next().value || null;
    }
  }

  try {
    await fs.promises.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  sessionListCache.clear();

  persistTabs();
  return { ok: true, activeTabId };
});

ipcMain.handle('session:rename', async (_e, { tabId, name } = {}) => {
  const { tabId: id, tab } = tabFor(tabId);
  // `setSessionName('')` clears the custom title; `null` would crash the SDK
  // (`name.replace(...)`), and the renderer sends `null` when the field is empty.
  const clean = typeof name === 'string' ? name : '';
  await tab.handle.session.setSessionName(clean);
  tab.fallbackName = clean.trim() || null;
  // A title lives in the file, not in the folder: drop the parsed list so the
  // sidebar shows the new name on its next read.
  sessionListCache.delete(sessionDirFor(tab.cwd));
  return tabSummary(id);
});

/**
 * Rename a session that is not open in a tab.
 *
 * Opening a tab just to call `setSessionName` switched the active tab and rebuilt
 * the transcript, which dropped assistant messages (including ones still
 * streaming). This opens the file, sets the name and disposes the handle
 * without touching any tab.
 */
ipcMain.handle('session:renameFile', async (_e, { cwd, sessionPath, name } = {}) => {
  const base = path.resolve(String(cwd || readPrefs().lastCwd || process.cwd()));
  const file = resolveSessionFile(base, String(sessionPath || ''));
  if (!file) return { ok: false, error: 'session file not found' };
  const clean = typeof name === 'string' ? name.trim() : '';
  let handle = null;
  try {
    // `SessionManager.open()` reads the JSONL and exposes `appendSessionInfo`,
    // which is exactly what the SDK's own `setSessionName()` writes. No agent
    // session or tab is needed for a rename.
    handle = sdk.SessionManager.open(file, path.dirname(file));
    if (typeof handle?.appendSessionInfo !== 'function') {
      return { ok: false, error: 'session manager cannot rename' };
    }
    handle.appendSessionInfo(clean);
    sessionListCache.delete(sessionDirFor(base));
    return { ok: true, name: clean || null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      handle?.dispose?.();
    } catch {}
  }
});

/**
 * Images this session attached to its prompts. Only files inside the chat
 * attachments folder are returned; skills, generated images and downloads are
 * deliberately left alone.
 */
function attachmentPathsForSession(sessionFile, cwd) {
  let text = '';
  try {
    text = fs.readFileSync(sessionFile, 'utf8');
  } catch {
    return [];
  }
  const dir = path.resolve(resolveFolder('attachments', cwd));
  const found = new Set();
  const re = /\[Attached image saved to:\s*([^\]\r\n]+)\]/g;
  for (const match of text.matchAll(re)) {
    const abs = path.resolve(cwd, match[1].trim());
    if (abs.startsWith(dir + path.sep) && fs.existsSync(abs)) found.add(abs);
  }
  return [...found];
}

/**
 * `/clear`: delete this conversation's text (its session file) and the images
 * it attached, then reopen the same workspace with an empty chat.
 *
 * The new chat is a genuine new session — new id, new file, and *no* context —
 * exactly like pressing "+ New", so clearing costs the same tokens as starting
 * over. Two things the user set deliberately are carried across, because losing
 * them is what made `/clear` feel like it threw the chat away:
 *
 *   name  — written back with `appendSessionInfo`, the same call a rename makes
 *   model — re-selected so clearing does not silently move you to the default
 *
 * Not touched: skills, generated images, downloaded files, other sessions.
 */
ipcMain.handle('session:clear', async (_e, tabId) => {
  const { tab } = tabFor(tabId);
  const cwd = tab.cwd;
  const file = tab.handle.session.sessionFile;
  const attachments = file ? attachmentPathsForSession(file, cwd) : [];

  // Read what the old chat was before the handle goes away. `sessionName` is
  // only set when the user named it; a derived name would come back anyway from
  // the first message of the *new* chat, so it is deliberately not carried.
  const keepName = (tab.handle.session.sessionName || '').trim();
  const keepModel = tab.handle.session.model
    ? { provider: tab.handle.session.model.provider, id: tab.handle.session.model.id }
    : null;

  try {
    await tab.handle.session.abort();
  } catch {}
  try {
    tab.handle.dispose();
  } catch {}
  tabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = tabs.keys().next().value || null;

  let warning = null;
  let warningKey = null;
  let warningParams = null;
  if (file) {
    const target = path.resolve(file);
    const root = path.resolve(SESSIONS_ROOT);
    if (target.startsWith(root + path.sep) && target.endsWith('.jsonl')) {
      try {
        await fs.promises.unlink(target);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          warningParams = { error: err instanceof Error ? err.message : String(err) };
          warningKey = 'noticeClearUnlink';
          warning = `Chat closed, but the history file could not be deleted: ${warningParams.error}`;
        }
      }
    } else {
      warningKey = 'noticeClearOutsideStore';
      warning = 'Chat closed, but its history file is outside the app session store and was left on disk.';
    }
  }

  for (const p of attachments) {
    try {
      await fs.promises.unlink(p);
    } catch {}
  }

  try {
    const newId = newTabId();
    const manager = sdk.SessionManager.create(cwd, sessionDirFor(cwd));
    const state = await attachTab(newId, manager, cwd);

    // Restore the two things the user chose. Both are best-effort: a failed
    // rename or model switch must not turn a successful clear into an error.
    if (keepName) {
      try {
        const newTab = tabs.get(newId);
        await newTab.handle.session.setSessionName(keepName);
        newTab.fallbackName = keepName;
        state.name = keepName;
      } catch {}
    }
    if (keepModel) {
      try {
        const newTab = tabs.get(newId);
        const model = await newTab.handle.setModel(keepModel.provider, keepModel.id);
        if (model) state.model = { provider: model.provider, id: model.id, name: model.name };
      } catch {}
    }

    activeTabId = newId;
    persistTabs();
    return {
      ok: true,
      tabId: newId,
      state,
      attachmentsRemoved: attachments.length,
      keptName: Boolean(keepName),
      keptModel: Boolean(state.model && keepModel),
      warning,
      warningKey,
      warningParams,
    };
  } catch (err) {
    persistTabs();
    return {
      ok: false,
      closed: true,
      warning,
      warningKey,
      warningParams,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('prompt:send', async (_e, { tabId, text, images, mode: passedMode } = {}) => {
  const { tab } = tabFor(tabId);

  /**
   * free-pi's models are text-only (the catalog declares input: ["text"]) and
   * prompt attachment handling works from disk paths:
   *   image → written into the workspace, agent views it through look_at_image
   *   file  → referenced by its existing path, agent reads it with its own tools
   */
  const imageFiles = [];
  const filePaths = [];

  for (const att of Array.isArray(images) ? images : []) {
    if (att?.kind === 'file' && typeof att.path === 'string' && att.path) {
      // Only accept a path that still exists on disk.
      if (fs.existsSync(att.path)) filePaths.push(att.path);
      continue;
    }

    const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,([A-Za-z0-9+/=]+)$/.exec(
      att?.dataUri || ''
    );
    if (!match) continue;
    const ext = match[1] === 'image/jpeg' ? 'jpg' : match[1].split('/')[1];
    const dir = resolveFolder('attachments', tab.cwd);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `image-${stamp}-${imageFiles.length + 1}.${ext}`);
      fs.writeFileSync(file, Buffer.from(match[2], 'base64'));
      imageFiles.push(file);
    } catch (err) {
      sendTab(tabFor(tabId).tabId, 'agent:notice', {
        text: `Could not save attachment: ${err instanceof Error ? err.message : String(err)}`,
        key: 'notice.attachmentFailed',
        params: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  const parts = [];
  if (text) parts.push(String(text));
  if (imageFiles.length) {
    parts.push(
      imageFiles.map((f) => `[Attached image saved to: ${f}]`).join('\n') +
        '\nThe image is saved on disk. You cannot see images directly: call look_at_image with that path and a specific question to view it.'
    );
  }
  if (filePaths.length) {
    // Say what kind of file it is. The agent can only act on a video or an
    // unsupported format if it knows that is what it is — otherwise it reaches
    // for the image reader and gives up.
    const kinds = filePaths.map((f) => `${f} (${describeFile(f)})`).join('\n');
    parts.push(
      `[Attached file${filePaths.length > 1 ? 's' : ''}:\n${kinds}]` +
        '\nThese files are on disk and were not read into the conversation.' +
        ' Use your own tools on the path: read it, grep it, or run a command to inspect it.' +
        ' If a format cannot be opened directly (a video, an archive, a binary),' +
        ' work out how to handle it yourself — list what tools are available,' +
        ' extract frames or text, or explain what you cannot do — rather than assuming it is unreadable.'
    );
  }
  const promptText = parts.join('\n\n');

  // A new prompt starts a new turn: a limit remembered for the last one is not
  // this turn's story.
  tab.promptSeq = (tab.promptSeq || 0) + 1;
  tab.limitFailure = null;

  // A second prompt while the agent is running must say how to queue itself:
  // 'steer' joins this turn, 'followUp' waits for the run to finish. Idle
  // prompts carry no option at all.
  const options = promptOptionsFor(Boolean(tab.handle.session.isStreaming), passedMode);
  // Mark busy the moment the prompt is accepted, not when the agent's
  // `agent_start` event lands. Between those two there is a window where the
  // renderer already says "working" but this process still reports idle; the
  // renderer's busy-heal (reconcileBusy) read that as a missed settle and drained
  // the next queued message early, so two queued prompts went out at once.
  tab.busy = true;
  sendTab(tabFor(tabId).tabId, 'agent:busy', { busy: true });

  // What this turn is made of, kept while it streams: if the allowance runs out
  // the session can drop both halves, and this is then the only copy of the
  // user's words and of the answer that was already half written
  // (see recoverInterruptedTurn). A steer joins the turn that is already running,
  // so it adds to that draft instead of replacing it.
  if (tab.handle.session.isStreaming && tab.turnDraft && !tab.turnDraft.done) {
    tab.turnDraft.prompts.push(promptText);
  } else {
    tab.turnDraft = { prompts: [promptText], assistant: '', thinking: '', tools: [], done: false };
  }

  const run = tab.handle.session.prompt(promptText, options);

  run.catch((err) => {
    reportTabError(tabFor(tabId).tabId, err instanceof Error ? err.message : String(err));
    tab.busy = false;
    sendTab(tabFor(tabId).tabId, 'agent:busy', { busy: false });
  });

  return { ok: true, mode: options?.streamingBehavior || null };
});

ipcMain.handle('prompt:abort', async (_e, tabId) => {
  const { tabId: id, tab } = tabFor(tabId);
  // A blocked ask_user would otherwise keep the turn alive after Stop.
  for (const [qid, pending] of questions) {
    if (pending.tabId !== id) continue;
    questions.delete(qid);
    pending.resolve(null);
  }
  /*
   * Clear the flag and tell the window *before* asking the session to stop.
   *
   * `session.abort()` on a session that is already idle — or one blocked waiting
   * for an answer — can go a long time without resolving, and this handler used
   * to sit awaiting it. The result was a Stop button that did nothing while the
   * window went on saying "working", with no way out of that state. The wait is
   * bounded now, and the flag stays cleared either way: from the user's side the
   * turn is over the moment they press Stop.
   */
  tab.busy = false;
  // The user asked for this stop; it is not a spent allowance and must not send
  // the turn to another model behind their back.
  tab.limitFailure = null;
  // Nothing is put back either: a stop is meant to end the turn where it is.
  tab.turnDraft = null;
  // Remembered so the abort-shaped failure this stop produces is not reported as
  // "the provider went quiet". Keyed by prompt number: a later turn's failure is
  // its own.
  tab.userAbort = { seq: tab.promptSeq || 0, at: Date.now() };
  sendTab(id, 'agent:busy', { busy: false });
  try {
    await Promise.race([
      tab.handle.session.abort(),
      new Promise((resolve) => {
        setTimeout(resolve, 4000).unref?.();
      }),
    ]);
  } catch {}
  return { ok: true };
});

ipcMain.handle('model:set', async (_e, { tabId, provider, id }) => {
  const { tabId: tid, tab } = tabFor(tabId);
  const m = await tab.handle.setModel(provider, id);
  sendTab(tid, 'model:changed', { model: m });

  // Switching providers swaps the chrome: ads only exist under FreePi.
  const freePi = tabIsFreePi(tab);
  sendTab(tid, 'ads:show', { ad: freePi ? tab.ad : null });
  if (freePi && !tab.ad && !tab.adRotating) {
    tab.adRotating = true;
    tab.handle
      .rotateAd()
      .catch(() => {})
      .finally(() => {
        tab.adRotating = false;
      });
  }
  return m;
});

/* ------------------------- session toolbox (undo etc.) ------------------ */

/**
 * Take back a message that was just sent.
 *
 * The Cancel row under a fresh message promises the words are the user's again.
 * Stopping the turn alone was not enough: the prompt had already been written
 * into the session, so the next repaint put the message straight back on screen
 * and the thing the user cancelled stayed in the transcript — worse, the abort
 * that stopped it was reported as "the provider stopped responding".
 *
 * So this stops the turn and then steps the session back over that user message.
 * A session still finishing its abort is retried briefly; if it cannot be
 * removed the window is told, instead of quietly keeping a message the reader
 * believes they cancelled.
 */
ipcMain.handle('prompt:takeBack', async (_e, tabId) => {
  const { tabId: id, tab } = tabFor(tabId);

  // Same rule as Stop: this is the user's own cancel, so its abort is not a
  // provider failure and not a spent allowance.
  tab.busy = false;
  tab.limitFailure = null;
  // And the message must not come back as a recovered turn: the point of
  // take-back is that the words are the user's again.
  tab.turnDraft = null;
  tab.userAbort = { seq: tab.promptSeq || 0, at: Date.now() };
  sendTab(id, 'agent:busy', { busy: false });

  try {
    await Promise.race([
      tab.handle.session.abort(),
      new Promise((resolve) => {
        setTimeout(resolve, 4000).unref?.();
      }),
    ]);
  } catch {}

  // The session refuses to step back while it is still streaming, so give the
  // abort a moment to land rather than reporting a cancel that did not happen.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      if (!tab.handle.session.isStreaming) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const res = await tab.handle.undo().catch((err) => ({
    ok: false,
    reason: err instanceof Error ? err.message : String(err),
  }));
  if (res?.ok) afterHistoryChange(id);
  return { ok: Boolean(res?.ok), reason: res?.ok ? null : res?.reason || 'busy' };
});

/** Tokens/context for the meter. Cheap: no network, reads the session in memory. */
ipcMain.handle('session:stats', async (_e, tabId) => {
  const { tab } = tabFor(tabId);
  return safeCall(() => tab.handle.stats(), null);
});

ipcMain.handle('session:undo', async (_e, tabId) => {
  const { tabId: tid, tab } = tabFor(tabId);
  const res = await tab.handle.undo().catch((err) => ({
    ok: false,
    reason: err instanceof Error ? err.message : String(err),
  }));
  if (res.ok) afterHistoryChange(tid);
  return res;
});

ipcMain.handle('session:redo', async (_e, { tabId, entryId } = {}) => {
  const { tabId: tid, tab } = tabFor(tabId);
  const res = await tab.handle.redo(entryId).catch(() => ({ ok: false, reason: 'error' }));
  if (res.ok) afterHistoryChange(tid);
  return res;
});

ipcMain.handle('session:compact', async (_e, { tabId, instructions } = {}) => {
  const { tabId: tid, tab } = tabFor(tabId);
  const res = await tab.handle.compact(instructions).catch((err) => ({
    ok: false,
    reason: err instanceof Error ? err.message : String(err),
  }));
  if (res.ok) afterHistoryChange(tid);
  return res;
});

ipcMain.handle('session:export', async (_e, tabId) => {
  const { tab } = tabFor(tabId);
  const res = await tab.handle.exportHtml().catch(() => ({ ok: false, path: null }));
  if (res.ok && res.path) {
    try {
      await shell.openPath(res.path);
    } catch {}
  }
  return res;
});

ipcMain.handle('session:thinking', async (_e, { tabId, level } = {}) => {
  const { tabId: tid, tab } = tabFor(tabId);
  if (level) {
    const set = safeCall(() => tab.handle.setThinking(level), null);
    writePrefs({ thinkingLevel: set || level });
    sendTab(tid, 'session:thinking', { thinking: safeCall(() => tab.handle.thinking(), null) });
  }
  return safeCall(() => tab.handle.thinking(), null);
});

/* ------------------------- review panel (changes) ------------------------ */

ipcMain.handle('changes:list', async (_e, tabId) => {
  const { tab } = tabFor(tabId);
  return {
    changes: tab.changes || [],
    revertable: (tab.changes || []).filter((c) => tab.fileBackup?.has(c.path)).length,
  };
});

/**
 * Put one file (or every changed file) back to how it was before this tab
 * touched it. Only paths the agent actually edited inside the workspace are
 * eligible, and the backup map decides that — never a path from the renderer.
 */
ipcMain.handle('changes:revert', async (_e, { tabId, path: targetPath, all } = {}) => {
  const { tab } = tabFor(tabId);
  if (!tab?.fileBackup) return { ok: false, reason: 'nothing to revert' };
  const targets = all
    ? tab.changes.map((c) => c.path).filter((p) => tab.fileBackup.has(p))
    : [targetPath].filter((p) => p && tab.fileBackup.has(p));
  if (!targets.length) return { ok: false, reason: 'nothing to revert' };

  const reverted = [];
  for (const file of targets) {
    const backup = tab.fileBackup.get(file);
    try {
      if (!backup.existed) fs.rmSync(file, { force: true });
      else {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, backup.before, 'utf8');
      }
      tab.fileBackup.delete(file);
      tab.changes = tab.changes.filter((c) => c.path !== file);
      reverted.push(file);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err), reverted };
    }
  }
  sendTab(tabIdForTab(tab), 'agent:changes', { changes: tab.changes });
  return { ok: true, reverted };
});

/** The message list changed underneath the renderer (undo/redo/compact). */
function afterHistoryChange(tabId) {
  const tab = tabs.get(tabId);
  if (!tab) return;
  sendTab(tabId, 'agent:history', { state: tabState(tabId) });
  sendTab(tabId, 'agent:settled', { aborted: false });
}

/** `!command` — runs in the workspace and joins the session, like the CLI. */
ipcMain.handle('shell:run', async (_e, { tabId, command } = {}) => {
  const text = String(command || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const { tabId: tid, tab } = tabFor(tabId);
  sendTab(tid, 'agent:bashStart', { command: text });
  try {
    const result = await tab.handle.bash(
      text,
      (chunk) => sendTab(tid, 'agent:bashChunk', { command: text, chunk }),
      {}
    );
    sendTab(tid, 'agent:bashEnd', {
      command: text,
      output: result?.output ?? '',
      exitCode: result?.exitCode ?? null,
      cancelled: Boolean(result?.cancelled),
    });
    return { ok: true, exitCode: result?.exitCode ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendTab(tid, 'agent:bashEnd', { command: text, output: message, exitCode: 1, cancelled: false });
    return { ok: false, reason: message };
  }
});

/* --------------------------- file index for @ --------------------------- */

const FILE_INDEX_SKIP = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  '.ntapi-attachments',
  '.freepi-attachments',
  'coverage',
  '.idea',
  '.vscode',
  'target',
  'vendor',
  '.turbo',
]);

function walkWorkspace(root, limit) {
  const results = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && results.length < limit) {
    const { dir, depth } = queue.shift();
    if (depth > 8) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= limit) break;
      const name = entry.name;
      if (name.startsWith('.') && name !== '.env.example') continue;
      const full = path.join(dir, name);
      if (entry.isDirectory()) {
        if (FILE_INDEX_SKIP.has(name)) continue;
        queue.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        results.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  return results;
}

/* ------------------------- image previews (IPC) ------------------------- */

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Resolve a renderer-supplied path against the tab's workspace. Anything that
 * escapes the workspace, or a missing/empty root, is refused: the renderer must
 * not be able to read the rest of the disk through these handlers.
 */
function resolveInsideWorkspace(cwd, target) {
  if (!cwd) return null;
  const root = path.resolve(String(cwd));
  const abs = path.resolve(root, String(target || ''));
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

/**
 * The picture a prompt brought with it may live outside the workspace.
 *
 * Chat attachments are written to `outputs/.ntapi-attachments` under the app
 * data root, not into the project folder, so the workspace rule above refused
 * them and a replayed message could not get its thumbnail back. That one folder
 * is readable as well — nothing else is added to the allowlist.
 */
function attachmentRoot(cwd) {
  return path.resolve(resolveFolder('attachments', cwd));
}

function resolveReadableImage(cwd, target) {
  const inside = resolveInsideWorkspace(cwd, target);
  if (inside) return inside;
  if (!cwd || !target) return null;
  const abs = path.resolve(String(cwd), String(target));
  const root = attachmentRoot(cwd);
  return abs.startsWith(root + path.sep) ? abs : null;
}

function imageMimeFor(ext) {
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

ipcMain.handle('fs:readImage', async (_e, { cwd, path: target } = {}) => {
  const abs = resolveReadableImage(cwd, target);
  if (!abs) return { ok: false };
  const ext = path.extname(abs).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return { ok: false };
  try {
    const stat = await fs.promises.stat(abs);
    if (!stat.isFile() || stat.size > IMAGE_MAX_BYTES) return { ok: false };
    const buf = await fs.promises.readFile(abs);
    const mime = imageMimeFor(ext);
    return { ok: true, path: abs, mimeType: mime, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('fs:openPath', async (_e, { cwd, path: target } = {}) => {
  const abs = resolveInsideWorkspace(cwd, target);
  if (!abs) return { ok: false };
  const error = await shell.openPath(abs);
  return error ? { ok: false, error } : { ok: true };
});

/**
 * Fuzzy list for the `@` menu. Subsequence matching, so "rdmr" finds
 * "src/renderer/markdown.js". Ranked: prefix hits first, then shorter paths.
 */
ipcMain.handle('fs:listFiles', async (_e, { cwd, query } = {}) => {
  const root = cwd && fs.existsSync(cwd) ? cwd : readPrefs().lastCwd;
  if (!root) return [];
  const files = walkWorkspace(root, 4000);
  const q = String(query || '').toLowerCase().trim();
  if (!q) return files.slice(0, 60);
  const scored = [];
  for (const file of files) {
    const lower = file.toLowerCase();
    let score = 0;
    const baseIdx = lower.lastIndexOf('/');
    const base = lower.slice(baseIdx + 1);
    if (lower.startsWith(q)) score = 100;
    else if (base.startsWith(q)) score = 80;
    else if (lower.includes(q)) score = 60 - Math.min(20, lower.length / 20);
    else {
      // subsequence
      let i = 0;
      for (const ch of lower) {
        if (ch === q[i]) i += 1;
        if (i === q.length) break;
      }
      if (i !== q.length) continue;
      score = 30 - Math.min(20, lower.length / 20);
    }
    scored.push({ file, score: score - file.split('/').length });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 40).map((s) => s.file);
});

/* ------------------------------ ask_user ------------------------------ */

ipcMain.handle('question:respond', async (_e, { id, answer } = {}) => {
  const pending = questions.get(id);
  if (!pending) return { ok: false };
  questions.delete(id);
  pending.resolve(answer === undefined || answer === null ? null : String(answer));
  // The user may have done the step by hand, moved the page, or closed it. Any
  // ref the agent holds is now a guess, so it must look again before acting.
  const claim = browserClaims.get();
  if (claim) {
    bridge.clearSnapshotTable(claim.tabId);
    send('browser:resume', { tabId: claim.tabId });
  }
  return { ok: true };
});

/** Open an ad's click-through. Only https, and never inside the app window. */
ipcMain.handle('ads:open', async (_e, url) => {
  const u = String(url || '');
  if (!/^https:\/\//i.test(u)) return { ok: false, error: 'Only https links are opened.' };
  try {
    await shell.openExternal(u);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/**
 * Rotate the sponsored banner.
 *
 * Auto rotation only happens while the window is focused and no turn is
 * running, and at most once a minute. Manual clicks get a short cooldown
 * instead. Every rotation asks the backend for a fresh ad and reports the
 * impression, because that is what displaying a new creative means.
 */
ipcMain.handle('ads:rotate', async (_e, { tabId, auto = false } = {}) => {
  const tab = tabs.get(tabId || activeTabId);
  if (!tab || typeof tab.handle.rotateAd !== 'function') return { ok: false, reason: 'no-tab' };
  // The ads backend is a FreePi endpoint; asking it while a Coarena model is
  // active would fetch a banner that can never be attached to a turn.
  if (!tabIsFreePi(tab)) return { ok: false, reason: 'provider' };
  if (tab.busy) return { ok: false, reason: 'busy' };
  if (!win || win.isDestroyed() || !win.isFocused() || win.isMinimized()) {
    return { ok: false, reason: 'not-focused' };
  }
  if (tab.adRotating) return { ok: false, reason: 'rotating' };

  const now = Date.now();
  if (auto && tab.adAt && now - tab.adAt < 58_000) return { ok: false, reason: 'fresh' };
  if (!auto && tab.adManualAt && now - tab.adManualAt < 8_000) {
    return { ok: false, reason: 'cooldown' };
  }

  tab.adRotating = true;
  if (!auto) tab.adManualAt = now;
  try {
    const shown = await tab.handle.rotateAd();
    return { ok: Boolean(shown) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    tab.adRotating = false;
  }
});

/*
 * USD → THB for the cost line. Asked for only when a paid figure is about to be
 * shown, and memoised in fx-rate.js for six hours so opening the panel does not
 * turn into a heartbeat to a currency service.
 */
ipcMain.handle('fx:usdThb', async () => fetchUsdThb());

ipcMain.handle('usage:fetch', async () => {
  // Same endpoint free-pi-cli's own usage tool calls: GET /me/stats
  try {
    const baseUrl = bridge.resolveBaseUrl();
    const jwt = await fs.promises
      .readFile(bridge.getCredentialsPath(), 'utf8')
      .then((r) => JSON.parse(r).token);
    const res = await fetch(`${baseUrl}/me/stats`, {
      headers: { authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/**
 * Who this machine is signed in as. Each computer keeps its own token in
 * ~/.free-pi/agent/credentials.json, so handing the folder to someone else
 * never shares an allowance — they sign in and use their own.
 */
ipcMain.handle('account:status', async () => {
  const credPath = bridge.getCredentialsPath();
  let jwt = '';
  try {
    jwt = JSON.parse(await fs.promises.readFile(credPath, 'utf8')).token || '';
  } catch {}

  const result = {
    credentialsPath: credPath,
    credentialsDir: path.dirname(credPath),
    home: os.homedir(),
    hasToken: Boolean(jwt),
    guest: null,
    lane: null,
    credits: null,
    email: null,
    error: null,
  };

  if (!jwt) return result;

  try {
    const baseUrl = bridge.resolveBaseUrl();
    const res = await fetch(`${baseUrl}/me/stats`, {
      headers: { authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      result.error = `HTTP ${res.status}`;
      return result;
    }
    const data = await res.json();
    result.guest = Boolean(data.guest);
    result.lane = data.lane ?? null;
    result.credits = data.remaining_credits_today ?? null;
    result.email = data.email ?? data.user?.email ?? null;
    result.allowance = data.allowance_credits ?? null;
    result.bonus = data.bonus_wallet_credits ?? data.premium_credits ?? null;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
});

/**
 * Free a stale session on the free-pi account — the same endpoint the CLI's
 * /close-other-session calls. Lets a user escape `concurrent_session` (the
 * account allows 4 running sessions; closed tabs still count server-side).
 */
ipcMain.handle('account:resetSession', async () =>
  resetFreePiSession({
    credentialsPath: bridge.getCredentialsPath(),
    baseUrl: bridge.resolveBaseUrl(),
  })
);

/** Open a terminal so the user can run free-pi-cli's own sign-in flow. */
ipcMain.handle('account:signIn', async () => {
  // Already signed in? Refresh instead of opening a second terminal window.
  try {
    const jwt = JSON.parse(
      await fs.promises.readFile(bridge.getCredentialsPath(), 'utf8')
    ).token;
    if (jwt) {
      const res = await fetch(`${bridge.resolveBaseUrl()}/me`, {
        headers: { authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return { ok: true, alreadySignedIn: true };
    }
  } catch {}

  try {
    const cli = await findFreePiCli();
    if (!cli) {
      return {
        ok: false,
        error:
          'free-pi-cli is not installed. Run: npm i -g free-pi-cli',
      };
    }
    // Launch in a real terminal: the CLI needs a TTY for its login flow.
    // Run it with node explicitly. Handing a .js file to `start` lets Windows
    // open it with Windows Script Host, which fails with "Invalid character".
    // `/c` (not `/k`) closes the console as soon as the CLI exits.
    const cmd =
      process.platform === 'win32'
        ? `start "free-pi login" cmd /c node "${cli}"`
        : `x-terminal-emulator -e node ${cli} || gnome-terminal -- node ${cli}`;
    require('node:child_process').exec(cmd, { windowsHide: false }, () => {});
    return { ok: true, cli };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/** Delete this machine's stored token so the next start signs in fresh. */
ipcMain.handle('account:signOut', async () => {
  const credPath = bridge.getCredentialsPath();
  try {
    await fs.promises.rm(credPath, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

/* --------------------------- browser sign-in ---------------------------
 * Same GitHub connect flow free-pi-cli uses, but rendered inside the window:
 *   POST /auth/connect/start -> confirm code + browser link
 *   POST /auth/connect/poll  -> pending / token
 * The token is saved straight to credentials.json and never sent to the
 * renderer. If this flow fails, "Use terminal instead" still works.
 */

const AUTH_TIMEOUT_MS = 15000;
const AUTH_CONSENT_VERSION = '4';
let loginFlow = null;

function sendAuthStatus(payload) {
  send('auth:status', payload);
}

function clientReport() {
  try {
    const o = Intl.DateTimeFormat().resolvedOptions();
    return {
      ...(o.timeZone ? { timezone: o.timeZone } : {}),
      ...(o.locale ? { locale: o.locale } : {}),
    };
  } catch {
    return {};
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authFailure(message, code = null) {
  if (loginFlow) loginFlow = null;
  sendAuthStatus({ status: 'error', message, code });
}

async function pollLoginFlow(flow) {
  const baseUrl = bridge.resolveBaseUrl();
  const credentialsPath = bridge.getCredentialsPath();
  let waitSeconds = flow.interval;
  let networkFailures = 0;

  while (!flow.cancelled && Date.now() < flow.expiresAt) {
    if (loginFlow !== flow) return;
    let res;
    try {
      res = await fetch(`${baseUrl}/auth/connect/poll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: flow.sessionId,
          poll_secret: flow.pollSecret,
          ...clientReport(),
        }),
        signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      });
      networkFailures = 0;
    } catch {
      networkFailures += 1;
      if (networkFailures >= 6) {
        authFailure('Could not reach free-pi. Check your connection.', 'network');
        return;
      }
      await sleep(Math.max(waitSeconds, 5) * 1000);
      continue;
    }

    if (loginFlow !== flow) return;
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 403 && body.code === 'denied') {
        authFailure('Sign-in was denied in the browser.', 'denied');
        return;
      }
      if (res.status === 410 && body.code === 'expired') {
        authFailure('The sign-in code expired. Try again.', 'expired');
        return;
      }
      if (body.code === 'consent_required') {
        authFailure('free-pi needs consent. Use “Use terminal” once to finish signing in.', 'consent');
        return;
      }
      authFailure(body.message || `Sign-in failed (HTTP ${res.status}).`);
      return;
    }

    if (typeof body.token === 'string' && body.token) {
      try {
        await bridge.saveJwt(credentialsPath, body.token);
      } catch {
        authFailure('Signed in, but the token could not be saved.', 'save');
        return;
      }
      if (loginFlow === flow) loginFlow = null;
      sendAuthStatus({ status: 'done' });
      return;
    }

    if (body.code === 'consent_required') {
      authFailure('free-pi needs consent. Use “Use terminal” once to finish signing in.', 'consent');
      return;
    }

    if (body.status === 'pending') {
      sendAuthStatus({ status: 'pending', opened: body.opened === true });
      if (typeof body.retry_after === 'number' && body.retry_after > waitSeconds) {
        waitSeconds = body.retry_after;
      }
    }
    await sleep(waitSeconds * 1000);
  }

  if (!flow.cancelled && loginFlow === flow) {
    authFailure('The sign-in code expired. Try again.', 'expired');
  }
}

ipcMain.handle('auth:start', async () => {
  // Already signed in? Never start a second login.
  try {
    const jwt = JSON.parse(await fs.promises.readFile(bridge.getCredentialsPath(), 'utf8')).token;
    if (jwt) {
      const res = await fetch(`${bridge.resolveBaseUrl()}/me`, {
        headers: { authorization: `Bearer ${jwt}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) return { ok: true, alreadySignedIn: true };
    }
  } catch {}

  if (loginFlow) {
    loginFlow.cancelled = true;
    loginFlow = null;
  }

  let body;
  try {
    const res = await fetch(`${bridge.resolveBaseUrl()}/auth/connect/start`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-freepi-signin-exp': '1',
      },
      body: JSON.stringify({
        consent_version: AUTH_CONSENT_VERSION,
        client: { os: process.platform, cli_version: bridge.CLIENT_VERSION },
      }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
    body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.message || `Sign-in failed (HTTP ${res.status}).` };
    }
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach free-pi: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let connectUrl;
  try {
    connectUrl = new URL(String(body.connect_url || ''));
  } catch {
    return { ok: false, error: 'The sign-in service returned an invalid link.' };
  }
  if (connectUrl.protocol !== 'https:' || !body.session_id || !body.poll_secret || !body.confirm_code) {
    return { ok: false, error: 'The sign-in service returned an incomplete response.' };
  }

  loginFlow = {
    sessionId: String(body.session_id),
    pollSecret: String(body.poll_secret),
    confirmCode: String(body.confirm_code).slice(0, 32),
    connectUrl: connectUrl.toString(),
    interval: Math.max(2, Math.min(30, Number(body.interval) || 2)),
    expiresAt: Date.now() + Math.max(60, Math.min(1800, Number(body.expires_in) || 600)) * 1000,
    cancelled: false,
  };

  let browserOpened = false;
  try {
    await shell.openExternal(loginFlow.connectUrl);
    browserOpened = true;
  } catch {}

  pollLoginFlow(loginFlow).catch(() => {});

  return {
    ok: true,
    confirmCode: loginFlow.confirmCode,
    expiresIn: Math.max(0, Math.round((loginFlow.expiresAt - Date.now()) / 1000)),
    browserOpened,
  };
});

ipcMain.handle('auth:openBrowser', async () => {
  if (!loginFlow) return { ok: false, error: 'No sign-in is in progress.' };
  try {
    await shell.openExternal(loginFlow.connectUrl);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('auth:copyCode', async () => {
  if (!loginFlow) return { ok: false };
  clipboard.writeText(loginFlow.confirmCode);
  return { ok: true };
});

/** Open a link from a reply in the user's browser. http(s) and mailto only. */
/**
 * Read the bundled `sponsor.json`, or null if anything about it is wrong.
 *
 * A broken file must cost a link, never the sidebar: every failure path here
 * collapses to "nothing" so the window starts looking exactly as it did before
 * the sponsor existed.
 */
function readBundledSponsor() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(SPONSOR_PATH, 'utf8'));
  } catch {
    return null;
  }
  return normalizeSponsor(raw) || null;
}

/**
 * The bundled sponsor, expressed in the feed's shape.
 *
 * Only used when there is no cache and no network: a fresh install offline still
 * shows the sponsor that shipped with the build, exactly as before the feed
 * existed. It has no creative, so the strip is text-only — which is what a build
 * from before this feature looked like anyway.
 */
function bundledPayload() {
  const bundled = readBundledSponsor();
  if (!bundled) return null;
  return {
    enabled: true,
    rotateSeconds: 0,
    updated: '',
    slots: [
      {
        id: bundled.id,
        url: bundled.url,
        text: bundled.text,
        media: null,
        clicks: sponsorClicks(bundled.id),
      },
    ],
  };
}

function sponsorClicks(id) {
  const all = readPrefs().sponsorClicks;
  if (!all || typeof all !== 'object') return 0;
  const n = Number(all[id]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

ipcMain.handle('sponsor:get', () => {
  const payload = sponsorPayload();
  if (payload.enabled) return payload;
  return bundledPayload() || { enabled: false };
});

/**
 * The bytes for one slot, fetched on demand.
 *
 * A data URL rather than a file path keeps the renderer's CSP at `img-src 'self'
 * data:` and keeps the app from ever pointing a media element at a remote host —
 * which would leak the user's IP to whoever serves the banner, on every start.
 */
ipcMain.handle('sponsor:media', async (_e, rawId) => {
  const slot = findSlot(rawId);
  if (!slot || !sponsorState.base) return { ok: false, reason: 'unknown-slot' };
  try {
    const out = await sponsorFeed.ensureMedia({ dir: SPONSOR_CACHE_DIR, base: sponsorState.base, slot });
    if (!out.ok) return { ok: false, reason: out.reason };
    return { ok: true, type: out.type, url: out.url, poster: out.poster || '' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
});

/**
 * Count the click, then open the link.
 *
 * The count is written first on purpose: it is the number a sponsor is paying
 * for, and a browser that refuses to open does not un-click anything. A failed
 * prefs write is swallowed — the link must still work.
 *
 * The URL opened is always the one that was validated on read of the feed, never
 * anything the renderer sends, so a compromised or buggy window cannot turn this
 * into "open any URL".
 */
ipcMain.handle('sponsor:click', async (_e, rawId) => {
  const slot =
    findSlot(rawId) || (() => {
      const bundled = readBundledSponsor();
      return bundled && bundled.id === String(rawId || '') ? bundled : null;
    })();
  if (!slot) return { ok: false };

  const clicks = sponsorClicks(slot.id) + 1;
  try {
    const all = readPrefs().sponsorClicks;
    writePrefs({ sponsorClicks: { ...(all && typeof all === 'object' ? all : {}), [slot.id]: clicks } });
  } catch {}

  try {
    await shell.openExternal(slot.url);
  } catch {
    return { ok: false, clicks };
  }
  return { ok: true, clicks };
});

ipcMain.handle('app:openExternal', async (_e, url) => {
  const u = String(url || '');
  if (!/^(https?:\/\/|mailto:)/i.test(u)) return { ok: false };
  try {
    await shell.openExternal(u);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

/*
 * The licence notice that travels with the installer.
 *
 * Two bundled packages are MIT, and MIT requires its notice to be reachable from
 * the shipped program — a link to the project page is not the notice. Packaged, the
 * file sits in resources; from source it is one level above `app/`.
 */
ipcMain.handle('app:openNotices', async () => openShippedDoc('THIRD-PARTY-NOTICES.md'));

/*
 * The terms, privacy notice, security policy and licence itself.
 *
 * These are not decoration: the licence says use is governed by TERMS.md and
 * PRIVACY.md, so a person who installs the program has to be able to read them
 * without visiting a repository. They ship next to the app and open with the
 * system viewer. The list is an allowlist — the renderer names a document, never
 * a path.
 */
const SHIPPED_DOCS = new Set(['TERMS.md', 'PRIVACY.md', 'SECURITY.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md']);

ipcMain.handle('app:openDoc', async (_e, name) => {
  const doc = String(name || '');
  if (!SHIPPED_DOCS.has(doc)) return { ok: false, reason: 'unknown-document' };
  return openShippedDoc(doc);
});

async function openShippedDoc(name) {
  const file = app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(__dirname, '..', '..', name);
  try {
    if (!fs.existsSync(file)) return { ok: false, reason: 'missing' };
    const err = await shell.openPath(file);
    return { ok: !err, reason: err || '' };
  } catch (err) {
    return { ok: false, reason: String(err && err.message) };
  }
}

ipcMain.handle('app:copyText', async (_e, text) => {
  const value = typeof text === 'string' ? text.slice(0, 2_000_000) : '';
  if (!value) return { ok: false };
  clipboard.writeText(value);
  return { ok: true };
});

ipcMain.handle('auth:cancel', async () => {
  if (loginFlow) {
    loginFlow.cancelled = true;
    loginFlow = null;
  }
  return { ok: true };
});

ipcMain.handle('approval:respond', async (_e, { id, allow } = {}) => {
  const pending = approvals.get(id);
  if (!pending) return { ok: false };
  approvals.delete(id);

  // Answering the dialog with "allow" is a one-off: it must not quietly turn
  // into "never ask again". Only the switch in the sidebar does that.
  pending.resolve(Boolean(allow));
  return { ok: true, policy: getApprovalPolicy() };
});

/** Let the sidebar reflect which answer is in force. */
function broadcastApprovalMode() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('approval:mode', { policy: getApprovalPolicy() });
}

/** The switch itself: 'ask' | 'allow' | 'deny', remembered across restarts. */
ipcMain.handle('approval:setMode', async (_e, { policy } = {}) => {
  setApprovalPolicy(policy);
  broadcastApprovalMode();
  return { ok: true, policy: getApprovalPolicy() };
});

ipcMain.handle('approval:getMode', async () => ({ policy: getApprovalPolicy() }));

/**
 * Notice a tab that says it is working when it is not.
 *
 * The "กำลังทำงาน" pill and the held queue both wait for one message:
 * `agent:settled`. If that message never arrives — a listener that threw, a run
 * that ended through a path this process did not expect, a window that was
 * reloading at that moment — the pill stays on and the messages the user put in
 * the queue never leave it. The user cannot get out of that state either: Stop
 * has nothing to stop.
 *
 * The session object is the only authority on whether a run is still going, so
 * this asks it instead of trusting the flag. Two consecutive idle readings are
 * required, so a run that is just starting up is never cut short.
 */
const idleStreak = new Map();
setInterval(() => {
  for (const [tabId, tab] of tabs) {
    if (!tab.busy) {
      idleStreak.delete(tabId);
      continue;
    }
    const session = tab.handle?.session;
    if (!session) continue;
    if (!safeCall(() => session.isIdle, false)) {
      idleStreak.delete(tabId);
      continue;
    }
    const streak = (idleStreak.get(tabId) || 0) + 1;
    idleStreak.set(tabId, streak);
    if (streak < 2) continue;
    idleStreak.delete(tabId);
    tab.busy = false;
    logCrash('busy-heal', `idle session but a busy flag on ${tabId}`);
    sendTab(tabId, 'agent:busy', { busy: false });
    // `healed` keeps the window from announcing a finish that has already been
    // shown; what it must do is release the queue.
    sendTab(tabId, 'agent:settled', { aborted: false, healed: true });
  }
}, 4000).unref?.();

function persistTabs() {
  writePrefs({
    // Only conversations that exist on disk are worth restoring. An empty tab
    // that was never used has no file yet; restoring it would create a blank
    // session (and a server session) on every launch.
    openTabs: [...tabs.entries()]
      .map(([tabId, tab]) => {
        const file = tab.handle.session.sessionFile;
        if (!file || !fs.existsSync(file)) return null;
        return { tabId, cwd: tab.cwd, sessionFile: file };
      })
      .filter(Boolean),
  });
}

/* ------------------------------ updates ------------------------------ */

/**
 * Auto-update over GitHub Releases.
 *
 * The source repo is private, so installers are published to the public
 * `NTAPI-releases` repo (see `build.publish` in package.json). Every step is
 * user-driven: nothing is downloaded until they press the button in Settings.
 * A dev run (`npm start`) is not packaged, so electron-updater is skipped and
 * the UI says so instead of throwing.
 */
/** Where the splash leaves its pid, so the updated app can close it. */
function splashPidFile() {
  return path.join(DATA_ROOT, 'update-splash.pid');
}

/**
 * Start the separate "updating" process. It must not inherit the app's single
 * instance lock, slashes or sandbox: it is its own Electron app, pointed at the
 * same data folder so it can read the chosen language.
 */
function openUpdateSplash() {
  try {
    const { spawn } = require('node:child_process');
    // NTAPI_DATA_DIR is passed explicitly: the app can resolve its data folder
    // to a legacy path while the splash defaults to C:\NTAPI. If the two
    // disagreed, the pid file would be written where the new build does not
    // look, and the splash would sit on screen with nothing able to close it.
    const child = spawn(process.execPath, ['--ntapi-splash'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NTAPI_DATA_DIR: DATA_ROOT },
    });
    child.unref();
  } catch (err) {
    console.log('[update] splash failed to start:', err?.message || err);
  }
}

/**
 * The updated app closes the splash the moment it is running. Also covers the
 * case where the install was cancelled: the pid file is stale, the kill fails,
 * and the splash's own six-minute timeout takes care of the window.
 */
function closeLeftoverSplash() {
  try {
    const pid = Number(fs.readFileSync(splashPidFile(), 'utf8').trim());
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) {
      try {
        process.kill(pid);
      } catch {}
    }
  } catch {
    return;
  }
  try {
    fs.unlinkSync(splashPidFile());
  } catch {}
}

let updater = null;
let updateState = {
  status: 'idle',
  current: app.getVersion(),
  version: null,
  progress: 0,
  error: null,
};

function sendUpdateState() {
  send('update:status', { ...updateState, packaged: app.isPackaged, current: app.getVersion() });
}

function setUpdates() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;

  const set = (patch) => {
    updateState = { ...updateState, ...patch };
    sendUpdateState();
  };

  updater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  updater.on('update-available', (info) =>
    set({ status: 'available', version: info?.version || null, error: null })
  );
  updater.on('update-not-available', (info) =>
    set({ status: 'latest', version: info?.version || null, error: null })
  );
  updater.on('error', (err) => set({ status: 'error', error: String(err?.message || err) }));
  updater.on('download-progress', (p) =>
    set({ status: 'downloading', progress: Math.round(p?.percent || 0) })
  );
  updater.on('update-downloaded', (info) =>
    set({ status: 'ready', version: info?.version || null, progress: 100 })
  );
}

ipcMain.handle('update:state', () => ({
  ...updateState,
  packaged: app.isPackaged,
  current: app.getVersion(),
}));

ipcMain.handle('update:check', async () => {
  if (!app.isPackaged || !updater) {
    return { ok: false, error: 'not-packaged', packaged: app.isPackaged, current: app.getVersion() };
  }
  try {
    await updater.checkForUpdates();
    return { ok: true, ...updateState };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('update:download', async () => {
  if (!updater) return { ok: false, error: 'not-packaged' };
  try {
    await updater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('update:install', () => {
  if (!updater) return { ok: false, error: 'not-packaged' };
  // Windows cannot replace a running .exe, so the silently-installed update
  // runs right after the app quits and `true` relaunches it. Give the renderer
  // a moment first so the "installing" step is visible instead of a sudden
  // close.
  updateState = { ...updateState, status: 'installing', progress: 100, error: null };
  sendUpdateState();
  openUpdateSplash();
  // 4.5 s is long enough to read the overlay; the splash covers the rest. But the
  // splash is a second Electron process and takes a moment to draw, so quitting on
  // a timer alone could quit into empty desktop before it appeared. It writes its
  // pid once its window exists — wait for that, and give up waiting after a while
  // so a splash that never starts cannot block the update.
  const quitAt = Date.now() + 4500;
  const quitWhenCovered = () => {
    const covered = fs.existsSync(splashPidFile());
    const late = Date.now() - quitAt > 6000;
    if (covered || late) {
      updater.quitAndInstall(true, true);
      return;
    }
    setTimeout(quitWhenCovered, 120);
  };
  setTimeout(quitWhenCovered, 4500);
  return { ok: true };
});

/* ---------------------------- presence ---------------------------- */

/**
 * "How many people are using NTAPI right now".
 *
 * The app posts an anonymous, per-launch id to the presence service every 45 s
 * and the service counts the ids it saw in the last 90 s. Nothing else is sent,
 * and the id is thrown away when the app closes. The heartbeat also keeps the
 * free Render instance awake, since it sleeps after 15 minutes without traffic.
 */
const PRESENCE_URL = process.env.NTAPI_PRESENCE_URL || 'https://ntapi-presence.onrender.com';
const PRESENCE_HEARTBEAT_MS = 45_000;
const PRESENCE_TIMEOUT_MS = 60_000; // a sleeping free instance needs ~50 s to wake
const PRESENCE_SESSION_ID = randomUUID();

let presenceTimer = null;
let presenceBusy = false;
let presenceState = null;

async function presenceBeat() {
  if (presenceBusy) return presenceState;
  presenceBusy = true;
  try {
    const res = await fetch(`${PRESENCE_URL}/beat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: PRESENCE_SESSION_ID }),
      signal: AbortSignal.timeout(PRESENCE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    presenceState = {
      online: Number(data.online) || 0,
      total: Number(data.total) || 0,
      at: Date.now(),
    };
  } catch (err) {
    // Offline, or the service is asleep/down: keep the last known number
    // instead of blanking the badge, and retry on the next tick.
    console.warn('[presence] heartbeat failed:', err instanceof Error ? err.message : err);
  } finally {
    presenceBusy = false;
  }
  if (win && !win.isDestroyed()) win.webContents.send('presence:state', presenceState);
  return presenceState;
}

function startPresence() {
  if (presenceTimer) return;
  presenceBeat();
  presenceTimer = setInterval(presenceBeat, PRESENCE_HEARTBEAT_MS);
  if (presenceTimer.unref) presenceTimer.unref();
}

ipcMain.handle('presence:get', async () => presenceState || (await presenceBeat()));

/* ---------------------------- notifications ---------------------------- */

/**
 * Native Windows toast for a finished session, raised only while the app is in
 * the background. Clicking it brings the window back.
 */
ipcMain.handle('notify:done', (_event, payload = {}) => {
  if (!win || win.isDestroyed() || win.isFocused()) return { ok: false, reason: 'focused' };
  if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const notice = new Notification({
      title: String(payload.title || 'NTAPI'),
      body: String(payload.body || ''),
      // The renderer plays its own chime; a second sound would double up.
      silent: true,
    });
    notice.on('click', () => {
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    notice.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

/* ------------------------------ boot ------------------------------ */

/* ----------------------------- browser IPC ----------------------------- */

/** Where the unpacked extension lives, packaged or not. */
function browserExtensionDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'browser-extension')
    : path.join(__dirname, '..', 'browser-extension');
}

function browserStatus() {
  const { enabled, connected, port, paired } = browserBridge.status();
  return {
    enabled,
    connected,
    port,
    paired,
    installed: fs.existsSync(path.join(browserExtensionDir(), 'manifest.json')),
    claim: browserClaims.get(),
    autopilot: browserAutopilot.state(),
  };
}

ipcMain.handle('browser:status', async () => browserStatus());

ipcMain.handle('browser:toggle', async (_e, { enabled } = {}) => {
  const on = Boolean(enabled);
  writePrefs({ browserBridge: { ...(readPrefs().browserBridge || {}), enabled: on } });
  if (on) {
    try {
      await browserBridge.start();
    } catch (err) {
      return { ...browserStatus(), error: `Could not start the bridge: ${err.message}` };
    }
  } else {
    browserAutopilot.shouldExpire({ type: 'featureOff' });
    releaseBrowserTab('featureOff');
    await browserBridge.call('detachAll', {}, { timeoutMs: 5000 }).catch(() => {});
    await browserBridge.stop();
  }
  return browserStatus();
});

ipcMain.handle('browser:installInfo', async () => ({
  folder: browserExtensionDir(),
  chromeUrl: CHROME_EXTENSIONS_URL,
  code: ensureBrowserToken(),
}));

ipcMain.handle('browser:openFolder', async () => {
  const dir = browserExtensionDir();
  const error = await shell.openPath(dir);
  return { ok: !error, error: error || null };
});

ipcMain.handle('browser:watch', async () => {
  try {
    const claim = browserClaims.get();
    // "Show the tab" means the tab the agent is working in, whoever owns it.
    if (claim) await browserBridge.call('tabs-real', { focus: true, tab: claim.tabId }, { timeoutMs: 8000 });
    else await browserBridge.call('tabs', { focus: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
});

/** Every tab the browser has, so the user can pick one to hand over. */
ipcMain.handle('browser:tabs', async () => {
  try {
    const result = await browserBridge.call('tabs-real', {}, { timeoutMs: 8000 });
    return { ok: true, tabs: result.tabs || [], windowId: result.windowId };
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
});

ipcMain.handle('browser:claim', async (_e, { tabId } = {}) => {
  let listed = null;
  try {
    listed = await browserBridge.call('tabs-real', {}, { timeoutMs: 8000 });
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
  const tab = Array.isArray(listed.tabs) ? listed.tabs.find((t) => t.id === tabId) : null;
  if (!tab) return { ok: false, error: 'That tab is not open any more.' };
  return claimBrowserTab({ tabId: tab.id, url: tab.url, title: tab.title });
});

ipcMain.handle('browser:release', async () => releaseBrowserTab('user'));

ipcMain.handle('browser:autopilot', async (_e, { on } = {}) => {
  if (!on) {
    browserAutopilot.stop('user');
    pushAutopilotState();
    return { ok: true, state: browserAutopilot.state() };
  }
  const claim = browserClaims.get();
  if (!claim) {
    return { ok: false, error: 'Hand a tab over before turning hand-over mode on.', state: browserAutopilot.state() };
  }
  browserAutopilot.grant({ tabId: claim.tabId, domain: claim.domain });
  pushAutopilotState();
  return { ok: true, state: browserAutopilot.state() };
});

app.whenReady().then(async () => {
  // The second copy quits above; make sure it never builds a window or opens
  // the presence port on its way out.
  if (!hasSingleInstanceLock) return;

  // One-time cleanup: rename the old "--C--Users-...--" history folders.
  try {
    await migrateSessionDirs();
  } catch {}

  // Adopt whatever client version the backend currently accepts, so a build cut
  // months ago never pins a machine without free-pi-cli to a number the backend
  // will reject. Failure is silent: the hardcoded floor stays in force.
  resolveClientVersionFloor({ baseUrl: process.env.FREEPI_BASE_URL || 'https://api.freepi.ai' }).catch(() => {});

  /*
   * The window comes before the SDK, and before anything that can be slow.
   *
   * Resolving the SDK is a ~1.5 s synchronous require, and it used to happen
   * first, so the desktop stayed empty for all of it. The window paints its own
   * shell while that require runs; the renderer's boot call, which needs the
   * SDK for the chat list, queues behind it and answers a moment later.
   *
   * The update splash left by the old build stays up until this window has
   * actually painted: closing it earlier left a stretch of empty desktop that
   * looked like the app had failed to come back.
   */
  createWindow();

  try {
    sdk = resolveSdk();
  } catch (err) {
    dialog.showErrorBox('pi SDK not found', err.message);
    app.quit();
    return;
  }

  /*
   * The sponsor strip draws from cache on the first frame, so the refresh is
   * deliberately after `createWindow()` and not awaited: a slow CDN must never
   * add a second to the window appearing.
   *
   * The startup refresh is forced. The TTL exists so a laptop opened five times a
   * day makes one request, but applied to *startup* it meant a sponsor published
   * this morning stayed invisible until the cache aged out — six hours of "I
   * uploaded it and nothing happened". The feed is under a kilobyte on a host
   * with no rate limit for this traffic, so boot always revalidates and the TTL
   * is left to govern only the timer below. A change is pushed to the window
   * (`sponsor:changed`), because by then it has already drawn the cached strip.
   */
  try {
    primeSponsorCache();
  } catch {}
  registerSponsorMedia();
  refreshSponsorFeed({ force: true }).catch(() => {});
  // While the app is left open, the feed is revalidated every 30 seconds (one
  // 304 when nothing changed) so a sponsor published in NTAPI ADS appears
  // without a restart. One unrefed timer, so it can never hold the process
  // alive on quit.
  sponsorRefreshTimer = setInterval(() => {
    refreshSponsorFeed().catch(() => {});
  }, sponsorFeed.REVALIDATE_MS);
  if (sponsorRefreshTimer.unref) sponsorRefreshTimer.unref();

  // Coming back to the window is the most likely moment to be looking at the
  // strip, so it also triggers a check — the burst floor in the refresh itself
  // keeps a tab-switching loop from turning into a request loop.
  app.on('browser-window-focus', () => {
    refreshSponsorFeed().catch(() => {});
  });

  if (winUiReady) {
    winUiReady.then(() => closeLeftoverSplash()).catch(() => closeLeftoverSplash());
  } else {
    closeLeftoverSplash();
  }
  setUpdates();
  startPresence();

  // Say once, after an update, that the version moved — the app relaunches
  // itself and otherwise looks exactly like it did before.
  const previousVersion = readPrefs().lastVersion;
  const currentVersion = app.getVersion();
  if (previousVersion && previousVersion !== currentVersion) {
    send('app:updated', { from: previousVersion, to: currentVersion });
  }
  writePrefs({ lastVersion: currentVersion });

  // Browser control is opt-in; only listen when the user left the chip on.
  if (readPrefs().browserBridge && readPrefs().browserBridge.enabled) {
    browserBridge.start().catch((err) => console.log('[browser] start failed:', err.message));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (sponsorRefreshTimer) clearInterval(sponsorRefreshTimer);
  for (const tab of tabs.values()) {
    try {
      tab.handle.dispose();
    } catch {}
  }
  tabs.clear();
  if (process.platform !== 'darwin') app.quit();
});
