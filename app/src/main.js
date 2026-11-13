'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const bridge = require('./freepi-bridge');
const { diffLines } = require('./diff');
const { sessionDirName } = require('./session-paths');
const { friendlyProviderError } = require('./provider-errors');

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
  // Never hardcode a user path: this app is meant to run on other machines too.
  const candidates = [process.env.FREEPI_SDK_PATH].filter(Boolean);

  for (const base of candidates) {
    try {
      return require(base);
    } catch {}
  }

  const npxRoot = path.join(app.getPath('home'), 'AppData', 'Local', 'npm-cache', '_npx');
  try {
    for (const dir of fs.readdirSync(npxRoot)) {
      const p = path.join(npxRoot, dir, 'node_modules', '@earendil-works', 'pi-coding-agent');
      if (fs.existsSync(p)) {
        try {
          return require(p);
        } catch {}
      }
    }
  } catch {}
  throw new Error(
    'Could not find @earendil-works/pi-coding-agent. Run `npx free-pi-cli@latest` once in a terminal, then reopen this app.'
  );
}

let sdk;
let win = null;

/**
 * App data root: one obvious folder people can find, back up, or copy to
 * another machine. `C:\Freepiai` by default; override with FREEPI_DATA_DIR.
 *
 * Deliberately NOT inside the workspace, so switching projects never strands
 * settings, and NOT inside `~/.free-pi`, because that folder belongs to the CLI
 * and to every other agent on the machine.
 *
 * If the drive refuses to be written (UAC, read-only, missing drive letter) we
 * quietly fall back to the standard per-user location so the app still opens.
 */
