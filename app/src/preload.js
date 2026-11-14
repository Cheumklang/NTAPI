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
  getSettings: (cwd) => ipcRenderer.invoke('settings:get', { cwd }),
  // MCP config: the app's own <data>/mcp.json, edited from Settings.
  mcpGet: () => ipcRenderer.invoke('mcp:get'),
  mcpSet: (payload) => ipcRenderer.invoke('mcp:set', payload),
  // Version/runtime/OS, for the "copy system info" button and crash reports.
  systemInfo: () => ipcRenderer.invoke('app:systemInfo'),
  // Browser control: the chip in the toolbar owns enable/disable.
  browserStatus: () => ipcRenderer.invoke('browser:status'),
  browserToggle: (enabled) => ipcRenderer.invoke('browser:toggle', { enabled: Boolean(enabled) }),
  browserInstallInfo: () => ipcRenderer.invoke('browser:installInfo'),
  browserOpenFolder: () => ipcRenderer.invoke('browser:openFolder'),
  browserWatch: () => ipcRenderer.invoke('browser:watch'),
  browserTabs: () => ipcRenderer.invoke('browser:tabs'),
  browserClaim: (tabId) => ipcRenderer.invoke('browser:claim', { tabId }),
  browserRelease: () => ipcRenderer.invoke('browser:release'),
  browserAutopilot: (on) => ipcRenderer.invoke('browser:autopilot', { on: Boolean(on) }),
  onBrowserStatus: on('browser:status'),
  onBrowserActivity: on('browser:activity'),
  onBrowserClaimState: on('browser:claimState'),
  onBrowserAutopilotState: on('browser:autopilotState'),
  onBrowserResume: on('browser:resume'),

  // Coarena key: the renderer sees status only, never the key itself.
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
  listSkills: () => ipcRenderer.invoke('skills:list'),
  pickSettingsFolder: () => ipcRenderer.invoke('settings:pickFolder'),
  revealPath: (p) => ipcRenderer.invoke('settings:reveal', p),

  openTab: (opts) => ipcRenderer.invoke('tab:open', opts),
  resumeRecent: (cwd) => ipcRenderer.invoke('tab:resumeRecent', cwd),
  activateTab: (tabId) => ipcRenderer.invoke('tab:activate', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  listTabs: () => ipcRenderer.invoke('tab:list'),
  getTabState: (tabId) => ipcRenderer.invoke('tab:state', tabId),

  listSessions: (cwd) => ipcRenderer.invoke('session:list', cwd),
  deleteSession: (cwd, sessionPath) => ipcRenderer.invoke('session:delete', { cwd, sessionPath }),
  clearSession: (tabId) => ipcRenderer.invoke('session:clear', tabId),
  renameSession: (tabId, name) => ipcRenderer.invoke('session:rename', { tabId, name }),
  renameSessionFile: (cwd, sessionPath, name) =>
    ipcRenderer.invoke('session:renameFile', { cwd, sessionPath, name }),

  sendPrompt: (tabId, text, images, mode) =>
    ipcRenderer.invoke('prompt:send', { tabId, text, images, mode }),
  abort: (tabId) => ipcRenderer.invoke('prompt:abort', tabId),
  setModel: (tabId, provider, id) => ipcRenderer.invoke('model:set', { tabId, provider, id }),
  fetchUsage: () => ipcRenderer.invoke('usage:fetch'),

  // Session toolbox: context meter, undo/redo, compaction, export, shell, @files.
  getStats: (tabId) => ipcRenderer.invoke('session:stats', tabId),
  undo: (tabId) => ipcRenderer.invoke('session:undo', tabId),
  redo: (tabId, entryId) => ipcRenderer.invoke('session:redo', { tabId, entryId }),
  compact: (tabId, instructions) => ipcRenderer.invoke('session:compact', { tabId, instructions }),
  exportSession: (tabId) => ipcRenderer.invoke('session:export', tabId),
  setThinking: (tabId, level) => ipcRenderer.invoke('session:thinking', { tabId, level }),
  runShell: (tabId, command) => ipcRenderer.invoke('shell:run', { tabId, command }),
  listChanges: (tabId) => ipcRenderer.invoke('changes:list', tabId),
  revertChanges: (tabId, path, all) => ipcRenderer.invoke('changes:revert', { tabId, path, all }),
  listFiles: (cwd, query) => ipcRenderer.invoke('fs:listFiles', { cwd, query }),
  respondQuestion: (id, answer) => ipcRenderer.invoke('question:respond', { id, answer }),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', String(url || '')),
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
  onFallback: on('agent:fallback'),
  onAd: on('ads:show'),
  openAd: (url) => ipcRenderer.invoke('ads:open', url),
  rotateAd: (opts) => ipcRenderer.invoke('ads:rotate', opts),
  onSettled: on('agent:settled'),
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
  onLog: on('app:log'),

  // Account on this machine (each computer signs in with its own allowance).
  accountStatus: () => ipcRenderer.invoke('account:status'),
  accountSignIn: () => ipcRenderer.invoke('account:signIn'),
  accountSignOut: () => ipcRenderer.invoke('account:signOut'),

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
