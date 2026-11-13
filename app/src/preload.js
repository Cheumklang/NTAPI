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
  // Coarena key: the renderer sees status only, never the key itself.
  coarenaStatus: () => ipcRenderer.invoke('coarena:status'),
  coarenaSetKey: (key) => ipcRenderer.invoke('coarena:setKey', { key }),
  coarenaClearKey: () => ipcRenderer.invoke('coarena:clearKey'),
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
});