function resolveDataRoot() {
  const candidates = [
    process.env.FREEPI_DATA_DIR,
    'C:\\Freepiai',
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
 * Where the agent's generated files land. Users can repoint each of these from
 * Settings; relative values resolve against the current workspace.
 *
 * Defaults live under the app data root so everything this app writes sits in
 * one place, even when the user opens a new workspace.
 */
const FOLDER_DEFAULTS = {
  images: 'images',
  attachments: '.freepi-attachments',
  downloads: 'downloads',
};

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
  owner: 'Chanathip Cheumklang',
  subtitle: 'DeepSeek v4.1 Flash',
  brand: 'FreePi.AI',
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
 * Per-tool "always allow" grants, held for the lifetime of the process only.
 * Deliberately not written to prefs: a blank cheque that survives a restart is
 * how people end up with an agent deleting something they forgot about.
 * `allowedTools` holds exact tool names (bash / edit / write).
 */
const allowedTools = new Set();
/** When true, every tool is approved until the app restarts or the user opts out. */
let allowEverything = false;

function askApproval(tabId, { toolName, args }) {
  if (allowEverything || allowedTools.has(toolName)) {
    return Promise.resolve(true);
  }
  approvalSeq += 1;
  const id = `approval-${approvalSeq}`;
  return new Promise((resolve) => {
    approvals.set(id, { resolve, tabId, toolName });
    sendTab(tabId, 'approval:request', { id, toolName, args, allowEverything });
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

async function listSessions(cwd) {
  const dir = sessionDirFor(cwd);
  try {
    const infos = await sdk.SessionManager.list(path.resolve(cwd), dir);
    return infos
      .slice()
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .map((i) => ({
        id: i.id,
        path: i.path,
        modified: i.modified,
        firstMessage: (i.firstMessage || '').slice(0, 120),
        messageCount: i.messageCount ?? null,
      }));
  } catch {
    return [];
  }
}

/**
 * One failure can surface twice (the assistant message and the rejected
 * prompt), so report each distinct failure once per few seconds.
 */
function reportTabError(tabId, raw) {
  const tab = tabs.get(tabId);
  const { text, code } = friendlyProviderError(raw);
  const key = code || text;
  const now = Date.now();
  if (tab?.lastError && tab.lastError.key === key && now - tab.lastError.at < 10000) return;
  if (tab) tab.lastError = { key, at: now };
  sendTab(tabId, 'agent:error', { text, code });
}

function messagesForUi(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m || m.role === 'system') continue;

    if (m.role === 'user') {
      const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
      const text = parts.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const images = parts
        .filter((c) => c.type === 'image')
        .map((c) => ({ dataUri: `data:${c.mimeType};base64,${c.data}`, mimeType: c.mimeType }));
      if (text || images.length) out.push({ kind: 'user', text, images, ts: m.timestamp });
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
        out.push({ kind: 'error', text: friendlyProviderError(m.errorMessage).text, ts: m.timestamp });
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
  return {
    ...tabSummary(tabId),
    models: tab.handle.modelList,
    messages: messagesForUi(tab.handle.session.messages),
  };
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

      case 'agent_settled':
        tab.busy = false;
        sendTab(tabId, 'agent:busy', { busy: false });
        sendTab(tabId, 'agent:settled', { aborted: Boolean(event.aborted) });
        break;

      case 'message_update': {
        const e = event.assistantMessageEvent;
        if (!e) break;
        if (e.type === 'text_delta') {
          sendTab(tabId, 'agent:delta', { channel: 'text', delta: e.delta });
        } else if (e.type === 'thinking_delta') {
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
          try {
            editSnapshots.set(event.toolCallId, {
              path: snapPath,
              before: await fs.promises.readFile(snapPath, 'utf8'),
            });
          } catch {
            // New file — remember that it did not exist.
            editSnapshots.set(event.toolCallId, { path: snapPath, before: '' });
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
          partial: event.partialResult,
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

        sendTab(tabId, 'agent:toolEnd', {
          id: event.toolCallId,
          name: event.toolName,
          result: event.result,
          isError: Boolean(event.isError),
          durationMs: event.durationMs,
          diff,
        });
        break;
      }

      case 'message_end': {
        const m = event.message;
        if (m?.role === 'assistant' && m.stopReason === 'error') {
          reportTabError(tabId, m.errorMessage);
        }
        break;
      }

      case 'auto_retry_start':
        sendTab(tabId, 'agent:notice', {
          text: `Retrying (${event.attempt}/${event.maxAttempts}): ${event.errorMessage || ''}`,
        });
        break;

      case 'compaction_start':
        sendTab(tabId, 'agent:notice', { text: 'Compacting conversation…' });
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
  });
  subscribeTab(tabId);

  // A resumed tab whose session has no name yet gets a readable one.
  if (!handle.session.sessionName) {
    tabs.get(tabId).fallbackName = deriveName(handle.session.messages, cwd);
  }

  return tabState(tabId);
}

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
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0f1115',
    title: 'Chanathip Cheumklang | DeepSeek v4.1 Flash',
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
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
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

ipcMain.handle('fs:pickImages', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images and documents', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'md', 'txt', 'json', 'js', 'ts', 'py', 'csv', 'log'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  const out = [];
  for (const file of res.filePaths) {
    const mime = mimeFor(file);
    if (!mime.startsWith('image/')) {
      // Non-image files are passed by path; the agent reads them itself.
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
function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  return 'image/png';
}

ipcMain.handle('app:boot', async () => {
  migrateLegacyPrefs();
  const prefs = readPrefs();
  const lastCwd = prefs.lastCwd && fs.existsSync(prefs.lastCwd) ? prefs.lastCwd : null;
  return {
    lastCwd,
    sessions: lastCwd ? await listSessions(lastCwd) : [],
    openTabs: Array.isArray(prefs.openTabs) ? prefs.openTabs : [],
    lang: prefs.lang === 'th' ? 'th' : 'en',
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
  if (typeof patch.adsAutoRotate === 'boolean') allowed.adsAutoRotate = patch.adsAutoRotate;
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
  if (Object.keys(allowed).length) writePrefs(allowed);
  return readPrefs();
});

/** Everything the Settings panel needs to render itself. */
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

ipcMain.on('win:minimize', () => win?.minimize());
ipcMain.on('win:toggleMaximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win:close', () => win?.close());
ipcMain.handle('win:state', () => winState());

ipcMain.handle('tab:open', async (_e, opts = {}) => {
  const tabId = opts.tabId && !tabs.has(opts.tabId) ? opts.tabId : newTabId();
  const cwd = path.resolve(opts.cwd || readPrefs().lastCwd || process.cwd());
  // Restoring a saved tab must not move the default workspace: only a folder the
  // user picked (or a new tab they opened) updates `lastCwd`.
  if (!opts.restore) writePrefs({ lastCwd: cwd });

  // Restoring must never invent an empty conversation when the saved file is
  // gone; the caller skips that tab instead.
  if (opts.restore && opts.sessionId && !resolveSessionFile(cwd, opts.sessionId)) {
    throw new Error('saved session file not found');
  }

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
  if (tab.ad) {
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
      sendTab(tabId, 'tab:deleted', {});
    }
  }

  try {
    await fs.promises.unlink(target);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  persistTabs();
  return { ok: true, activeTabId };
});

ipcMain.handle('session:rename', async (_e, { tabId, name } = {}) => {
  const { tabId: id, tab } = tabFor(tabId);
  await tab.handle.session.setSessionName(name || null);
  tab.fallbackName = name || null;
  return tabSummary(id);
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
 * Not touched: skills, generated images, downloaded files, other sessions.
 */
ipcMain.handle('session:clear', async (_e, tabId) => {
  const { tab } = tabFor(tabId);
  const cwd = tab.cwd;
  const file = tab.handle.session.sessionFile;
  const attachments = file ? attachmentPathsForSession(file, cwd) : [];

  try {
    await tab.handle.session.abort();
  } catch {}
  try {
    tab.handle.dispose();
  } catch {}
  tabs.delete(tabId);
  if (activeTabId === tabId) activeTabId = tabs.keys().next().value || null;

  let warning = null;
  if (file) {
    const target = path.resolve(file);
    const root = path.resolve(SESSIONS_ROOT);
    if (target.startsWith(root + path.sep) && target.endsWith('.jsonl')) {
      try {
        await fs.promises.unlink(target);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          warning = `Chat closed, but the history file could not be deleted: ${
            err instanceof Error ? err.message : String(err)
          }`;
        }
      }
    } else {
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
    activeTabId = newId;
    persistTabs();
    return {
      ok: true,
      tabId: newId,
      state,
      attachmentsRemoved: attachments.length,
      warning,
    };
  } catch (err) {
    persistTabs();
    return {
      ok: false,
      closed: true,
      warning,
      error: err instanceof Error ? err.message : String(err),
    };
  }
});

ipcMain.handle('prompt:send', async (_e, { tabId, text, images } = {}) => {
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
    parts.push(
      filePaths.map((f) => `[Attached file: ${f}]`).join('\n') +
        '\nThese files are on disk. Use the read, grep or find tools to inspect them as needed.'
    );
  }
  const promptText = parts.join('\n\n');

  const run = tab.handle.session.prompt(promptText);

  run.catch((err) => {
    reportTabError(tabFor(tabId).tabId, err instanceof Error ? err.message : String(err));
    tab.busy = false;
    sendTab(tabFor(tabId).tabId, 'agent:busy', { busy: false });
  });

  return { ok: true };
});

ipcMain.handle('prompt:abort', async (_e, tabId) => {
  const { tabId: id, tab } = tabFor(tabId);
  try {
    await tab.handle.session.abort();
  } catch {}
  tab.busy = false;
  sendTab(id, 'agent:busy', { busy: false });
  return { ok: true };
});

ipcMain.handle('model:set', async (_e, { tabId, provider, id }) => {
  const { tabId: tid, tab } = tabFor(tabId);
  const m = await tab.handle.setModel(provider, id);
  sendTab(tid, 'model:changed', { model: m });
  return m;
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

ipcMain.handle('auth:cancel', async () => {
  if (loginFlow) {
    loginFlow.cancelled = true;
    loginFlow = null;
  }
  return { ok: true };
});

ipcMain.handle('approval:respond', async (_e, { id, allow, remember, rememberAll } = {}) => {
  const pending = approvals.get(id);
  if (!pending) return { ok: false };
  approvals.delete(id);

  if (allow && rememberAll) {
    allowEverything = true;
  } else if (allow && remember && pending.toolName) {
    allowedTools.add(pending.toolName);
  }

  pending.resolve(Boolean(allow));
  broadcastApprovalMode();
  return { ok: true, allowEverything, allowedTools: [...allowedTools] };
});

/** Let the sidebar reflect whether prompts are still being asked. */
function broadcastApprovalMode() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('approval:mode', { allowEverything, allowedTools: [...allowedTools] });
}

/** Turn prompts back on (sidebar toggle, or resetting after a slip). */
ipcMain.handle('approval:setMode', async (_e, { allowEverything: all, reset } = {}) => {
  if (reset) {
    allowedTools.clear();
    allowEverything = false;
  } else if (typeof all === 'boolean') {
    allowEverything = all;
    if (!all) allowedTools.clear();
  }
  broadcastApprovalMode();
  return { ok: true, allowEverything, allowedTools: [...allowedTools] };
});

ipcMain.handle('approval:getMode', async () => ({
  allowEverything,
  allowedTools: [...allowedTools],
}));

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

/* ------------------------------ boot ------------------------------ */

app.whenReady().then(async () => {
  try {
    sdk = resolveSdk();
  } catch (err) {
    dialog.showErrorBox('pi SDK not found', err.message);
    app.quit();
    return;
  }

  // One-time cleanup: rename the old "--C--Users-...--" history folders.
  try {
    await migrateSessionDirs();
  } catch {}

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const tab of tabs.values()) {
    try {
      tab.handle.dispose();
    } catch {}
  }
  tabs.clear();
  if (process.platform !== 'darwin') app.quit();
});
