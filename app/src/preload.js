'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('freepi', {
  pickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
  pickImages: () => ipcRenderer.invoke('fs:pickImages'),

  /**
   * Electron dropped `File.path` in v32 — the supported way to turn a dropped or
   * pasted File into a real filesystem path is webUtils.getPathForFile(), which is
   * only available in the preload. Returns '' when the path cannot be resolved.
   */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },

  boot: () => ipcRenderer.invoke('app:boot'),
  setPrefs: (patch) => ipcRenderer.invoke('prefs:set', patch),
  /**
   * The saved theme, read before the first paint.
   *
   * The value arrives as a renderer argument (`--ntapi-theme=light`) because a
   * synchronous IPC deadlocks whenever the page is loaded without a main process
   * answering — which is how every window check in scripts/ loads it. Reading an
   * argument cannot hang, and it is available in <head>, before anything is drawn.
   */
  getThemeSync: () => {
    try {
      const arg = process.argv.find((a) => typeof a === 'string' && a.startsWith('--ntapi-theme='));
      if (arg) return arg.slice('--ntapi-theme='.length) || null;
      // No argument means an older main process, or no main process at all (a page
      // loaded by one of the window checks). Return nothing rather than make a
      // synchronous IPC call that blocks forever with nobody listening.
      return null;
    } catch {
      return null;
    }
  },
  getSettings: (cwd) => ipcRenderer.invoke('settings:get', { cwd }),
  // MCP config: the app's own <data>/mcp.json, edited from Settings.
  mcpGet: () => ipcRenderer.invoke('mcp:get'),
  mcpSet: (payload) => ipcRenderer.invoke('mcp:set', payload),
  // Version/runtime/OS, for the "copy system info" button and crash reports.
  systemInfo: () => ipcRenderer.invoke('app:systemInfo'),
  // One line kept on disk by the main process. Used by the transcript when a
  // repaint could not draw a message: the visible chat would otherwise just be
  // short, with nothing to point at afterwards.
  uiLog: (line) => ipcRenderer.send('ui:log', String(line || '')),
  // "The window has painted something." The update splash stays up until this
  // arrives, so closing it early would uncover an empty window.
  uiReady: () => ipcRenderer.send('ui:ready'),
  // Browser control: the chip in the toolbar owns enable/disable.
  browserStatus: () => ipcRenderer.invoke('browser:status'),
  browserToggle: (enabled) => ipcRenderer.invoke('browser:toggle', { enabled: Boolean(enabled) }),
  browserInstallInfo: () => ipcRenderer.invoke('browser:installInfo'),
  browserOpenFolder: () => ipcRenderer.invoke('browser:openFolder'),
  browserWatch: () => ipcRenderer.invoke('browser:watch'),
  browserTabs: () => ipcRenderer.invoke('browser:tabs'),
  browserClaim: (tabId) => ipcRenderer.invoke('browser:claim', { tabId }),
  // No tab id releases them all; one id takes back exactly that tab.
  browserRelease: (tabId) => ipcRenderer.invoke('browser:release', { tabId }),
  browserAutopilot: (on) => ipcRenderer.invoke('browser:autopilot', { on: Boolean(on) }),
  onBrowserStatus: on('browser:status'),
  onBrowserActivity: on('browser:activity'),
  onBrowserClaimState: on('browser:claimState'),
  onBrowserAutopilotState: on('browser:autopilotState'),
  onBrowserResume: on('browser:resume'),

  // Coarena key: the renderer sees status only, never the key itself.
  providerKeyHealth: () => ipcRenderer.invoke('providers:key-health'),
  coarenaStatus: () => ipcRenderer.invoke('coarena:status'),
  coarenaSetKey: (key) => ipcRenderer.invoke('coarena:setKey', { key }),
  coarenaClearKey: () => ipcRenderer.invoke('coarena:clearKey'),
  zroStatus: () => ipcRenderer.invoke('zro:status'),
  zroSetKey: (key) => ipcRenderer.invoke('zro:setKey', { key }),
  zroClearKey: () => ipcRenderer.invoke('zro:clearKey'),
  nvidiaStatus: () => ipcRenderer.invoke('nvidia:status'),
  nvidiaSetKey: (key) => ipcRenderer.invoke('nvidia:setKey', { key }),
  nvidiaClearKey: () => ipcRenderer.invoke('nvidia:clearKey'),
  tokenharborStatus: () => ipcRenderer.invoke('tokenharbor:status'),
  tokenharborSetKey: (key) => ipcRenderer.invoke('tokenharbor:setKey', { key }),
  tokenharborClearKey: () => ipcRenderer.invoke('tokenharbor:clearKey'),
  llm7Status: () => ipcRenderer.invoke('llm7:status'),
  llm7SetKey: (key) => ipcRenderer.invoke('llm7:setKey', { key }),
  llm7ClearKey: () => ipcRenderer.invoke('llm7:clearKey'),
  deepseekStatus: () => ipcRenderer.invoke('deepseek:status'),
  deepseekSetKey: (key) => ipcRenderer.invoke('deepseek:setKey', { key }),
  deepseekClearKey: () => ipcRenderer.invoke('deepseek:clearKey'),
  anthropicStatus: () => ipcRenderer.invoke('anthropic:status'),
  anthropicSetKey: (key) => ipcRenderer.invoke('anthropic:setKey', { key }),
  anthropicClearKey: () => ipcRenderer.invoke('anthropic:clearKey'),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleSetKey: (key) => ipcRenderer.invoke('google:setKey', { key }),
  googleClearKey: () => ipcRenderer.invoke('google:clearKey'),
  listSkills: (opts) => ipcRenderer.invoke('skills:list', opts),
  pickSettingsFolder: () => ipcRenderer.invoke('settings:pickFolder'),
  revealPath: (p) => ipcRenderer.invoke('settings:reveal', p),

  openTab: (opts) => ipcRenderer.invoke('tab:open', opts),
  resumeRecent: (cwd) => ipcRenderer.invoke('tab:resumeRecent', cwd),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  listTabs: () => ipcRenderer.invoke('tab:list'),
  getTabState: (tabId) => ipcRenderer.invoke('tab:state', tabId),

  listSessions: (cwd) => ipcRenderer.invoke('session:list', cwd),
  listOtherSessions: (cwd) => ipcRenderer.invoke('session:listOther', cwd),
  deleteSession: (cwd, sessionPath) => ipcRenderer.invoke('session:delete', { cwd, sessionPath }),
  clearSession: (tabId) => ipcRenderer.invoke('session:clear', tabId),
  renameSession: (tabId, name) => ipcRenderer.invoke('session:rename', { tabId, name }),
  renameSessionFile: (cwd, sessionPath, name) =>
    ipcRenderer.invoke('session:renameFile', { cwd, sessionPath, name }),
  // Pins and colours on saved chats, keyed by the session file on disk.
  getSessionColors: () => ipcRenderer.invoke('session:colors'),
  setSessionMark: (sessionPath, patch) =>
    ipcRenderer.invoke('session:mark', { sessionPath, ...(patch || {}) }),

  sendPrompt: (tabId, text, images, mode) =>
    ipcRenderer.invoke('prompt:send', { tabId, text, images, mode }),
  abort: (tabId) => ipcRenderer.invoke('prompt:abort', tabId),
  takeBackPrompt: (tabId) => ipcRenderer.invoke('prompt:takeBack', tabId),
  setModel: (tabId, provider, id) => ipcRenderer.invoke('model:set', { tabId, provider, id }),
  fetchUsage: () => ipcRenderer.invoke('usage:fetch'),
  // USD → THB for the token panel's cost line (memoised for six hours).
  getUsdThb: () => ipcRenderer.invoke('fx:usdThb'),

  // Session toolbox: context meter, undo/redo, compaction, export, shell, @files.
  getStats: (tabId) => ipcRenderer.invoke('session:stats', tabId),
  undo: (tabId) => ipcRenderer.invoke('session:undo', tabId),
  redo: (tabId, entryId) => ipcRenderer.invoke('session:redo', { tabId, entryId }),
  compact: (tabId, instructions) => ipcRenderer.invoke('session:compact', { tabId, instructions }),
  exportSession: (tabId) => ipcRenderer.invoke('session:export', tabId),
  setThinking: (tabId, level) => ipcRenderer.invoke('session:thinking', { tabId, level }),
  // Auto-compaction: read the effective values for the open tab, or send a patch
  // (`{ enabled }` applies at once, token numbers travel with the next tab).
  getCompaction: (tabId) => ipcRenderer.invoke('settings:compaction', { tabId }),
  setCompaction: (patch, tabId) => ipcRenderer.invoke('settings:compaction', { tabId, patch }),
  runShell: (tabId, command) => ipcRenderer.invoke('shell:run', { tabId, command }),
  listChanges: (tabId) => ipcRenderer.invoke('changes:list', tabId),
  revertChanges: (tabId, path, all) => ipcRenderer.invoke('changes:revert', { tabId, path, all }),
  listFiles: (cwd, query) => ipcRenderer.invoke('fs:listFiles', { cwd, query }),
  respondQuestion: (id, answer) => ipcRenderer.invoke('question:respond', { id, answer }),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', String(url || '')),
  // Opens the shipped third-party licence notice (MIT requires it to be reachable).
  openNotices: () => ipcRenderer.invoke('app:openNotices'),
  // Terms, privacy notice, security policy and the licence itself, shipped with
  // the installer. The main process holds the allowlist of names.
  openDoc: (name) => ipcRenderer.invoke('app:openDoc', String(name || '')),
  // Declining the terms closes the program. The renderer asks; the main process
  // decides how it ends, so no window can be left running afterwards.
  quitApp: () => ipcRenderer.invoke('app:quit'),
  // The sponsor strip at the bottom of the sidebar. `sponsor:click` counts the
  // click as well as opening the link; the URL itself comes from the main
  // process, so the renderer never chooses where to go.
  sponsorGet: () => ipcRenderer.invoke('sponsor:get'),
  sponsorMedia: (id) => ipcRenderer.invoke('sponsor:media', String(id || '')),
  sponsorClick: (id) => ipcRenderer.invoke('sponsor:click', String(id || '')),
  // A publish landed after the window had already drawn the cached strip.
  onSponsorChanged: on('sponsor:changed'),
  readImage: (cwd, p) => ipcRenderer.invoke('fs:readImage', { cwd, path: p }),
  openPath: (cwd, p) => ipcRenderer.invoke('fs:openPath', { cwd, path: p }),

  onBusy: on('agent:busy'),
  onDelta: on('agent:delta'),
  onTextEnd: on('agent:textEnd'),
  onToolStart: on('agent:toolStart'),
  onToolUpdate: on('agent:toolUpdate'),
  onToolEnd: on('agent:toolEnd'),
  onNotice: on('agent:notice'),
  onError: on('agent:error'),
  onAd: on('ads:show'),
  openAd: (url) => ipcRenderer.invoke('ads:open', url),
  rotateAd: (opts) => ipcRenderer.invoke('ads:rotate', opts),
  onSettled: on('agent:settled'),
  onRecovered: on('agent:recovered'),
  onTurnStart: on('agent:turnStart'),
  onTodos: on('agent:todos'),
  onQuestion: on('agent:question'),
  onBashStart: on('agent:bashStart'),
  onBashChunk: on('agent:bashChunk'),
  onBashEnd: on('agent:bashEnd'),
  onHistory: on('agent:history'),
  onChanges: on('agent:changes'),
  onModelChanged: on('model:changed'),
  onSessionName: on('session:name'),
  onApprovalRequest: on('approval:request'),
  respondApproval: (id, allow, opts = {}) =>
    ipcRenderer.invoke('approval:respond', { id, allow, ...opts }),
  getApprovalMode: () => ipcRenderer.invoke('approval:getMode'),
  setApprovalMode: (opts = {}) => ipcRenderer.invoke('approval:setMode', opts),
  onApprovalMode: on('approval:mode'),

  // Desktop control (Linux AT-SPI). Off until the user turns the switch on; the
  // main process is the gate, so these calls only carry the decision.
  systemGetState: () => ipcRenderer.invoke('system:getState'),
  systemProbe: () => ipcRenderer.invoke('system:probe'),
  systemSetEnabled: (enabled) => ipcRenderer.invoke('system:setEnabled', { enabled: Boolean(enabled) }),
  onSystemState: on('system:state'),
  onSystemStopped: on('system:stopped'),
  onLog: on('app:log'),

  // Account on this machine (each computer signs in with its own allowance).
  accountStatus: () => ipcRenderer.invoke('account:status'),
  accountSignIn: () => ipcRenderer.invoke('account:signIn'),
  accountSignOut: () => ipcRenderer.invoke('account:signOut'),
  resetFreePiSession: () => ipcRenderer.invoke('account:resetSession'),

  // In-app GitHub sign-in (browser connect flow).
  authStart: () => ipcRenderer.invoke('auth:start'),
  authCancel: () => ipcRenderer.invoke('auth:cancel'),
  authOpenBrowser: () => ipcRenderer.invoke('auth:openBrowser'),
  authCopyCode: () => ipcRenderer.invoke('auth:copyCode'),
  copyText: (text) => ipcRenderer.invoke('app:copyText', String(text ?? '')),
  onAuthStatus: on('auth:status'),

  // Custom frameless window controls.
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
  closeWindow: () => ipcRenderer.send('win:close'),
  getWinState: () => ipcRenderer.invoke('win:state'),
  onWinState: on('win:state'),

  // User-driven updates over GitHub Releases.
  getUpdateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: on('update:status'),
  onAppUpdated: on('app:updated'),

  // How many people are online right now (45 s heartbeat).
  getPresence: () => ipcRenderer.invoke('presence:get'),
  onPresence: on('presence:state'),

  // Native toast when a session finishes while the window is in the background.
  notifyDone: (p) => ipcRenderer.invoke('notify:done', p),
});
