'use strict';

const api = window.freepi;
const MD = window.FPMarkdown;
const FPProvider = window.FPProvider;

const el = (id) => document.getElementById(id);
const transcript = el('transcript');
const jumpToBottom = el('jumpToBottom');
const input = el('input');
const sendBtn = el('sendBtn');
const stopBtn = el('stopBtn');
const statusHint = el('statusHint');
const noticeEl = el('notice');
const modelSelect = el('modelSelect');
const modelPicker = el('modelPicker');
const modelPickerBtn = el('modelPickerBtn');
const modelPickerMark = el('modelPickerMark');
const modelPickerProvider = el('modelPickerProvider');
const modelPickerName = el('modelPickerName');
const modelPickerPlan = el('modelPickerPlan');
const modelMenu = el('modelMenu');
const modelSearch = el('modelSearch');
const modelFreeOnly = el('modelFreeOnly');
const modelFreeOnlyLabel = el('modelFreeOnlyLabel');
const modelList = el('modelList');
const modelMenuEmpty = el('modelMenuEmpty');
const sessionTitle = el('sessionTitle');
const emptyState = el('emptyState');
/**
 * The placeholder that fills the reading area until the first transcript paints.
 * It lives beside `#transcript`, not inside it, because that element is rebuilt
 * wholesale on every tab switch.
 */
const txSkeleton = el('txSkeleton');
function hideSkeleton() {
  if (txSkeleton) txSkeleton.hidden = true;
}
// If the first paint never comes (no tab, a load that failed), the placeholder must
// not sit there forever pretending to still be loading.
setTimeout(hideSkeleton, 2500);
const attachBar = el('attachments');
const adSlot = el('adSlot');
const slashMenu = el('slashMenu');
const loginOverlay = el('loginOverlay');
const loginCodeEl = el('loginCode');
const loginStatus = el('loginStatus');
const loginStatusText = el('loginStatusText');
const loginError = el('loginError');
const loginOpen = el('loginOpen');
const loginCopy = el('loginCopy');
const loginCancel = el('loginCancel');
const loginTerminal = el('loginTerminal');

/** free-pi allows 4 running sessions per account; restoring more just breaks sends. */
const MAX_RESTORED_TABS = 4;

/* ------------------------------- i18n -------------------------------- */

const STRINGS = {
  en: {
    // Browser control (chip next to the language button).
    errorPrefix: 'Error',
    updateOverlayTitle: 'Updating NTAPI…',
    updateOverlayLine: 'The program closes itself to install the update, then opens again on its own.',
    updateOverlayHint: 'You do not need to start it again. Leave this window; it goes away by itself.',
    updatedToast: 'Updated to v{v} — everything is where you left it.',
    browserTitle: 'Browser control',
    browserOff: 'Browser control is off. The agent cannot use your browser.',
    browserWaiting: 'Waiting for the Chrome extension to connect…',
    browserConnected: 'Connected. The agent can drive the NTAPI browser window.',
    browserInstallTitle: 'One-time setup',
    browserInstallSteps: '1. Open the extension folder\n2. In Chrome: chrome://extensions -> Developer mode -> Load unpacked -> pick that folder\n3. Open the extension popup and paste the pairing code below',
    browserOpenFolder: 'Open folder',
    browserCopyExtensions: 'Copy chrome://extensions',
    browserWatch: 'Watch what the agent does',
    browserDisconnect: 'Turn off',
    browserConnect: 'Turn on',
    browserChipOff: 'Browser control: off',
    browserChipWaiting: 'Browser control: waiting for the extension',
    browserChipOn: 'Browser control: connected',
    browserCopied: 'Copied',
    browserInstalled: 'Extension folder is ready.',
    browserNotInstalled: 'Extension folder is missing from this build.',
    browserTabsTitle: 'Work in one of your tabs',
    browserTabsHint: 'Hand the agent a tab you are already signed into. It only ever touches that one.',
    browserNoTabs: 'No tabs found. Is Chrome running?',
    browserTabAgent: 'agent window',
    browserClaimTab: 'Use this tab',
    browserClaimed: 'Handed over',
    browserRelease: 'Release the tab',
    browserClaimFailed: 'Could not hand that tab over',
    browserAutopilotOn: 'Let it work without asking',
    browserAutopilotOff: 'Ask me for every step again',
    browserAutopilotNote: 'Hand-over mode: the agent works in this tab without a dialog per step.',
    browserAutopilotUntil: 'Stops on its own at',
    browserDebugBarNote:
      'Chrome shows a yellow "started debugging this browser" bar while the agent works. Leave it alone — dismissing it disconnects the agent.',
    activityStop: 'Stop',
    activityFailed: 'failed',
    autopilotStopIdle: 'Hand-over mode ended after five quiet minutes.',
    autopilotStopTabClosed: 'Hand-over mode ended: the tab was closed.',
    autopilotStopLeftSite: 'Hand-over mode ended: the page left this site.',
    autopilotStopFailures: 'Hand-over mode ended after three failures in a row.',
    autopilotStopStopped: 'Hand-over mode stopped.',
    autopilotStopFeatureOff: 'Hand-over mode ended: browser control was turned off.',
    workspace: 'Workspace',
    savedSessions: 'Saved sessions',
    new: '+ New',
    status: 'Status',
    credits: 'Daily quota',
    bonus: 'Bonus credits',
    lane: 'Lane',
    resets: 'Resets',
    refreshStatus: 'Refresh status',
    attach: 'Attach',
    stop: 'Stop',
    send: 'Send',
    idle: 'Idle',
    working: 'Working…',
    restoring: 'Restoring last session…',
    placeholderIdle: 'Ask NTAPI to build, fix, or explain… (Enter to send, Shift+Enter for newline)',
    placeholderBusy: 'Agent is working — Enter sends into the turn, Ctrl+Enter queues',
    steerSent: 'Sent into the running turn.',
    holdCountdown: 'Sending in {n}s · {what}',
    holdWhatSteer: 'into the running turn',
    holdWhatQueue: 'queued',
    holdEdit: 'Edit',
    holdCancel: 'Cancel',
    holdDropped: 'Dropped.',
    jumpToBottom: 'Newest',
    untitled: 'Untitled session',
    rename: 'Rename',
    noSessions: 'No saved sessions yet.',
    openBadge: 'open',
    currentBadge: 'current',
    sessionMenuHint: 'Right-click to rename or delete',
    settings: 'Settings',
    settingsSub: 'Where this app keeps its files. Everything lives in one folder you can copy or back up.',
    adFrom: 'Ad from FREEPI.AI',
    provider: 'Provider',
    coarenaSection: 'Coarena',
    coarenaKeyLabel: 'API key',
    coarenaSave: 'Save',
    coarenaRemove: 'Remove',
    coarenaRemoveTitle: 'Remove the Coarena key?',
    coarenaRemoveSub:
      'Coarena models disappear from the model list. A running turn keeps its current model until it finishes.',
    coarenaConfigured: 'Configured',
    coarenaUnreadable: 'This key was saved on another machine and cannot be read here — enter it again.',
    coarenaNotConfigured: 'No key yet — Coarena models stay hidden.',
    coarenaEncrypted: 'encrypted',
    coarenaPlaintext: 'stored without encryption',
    coarenaLimits: 'Limits',
    coarenaGetKey: 'Get a key at coarena.ai',
    coarenaSaved: 'Coarena key saved.',
    coarenaUnverified: 'Coarena could not be reached — the key was saved unverified.',
    coarenaSaveFailed: 'Could not save the key:',
    coarenaRemoved: 'Coarena key removed.',
    coarenaModelSwitched: 'The saved model is unavailable — switched to',
    zroSection: 'Zro',
    zroKeyLabel: 'API key',
    zroSave: 'Save',
    zroRemove: 'Remove',
    zroRemoveTitle: 'Remove the Zro key?',
    zroRemoveSub:
      'Zro models disappear from the model list. A running turn keeps its current model until it finishes.',
    zroConfigured: 'Configured',
    zroUnreadable: 'This key was saved on another machine and cannot be read here — enter it again.',
    zroNotConfigured: 'No key yet — Zro models stay hidden.',
    zroGetKey: 'Get a key at zro.moonmath.ai',
    zroSaved: 'Zro key saved.',
    zroUnverified: 'Zro could not be reached — the key was saved unverified.',
    zroSaveFailed: 'Could not save the key:',
    zroRemoved: 'Zro key removed.',
    nvidiaSection: 'NVIDIA',
    nvidiaKeyLabel: 'API key',
    nvidiaSave: 'Save',
    nvidiaRemove: 'Remove',
    nvidiaRemoveTitle: 'Remove the NVIDIA key?',
    nvidiaRemoveSub:
      'NVIDIA models disappear from the model list. A running turn keeps its current model until it finishes.',
    nvidiaConfigured: 'Configured',
    nvidiaUnreadable: 'This key was saved on another machine and cannot be read here — enter it again.',
    nvidiaNotConfigured: 'No key yet — NVIDIA models stay hidden.',
    nvidiaGetKey: 'Get a key at build.nvidia.com',
    nvidiaSaved: 'NVIDIA key saved.',
    nvidiaUnverified: 'NVIDIA could not be reached — the key was saved unverified.',
    nvidiaModelMissing: 'The key works, but NVIDIA no longer serves a DeepSeek Flash model.',
    nvidiaSaveFailed: 'Could not save the key:',
    nvidiaRemoved: 'NVIDIA key removed.',
    nvidiaFreeTier: 'Free tier',
    nvidiaLimits: '40/min · 10,000/day',
    tokenharborSection: 'Token Harbor',
    tokenharborKeyLabel: 'API key',
    tokenharborSave: 'Save',
    tokenharborRemove: 'Remove',
    tokenharborRemoveTitle: 'Remove the Token Harbor key?',
    tokenharborRemoveSub:
      'Token Harbor models disappear from the model list. A running turn keeps its current model until it finishes.',
    tokenharborConfigured: 'Configured',
    tokenharborUnreadable: 'This key was saved on another machine and cannot be read here — enter it again.',
    tokenharborNotConfigured: 'No key yet — Token Harbor models stay hidden.',
    tokenharborGetKey: 'Get a key at tokenharbor.ai',
    tokenharborSaved: 'Token Harbor key saved.',
    tokenharborUnverified: 'Token Harbor could not be reached — the key was saved unverified.',
    tokenharborModelMissing:
      'The key works, but free models are switched off in the Token Harbor dashboard.',
    tokenharborSaveFailed: 'Could not save the key:',
    tokenharborRemoved: 'Token Harbor key removed.',
    tokenharborFreeTier: 'Free tier',
    tokenharborLimits: 'weekly allowance',
    llm7Section: 'LLM7.io',
    llm7KeyLabel: 'API key',
    llm7Save: 'Save',
    llm7Remove: 'Remove',
    llm7RemoveTitle: 'Remove the LLM7.io token?',
    llm7RemoveSub:
      'LLM7.io models disappear from the model list. A running turn keeps its current model until it finishes.',
    llm7Configured: 'Configured',
    llm7Unreadable: 'This token was saved on another machine and cannot be read here — enter it again.',
    llm7NotConfigured: 'No token yet — LLM7.io models stay hidden.',
    llm7GetKey: 'Get a token at dash.llm7.io',
    llm7Saved: 'LLM7.io token saved.',
    llm7Unverified: 'LLM7.io could not confirm the token — it was saved as unverified.',
    llm7SaveFailed: 'Could not save the token:',
    llm7Removed: 'LLM7.io token removed.',
    llm7FreeTier: 'Free turbo models',
    llm7Limits: '100K tokens/day · 60/min',
    mcpSection: 'MCP',
    mcpHead: 'MCP servers',
    mcpIntro:
      'MCP servers add tools to the agent. A server runs with your privileges and its tool descriptions are untrusted input, so every MCP tool asks for approval first.',
    mcpEnable: 'Enable MCP servers',
    mcpSave: 'Save',
    mcpSaving: 'Saving…',
    mcpSaved: 'Saved — applies to new sessions',
    mcpSaveFailed: 'Could not save',
    copySystemInfo: 'Copy system info',
    systemInfoCopied: 'Copied',
    systemInfoFailed: 'Could not copy',
    crashNotice: 'Something went wrong. Copy the system info and include it in a bug report.',
    mcpLlm7Warn:
      "On LLM7.io's free tier, function calling may be unavailable and each tool drains the daily token budget — prefer another provider for MCP work.",
    dataRootLabel: 'App data folder',
    outputFolders: 'Output folders',
    systemPaths: 'System locations',
    workspaceSection: 'Workspace',
    providersSection: 'Providers',
    appearanceSection: 'Appearance & Behavior',
    advancedSection: 'Advanced',
    folderSettings: 'Folder Settings',
    apiKeys: 'API Keys',
    accountsKeys: 'Accounts & API keys',
    providersIntro: 'One card per company. Each key is only used by the service named on its card.',
    freepiSection: 'FreePi',
    freepiGetKey: 'Sign in at freepi.ai',
    accountSettings: 'Account',
    ntapiSection: 'NTAPI',
    ntapiHint: 'Uses your NTAPI account (GitHub sign-in) instead of an API key.',
    dataLocations: 'Data Locations',
    resetAll: 'Reset All Settings',
    accountSection: 'Your account',
    accountKind: 'Signed in as',
    accountCredits: 'Credits today',
    accountLane: 'Lane',
    accountFile: 'Login token',
    accountTokenMissing: 'No token yet — created when you sign in.',
    accountTokenNote:
      'Stays on this computer and is shared with the terminal CLI. It never travels with the app folder.',
    accountError: 'Could not read account',
    acctNone: 'Not signed in',
    acctGuest: 'Guest (limited free credits)',
    acctMember: 'Your own account',
    signIn: 'Sign in…',
    refreshAccount: 'Refresh',
    signedIn: 'Signed in — opening your chat…',
    loginTitle: 'Sign in to FreePi',
    loginSub: 'Use your GitHub account. The browser opens automatically — confirm the code below.',
    loginStepOpen: 'Open the GitHub sign-in page',
    loginOpen: 'Open GitHub',
    loginOpenHint: 'Click “Open GitHub” to continue.',
    loginStepCode: 'Confirm this code',
    loginCopy: 'Copy',
    loginCopied: 'Copied',
    loginWaiting: 'Waiting for you to approve in the browser…',
    loginOpened: 'Browser opened — waiting for approval…',
    loginSuccess: 'Signed in — opening your chat…',
    loginRetry: 'Try again',
    loginError: 'Sign-in failed. Try again.',
    loginTerminal: 'Use terminal instead',
    signOut: 'Sign out',
    signInOpened:
      'A terminal window opened. Sign in with GitHub (type /login if it does not start by itself), then type /exit to close the window. Back here, press Sign in again to refresh.',
    signOutConfirm: 'Sign out on this computer? The next start will create a new guest session.',
    defaultTag: 'default',
    chooseFolder: 'Choose…',
    openFolder: 'Open',
    resetDefaults: 'Reset to defaults',
    close: 'Close',
    sessionsFolder: 'Chat history',
    skillsFolder: 'Skills',
    prefsFile: 'App settings file',
    scopeFor: 'Chat history for',
    noWorkspaceHint: 'Choose a workspace folder first — these settings are relative to it.',
    noWorkspaceChat: 'No workspace selected yet, so there is no chat history to show.',
    open: 'Open',
    deleteFromDisk: 'Delete from disk…',
    deleteTitle: 'Delete this session?',
    deleteSub: 'This removes the conversation from disk. It cannot be undone.',
    clearTitle: 'Clear this chat?',
    clearSub:
      'Deletes every message and attached image in this chat from disk. The chat name and model are kept, and the new chat starts with no context — the same cost as a new chat. Skills, generated images and downloaded files are not touched.',
    clearMeta: 'The chat reopens empty in the same folder.',
    clearNoFile: 'No history file yet — only the open messages will be cleared.',
    clearAction: 'Clear chat',
    clearDone: 'Chat cleared — messages and attached images were deleted.',
    clearKeptName: 'Chat cleared. The name and model were kept.',
    deleteFailed: 'Could not delete: {error}',
    deletedFromDisk: 'Deleted this chat from disk.',
    attachPathFailed: 'Could not read the path of “{name}”. Use the Attach button instead.',
    modelSwitchFailed: 'Could not switch model: {error}',
    unknownError: 'unknown cause',
    noticeReasoningOverflow:
      'The model spent its whole output limit on reasoning and never answered. Retry, or pick a model that does not think first.',
    noticeClearUnlink: 'Chat closed, but its history file could not be deleted: {error}',
    noticeClearOutsideStore:
      'Chat closed, but its history file is outside the app session store and was left on disk.',
    pinChat: 'Pin chat',
    unpinChat: 'Unpin chat',
    chatColor: 'Chat colour',
    colorNone: 'No colour',
    color_red: 'Red',
    color_orange: 'Orange',
    color_yellow: 'Yellow',
    color_green: 'Green',
    color_blue: 'Blue',
    color_purple: 'Purple',
    color_pink: 'Pink',
    pinNeedsFile: 'This chat has no history file yet — send a message first.',
    chooseWorkspace: 'Choose a workspace folder first.',
    readyHint: 'Ready — press + to start a session',
    chooseToBegin: 'Choose a workspace folder to begin',
    emptyTitle: 'What are we building?',
    emptySub: 'Pick a folder on the left, then describe a task. NTAPI runs the agent here — no terminal.',
    emptyPickFolder: 'Choose a folder',
    emptyNewChat: 'New chat',
    emptySettings: 'Settings',
    emptyWhere: 'Generated files and downloads go in the folder you pick.',
    dropFiles: 'Drop files to attach',
    removeFromQueue: 'Remove from queue',
    queueEdit: 'Edit',
    queueSave: 'Save',
    queueCancelEdit: 'Cancel',
    queueReorder: 'Drag to reorder',
    queuePosition: 'Position {n} in the queue',
    queueEditingNote: 'Editing — not sent yet',
    newSession: 'New session',
    noOutput: '(no output)',
    copied: 'Copied',
    copyOutput: 'Copy output',
    toolRunning: 'running…',
    toolFailed: 'failed',
    toolDone: 'done',
    toolsUsed: '{n} tools used',
    toolsUsedOne: '1 tool used',
    narrationMany: '{n} working notes',
    narrationOne: '1 working note',
  actThinking: 'Thinking',
  actTools: 'Using tools',
  actNotes: 'Writing',
    toolsFailed: '{n} failed',
    cancel: 'Cancel',
    delete: 'Delete',
    queuedOne: 'Queued: 1',
    queuedMany: 'Queued: {n}',
    pctUsed: '{n}% used',
    spent: '{n} of {total} used',
    allowOnce: 'Allow',
    deny: 'Deny',
    approvalTitle: 'Allow this command?',
    approvalSub: 'The agent wants to run',
    approvalSub2: 'in this folder.',
    signOutTitle: 'Sign out on this computer?',
    signOutSub:
      'The saved login token will be deleted from this computer. The next start will ask you to sign in again.',
    signOutMeta: 'This does not delete your chats or files.',
    waitingForYou: 'Waiting for you — nothing runs until you choose',
    thinkingShow: 'Show thinking',
    thinkingHide: 'Hide thinking',
    you: 'You',
    assistant: 'NTAPI',
    system: 'System',
    aboutSection: 'About',
    aboutApp: 'NTAPI',
    aboutVersion: 'Version',
    aboutDeveloper: 'Developer',
    aboutNameEn: 'Name (English)',
    aboutNameTh: 'Name (Thai)',
    aboutNickname: 'Nickname',
    aboutEmail: 'Email',
    aboutBug: 'Report a bug',
    aboutBugDesc: 'Found a bug? Send an email — I read every report.',
    aboutDonation: 'Buy me a coffee',
    aboutQrDesc: 'Scan the QR code to support a coffee',
    updatesSection: 'Updates',
    updateCurrent: 'Current version',
    checkUpdates: 'Check for updates',
    updateIdle: 'Updates are only checked when you ask.',
    updateChecking: 'Checking for updates…',
    updateLatest: 'You are on the latest version.',
    updateAvailable: 'Version {v} is available.',
    updateDownload: 'Download update',
    updateDownloading: 'Downloading... {p}%',
    updateReady: 'Version {v} is ready.',
    updateInstall: 'Install & restart',
    updateInstalling: 'Installing... the app will close and reopen on its own.',
    notifyDone: 'Session finished',
    updateDev: 'Auto-update works in the installed build only.',
    updateError: 'Update check failed: {e}',
    sponsorSoundOn: 'Play ad sound',
    sponsorSoundOff: 'Mute ad',
  },
  th: {
    // Browser control (chip next to the language button).
    errorPrefix: 'ข้อผิดพลาด',
    sponsorSoundOn: 'เปิดเสียงโฆษณา',
    sponsorSoundOff: 'ปิดเสียงโฆษณา',
    updateOverlayTitle: 'กำลังอัปเดต NTAPI…',
    updateOverlayLine: 'โปรแกรมจะปิดตัวเองเพื่อติดตั้งอัปเดต แล้วเปิดกลับมาเอง',
    updateOverlayHint: 'ไม่ต้องกดเปิดใหม่ ปล่อยไว้ได้เลย หน้าต่างนี้จะหายไปเอง',
    updatedToast: 'อัปเดตเป็น v{v} แล้ว — ทุกอย่างอยู่ที่เดิม',
    browserTitle: 'ควบคุมเบราว์เซอร์',
    browserOff: 'ยังปิดอยู่ — AI จะใช้เบราว์เซอร์ของคุณไม่ได้',
    browserWaiting: 'รอส่วนขยาย Chrome เชื่อมต่อ…',
    browserConnected: 'เชื่อมต่อแล้ว — AI ขับหน้าต่างเบราว์เซอร์ของ NTAPI ได้',
    browserInstallTitle: 'ติดตั้งครั้งเดียว',
    browserInstallSteps: '1. เปิดโฟลเดอร์ส่วนขยาย\n2. ใน Chrome ไปที่ chrome://extensions -> เปิด Developer mode -> Load unpacked -> เลือกโฟลเดอร์นั้น\n3. เปิด popup ของส่วนขยาย แล้ววางรหัสจับคู่ด้านล่าง',
    browserOpenFolder: 'เปิดโฟลเดอร์',
    browserCopyExtensions: 'คัดลอก chrome://extensions',
    browserWatch: 'ดูว่า AI ทำอะไรอยู่',
    browserDisconnect: 'ปิดการใช้งาน',
    browserConnect: 'เปิดการใช้งาน',
    browserChipOff: 'ควบคุมเบราว์เซอร์: ปิด',
    browserChipWaiting: 'ควบคุมเบราว์เซอร์: รอส่วนขยาย',
    browserChipOn: 'ควบคุมเบราว์เซอร์: เชื่อมต่อแล้ว',
    browserCopied: 'คัดลอกแล้ว',
    browserInstalled: 'โฟลเดอร์ส่วนขยายพร้อมใช้งาน',
    browserNotInstalled: 'ไม่พบโฟลเดอร์ส่วนขยายในบิลด์นี้',
    browserTabsTitle: 'ทำงานในแท็บของคุณ',
    browserTabsHint: 'มอบแท็บที่คุณล็อกอินอยู่ให้ AI — มันจะแตะเฉพาะแท็บนั้นเท่านั้น',
    browserNoTabs: 'ไม่พบแท็บ — Chrome เปิดอยู่ไหมครับ',
    browserTabAgent: 'หน้าต่างของ AI',
    browserClaimTab: 'ใช้แท็บนี้',
    browserClaimed: 'มอบแล้ว',
    browserRelease: 'ปล่อยแท็บ',
    browserClaimFailed: 'มอบแท็บนี้ไม่ได้',
    browserAutopilotOn: 'ให้ทำต่อโดยไม่ถามทุกขั้น',
    browserAutopilotOff: 'กลับมาถามทุกขั้น',
    browserAutopilotNote: 'โหมดมอบงาน: AI ทำงานในแท็บนี้โดยไม่เด้งถามทีละขั้น',
    browserAutopilotUntil: 'จะหยุดเองเมื่อ',
    browserDebugBarNote:
      'Chrome จะขึ้นแถบเหลือง "started debugging this browser" ระหว่างที่ AI ทำงาน — อย่าปิดแถบนั้น เพราะจะตัดการเชื่อมต่อทันที',
    activityStop: 'หยุด',
    activityFailed: 'ล้มเหลว',
    autopilotStopIdle: 'โหมดมอบงานจบลงหลังเงียบไป 5 นาที',
    autopilotStopTabClosed: 'โหมดมอบงานจบลง เพราะแท็บถูกปิด',
    autopilotStopLeftSite: 'โหมดมอบงานจบลง เพราะหน้าเว็บออกนอกไซต์นี้',
    autopilotStopFailures: 'โหมดมอบงานจบลงหลังล้มเหลวติดกัน 3 ครั้ง',
    autopilotStopStopped: 'โหมดมอบงานถูกหยุด',
    autopilotStopFeatureOff: 'โหมดมอบงานจบลง เพราะปิดการควบคุมเบราว์เซอร์',
    workspace: 'โฟลเดอร์งาน',
    savedSessions: 'แชทที่บันทึกไว้',
    new: '+ ใหม่',
    status: 'สถานะ',
    credits: 'โควตาวันนี้',
    bonus: 'เครดิตโบนัส',
    lane: 'เลน',
    resets: 'รีเซ็ตใน',
    refreshStatus: 'อัปเดตสถานะ',
    attach: 'แนบไฟล์',
    stop: 'หยุด',
    send: 'ส่ง',
    idle: 'พร้อมใช้งาน',
    working: 'กำลังทำงาน…',
    restoring: 'กำลังกลับไปยังแชทล่าสุด…',
    placeholderIdle: 'พิมพ์ให้ NTAPI สร้าง แก้ หรืออธิบาย… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)',
    placeholderBusy: 'AI กำลังทำงาน — Enter ส่งเข้าเทิร์น, Ctrl+Enter เข้าคิว',
    steerSent: 'ส่งเข้าเทิร์นที่กำลังทำงานแล้ว',
    holdCountdown: 'จะส่งในอีก {n} วิ · {what}',
    holdWhatSteer: 'ส่งเข้าเทิร์นที่กำลังทำ',
    holdWhatQueue: 'เข้าคิว',
    holdEdit: 'แก้ไข',
    holdCancel: 'ยกเลิก',
    holdDropped: 'ยกเลิกแล้ว',
    jumpToBottom: 'ล่าสุด',
    untitled: 'แชทไม่มีชื่อ',
    rename: 'เปลี่ยนชื่อ',
    noSessions: 'ยังไม่มีแชทที่บันทึกไว้',
    openBadge: 'เปิดอยู่',
    currentBadge: 'ปัจจุบัน',
    sessionMenuHint: 'คลิกขวาเพื่อเปลี่ยนชื่อหรือลบ',
    settings: 'ตั้งค่า',
    settingsSub: 'ที่เก็บไฟล์ของแอปนี้ — ทุกอย่างอยู่ในโฟลเดอร์เดียว ก๊อปหรือแบ็กอัปได้ทั้งก้อน',
    adFrom: 'โฆษณาจาก FREEPI.AI',
    provider: 'ผู้ให้บริการ',
    coarenaSection: 'Coarena',
    coarenaKeyLabel: 'API key',
    coarenaSave: 'บันทึก',
    coarenaRemove: 'ลบออก',
    coarenaRemoveTitle: 'ลบคีย์ Coarena?',
    coarenaRemoveSub:
      'โมเดล Coarena จะหายจากรายการ โมเดลที่กำลังทำงานอยู่จะใช้ต่อจนจบเทิร์น',
    coarenaConfigured: 'ตั้งค่าแล้ว',
    coarenaUnreadable: 'คีย์นี้ถูกบันทึกไว้บนเครื่องอื่นและอ่านไม่ได้ที่นี่ — กรอกใหม่',
    coarenaNotConfigured: 'ยังไม่มีคีย์ — โมเดล Coarena จะไม่แสดง',
    coarenaEncrypted: 'เข้ารหัสแล้ว',
    coarenaPlaintext: 'บันทึกโดยไม่เข้ารหัส',
    coarenaLimits: 'ขีดจำกัด',
    coarenaGetKey: 'ขอคีย์ที่ coarena.ai',
    coarenaSaved: 'บันทึกคีย์ Coarena แล้ว',
    coarenaUnverified: 'ติดต่อ Coarena ไม่ได้ — บันทึกคีย์แบบยังไม่ยืนยัน',
    coarenaSaveFailed: 'บันทึกคีย์ไม่สำเร็จ:',
    coarenaRemoved: 'ลบคีย์ Coarena แล้ว',
    coarenaModelSwitched: 'โมเดลที่บันทึกไว้ใช้ไม่ได้แล้ว — เปลี่ยนเป็น',
    zroSection: 'Zro',
    zroKeyLabel: 'API key',
    zroSave: 'บันทึก',
    zroRemove: 'ลบออก',
    zroRemoveTitle: 'ลบคีย์ Zro?',
    zroRemoveSub: 'โมเดล Zro จะหายจากรายการ โมเดลที่กำลังทำงานอยู่จะใช้ต่อจนจบเทิร์น',
    zroConfigured: 'ตั้งค่าแล้ว',
    zroUnreadable: 'คีย์นี้ถูกบันทึกไว้บนเครื่องอื่นและอ่านไม่ได้ที่นี่ — กรอกใหม่',
    zroNotConfigured: 'ยังไม่มีคีย์ — โมเดล Zro จะไม่แสดง',
    zroGetKey: 'ขอคีย์ที่ zro.moonmath.ai',
    zroSaved: 'บันทึกคีย์ Zro แล้ว',
    zroUnverified: 'ติดต่อ Zro ไม่ได้ — บันทึกคีย์แบบยังไม่ยืนยัน',
    zroSaveFailed: 'บันทึกคีย์ไม่สำเร็จ:',
    zroRemoved: 'ลบคีย์ Zro แล้ว',
    nvidiaSection: 'NVIDIA',
    nvidiaKeyLabel: 'API key',
    nvidiaSave: 'บันทึก',
    nvidiaRemove: 'ลบออก',
    nvidiaRemoveTitle: 'ลบคีย์ NVIDIA?',
    nvidiaRemoveSub: 'โมเดล NVIDIA จะหายจากรายการ โมเดลที่กำลังทำงานอยู่จะใช้ต่อจนจบเทิร์น',
    nvidiaConfigured: 'ตั้งค่าแล้ว',
    nvidiaUnreadable: 'คีย์นี้ถูกบันทึกไว้บนเครื่องอื่นและอ่านไม่ได้ที่นี่ — กรอกใหม่',
    nvidiaNotConfigured: 'ยังไม่มีคีย์ — โมเดล NVIDIA จะไม่แสดง',
    nvidiaGetKey: 'ขอคีย์ที่ build.nvidia.com',
    nvidiaSaved: 'บันทึกคีย์ NVIDIA แล้ว',
    nvidiaUnverified: 'ติดต่อ NVIDIA ไม่ได้ — บันทึกคีย์แบบยังไม่ยืนยัน',
    nvidiaModelMissing: 'คีย์ใช้ได้ แต่ NVIDIA ไม่มีโมเดล DeepSeek Flash ให้บริการแล้ว',
    nvidiaSaveFailed: 'บันทึกคีย์ไม่สำเร็จ:',
    nvidiaRemoved: 'ลบคีย์ NVIDIA แล้ว',
    nvidiaFreeTier: 'โควตาฟรี',
    nvidiaLimits: '40/นาที · 10,000/วัน',
    tokenharborSection: 'Token Harbor',
    tokenharborKeyLabel: 'API key',
    tokenharborSave: 'บันทึก',
    tokenharborRemove: 'ลบออก',
    tokenharborRemoveTitle: 'ลบคีย์ Token Harbor?',
    tokenharborRemoveSub: 'โมเดล Token Harbor จะหายจากรายการ โมเดลที่กำลังทำงานอยู่จะใช้ต่อจนจบเทิร์น',
    tokenharborConfigured: 'ตั้งค่าแล้ว',
    tokenharborUnreadable: 'คีย์นี้ถูกบันทึกไว้บนเครื่องอื่นและอ่านไม่ได้ที่นี่ — กรอกใหม่',
    tokenharborNotConfigured: 'ยังไม่มีคีย์ — โมเดล Token Harbor จะไม่แสดง',
    tokenharborGetKey: 'ขอคีย์ที่ tokenharbor.ai',
    tokenharborSaved: 'บันทึกคีย์ Token Harbor แล้ว',
    tokenharborUnverified: 'ติดต่อ Token Harbor ไม่ได้ — บันทึกคีย์แบบยังไม่ยืนยัน',
    tokenharborModelMissing: 'คีย์ใช้ได้ แต่ยังไม่ได้เปิด free models ในหน้า dashboard ของ Token Harbor',
    tokenharborSaveFailed: 'บันทึกคีย์ไม่สำเร็จ:',
    tokenharborRemoved: 'ลบคีย์ Token Harbor แล้ว',
    tokenharborFreeTier: 'โควตาฟรี',
    tokenharborLimits: 'โควตารายสัปดาห์',
    llm7Section: 'LLM7.io',
    llm7KeyLabel: 'API key',
    llm7Save: 'บันทึก',
    llm7Remove: 'ลบออก',
    llm7RemoveTitle: 'ลบโทเคน LLM7.io?',
    llm7RemoveSub: 'โมเดล LLM7.io จะหายจากรายการ โมเดลที่กำลังทำงานอยู่จะใช้ต่อจนจบเทิร์น',
    llm7Configured: 'ตั้งค่าแล้ว',
    llm7Unreadable: 'โทเคนนี้ถูกบันทึกไว้บนเครื่องอื่นและอ่านไม่ได้ที่นี่ — กรอกใหม่',
    llm7NotConfigured: 'ยังไม่มีโทเคน — โมเดล LLM7.io จะไม่แสดง',
    llm7GetKey: 'ขอโทเคนที่ dash.llm7.io',
    llm7Saved: 'บันทึกโทเคน LLM7.io แล้ว',
    llm7Unverified: 'LLM7.io ยืนยันโทเคนไม่ได้ — บันทึกไว้แบบยังไม่ยืนยัน',
    llm7SaveFailed: 'บันทึกโทเคนไม่สำเร็จ:',
    llm7Removed: 'ลบโทเคน LLM7.io แล้ว',
    llm7FreeTier: 'โมเดลฟรี (turbo)',
    llm7Limits: '100K โทเคน/วัน · 60/นาที',
    mcpSection: 'MCP',
    mcpHead: 'เซิร์ฟเวอร์ MCP',
    mcpIntro:
      'MCP เพิ่มเครื่องมือให้ AI เซิร์ฟเวอร์ทํางานด้วยสิทธิ์ของคุณ และคําอธิบายเครื่องมือเป็นข้อมูลที่ไม่น่าไว้ใจ จึงต้องอนุมัติทุกครั้งก่อนเรียก MCP tool',
    mcpEnable: 'เปิดใช้เซิร์ฟเวอร์ MCP',
    mcpSave: 'บันทึก',
    mcpSaving: 'กำลังบันทึก…',
    mcpSaved: 'บันทึกแล้ว — มีผลกับ session ใหม่',
    mcpSaveFailed: 'บันทึกไม่สําเร็จ',
    copySystemInfo: 'คัดลอกข้อมูลระบบ',
    systemInfoCopied: 'คัดลอกแล้ว',
    systemInfoFailed: 'คัดลอกไม่สําเร็จ',
    crashNotice: 'เกิดข้อผิดพลาดบางอย่าง คัดลอกข้อมูลระบบแล้วแนบไปในรายงานบั๊กได้เลย',
    mcpLlm7Warn:
      'บน LLM7.io โควตาฟรีอาจเรียก tool ไม่ได้ และทุก tool จะกินโทเคนรายวัน — ควรใช้ค่ายอื่นสำหรับงาน MCP',
    dataRootLabel: 'โฟลเดอร์ข้อมูลของแอป',
    outputFolders: 'โฟลเดอร์ปลายทาง',
    systemPaths: 'ตำแหน่งของระบบ',
    workspaceSection: 'โฟลเดอร์งาน',
    providersSection: 'ผู้ให้บริการ',
    appearanceSection: 'รูปลักษณ์และพฤติกรรม',
    advancedSection: 'ขั้นสูง',
    folderSettings: 'ตั้งค่าโฟลเดอร์',
    apiKeys: 'API Keys',
    accountsKeys: 'บัญชีและคีย์ API',
    providersIntro: 'หนึ่งการ์ดต่อหนึ่งบริษัท คีย์แต่ละอันใช้กับบริการบนการ์ดนั้นเท่านั้น',
    freepiSection: 'FreePi',
    freepiGetKey: 'สมัคร/เข้าสู่ระบบที่ freepi.ai',
    accountSettings: 'บัญชี',
    ntapiSection: 'NTAPI',
    ntapiHint: 'ใช้บัญชี NTAPI (เข้าสู่ระบบด้วย GitHub) แทน API key',
    dataLocations: 'ตำแหน่งข้อมูล',
    resetAll: 'รีเซ็ตทั้งหมด',
    accountSection: 'บัญชีของคุณ',
    accountKind: 'ล็อกอินเป็น',
    accountCredits: 'โควตาวันนี้',
    accountLane: 'เลน',
    accountFile: 'ไฟล์ล็อกอิน',
    accountTokenMissing: 'ยังไม่มีไฟล์ — จะสร้างขึ้นเมื่อล็อกอิน',
    accountTokenNote:
      'เก็บไว้ในเครื่องนี้เท่านั้น และใช้ร่วมกับ terminal CLI — ไม่ติดไปกับโฟลเดอร์แอป',
    accountError: 'อ่านบัญชีไม่ได้',
    acctNone: 'ยังไม่ได้ล็อกอิน',
    acctGuest: 'ผู้เยี่ยมชม (credits จำกัด)',
    acctMember: 'บัญชีของคุณเอง',
    signIn: 'เข้าสู่ระบบ…',
    refreshAccount: 'รีเฟรช',
    signedIn: 'ล็อกอินแล้ว — กำลังเปิดแชทให้…',
    loginTitle: 'เข้าสู่ระบบ FreePi',
    loginSub: 'ใช้บัญชี GitHub ของคุณ — เบราว์เซอร์จะเปิดขึ้นอัตโนมัติ ยืนยันรหัสด้านล่าง',
    loginStepOpen: 'เปิดหน้าเข้าสู่ระบบ GitHub',
    loginOpen: 'เปิด GitHub',
    loginOpenHint: 'กด “เปิด GitHub” เพื่อดำเนินการต่อ',
    loginStepCode: 'ยืนยันรหัสนี้',
    loginCopy: 'คัดลอก',
    loginCopied: 'คัดลอกแล้ว',
    loginWaiting: 'กำลังรอการยืนยันในเบราว์เซอร์…',
    loginOpened: 'เปิดเบราว์เซอร์แล้ว — กำลังรอการยืนยัน…',
    loginSuccess: 'เข้าสู่ระบบแล้ว — กำลังเปิดแชท…',
    loginRetry: 'ลองใหม่',
    loginError: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
    loginTerminal: 'ใช้ terminal แทน',
    signOut: 'ออกจากระบบ',
    signInOpened:
      'เปิดหน้าต่าง terminal แล้ว ล็อกอิน GitHub (ถ้าไม่ขึ้นเองให้พิมพ์ /login) เสร็จแล้วพิมพ์ /exit เพื่อปิดหน้าต่าง กลับมากดปุ่มนี้อีกครั้งเพื่อรีเฟรช',
    signOutConfirm: 'ออกจากระบบบนเครื่องนี้? ครั้งถัดไปจะสร้าง guest session ใหม่',
    defaultTag: 'ค่าเริ่มต้น',
    chooseFolder: 'เลือกโฟลเดอร์…',
    openFolder: 'เปิด',
    resetDefaults: 'คืนค่าเริ่มต้น',
    close: 'ปิด',
    sessionsFolder: 'ประวัติแชท',
    skillsFolder: 'ทักษะ (Skills)',
    prefsFile: 'ไฟล์ตั้งค่าแอป',
    scopeFor: 'ประวัติแชทของ',
    noWorkspaceHint: 'เลือกโฟลเดอร์งานก่อน — ตั้งค่าเหล่านี้จะอ้างอิงจากโฟลเดอร์นั้น',
    noWorkspaceChat: 'ยังไม่ได้เลือกโฟลเดอร์งาน จึงยังไม่มีประวัติแชทให้แสดง',
    open: 'เปิด',
    deleteFromDisk: 'ลบออกจากเครื่อง…',
    deleteTitle: 'ลบแชทนี้?',
    deleteSub: 'แชทนี้จะถูกลบออกจากเครื่องถาวร กู้คืนไม่ได้',
    clearTitle: 'ล้างแชทนี้?',
    clearSub:
      'ลบข้อความและรูปที่แนบในแชทนี้ออกจากดิสก์ — ชื่อแชทและ model ยังอยู่ แชทใหม่เริ่มด้วยบริบทว่างเหมือนกดแชทใหม่ (ไม่เปลือง token เพิ่ม) ไม่แตะ skills, รูปที่ AI สร้าง หรือไฟล์ที่ดาวน์โหลด',
    clearMeta: 'แชทจะเปิดใหม่แบบว่างในโฟลเดอร์เดิม',
    clearNoFile: 'ยังไม่มีไฟล์ประวัติ — จะล้างเฉพาะข้อความที่เปิดอยู่',
    clearAction: 'ล้างแชท',
    clearDone: 'ล้างแชทแล้ว — ลบข้อความและรูปที่แนบเรียบร้อย',
    clearKeptName: 'ล้างแชทแล้ว — เก็บชื่อและ model เดิมไว้ให้',
    deleteFailed: 'ลบไม่ได้: {error}',
    deletedFromDisk: 'ลบแชทนี้ออกจากเครื่องแล้ว',
    attachPathFailed: 'อ่านที่อยู่ไฟล์ “{name}” ไม่ได้ — ใช้ปุ่มแนบไฟล์แทน',
    modelSwitchFailed: 'สลับ model ไม่ได้: {error}',
    unknownError: 'ไม่ทราบสาเหตุ',
    noticeReasoningOverflow:
      'model ใช้เพดานผลลัพธ์หมดไปกับการคิดแล้วไม่ได้ตอบเลย — ลองส่งอีกครั้ง หรือเปลี่ยนไปใช้ model ที่ไม่ใช่สายคิดก่อนตอบ',
    noticeClearUnlink: 'ปิดแชทแล้ว แต่ลบไฟล์ประวัติไม่ได้: {error}',
    noticeClearOutsideStore:
      'ปิดแชทแล้ว แต่ไฟล์ประวัติอยู่นอกโฟลเดอร์ของแอป จึงยังค้างอยู่ในเครื่อง',
    pinChat: 'ปักหมุดแชท',
    unpinChat: 'เอาหมุดออก',
    chatColor: 'สีของแชท',
    colorNone: 'ไม่ใช้สี',
    color_red: 'แดง',
    color_orange: 'ส้ม',
    color_yellow: 'เหลือง',
    color_green: 'เขียว',
    color_blue: 'ฟ้า',
    color_purple: 'ม่วง',
    color_pink: 'ชมพู',
    pinNeedsFile: 'แชทนี้ยังไม่มีไฟล์ประวัติ — ส่งข้อความก่อนแล้วค่อยปักหมุด',
    chooseWorkspace: 'เลือกโฟลเดอร์ทำงานก่อนครับ',
    readyHint: 'พร้อมแล้ว — กด + เพื่อเริ่มเซสชัน',
    chooseToBegin: 'เลือกโฟลเดอร์ทำงานเพื่อเริ่มต้น',
    emptyTitle: 'จะสร้างอะไรกันดี?',
    emptySub: 'เลือกโฟลเดอร์ทางซ้าย แล้วบอกงานที่ต้องการ — NTAPI ทํางานให้ที่นี่ ไม่ต้องใช้ terminal',
    emptyPickFolder: 'เลือกโฟลเดอร์',
    emptyNewChat: 'แชทใหม่',
    emptySettings: 'ตั้งค่า',
    emptyWhere: 'ไฟล์ที่สร้างและดาวน์โหลดจะอยู่ในโฟลเดอร์ที่เลือก',
    dropFiles: 'วางไฟล์เพื่อแนบ',
    removeFromQueue: 'เอาออกจากคิว',
    queueEdit: 'แก้ไข',
    queueSave: 'บันทึก',
    queueCancelEdit: 'ยกเลิก',
    queueReorder: 'ลากเพื่อสลับลำดับ',
    queuePosition: 'ลำดับที่ {n} ในคิว',
    queueEditingNote: 'กำลังแก้ — ยังไม่ส่ง',
    newSession: 'เซสชันใหม่',
    noOutput: '(ไม่มีผลลัพธ์)',
    copied: 'คัดลอกแล้ว',
    copyOutput: 'คัดลอกผลลัพธ์',
    toolRunning: 'กำลังรัน…',
    toolFailed: 'ล้มเหลว',
    toolDone: 'เสร็จ',
    toolsUsed: 'ใช้เครื่องมือ {n} ครั้ง',
    toolsUsedOne: 'ใช้เครื่องมือ 1 ครั้ง',
    narrationMany: 'บันทึกการทำงาน {n} ช่วง',
    narrationOne: 'บันทึกการทำงาน 1 ช่วง',
  actThinking: 'กำลังคิด',
  actTools: 'กำลังใช้เครื่องมือ',
  actNotes: 'กำลังเขียน',
    toolsFailed: 'ล้มเหลว {n}',
    cancel: 'ยกเลิก',
    delete: 'ลบ',
    queuedOne: 'ในคิว: 1',
    queuedMany: 'ในคิว: {n}',
    pctUsed: 'ใช้ไป {n}%',
    spent: 'ใช้ไป {n} จาก {total}',
    allowOnce: 'อนุญาต',
    deny: 'ปฏิเสธ',
    approvalTitle: 'อนุญาตให้รันคําสั่งนี้ไหม?',
    approvalSub: 'AI ต้องการรัน',
    approvalSub2: 'ในโฟลเดอร์นี้',
    signOutTitle: 'ออกจากระบบบนเครื่องนี้?',
    signOutSub: 'token ล็อกอินจะถูกลบออกจากเครื่องนี้ ครั้งถัดไปต้องล็อกอินใหม่',
    signOutMeta: 'ไม่ลบแชทหรือไฟล์ของคุณ',
    waitingForYou: 'กำลังรอคุณตัดสินใจ — ยังไม่มีอะไรถูกทำจนคุณเลือก',
    thinkingShow: 'ดูความคิด',
    thinkingHide: 'ซ่อนความคิด',
    you: 'คุณ',
    assistant: 'NTAPI',
    system: 'ระบบ',
    aboutSection: 'เกี่ยวกับ',
    aboutApp: 'NTAPI',
    aboutVersion: 'เวอร์ชัน',
    aboutDeveloper: 'ผู้พัฒนา',
    aboutNameEn: 'ชื่อ (ภาษาอังกฤษ)',
    aboutNameTh: 'ชื่อ (ภาษาไทย)',
    aboutNickname: 'ชื่อเล่น',
    aboutEmail: 'อีเมล',
    aboutBug: 'แจ้งปัญหาการใช้งาน',
    aboutBugDesc: 'เจอบั๊กหรือใช้งานไม่ได้ ส่งอีเมลมาบอกได้เลยครับ',
    aboutDonation: 'สนับสนุนค่ากาแฟ',
    aboutQrDesc: 'สแกน QR Code เพื่อสนับสนุนค่ากาแฟ',
    updatesSection: 'อัปเดต',
    updateCurrent: 'เวอร์ชันปัจจุบัน',
    checkUpdates: 'ตรวจหาอัปเดต',
    updateIdle: 'ระบบจะตรวจหาอัปเดตเมื่อคุณกดเท่านั้น',
    updateChecking: 'กำลังตรวจหาอัปเดต…',
    updateLatest: 'คุณใช้เวอร์ชันล่าสุดแล้ว',
    updateAvailable: 'มีเวอร์ชันใหม่ {v} ให้อัปเดต',
    updateDownload: 'ดาวน์โหลดอัปเดต',
    updateDownloading: 'กําลังดาวน์โหลด... {p}%',
    updateReady: 'เวอร์ชัน {v} พร้อมติดตั้งแล้ว',
    updateInstall: 'ติดตั้งและรีสตาร์ต',
    updateInstalling: 'กำลังติดตั้ง... โปรแกรมจะปิดและเปิดใหม่เอง',
    notifyDone: 'ทำงานเสร็จแล้ว',
    updateDev: 'ระบบอัปเดตใช้ได้กับเวอร์ชันที่ติดตั้งแล้วเท่านั้น',
    updateError: 'ตรวจหาอัปเดตไม่สำเร็จ: {e}',
  },
};

let lang = 'en';
// Mirrors the prefs blob returned by api.boot(); sidebar width lives here too.
let appPrefs = {};
// Title-bar identity (brand / owner / subtitle), loaded from prefs.
let profile = {};
// Last account snapshot shown in Settings.
let accountData = null;
// Sponsor strip config, as handed over by the main process. Null = no strip.
let sponsor = null;

/** Translate a key, substituting {placeholders}. */
function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let s = table[key] ?? STRINGS.en[key];
  // Failure wording lives in src/error-messages.js, which both processes read:
  // main only reports a key, the renderer picks the language.
  if (s === undefined && globalThis.FPErrorMessages) {
    s = globalThis.FPErrorMessages.messageFor(key, lang, vars || null);
    if (s !== key) return s;
  }
  if (s === undefined) s = key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

/**
 * A span of time in the reader's language (`8.8 วินาที` / `8.8 sec`).
 * duration.js is shared with the tests, and falls back to English if it ever
 * fails to load, so a missing script costs wording, not the whole card.
 *
 * @param {number} ms
 * @param {{decimals?: number}} [opts]
 */
function formatSpan(ms, opts) {
  const fmt = globalThis.FPDuration?.formatDuration;
  if (typeof fmt === 'function') return fmt(ms, lang, opts);
  return `${ms} ms`;
}

/** Apply translations to every element carrying data-i18n. */
function applyLanguage() {
  document.documentElement.lang = lang;
  for (const node of document.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.getAttribute('data-i18n'));
  }
  const btn = el('langBtn');
  if (btn) {
    btn.textContent = lang === 'en' ? 'EN' : 'TH';
    btn.title = lang === 'en' ? 'Switch to Thai' : 'เปลี่ยนเป็นภาษาอังกฤษ';
  }
  const online = el('brandOnline');
  if (online?.dataset.count) {
    const n = Number(online.dataset.count);
    online.textContent = onlineLabel(n);
    online.title =
      lang === 'th' ? `ออนไลน์ตอนนี้ ${n.toLocaleString()} คน` : `${n.toLocaleString()} online now`;
  }
  // The narrowest the column may be depends on how long the longest single line
  // is, and that line is translated: switching Thai/English has to move the floor
  // with it, or one language ends up with a sentence clipped to one line.
  if (typeof applySidebarWidth === 'function') {
    try {
      // The floor moves with the language, so the locked width is re-measured.
      applySidebarWidth();
    } catch {}
  }
  // Placeholders and dialog titles are not plain text nodes.
  el('sessionTitle').placeholder = t('untitled');
  // The effort switch's positions are translated and built in JS rather than
  // marked with data-i18n, so switching language has to repaint them.
  if (typeof paintThinking === 'function') paintThinking(activeView()?.thinking || null);
  // The sponsor strip's wording comes from sponsor.json, not from STRINGS, so it
  // has to be repainted by hand the same way.
  if (typeof paintSponsor === 'function') paintSponsor();
  setBusy(Boolean(activeView()?.busy));
  renderAttachments();
  renderQueue();
  // Language is cosmetic, so it must never disturb a reply in progress.
  // Rebuilding the transcript mid-turn detaches the live assistant bubble:
  // the answer jumps to a fresh bubble and can be lost outright (and the
  // composer draft with it). Re-render only while idle, then put the draft
  // and the scroll position back exactly as they were.
  const draft = input.value;
  const caret = input.selectionStart;
  const scroll = transcript.scrollTop;
  if (!activeView()?.busy) renderActiveTab();
  transcript.scrollTop = scroll;
  if (input.value !== draft) {
    input.value = draft;
    try {
      input.setSelectionRange(caret, caret);
    } catch {}
  }
  if (typeof renderBrowserChip === 'function') renderBrowserChip();
  if (typeof renderBrowserDialog === 'function') renderBrowserDialog();
  // Re-render the status legend so "18% used" follows the language too.
  if (lastUsage) applyUsageLabels(lastUsage);
  if (settingsData && !el('settingsOverlay').hidden) renderSettings();
  if (slashState.open) updateSlashMenu();
}

async function setLanguage(next) {
  lang = next === 'th' ? 'th' : 'en';
  try {
    await api.setPrefs({ lang });
  } catch {}
  applyLanguage();
}

/**
 * One view object per tab. Holding DOM nodes per tab keeps scroll position,
 * streaming text and tool cards intact while you switch between sessions.
 */
const views = new Map();
let activeTabId = null;
/** Last folder the user worked in. Kept after every tab is closed so "+ New"
 *  still has somewhere to start instead of asking for a folder again. */
let lastWorkspace = null;
/** Images staged for the next message in the active tab. */
let pendingImages = [];

/* ------------------------------ helpers ------------------------------ */

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const activeView = () => (activeTabId ? views.get(activeTabId) : null);

/**
 * Repaint the session rows so the running spinner tracks the turn.
 *
 * `renderSessions()` is otherwise rebuilt only when the list itself changes, so a
 * turn that had already finished left the spinner turning on that row until
 * something else happened to redraw the sidebar.
 */
function refreshSessionBusy() {
  if (state.cwd) renderSessions(state.cwd);
}

function createView(tabId) {
  const view = {
    tabId,
    busy: false,
    messages: [],
    liveAssistant: null,
    liveTools: null,
    queue: [],
  };
  views.set(tabId, view);
  return view;
}

/**
 * Whether the view is following the newest message.
 *
 * This is a sticky state, not a measurement. It used to be recomputed on every
 * call as "am I within 48px of the bottom", and that is subtly wrong: content
 * added while the reader sits at the bottom makes the gap larger, so the next
 * check decided they had scrolled away and stopped following. Someone who never
 * touched the scrollbar drifted up the transcript as the answer streamed.
 *
 * Now the answer is decided once, when the reader actually scrolls: landed at the
 * bottom means follow, moved up means stop. Nothing else changes it, so content
 * growing underneath cannot make the app think the reader left.
 *
 * 48px of slack stays, because "the bottom" is not always exactly scrollHeight:
 * a fade, a sub-pixel layout round, or a message that grows while on screen all
 * leave a few pixels over.
 */
const NEAR_BOTTOM_PX = 48;

/** True while new output should keep the view at the bottom. */
let pinnedToBottom = true;

/** True during an explicit jump, so the in-between scroll events are ignored. */
let jumpingToBottom = false;

/** The gap still left below the viewport. */
function distanceFromBottom() {
  return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight;
}

/**
 * Re-decide whether to follow, from where the reader just scrolled to.
 *
 * Called from the scroll event only. Programmatic scrolls also fire it, which is
 * harmless: they land at the bottom and keep the state true.
 */
function syncFollow() {
  // A scroll event during our own smooth scroll can report an intermediate
  // position. Treating that as "the reader left" would unpin them mid-jump.
  if (jumpingToBottom) return;
  pinnedToBottom = distanceFromBottom() <= NEAR_BOTTOM_PX;
  syncJumpToBottom();
}

/** Show the button only when there is somewhere below to go. */
function syncJumpToBottom() {
  if (!jumpToBottom) return;
  jumpToBottom.hidden = !isReadingUp();
}

/** True when the reader has moved up away from the newest message. */
function isReadingUp() {
  return !pinnedToBottom;
}

/**
 * Keep the view pinned to the newest message, but only for a reader who is
 * already there.
 *
 * `force` is for a view change (opening a tab, replaying history) where following
 * the newest message is what the user asked for — not for output arriving while
 * they read.
 */
function scrollToBottom(force = false) {
  if (!force && !pinnedToBottom) {
    syncJumpToBottom();
    return;
  }
  if (force) pinnedToBottom = true;
  transcript.scrollTop = transcript.scrollHeight;
  syncJumpToBottom();
}

function setBusy(value) {
  const view = activeView();
  if (view) view.busy = value;
  sendBtn.hidden = value;
  stopBtn.hidden = !value;
  sendBtn.disabled = value || (!input.value.trim() && pendingImages.length === 0);
  // The working hint gets three softly bouncing dots so a long turn never looks
  // like a frozen window. Plain static text was easy to mistake for a hang.
  if (value) {
    const label = t('working').replace(/[\s.\u2026]+$/, '');
    statusHint.innerHTML = `${escapeHtml(label)}<span class="hint-dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
  } else {
    statusHint.textContent = t('idle');
  }
  input.placeholder = value ? t('placeholderBusy') : t('placeholderIdle');
}

let noticeTimer = null;
/**
 * True while the notice on screen is the "retrying" one. That notice is a passing
 * state, not something the reader has to dismiss: a 503 that retried
 * successfully used to leave "Retrying (1/3)..." above the composer until the
 * window was closed. The end of the turn, or a ceiling on its age, takes it away.
 */
let noticeIsRetry = false;

/**
 * A short note above the composer.
 *
 * It fades in, then fades out before it is hidden. It used to vanish in one frame,
 * which read as a glitch. Nothing needs dismissing either way: this is a passing
 * remark ("sent into the running turn"), not a dialog.
 */
/**
 * What the network stack said, in Thai.
 *
 * Provider failures arrive as raw prose from outside the app: `fetch failed`,
 * `net::ERR_CONNECTION_RESET`, `401 Unauthorized`. Nothing can translate those
 * at the source — so they are mapped here, locally, before the notice is
 * painted. This costs no tokens and no time: it is a table lookup.
 *
 * The patterns are deliberately narrow. A broad rule such as /not found/ would
 * also rewrite "model not found", which is a different problem with a different
 * fix, so each rule matches only the technical token itself.
 */
const TECHNICAL_ERRORS = [
  [/fetch failed|socket hang up|network error|net::ERR_[A-Z_]+/gi,
    'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่'],
  [/\b(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN)\b/g,
    'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คอินเทอร์เน็ตแล้วลองใหม่'],
  [/\bETIMEDOUT\b|timed out/gi, 'หมดเวลารอคำตอบ — ลองใหม่'],
  [/\b429\b|rate.?limit/gi, 'ส่งคำขวเร็วเกินไป — รอสักครู่แล้วลองใหม่'],
  [/\b401\b|unauthori[sz]ed|invalid api key/gi, 'คีย์ไม่ถูกต้องหรือหมดอายุ'],
  [/\b403\b|forbidden/gi, 'ถูกปฏิเสธสิทธิ์ (403)'],
  [/\b404\b/g, 'ไม่พบปลายทาง (404)'],
  [/\b50[0234]\b/g, 'เซิร์ฟเวอร์ผู้ให้บริการมีปัญหา — ลองใหม่ภายหลัง'],
  [/\bENOSPC\b/g, 'ดิสก์เต็ม'],
  [/\bEACCES\b|\bEPERM\b/g, 'ไม่มีสิทธิ์เข้าถึงไฟล์'],
  [/\bENOENT\b/g, 'ไม่พบไฟล์หรือโฟลเดอร์'],
];

/** Rewrite the technical fragments in a notice, leaving everything else alone. */
function softenTechnical(text) {
  let out = String(text || '');
  if (lang !== 'th') return out;
  for (const [pattern, thai] of TECHNICAL_ERRORS) out = out.replace(pattern, thai);
  return out;
}

function showNotice(text, ms) {
  clearTimeout(noticeTimer);
  if (!text) {
    noticeIsRetry = false;
    hideNotice();
    return;
  }
  noticeEl.classList.remove('out');
  noticeEl.hidden = false;
  noticeEl.textContent = softenTechnical(text);
  // Restart the entrance animation even when a notice replaces another one.
  noticeEl.classList.remove('in');
  void noticeEl.offsetWidth;
  noticeEl.classList.add('in');
  if (ms > 0) noticeTimer = setTimeout(hideNotice, ms);
}

/** Fade the notice out, then take it out of the layout. */
function hideNotice() {
  if (!noticeEl || noticeEl.hidden) return;
  noticeEl.classList.add('out');
  noticeTimer = setTimeout(() => {
    noticeEl.hidden = true;
    noticeEl.textContent = '';
    noticeEl.classList.remove('in', 'out');
  }, 200);
}

/* --------------------------- sounds & toasts --------------------------- */

const soundCache = {};
/** Play a UI sound; a missing file or blocked autoplay just stays silent. */
function playSound(name) {
  try {
    const audio = soundCache[name] || (soundCache[name] = new Audio(`assets/sounds/${name}.wav`));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

/** Small card in the bottom-right corner; clicking runs `onClick`, then fades. */
function showToast({ title, body, onClick }) {
  const stack = el('toasts');
  if (!stack) return;
  const card = document.createElement('div');
  card.className = 'toast';
  card.innerHTML = '<div class="toast-title"></div><div class="toast-body"></div>';
  card.querySelector('.toast-title').textContent = title;
  card.querySelector('.toast-body').textContent = body || '';
  const dismiss = () => {
    if (card.classList.contains('out')) return;
    card.classList.add('out');
    setTimeout(() => card.remove(), 220);
  };
  card.addEventListener('click', () => {
    dismiss();
    onClick?.();
  });
  stack.appendChild(card);
  setTimeout(dismiss, 6000);
}

/**
 * Tell the user a turn finished, but only when they are not already watching
 * it. Same tab with the window focused means the answer is right there.
 */
function notifyFinished(view) {
  if (payloadTabIsActive(view) && document.hasFocus()) return;
  playSound('done');
  const title = t('notifyDone');
  const body = view.name || view.label || (lang === 'th' ? 'แชท' : 'Chat');
  showToast({ title, body, onClick: () => activate(view.tabId) });
  if (!document.hasFocus()) api.notifyDone?.({ title, body });
}

/** Electron wraps IPC failures with "Error invoking remote method …"; drop it. */
function errorText(err) {
  return String(err?.message || err || '').replace(
    /^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,
    ''
  );
}

function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const first = Object.entries(args)[0];
  if (!first) return '';
  const value = typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1]);
  return `${first[0]}: ${value}`.replace(/\s+/g, ' ').slice(0, 140);
}

function toolText(result) {
  if (!result) return '';
  const content = result.content ?? result;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (!c) return '';
        // Never turn an image (multi-MB base64) into a DOM text node.
        if (c.type === 'image') return '[image]';
        if (c.type === 'text') return c.text || '';
        return JSON.stringify(c);
      })
      .join('\n');
  }
  return JSON.stringify(content, null, 2);
}

/* ------------------------- live activity chips ------------------------- */

/**
 * The three channels a turn can produce output on, and the chip each one shows.
 * The names match the three collapsible sections, so a chip and the section it
 * refers to are recognisably the same thing.
 */
const ACTIVITY_CHANNELS = {
  think: { label: 'actThinking', icon: '\u{1F4AD}' },
  tools: { label: 'actTools', icon: '\u{1F527}' },
  notes: { label: 'actNotes', icon: '\u{1F4DD}' },
};

/**
 * Show or hide one channel's chip on a message.
 *
 * Only the chip for a channel that is producing output is present at all, which
 * is what "if it is not working on that part, it disappears" asks for. Several
 * channels can be on at once when the model reasons and calls a tool together.
 */
function setActivity(wrap, channel, on) {
  const box = wrap?.querySelector?.('.msg-activity');
  if (!box) return;
  const existing = box.querySelector(`.act-chip[data-act="${channel}"]`);
  if (!on) {
    if (existing) existing.remove();
    box.hidden = !box.querySelector('.act-chip');
    return;
  }
  if (existing) return;
  const spec = ACTIVITY_CHANNELS[channel];
  if (!spec) return;
  const chip = document.createElement('span');
  chip.className = 'act-chip';
  chip.dataset.act = channel;
  chip.innerHTML = `<span class="act-icon" aria-hidden="true">${spec.icon}</span><span class="act-text">${escapeHtml(t(spec.label))}</span>`;
  box.appendChild(chip);
  box.hidden = false;
}

/** Hide every chip: the turn produced nothing more on any channel. */
function clearMsgActivity(wrap) {
  const box = wrap?.querySelector?.('.msg-activity');
  if (!box) return;
  box.replaceChildren();
  box.hidden = true;
  wrap.__runningTools = 0;
}

/* ------------------------------ messages ------------------------------ */

/**
 * The name shown above an assistant reply.
 *
 * It names who actually answered — the provider and the model — rather than
 * this app, because a conversation can move between providers mid-thread and
 * "NTAPI" said nothing about what produced the words. The provider part is
 * upper-cased by CSS (`.msg .role`), so this returns "FreePi | Model: …" and
 * displays as "FREEPI | MODEL: …".
 */
function messageAuthor(view = activeView()) {
  const model = view?.model || null;
  const provider = model?.provider ? FPProvider.providerLabel(model.provider) : '';
  const name = model?.name || model?.id || '';
  // With no model chosen yet the room to name one is unknown; fall back to the
  // plain role label instead of printing a lone separator.
  if (!provider && !name) return t('assistant');
  if (!name) return provider;
  if (!provider) return `Model: ${name}`;
  return `${provider} | ${t('model')}: ${name}`;
}

function addMessage(kind) {
  emptyState.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = `msg ${kind}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent =
    kind === 'user' ? t('you') : kind === 'system' ? t('system') : messageAuthor();
  wrap.appendChild(role);

  if (kind === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);
  } else {
    //
    // A live readout of which parts of the turn are producing output right now.
    //
    // The three detail sections (thinking, tools, notes) are all collapsed, so
    // without this the only sign of activity was a collapsible row appearing —
    // and you had to open each one to find out whether the agent was reasoning,
    // calling a tool, or writing. A chip per active channel answers that at a
    // glance: whatever is running shows, whatever is idle disappears, and two
    // channels can show at once.
    //
    // `aria-live="polite"` so a screen reader hears the change without the
    // interruptions of a full announcement.
    const activity = document.createElement('div');
    activity.className = 'msg-activity';
    activity.setAttribute('aria-live', 'polite');
    activity.hidden = true;
    wrap.appendChild(activity);

    // Thinking is collapsed by default: a small toggle the user can open on demand.
    const thinkWrap = document.createElement('div');
    thinkWrap.className = 'thinking-wrap';

    const toggle = document.createElement('button');
    toggle.className = 'thinking-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.hidden = true; // revealed once the model actually thinks

    const thinking = document.createElement('div');
    thinking.className = 'thinking';
    thinking.hidden = true;

    toggle.addEventListener('click', () => {
      const open = thinking.hidden;
      thinking.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      thinkWrap.classList.toggle('open', open);
      toggle.textContent = open ? `\u25be ${t('thinkingHide')}` : `\u25b8 ${t('thinkingShow')}`;
      if (open) scrollToBottom();
    });
    thinkWrap.appendChild(toggle);
    thinkWrap.appendChild(thinking);
    wrap.appendChild(thinkWrap);

    const toolsWrap = document.createElement('div');
    toolsWrap.className = 'tools-wrap';
    toolsWrap.hidden = true;

    const toolsToggle = document.createElement('button');
    toolsToggle.type = 'button';
    toolsToggle.className = 'tools-toggle';
    toolsToggle.hidden = true;
    toolsToggle.setAttribute('aria-expanded', 'false');

    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.hidden = true;

    toolsToggle.addEventListener('click', () => {
      const open = tools.hidden;
      tools.hidden = !open;
      toolsToggle.setAttribute('aria-expanded', String(open));
      const chev = toolsToggle.querySelector('.tools-chevron');
      if (chev) chev.textContent = open ? '\u25be' : '\u25b8';
      if (open) scrollToBottom();
    });

    toolsWrap.append(toolsToggle, tools);
    wrap.appendChild(toolsWrap);

    const body = document.createElement('div');
    body.className = 'body';
    wrap.appendChild(body);
    // No copy button: selecting the part you want with the mouse is easier than
    // copying the whole reply and deleting the rest, and it leaves the answer
    // itself uncluttered. Code blocks keep their own copy, because a block is
    // exactly what you want to copy whole.
  }

  transcript.appendChild(wrap);
  // A new answer must not pull someone back down who is re-reading an older one.
  scrollToBottom();
  return wrap;
}

function renderUserMessage(text, attachments) {
  const wrap = addMessage('user');
  const bubble = wrap.querySelector('.bubble');
  const imgs = (attachments || []).filter((a) => a.kind !== 'file' && a.dataUri);
  const files = (attachments || []).filter((a) => a.kind === 'file');

  if (imgs.length) {
    const strip = document.createElement('div');
    strip.className = 'bubble-images';
    for (const img of imgs) {
      const im = document.createElement('img');
      im.src = img.dataUri;
      im.alt = '';
      strip.appendChild(im);
    }
    bubble.appendChild(strip);
  }

  if (files.length) {
    const strip = document.createElement('div');
    strip.className = 'bubble-files';
    for (const f of files) {
      const chip = document.createElement('span');
      chip.className = 'bubble-file';
      chip.textContent = `📄 ${f.name}`;
      chip.title = f.path;
      strip.appendChild(chip);
    }
    bubble.appendChild(strip);
  }

  if (text) {
    const p = document.createElement('div');
    p.textContent = text;
    bubble.appendChild(p);
  }

  // Returned so the caller can hang a countdown row under this exact message.
  //
  // The transcript always follows this one to the bottom, even when the reader
  // has scrolled up. The guarded scroll deliberately holds still for an incoming
  // answer, so someone re-reading an old reply is not yanked away mid-sentence —
  // but a message the user just sent is different: they are watching their own
  // words land, and leaving the view where it was means they have to scroll down
  // to find a bubble that is already at the bottom. The normal "am I near the
  // bottom" test cannot be reused here either, because it reads false exactly in
  // the case that matters: they had scrolled up to read, then typed.
  scrollToBottom(true);

  return wrap;
}

/**
 * A message typed while the agent is working is held for a few seconds first.
 *
 * Sending mid-turn was instant and final: a typo, or a second thought, could not
 * be taken back, and the only fix was to send a correction on top. So the message
 * is shown straight away — you see exactly what you sent — with a countdown and
 * two ways out: edit it, or drop it. When the countdown reaches zero it is sent
 * down the path the key would have taken anyway (steer for Enter, queue for
 * Ctrl+Enter), so nothing about sending changes, only the moment of it.
 *
 * If the turn finishes first the message goes immediately: there is no longer
 * anything to wait for.
 */
const HOLD_SECONDS = 5;

/** One pending hold per tab, so switching tabs cannot orphan a timer. */
const holds = new Map();

/**
 * Show the countdown row under a message and schedule the send.
 *
 * `send` is the real send. `giveUp` returns the text to the composer.
 */
/**
 * Show the countdown row and schedule the send.
 *
 * Two places a held message can live: under the bubble it was drawn in (`wrap`),
 * or under its row in the queue (`rowInto`, a function, because the queue is
 * re-rendered and the row does not exist yet at call time). Whichever it is, the
 * message is sent by `send()` at zero, and `onCancel(taken)` undoes it.
 *
 * `onCancel` receives `true` when the user chose "edit" (their words are owed
 * back to the composer) and `false` when they dropped it.
 *
 * The callback is read off the returned record when the button is pressed, not
 * captured here. A caller that has to know the item it just queued
 * (`queueMessage`) can only create its cancel handler after this returns, and a
 * captured `undefined` left Cancel doing nothing at all: the countdown row
 * disappeared but the message stayed in the queue.
 */
function holdMessage(view, wrap, { text, images, send, what, rowInto, onCancel }) {
  cancelHold(view, { silent: true });

  const row = document.createElement('div');
  row.className = 'hold-row';

  const clock = document.createElement('span');
  clock.className = 'hold-clock';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'hold-btn';
  edit.textContent = t('holdEdit');

  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'hold-btn hold-drop';
  drop.textContent = t('holdCancel');

  row.append(clock, edit, drop);
  if (wrap) wrap.appendChild(row);

  let left = HOLD_SECONDS;
  const paint = () => {
    // `what` names the path so the countdown is not a mystery: a message going
    // into the queue reads differently from one joining the running turn.
    clock.textContent = t('holdCountdown', { n: left, what });
  };
  paint();

  const record = {
    id: holdIdFor(view),
    view,
    wrap,
    row,
    text,
    images,
    send,
    onCancel,
    rowInto,
    finished: false,
    timer: null,
  };
  holds.set(view.tabId, record);

  const detach = () => {
    record.finished = true;
    clearInterval(record.timer);
    holds.delete(view.tabId);
    row.remove();
  };

  record.timer = setInterval(() => {
    left -= 1;
    if (left > 0) {
      paint();
      return;
    }
    if (record.finished) return;
    detach();
    send();
  }, 1000);

  const giveBack = (taken) => {
    if (record.finished) return;
    detach();
    // Read from the record, not the destructured parameter: the caller may set
    // it after this function returned.
    const handler = record.onCancel || onCancel;
    if (typeof handler === 'function') {
      handler(taken);
      return;
    }
    // Transcript path: remove the entry and the bubble it drew.
    const at = (view.messages || []).findIndex((m) => m.pending && m.holdId === record.id);
    if (at !== -1) view.messages.splice(at, 1);
    if (wrap) wrap.remove();
    emptyState.hidden = (view.messages || []).length > 0;
    if (taken) {
      input.value = text || '';
      pendingImages = (images || []).slice();
      renderAttachments();
      autoGrow();
      updateSendState();
      input.focus();
    } else {
      showNotice(t('holdDropped'), 1800);
    }
  };

  edit.addEventListener('click', () => giveBack(true));
  drop.addEventListener('click', () => giveBack(false));

  // A queued message's row only exists after renderQueue(), so mount it now.
  if (!wrap && typeof rowInto === 'function') {
    const target = rowInto();
    if (target) target.appendChild(row);
  }

  return record;
}

/** A stable id so the message entry and its row agree on which hold they belong to. */
function holdIdFor(view) {
  view.holdSeq = (view.holdSeq || 0) + 1;
  return `${view.tabId}:${view.holdSeq}`;
}

/**
 * Stop a hold. `silent` keeps the message in the transcript (used by the
 * buttons, which remove it themselves); otherwise it is cancelled because the
 * message can no longer be sent as written — a tab switch, say.
 */
function cancelHold(view, { silent = false } = {}) {
  const record = holds.get(view?.tabId);
  if (!record || record.finished) return;
  record.finished = true;
  clearInterval(record.timer);
  holds.delete(view.tabId);
  record.row.remove();
  if (silent) return;
  // The message never went out, so it must not stay looking sent.
  if (typeof record.onCancel === 'function') {
    record.onCancel(true);
    return;
  }
  const at = (view.messages || []).findIndex((m) => m.pending && m.holdId === record.id);
  if (at !== -1) view.messages.splice(at, 1);
  if (record.wrap) record.wrap.remove();
  emptyState.hidden = (view.messages || []).length > 0;
  // Give the words back rather than swallowing them.
  if (!input.value.trim() && record.text) {
    input.value = record.text;
    autoGrow();
    updateSendState();
  }
}

/**
 * Stop the countdown attached to one queued message, keeping the message.
 *
 * The hold row is drawn inside the queue row it belongs to, so it can be found
 * from the queue id. This is the "I am about to change this message" path: the
 * clock must stop, but the item stays where it is, unlike `cancelHold`, which is
 * for the message being taken back or thrown away.
 */
function cancelHoldFor(queueId) {
  if (!queueId) return false;
  for (const [tabId, record] of [...holds.entries()]) {
    if (record.finished) continue;
    if (record.item?.queueId !== queueId) continue;
    const view = views.get(tabId);
    if (view) cancelHold(view, { silent: true });
    else {
      record.finished = true;
      clearInterval(record.timer);
      holds.delete(tabId);
      record.row.remove();
    }
    return true;
  }
  return false;
}

/** Nothing should fire for a tab the window is no longer showing. */
function cancelAllHolds(exceptTabId) {
  for (const tabId of [...holds.keys()]) {
    if (tabId === exceptTabId) continue;
    const view = views.get(tabId);
    if (view) cancelHold(view, { silent: true });
  }
}

function toolCard(container, { id, name, args }) {
  const card = document.createElement('div');
  card.className = 'tool collapsed';
  card.dataset.toolId = id;
  card.innerHTML = `
    <div class="tool-head">
      <span class="tool-name">${escapeHtml(name)}</span>
      <span class="tool-arg">${escapeHtml(summarizeArgs(args))}</span>
      <span class="tool-status">${escapeHtml(t('toolRunning'))}</span>
    </div>
    <div class="tool-body"></div>
    <button type="button" class="tool-copy" hidden>${escapeHtml(t('copyOutput'))}</button>
  `;
  card.querySelector('.tool-head').addEventListener('click', () => card.classList.toggle('collapsed'));
  card.querySelector('.tool-copy').addEventListener('click', (e) => {
    e.stopPropagation();
    const text = card.querySelector('.tool-body')?.textContent || '';
    if (text.trim()) MD.copyText(text);
    const btn = e.currentTarget;
    btn.textContent = t('copied');
    setTimeout(() => {
      btn.textContent = t('copyOutput');
    }, 1200);
  });
  container.appendChild(card);
  refreshToolsSummary(container);
  scrollToBottom();
  return card;
}

/**
 * One compact line above the answer instead of a stack of cards:
 * "ใช้เครื่องมือ 5 ครั้ง · look_at_image ×3, bash ×2". Clicking opens the cards.
 */
function refreshToolsSummary(container) {
  if (!container) return;
  const wrap = container.closest('.tools-wrap');
  if (!wrap) return;
  const toggle = wrap.querySelector('.tools-toggle');
  if (!toggle) return;

  const cards = [...container.querySelectorAll('.tool')];
  if (!cards.length) {
    toggle.hidden = true;
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  const counts = new Map();
  for (const card of cards) {
    const name = card.querySelector('.tool-name')?.textContent || 'tool';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const names = [...counts.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name));
  const failed = cards.filter((card) => card.classList.contains('error')).length;
  const label = cards.length === 1 ? t('toolsUsedOne') : t('toolsUsed', { n: cards.length });
  const open = !container.hidden;

  toggle.textContent = '';
  const chev = document.createElement('span');
  chev.className = 'tools-chevron';
  chev.textContent = open ? '\u25be' : '\u25b8';
  const text = document.createElement('span');
  text.textContent = label;
  const detail = document.createElement('span');
  detail.className = 'tools-names';
  detail.textContent = failed
    ? `${names.join(', ')} · ${t('toolsFailed', { n: failed })}`
    : names.join(', ');
  toggle.append(chev, text, detail);
  toggle.classList.toggle('has-error', failed > 0);
  toggle.hidden = false;
  toggle.setAttribute('aria-expanded', String(open));
}

/* ------------------------------ sessions UI ------------------------------ */

/* ------------------------------ model picker ------------------------------ */
/*
 * The catalog is one flat, provider-tagged list. Rendering it as one native
 * <select> turned FreePi + Coarena + Zro into a wall of near-identical names,
 * so the visible control groups the same list by provider and leads each group
 * with that provider's mark. The hidden <select> stays the single source of
 * truth for IPC and the existing change handler.
 */

function modelKey(model) {
  return model ? `${model.provider}||${model.id}` : '';
}

function paintProviderMark(mark, provider) {
  if (!mark) return;
  mark.replaceChildren();
  if (!provider) return;

  const logo = FPProvider.providerLogoPath(provider);
  if (logo) {
    const img = document.createElement('img');
    img.src = logo;
    img.alt = '';
    img.draggable = false;
    // A missing bundled file must not leave an empty square in the picker.
    img.addEventListener(
      'error',
      () => {
        mark.replaceChildren();
        const letter = document.createElement('span');
        letter.className = 'model-logo-letter';
        letter.textContent = FPProvider.providerInitial(provider);
        mark.appendChild(letter);
      },
      { once: true }
    );
    mark.appendChild(img);
    return;
  }

  const letter = document.createElement('span');
  letter.className = 'model-logo-letter';
  letter.textContent = FPProvider.providerInitial(provider);
  mark.appendChild(letter);
}

function paintModelTrigger(model) {
  const provider = model?.provider || '';
  const name = model?.name || model?.id || '';
  paintProviderMark(modelPickerMark, provider);
  modelPickerProvider.textContent = provider ? FPProvider.providerLabel(provider) : t('model');
  modelPickerName.textContent = name || '—';
  modelPickerBtn.title = model ? `${t('model')}: ${FPProvider.modelOptionLabel(model)}` : t('model');
  modelPickerBtn.setAttribute(
    'aria-label',
    model ? `${t('model')}: ${FPProvider.modelOptionLabel(model)}` : t('model')
  );
  // The badge follows the closed button too, so a paid model is never active
  // without the window saying so.
  const plan = model ? FPProvider.modelPlan(model) : 'free';
  modelPickerPlan.hidden = !model;
  modelPickerPlan.className = `model-picker-plan ${plan}`;
  modelPickerPlan.textContent = model ? planText(model) : '';
  modelPickerPlan.title = model ? planTitle(model) : '';
}

/* ------------------------------ free vs paid ------------------------------ */

/**
 * Short text for a plan badge. A paid row shows the cost the catalog named
 * (`18x`, `$0.30/$1.10`) when there is one; the codes below are what a provider
 * sends when the cost needs a phrase instead of a number.
 */
const PLAN_NOTE_KEYS = {
  credit: 'planNoteCredit',
  daily: 'planNoteDaily',
  trial: 'planNoteTrial',
  wallet: 'planNoteWallet',
  routed: 'planNoteRouted',
};

function planText(model) {
  if (FPProvider.modelPlan(model) === 'free') return t('planFree');
  const note = String(model?.planNote || '').trim();
  if (!note) return t('planPaid');
  return PLAN_NOTE_KEYS[note] ? t(PLAN_NOTE_KEYS[note]) : note;
}

/** Longer form for a tooltip: `Cost: billed to wallet`. */
function planTitle(model) {
  return `${t('planLabel')}: ${planText(model)}`;
}

function modelOptionButton(model, current) {
  const provider = FPProvider.providerLabel(model.provider);
  const name = model.name || model.id;
  const plan = FPProvider.modelPlan(model);
  const selected = Boolean(
    current && current.provider === model.provider && current.id === model.id
  );
  const fav = favoriteModels.has(modelKey(model));

  const holder = document.createElement('div');
  holder.className = 'model-row';

  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'model-option';
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(selected));
  row.setAttribute('aria-label', `${FPProvider.modelOptionLabel(model)} — ${planTitle(model)}`);
  row.dataset.provider = model.provider;
  row.dataset.id = model.id;
  row.dataset.value = `${model.provider}||${model.id}`;
  row.dataset.plan = plan;
  // Provider, plan words and the id are all searchable, so "coarena" narrows
  // the whole list and "paid" (or "เสียเงิน") narrows to the rows that cost.
  row.dataset.search =
    `${provider} ${name} ${model.id} ${plan} ${plan === 'paid' ? 'paid เสียเงิน' : 'free ฟรี'}`.toLowerCase();
  row.tabIndex = -1;

  const check = document.createElement('span');
  check.className = 'model-option-check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '\u2713';

  const label = document.createElement('span');
  label.className = 'model-option-name';
  label.textContent = name;

  // The heading above already says the row is free, so only a row that spends
  // money carries a badge — and it carries the cost when the catalog knew one.
  row.append(check, label);
  if (plan === 'paid') {
    const badge = document.createElement('span');
    badge.className = 'model-plan paid';
    badge.textContent = planText(model);
    row.appendChild(badge);
  }

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'model-star' + (fav ? ' on' : '');
  star.dataset.provider = model.provider;
  star.dataset.id = model.id;
  star.textContent = fav ? '\u2605' : '\u2606';
  star.title = fav ? t('unstar') : t('star');
  star.setAttribute('aria-label', star.title);
  star.setAttribute('aria-pressed', String(fav));

  holder.append(row, star);
  return holder;
}

function renderModelMenu(models, current) {
  modelList.replaceChildren();
  const list = Array.isArray(models) ? models : [];

  // Favourites sit in their own folder on top so a starred model is one click
  // away regardless of provider. It is a shortcut: the model still appears
  // under its provider below.
  const favorites = list.filter((model) => favoriteModels.has(modelKey(model)));
  if (favorites.length) modelList.appendChild(favoriteGroup(favorites, current));

  const groups = FPProvider.groupModelsByProvider(list);
  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'model-group';
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', group.label);

    const head = document.createElement('div');
    head.className = 'model-group-head';

    const mark = document.createElement('span');
    mark.className = 'model-group-mark';
    paintProviderMark(mark, group.provider);

    const label = document.createElement('span');
    label.className = 'model-group-name';
    label.textContent = group.label;

    const count = document.createElement('span');
    count.className = 'model-group-count';
    count.textContent = String(group.models.length);

    head.append(mark, label, count);
    section.appendChild(head);

    // Every provider gets its free / paid headings, even when only one kind is
    // present: a paid row must never sit unlabelled among free ones, and an
    // all-free provider should say so rather than leave the user guessing.
    for (const part of group.sections) {
      const bucket = document.createElement('div');
      bucket.className = 'model-section';
      bucket.dataset.plan = part.plan;

      const sub = document.createElement('div');
      sub.className = `model-section-head ${part.plan}`;
      sub.textContent = part.plan === 'paid' ? t('planSectionPaid') : t('planSectionFree');
      const subCount = document.createElement('span');
      subCount.className = 'model-section-count';
      subCount.textContent = String(part.models.length);
      sub.appendChild(subCount);
      bucket.appendChild(sub);

      for (const model of part.models) {
        bucket.appendChild(modelOptionButton(model, current));
      }
      section.appendChild(bucket);
    }
    modelList.appendChild(section);
  }
}

function visibleModelOptions() {
  return [...modelList.querySelectorAll('.model-option')].filter(
    (row) =>
      !row.hidden &&
      !row.closest('.model-row')?.hidden &&
      !row.closest('.model-section')?.hidden &&
      !row.closest('.model-group')?.hidden
  );
}

function filterModelMenu() {
  const query = modelSearch.value.trim().toLowerCase();
  const freeOnly = Boolean(modelFreeOnly?.checked);
  let visible = 0;
  for (const group of modelList.querySelectorAll('.model-group')) {
    let shown = 0;
    for (const section of group.querySelectorAll('.model-section')) {
      let inSection = 0;
      for (const row of section.querySelectorAll('.model-option')) {
        const match =
          (!query || row.dataset.search.includes(query)) &&
          (!freeOnly || row.dataset.plan === 'free');
        (row.closest('.model-row') || row).hidden = !match;
        if (match) inSection += 1;
      }
      section.hidden = inSection === 0;
      shown += inSection;
    }
    group.hidden = shown === 0;
    visible += shown;
  }
  modelMenuEmpty.hidden = visible > 0;
  modelMenuEmpty.textContent = t('noModelsMatch');
}

function syncModelMenuSelection() {
  const value = modelSelect.value;
  for (const row of modelList.querySelectorAll('.model-option')) {
    row.setAttribute('aria-selected', String(row.dataset.value === value));
  }
}

function openModelMenu() {
  if (!modelSelect.options.length || modelPickerBtn.disabled) return;
  modelMenu.hidden = false;
  modelPickerBtn.setAttribute('aria-expanded', 'true');
  modelSearch.value = '';
  modelSearch.placeholder = t('searchModels');
  filterModelMenu();

  // Bring the active model into view before the user starts typing.
  const selected = modelList.querySelector('.model-option[aria-selected="true"]');
  if (selected) selected.scrollIntoView({ block: 'center' });

  requestAnimationFrame(() => {
    modelSearch.focus({ preventScroll: true });
    modelSearch.select();
  });
}

function closeModelMenu({ focus = false } = {}) {
  if (modelMenu.hidden) return;
  modelMenu.hidden = true;
  hideModelTip();
  modelPickerBtn.setAttribute('aria-expanded', 'false');
  if (focus) modelPickerBtn.focus({ preventScroll: true });
}

function toggleModelMenu() {
  if (modelMenu.hidden) openModelMenu();
  else closeModelMenu({ focus: true });
}

function moveModelMenuFocus(delta) {
  const options = visibleModelOptions();
  if (!options.length) return;
  const at = options.indexOf(document.activeElement);
  const next =
    at === -1 ? (delta > 0 ? 0 : options.length - 1) : (at + delta + options.length) % options.length;
  options[next].focus({ preventScroll: true });
  options[next].scrollIntoView({ block: 'nearest' });
}

function chooseModel(provider, id) {
  if (!provider || !id) return;
  closeModelMenu({ focus: true });
  const next = `${provider}||${id}`;
  if (modelSelect.value === next) return;
  modelSelect.value = next;
  if (modelSelect.value !== next) return;
  modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderModelPicker(view) {
  const models = Array.isArray(view?.models) ? view.models : [];
  const current = view?.model || null;

  modelSearch.placeholder = t('searchModels');
  modelMenuEmpty.textContent = t('noModelsMatch');
  modelList.setAttribute('aria-label', t('model'));
  modelFreeOnlyLabel.textContent = t('freeOnly');
  modelFreeOnly.title = t('freeOnly');
  modelFreeOnly.setAttribute('aria-label', t('freeOnly'));

  modelSelect.innerHTML = '';
  for (const model of models) {
    const option = document.createElement('option');
    option.value = modelKey(model);
    option.textContent = FPProvider.modelOptionLabel(model);
    if (current && model.provider === current.provider && model.id === current.id) {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  }

  modelPickerBtn.disabled = models.length === 0;
  paintModelTrigger(current);
  menuModels = models;
  menuCurrent = current;
  renderModelMenu(models, current);
  syncModelMenuSelection();

  if (!models.length) closeModelMenu();
  else if (!modelMenu.hidden) filterModelMenu();
}

modelPickerBtn.addEventListener('click', toggleModelMenu);

// "Free only" is a display preference rather than a credential, so
// localStorage is the right shelf for it. The default is to show everything.
const FREE_ONLY_KEY = 'ntapi.modelFreeOnly';
try {
  modelFreeOnly.checked = localStorage.getItem(FREE_ONLY_KEY) === '1';
} catch {}
modelFreeOnly.addEventListener('change', () => {
  try {
    localStorage.setItem(FREE_ONLY_KEY, modelFreeOnly.checked ? '1' : '0');
  } catch {}
  filterModelMenu();
});

/* ------------------------- favourite models ------------------------- */

// Stars live in localStorage next to the "free only" preference: cosmetic,
// per machine, and never sent to a provider.
const FAVORITES_KEY = 'ntapi.favoriteModels';
let favoriteModels = new Set();
try {
  const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  if (Array.isArray(saved)) favoriteModels = new Set(saved.filter((v) => typeof v === 'string'));
} catch {}
let menuModels = [];
let menuCurrent = null;

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteModels]));
  } catch {}
}

function toggleFavorite(provider, id) {
  if (!provider || !id) return;
  const key = `${provider}||${id}`;
  if (favoriteModels.has(key)) favoriteModels.delete(key);
  else favoriteModels.add(key);
  saveFavorites();
  renderModelMenu(menuModels, menuCurrent);
  filterModelMenu();
  syncModelMenuSelection();
}

/** The starred models as their own folder at the top of the list. */
function favoriteGroup(models, current) {
  const group = document.createElement('div');
  group.className = 'model-group model-group-fav';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', t('favorites'));

  const head = document.createElement('div');
  head.className = 'model-group-head';
  const mark = document.createElement('span');
  mark.className = 'model-group-mark model-group-mark-star';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '\u2605';
  const label = document.createElement('span');
  label.className = 'model-group-name';
  label.textContent = t('favorites');
  const count = document.createElement('span');
  count.className = 'model-group-count';
  count.textContent = String(models.length);
  head.append(mark, label, count);
  group.appendChild(head);

  const bucket = document.createElement('div');
  bucket.className = 'model-section';
  bucket.dataset.plan = 'free';
  for (const model of models) bucket.appendChild(modelOptionButton(model, current));
  group.appendChild(bucket);
  return group;
}

/* --------------------- provider bubble on hover --------------------- */

// A native title cannot show a logo, so the provider a row belongs to is shown
// in a rounded bubble instead.
const modelTip = el('modelTip');

function showModelTip(row) {
  if (!modelTip) return;
  const provider = row.dataset.provider;
  const logo = FPProvider.providerLogoPath(provider);
  modelTip.replaceChildren();
  if (logo) {
    const img = document.createElement('img');
    img.src = logo;
    img.alt = '';
    modelTip.appendChild(img);
  } else {
    const letter = document.createElement('span');
    letter.className = 'model-tip-letter';
    letter.textContent = FPProvider.providerInitial(provider);
    modelTip.appendChild(letter);
  }
  const text = document.createElement('span');
  text.textContent = FPProvider.providerLabel(provider);
  modelTip.appendChild(text);

  modelTip.hidden = false;
  const r = row.getBoundingClientRect();
  const w = modelTip.offsetWidth;
  const h = modelTip.offsetHeight;
  let top = r.top - h - 8;
  if (top < 8) top = r.bottom + 8;
  let left = r.left;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (left < 8) left = 8;
  modelTip.style.top = `${top}px`;
  modelTip.style.left = `${left}px`;
}

function hideModelTip() {
  if (modelTip) modelTip.hidden = true;
}

modelList.addEventListener('pointerover', (e) => {
  const row = e.target.closest?.('.model-option');
  if (row) showModelTip(row);
});
modelList.addEventListener('pointerout', (e) => {
  if (!e.relatedTarget || !e.relatedTarget.closest?.('.model-option')) hideModelTip();
});
modelList.addEventListener('scroll', hideModelTip);
modelPickerBtn.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    openModelMenu();
  }
});

modelSearch.addEventListener('input', filterModelMenu);
modelSearch.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    moveModelMenuFocus(e.key === 'ArrowDown' ? 1 : -1);
  } else if (e.key === 'Enter') {
    const first = visibleModelOptions()[0];
    if (first) {
      e.preventDefault();
      first.click();
    }
  }
});

modelList.addEventListener('click', (e) => {
  const star = e.target.closest('.model-star');
  if (star) {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(star.dataset.provider, star.dataset.id);
    return;
  }
  const row = e.target.closest('.model-option');
  if (!row) return;
  chooseModel(row.dataset.provider, row.dataset.id);
});

modelMenu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeModelMenu({ focus: true });
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    // Search handles its own arrows above; options move from here.
    if (e.target === modelSearch) return;
    e.preventDefault();
    moveModelMenuFocus(e.key === 'ArrowDown' ? 1 : -1);
  }
});

document.addEventListener('pointerdown', (e) => {
  if (!modelMenu.hidden && !modelPicker.contains(e.target)) closeModelMenu();
});

modelPicker.addEventListener('focusout', () => {
  // relatedTarget is null for some native clicks, so check after focus settles.
  setTimeout(() => {
    if (!modelMenu.hidden && !modelPicker.contains(document.activeElement)) closeModelMenu();
  }, 0);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modelMenu.hidden) {
    e.preventDefault();
    closeModelMenu({ focus: true });
  }
});

function renderActiveTab() {
  const view = activeView();
  if (!view) {
    transcript.innerHTML = '';
    transcript.appendChild(emptyState);
    emptyState.hidden = false;
    hideSkeleton();
    sessionTitle.value = '';
    el('sessionDot').hidden = true;
    closeModelMenu();
    renderModelPicker(null);
    setBusy(false);
    return;
  }

  sessionTitle.value = view.name || '';
  el('sessionDot').hidden = false;
  sessionTitle.placeholder = view.sessionId
    ? `Session ${String(view.sessionId).slice(0, 8)}`
    : t('untitled');
  el('cwdLabel').textContent = view.cwd || '…';
  el('guestBadge').hidden = !view.guest;

  renderModelPicker(view);

  transcript.innerHTML = '';
  transcript.appendChild(emptyState);
  const messages = view.messages || [];
  emptyState.hidden = messages.length > 0;
  hideSkeleton();
  const generation = ++renderGeneration;

  let currentAssistant = null;
  // Drawing is per entry and it must stay that way: one entry the renderer cannot
  // handle used to end the repaint where it threw, so the chat showed a prefix of
  // itself — and the next repaint failed at the same entry and cut it again. The
  // messages were never lost (a restart proved it); only the drawing stopped.
  let drawn = 0;
  const gaps = [];
  const draw = (m) => {
    if (m.kind === 'user') {
      renderUserMessage(m.text, m.images);
      currentAssistant = null;
    } else if (m.kind === 'assistant') {
      const text = m.text || '';
      const tools = m.tools || [];
      // A tool-using turn is stored as several assistant messages (one per
      // step). Group the steps into one bubble so the transcript shows a
      // single "tools used" line and the final answer right below it.
      const bodyText = currentAssistant?.querySelector(':scope > .body')?.textContent || '';
      const prevHasTools = Boolean(currentAssistant?.querySelector('.tool'));
      const reuse =
        Boolean(currentAssistant) &&
        !bodyText.trim() &&
        ((!text.trim() && tools.length > 0) || (text.trim() && prevHasTools));
      const wrap = reuse ? currentAssistant : addMessage('assistant');
      currentAssistant = wrap;
      if (m.thinking) {
        const th = wrap.querySelector('.thinking');
        const toggle = wrap.querySelector('.thinking-toggle');
        if (th && toggle) {
          th.textContent = m.thinking;
          toggle.hidden = false;
          toggle.textContent = `\u25b8 ${t('thinkingShow')}`;
        }
      }
      if (text) {
        // `currentBody` continues an unfinished block and starts a new one after
        // a seal. Using the first `.body` instead appended every block of a turn
        // into the top one — which is why a replayed chat showed one enormous
        // bubble that could not be folded.
        const body = currentBody(wrap);
        body.__fpText = body.__fpText ? `${body.__fpText}${text}` : text;
        MD.renderInto(body, body.__fpText, { copiedLabel: t('copied') });
        appendImagePreviews(body, text, view.cwd);
      }
      const tc = wrap.querySelector('.tools');
      for (const tool of tools) toolCard(tc, tool);
    } else if (m.kind === 'error') {
      // Replayed from history: keep the failure visible instead of a blank turn.
      appendErrorBanner(m.text, false);
      currentAssistant = null;
    } else if (m.kind === 'tool') {
      const target = currentAssistant?.querySelector('.tools');
      if (!target) return;
      // A tool call ends the prose before it, exactly as it does live, so a
      // reopened chat shows the same folded narration it showed while running.
      if (currentAssistant) sealBody(currentAssistant);
      const card =
        target.querySelector(`[data-tool-id="${m.id}"]`) || toolCard(target, { id: m.id, name: m.name, args: {} });
      const stored = view.toolResults?.get(m.id);
      applyToolResult(
        card,
        stored || {
          text: m.text || t('noOutput'),
          isError: m.isError,
          durationMs: m.durationMs,
          diff: m.diff || null,
        },
        view.cwd
      );
    }
  };
  const total = messages.length;
  const drawRange = (from, to) => {
    // Grouping walks forward and needs a clean start: a chunk that began on a tool
    // step would paint a second bubble header for the same turn.
    currentAssistant = null;
    for (let i = from; i < to; i += 1) {
      const m = messages[i];
      try {
        draw(m);
        drawn += 1;
      } catch (err) {
        gaps.push({ index: i, kind: m && m.kind, detail: err instanceof Error ? err.message : String(err) });
        currentAssistant = null;
      }
    }
  };

  // A long conversation is a megabyte of markdown — code blocks, the highlighter,
  // the lot — and drawing all of it before the window can do anything is what made
  // opening a chat, and coming back to its tab, feel stuck for seconds. Draw the
  // end of the chat first, because that is the part the reader is looking at, and
  // fill the history in above it once the window is already answering.
  const tailFrom = total > RENDER_TAIL_MESSAGES * 2 ? alignChunk(messages, total - RENDER_TAIL_MESSAGES) : 0;
  drawRange(tailFrom, total);

  setBusy(Boolean(view.busy));
  scrollToBottom(true);
  renderAttachments();
  renderQueue();
  syncProviderChrome(view);

  // Ranges still to draw, nearest to the tail first: reading upward, the history
  // arrives in the order it is being looked at.
  const pending = [];
  for (let at = tailFrom; at > 0; ) {
    const from = at > RENDER_CHUNK_MESSAGES ? alignChunk(messages, at - RENDER_CHUNK_MESSAGES) : 0;
    pending.push([from, at]);
    at = from;
  }
  if (!pending.length) {
    if (gaps.length) reportTranscriptGaps(view, gaps, total, drawn);
    return;
  }

  let topAnchor = null;
  const paintNext = () => {
    // Another repaint (a new message, a tab switch) owns the transcript now.
    if (generation !== renderGeneration) return;
    const [from, to] = pending.shift();
    const wasAtBottom = pinnedToBottom;
    const heightBefore = transcript.scrollHeight;
    const before = new Set(transcript.childNodes);

    drawRange(from, to);

    const added = [...transcript.childNodes].filter((node) => !before.has(node));
    const anchor = topAnchor || emptyState.nextSibling;
    for (const node of added) transcript.insertBefore(node, anchor);
    if (added.length) topAnchor = added[0];

    // Inserting above the viewport pushes the visible text down. Put the reader
    // back where they were, unless they were following the bottom of the chat.
    if (wasAtBottom) scrollToBottom();
    else transcript.scrollTop += Math.max(0, transcript.scrollHeight - heightBefore);

    if (pending.length) setTimeout(paintNext, 0);
    else if (gaps.length) reportTranscriptGaps(view, gaps, total, drawn);
  };
  setTimeout(paintNext, 0);
}

/** How much of a conversation has to be on screen before the window is usable. */
const RENDER_TAIL_MESSAGES = 24;
/** How much history each follow-up pass draws; roughly a long scroll of text. */
const RENDER_CHUNK_MESSAGES = 30;
/** Bumped by every repaint so a half-finished fill stops when a newer one starts. */
let renderGeneration = 0;

/**
 * Move a chunk edge back to a user message, so a chunk never starts mid-turn.
 * Tool steps are stored as separate assistant messages and are grouped into the
 * bubble above them; starting a chunk on one would show a stray second header.
 */
function alignChunk(messages, index) {
  let at = Math.max(0, Math.min(index, messages.length));
  while (at > 0 && at < messages.length && messages[at] && messages[at].kind !== 'user') at -= 1;
  return at;
}

/**
 * Say that a repaint could not draw everything, and keep a line on disk.
 *
 * The console alone is not enough: the failure is invisible after the fact — the
 * chat is short, the session file is complete, and the app looks fine once it has
 * been restarted. One report per repaint, capped, so a broken entry cannot fill
 * the log.
 */
let transcriptGapReports = 0;
function reportTranscriptGaps(view, gaps, total, drawn) {
  if (transcriptGapReports > 40) return;
  transcriptGapReports += 1;
  const summary = gaps
    .slice(0, 5)
    .map((g) => `#${g.index} ${g.kind}: ${g.detail}`)
    .join(' | ');
  console.error(`[transcript] drew ${drawn}/${total} — ${summary}`);
  try {
    api.uiLog?.(
      `transcript gap tab=${view?.tabId || '?'} drew=${drawn}/${total} gaps=${gaps.length} :: ${summary}`,
    );
  } catch {}
}

/* ------------------------- provider chrome ------------------------- */

let coarenaStatus = null;
let coarenaStatusAt = 0;
let coarenaStatusPromise = null;

/**
 * One window, two providers: the meter and the ad slot follow the active
 * model. FreePi shows usage and ads; Coarena shows its own published limits.
 */
function syncProviderChrome(view) {
  const chrome = FPProvider.providerChrome(view?.model);
  const freePiUsage = el('freePiUsage');
  const providerUsage = el('providerUsage');
  if (freePiUsage) freePiUsage.hidden = chrome.meter !== null;
  if (providerUsage) providerUsage.hidden = chrome.meter === null;
  // The pill follows the same split: FreePi's credit bar, or whichever provider
  // is paying and what it says about its own allowance.
  const stripFree = el('statusFree');
  const stripProvider = el('statusProvider');
  if (stripFree) stripFree.hidden = chrome.meter !== null;
  if (stripProvider) stripProvider.hidden = chrome.meter === null;
  if (!chrome.showAds) adSlot.hidden = true;
  paintProviderMeter(view);
  // The key can arrive while this tab is already open, so the meter fetches its
  // own status instead of relying on Settings having been opened.
  if (chrome.meter === 'coarena') ensureCoarenaStatus().catch(() => {});
}

/** Throttled status read: syncProviderChrome runs on every tab paint. */
async function ensureCoarenaStatus(force = false) {
  if (coarenaStatusPromise) return coarenaStatusPromise;
  if (!force && Date.now() - coarenaStatusAt < 30_000) return coarenaStatus;
  coarenaStatusPromise = refreshCoarenaStatus().finally(() => {
    coarenaStatusPromise = null;
  });
  return coarenaStatusPromise;
}

function paintProviderMeter(view) {
  const chrome = FPProvider.providerChrome(view?.model);
  const name = el('providerName');
  const label = el('providerMeterLabel');
  const text = el('providerMeterText');
  const barWrap = el('providerBarWrap');
  const resetsRow = el('providerResetsRow');
  // Mirrors of the two lines, in the topbar pill. Written here rather than from a
  // second pass so the pill and the popover can never disagree.
  const pillName = el('statusProviderName');
  const pillMeter = el('statusProviderMeter');
  const mirror = () => {
    if (pillName) pillName.textContent = name.textContent;
    if (pillMeter) pillMeter.textContent = text.textContent;
  };
  if (!name || !text || !label) return;
  if (chrome.meter === null) return;

  // The budget bar and resets row belong to Coarena; hide them for every other
  // provider so switching models never leaves a stale bar behind.
  if (barWrap) barWrap.hidden = true;
  if (resetsRow) resetsRow.hidden = true;

  name.textContent = FPProvider.providerLabel(view?.model?.provider);
  if (chrome.meter === 'coarena') {
    label.textContent = t('coarenaLimits');
    text.textContent = coarenaStatus?.info ? FPProvider.coarenaMeterText(coarenaStatus.info) : '—';
    // When the key reports a daily USD allowance, show it as a bar so the user
    // can see how close to the cap they are, not just a raw limits line.
    const budget = FPProvider.coarenaBudget(coarenaStatus?.info);
    if (budget && barWrap) {
      barWrap.hidden = false;
      const fill = el('providerBarFill');
      fill.style.width = `${budget.pct}%`;
      fill.className =
        'usage-bar-fill' + (budget.pct >= 90 ? ' danger' : budget.pct >= 70 ? ' warn' : '');
      el('providerPct').textContent = t('pctUsed', { n: budget.pct });
      el('providerUsed').textContent = `$${budget.used.toFixed(2)} / $${budget.limit.toFixed(2)}`;
      if (budget.resetsAt && resetsRow) {
        const when = new Date(budget.resetsAt);
        resetsRow.hidden = false;
        el('providerResets').textContent = formatShortDateTime(when);
        el('providerResets').title = when.toLocaleString();
      }
    }
  } else if (chrome.meter === 'nvidia') {
    // NVIDIA publishes no usage endpoint; show the free-tier shape instead.
    label.textContent = t('nvidiaFreeTier');
    text.textContent = t('nvidiaLimits');
  } else if (chrome.meter === 'tokenharbor') {
    // Token Harbor shows its allowance as a percentage in its own dashboard.
    label.textContent = t('tokenharborFreeTier');
    text.textContent = `${t('tokenharborLimits')} · ${view?.model?.name || '—'}`;
  } else if (chrome.meter === 'llm7') {
    // The balance lives in LLM7.io's dashboard; the free turbo lane is the part
    // worth naming here, since a zero balance still leaves it usable.
    label.textContent = t('llm7FreeTier');
    text.textContent = `${t('llm7Limits')} · ${view?.model?.name || '—'}`;
  } else {
    label.textContent = t('model');
    text.textContent = view?.model?.name || '—';
  }
  mirror();
}

/** Settings copy for the key: never the key itself, only what it is worth. */
function paintCoarenaSettings() {
  const node = el('coarenaStatus');
  const remove = el('coarenaRemove');
  if (!node) return;

  const s = coarenaStatus;
  let text = t('coarenaNotConfigured');
  if (s?.configured && s.readable) {
    const how = s.encrypted ? t('coarenaEncrypted') : t('coarenaPlaintext');
    text = `${t('coarenaConfigured')} · ${how}`;
    if (s.hint) text += ` · …${s.hint}`;
    if (s.info?.label) text += ` · ${s.info.label}`;
    if (s.infoError) text += ` · ${s.infoError}`;
  } else if (s?.configured) {
    text = t('coarenaUnreadable');
  }

  node.textContent = text;
  node.classList.toggle('warn', Boolean(s?.configured && !s.readable));
  if (remove) remove.disabled = !s?.configured;
}

async function refreshCoarenaStatus() {
  coarenaStatusAt = Date.now();
  try {
    coarenaStatus = await api.coarenaStatus();
  } catch {
    coarenaStatus = null;
  }
  paintCoarenaSettings();
  paintProviderMeter(activeView());
  return coarenaStatus;
}

/* Zro keeps no remote metadata: its status is the store's own state. */
let zroStatus = null;

function paintZroSettings() {
  const node = el('zroStatus');
  const remove = el('zroRemove');
  if (!node) return;

  const s = zroStatus;
  let text = t('zroNotConfigured');
  if (s?.configured && s.readable) {
    const how = s.encrypted ? t('coarenaEncrypted') : t('coarenaPlaintext');
    text = `${t('zroConfigured')} · ${how}`;
    if (s.hint) text += ` · …${s.hint}`;
  } else if (s?.configured) {
    text = t('zroUnreadable');
  }

  node.textContent = text;
  node.classList.toggle('warn', Boolean(s?.configured && !s.readable));
  if (remove) remove.disabled = !s?.configured;
}

async function refreshZroStatus() {
  try {
    zroStatus = await api.zroStatus();
  } catch {
    zroStatus = null;
  }
  paintZroSettings();
  return zroStatus;
}

/* NVIDIA also has no per-key usage endpoint: same store-state status. */
let nvidiaStatus = null;

function paintNvidiaSettings() {
  const node = el('nvidiaStatus');
  const remove = el('nvidiaRemove');
  if (!node) return;

  const s = nvidiaStatus;
  let text = t('nvidiaNotConfigured');
  if (s?.configured && s.readable) {
    const how = s.encrypted ? t('coarenaEncrypted') : t('coarenaPlaintext');
    text = `${t('nvidiaConfigured')} · ${how}`;
    if (s.hint) text += ` · …${s.hint}`;
  } else if (s?.configured) {
    text = t('nvidiaUnreadable');
  }

  node.textContent = text;
  node.classList.toggle('warn', Boolean(s?.configured && !s.readable));
  if (remove) remove.disabled = !s?.configured;
}

async function refreshNvidiaStatus() {
  try {
    nvidiaStatus = await api.nvidiaStatus();
  } catch {
    nvidiaStatus = null;
  }
  paintNvidiaSettings();
  return nvidiaStatus;
}

/* Token Harbor has no usage endpoint either: same store-state status. */
let tokenharborStatus = null;

function paintTokenharborSettings() {
  const node = el('tokenharborStatus');
  const remove = el('tokenharborRemove');
  if (!node) return;

  const s = tokenharborStatus;
  let text = t('tokenharborNotConfigured');
  if (s?.configured && s.readable) {
    const how = s.encrypted ? t('coarenaEncrypted') : t('coarenaPlaintext');
    text = `${t('tokenharborConfigured')} · ${how}`;
    if (s.hint) text += ` · …${s.hint}`;
  } else if (s?.configured) {
    text = t('tokenharborUnreadable');
  }

  node.textContent = text;
  node.classList.toggle('warn', Boolean(s?.configured && !s.readable));
  if (remove) remove.disabled = !s?.configured;
}

async function refreshTokenharborStatus() {
  try {
    tokenharborStatus = await api.tokenharborStatus();
  } catch {
    tokenharborStatus = null;
  }
  paintTokenharborSettings();
  return tokenharborStatus;
}

/* LLM7.io shows balance only in its own dashboard, so the status is the key
   store's own state, exactly like Token Harbor's. */
let llm7Status = null;

function paintLlm7Settings() {
  const node = el('llm7Status');
  const remove = el('llm7Remove');
  if (!node) return;

  const s = llm7Status;
  let text = t('llm7NotConfigured');
  if (s?.configured && s.readable) {
    const how = s.encrypted ? t('coarenaEncrypted') : t('coarenaPlaintext');
    text = `${t('llm7Configured')} · ${how}`;
    if (s.hint) text += ` · ...${s.hint}`;
  } else if (s?.configured) {
    text = t('llm7Unreadable');
  }

  node.textContent = text;
  node.classList.toggle('warn', Boolean(s?.configured && !s.readable));
  if (remove) remove.disabled = !s?.configured;
}

async function refreshLlm7Status() {
  try {
    llm7Status = await api.llm7Status();
  } catch {
    llm7Status = null;
  }
  paintLlm7Settings();
  return llm7Status;
}

/**
 * Keep messages that were sent locally but are not in the session yet.
 *
 * submit() shows a message immediately and marks it `pending`. The agent only
 * writes it into `session.messages` a moment later (it runs input handlers and
 * templates first). `applyTabState` replaces the whole list with what main
 * reports, so an `agent:history` landing inside that gap — from compact, undo,
 * a key change or a model switch — used to erase the message you just sent, and
 * nothing in the UI remembered it.
 *
 * So: whatever the session already has wins, and any pending local message the
 * session does not have yet is appended after it. Once the session does have the
 * message, the pending copy is dropped instead of being shown twice.
 *
 * `pending` is only ever set on messages this renderer just sent, so a real
 * history change (undo, compact) still removes everything it should: those
 * messages were never pending.
 */
function mergeIncomingMessages(view, incoming) {
  const next = Array.isArray(incoming) ? incoming.slice() : [];
  const local = (view && Array.isArray(view.messages) ? view.messages : []).filter((m) => m && m.pending);
  if (!local.length) return next;

  // A message counts as "already in the session" when the session holds an entry
  // of the same kind whose text starts with the text we sent.
  //
  // It cannot be an exact match: main turns attachments into a rewritten prompt
  // before it reaches the session — "[Attached image saved to: …]" is appended
  // and the base64 images are replaced by that path. Comparing the literal text
  // therefore never matched a message with an attachment, so the pending copy
  // was kept forever and the message appeared twice. Prefix matching also covers
  // `/skill:` and template expansion, which rewrite the front of the text.
  //
  // Windowed, not a set: two identical questions sent in a row each consume one
  // session entry, so neither is swallowed.
  const localText = (m) => String(m.text || '').trim();
  const same = (a, b) => {
    if (a.kind !== b.kind) return false;
    const mine = localText(a);
    const theirs = localText(b);
    // An image-only message has no text to compare; count it as matching the
    // first user entry that has none.
    if (!mine) return !theirs;
    if (theirs === mine) return true;
    // Only a rewrite counts as the same message when what follows is a boundary.
    // A bare prefix would swallow a genuinely different question that happens to
    // start the same way ("สวัสดี" vs "สวัสดีครับ ผมชื่อ…").
    if (!theirs.startsWith(mine)) return false;
    const nextChar = theirs.charAt(mine.length);
    return nextChar === '\n' || nextChar === ' ' || nextChar === '\t';
  };

  const kept = [];
  const claimed = new Set();
  for (const m of local) {
    const at = next.findIndex((candidate, i) => !claimed.has(i) && same(m, candidate));
    if (at !== -1) {
      // The session has it now: drop the pending copy, it is already shown.
      claimed.add(at);
      continue;
    }
    kept.push(m);
  }
  return next.concat(kept);
}

function applyTabState(state) {
  if (!state) return;
  let view = views.get(state.tabId);
  if (!view) view = createView(state.tabId);

  Object.assign(view, {
    cwd: state.cwd,
    sessionId: state.sessionId,
    sessionFile: state.sessionFile,
    name: state.name,
    model: state.model,
    models: state.models || view.models || [],
    guest: state.guest,
    busy: Boolean(state.busy),
    messages: mergeIncomingMessages(view, state.messages),
    modelFallback: state.modelFallback || null,
    liveAssistant: null,
    liveTools: null,
  });
  if (state.cwd) lastWorkspace = state.cwd;
  if (!view.label) view.label = state.name || deriveLabel(state);
  activeTabId = state.tabId;
  renderActiveTab();
  // A turn may still be running in this tab: after a window reload the renderer
  // is new but the agent in the main process never stopped. Without this the
  // Send button comes back looking idle, and pressing it would start a second
  // turn on the same conversation.
  if (typeof setBusy === 'function') setBusy(Boolean(state.busy));
  renderSessions(state.cwd);
  paintContext(state.stats || null);
  renderTodos(state.todos || []);
  paintThinking(state.thinking || null);
  view.changes = state.changes || [];
  renderChangesBar(view.changes);

  // A resumed chat can remember a model this account no longer has. Say it once
  // instead of leaving a dropdown entry that cannot be used.
  if (state.modelFallback && !view.fallbackNotified) {
    view.fallbackNotified = true;
    const to = state.modelFallback.to;
    showNotice(`${t('coarenaModelSwitched')} ${to ? `${to.provider}/${to.id}` : '—'}`);
  }
  syncProviderChrome(view);
}

function deriveLabel(state) {
  const firstUser = (state.messages || []).find((m) => m.kind === 'user' && m.text);
  if (firstUser) return MD.toPlainText(firstUser.text).slice(0, 42) || firstUser.text.slice(0, 42);
  return state.cwd ? state.cwd.split(/[\\/]/).pop() : 'New session';
}

async function activate(tabId) {
  if (tabId === activeTabId) return;
  const state = await api.activateTab(tabId);
  applyTabState(state);
}

async function closeTab(tabId) {
  const res = await api.closeTab(tabId);
  views.delete(tabId);
  if (activeTabId === tabId) {
    activeTabId = res.activeTabId;
    if (activeTabId && views.has(activeTabId)) {
      await activateTabDirect(activeTabId);
      return;
    }
    renderActiveTab();
  }
}

async function activateTabDirect(tabId) {
  // A held message belongs to the tab the user is looking at. Switching away
  // must not fire a send they can no longer see, and must not leave a timer
  // ticking behind their back — the text goes back to that tab's composer.
  cancelAllHolds(tabId);
  const state = await api.getTabState(tabId);
  applyTabState(state);
}

async function openNewTab(cwd, sessionId) {
  const view = await api.openTab({ cwd, sessionId });
  applyTabState(view.state);
  return view;
}

/* ------------------------------ sessions ------------------------------ */

/**
 * Pins and colours set in this window.
 *
 * The store of record is `prefs.json` in the main process (see
 * session-marks.js). This mirror exists for one reason: a click must show up
 * immediately, and the IPC reply is asynchronous. Entries are replaced, never
 * merged, so a local copy can never contradict what the main process saved.
 */
const sessionMarksLocal = new Map();

/** Colour keys, matching `COLORS` in src/session-marks.js. */
const SESSION_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

/** Normalised path key, so two spellings of one file share a mark. */
function sessionMarkKey(sessionPath) {
  if (!sessionPath || typeof sessionPath !== 'string') return null;
  return sessionPath.replace(/\\/g, '/').toLowerCase();
}

/**
 * The mark to draw for a chat.
 *
 * `set` says whether this window has an opinion (a click happened here). When it
 * does not, the caller's `pinned`/`color` from the main process is used as-is,
 * so we never overwrite a value we did not set.
 */
function sessionMarkOf(sessionPath) {
  const key = sessionMarkKey(sessionPath);
  if (key && sessionMarksLocal.has(key)) return { ...sessionMarksLocal.get(key), set: true };
  return { pinned: false, color: null, set: false };
}

/** Apply a pin/colour change to one chat and redraw the sidebar. */
async function setSessionMark(sessionPath, patch, cwd) {
  const key = sessionMarkKey(sessionPath);
  if (!key) {
    showNotice(t('pinNeedsFile'));
    return;
  }
  try {
    const res = await api.setSessionMark(sessionPath, patch);
    if (!res?.ok) throw new Error(res?.error || 'could not save');
    sessionMarksLocal.set(key, {
      pinned: Boolean(res.mark?.pinned),
      color: res.mark?.color || null,
    });
    await renderSessions(cwd || lastWorkspace);
  } catch (err) {
    showNotice(errorText(err));
  }
}

async function renderSessions(cwd) {
  const list = el('sessionList');
  let sessions = await api.listSessions(cwd);
  
  // Include active session even if not yet persisted to disk
  const active = activeView();
  if (active?.sessionId && !sessions.some(s => s.id === active.sessionId)) {
    const known = sessionMarkOf(active.sessionFile);
    sessions = [
      {
        id: active.sessionId,
        path: active.sessionFile || '',
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        firstMessage: active.name || active.label || t('untitled'),
        messageCount: (active.messages || []).filter(m => m.kind === 'user').length,
        pinned: known.pinned,
        color: known.color,
      },
      ...sessions,
    ];
  }

  // Marks set in this window are mirrored to the main process, but the reply may
  // not have caught up with the render that follows it. Overlay the local copy
  // so the row you just pinned never blinks back to unpinned.
  sessions = sessions.map((s) => {
    const local = sessionMarkOf(s.path);
    return local.set ? { ...s, pinned: local.pinned, color: local.color } : s;
  });

  // Newest conversation on top, by creation time, with `id` as a deterministic
  // tie-break. Creation never changes, so the order does not shuffle while you
  // chat — only a newly started chat appears above the rest.
  sessions = sessions.slice().sort((a, b) => {
    const ta = new Date(a.created || a.modified).getTime() || 0;
    const tb = new Date(b.created || b.modified).getTime() || 0;
    return tb - ta || String(b.id).localeCompare(String(a.id));
  });

  // Pinned chats move to the top; everything else keeps the order above. The
  // main process already does this, but the "active session not yet on disk"
  // row is added here, so sorting has to be applied to the merged list.
  sessions = [
    ...sessions.filter((s) => s.pinned),
    ...sessions.filter((s) => !s.pinned),
  ];
  
  list.innerHTML = '';
  if (!sessions.length) {
    const p = document.createElement('div');
    p.style.cssText = 'font-size:11.5px;color:#8b93a7;padding:6px 4px';
    p.textContent = t('noSessions');
    list.appendChild(p);
    return;
  }
  for (const s of sessions) {
    const btn = document.createElement('button');
    const open = [...views.entries()].find(([, v]) => v.sessionId === s.id);
    const isActive = open && open[0] === activeTabId;
    btn.className = 'session-item' + (open ? ' open' : '') + (isActive ? ' active' : '');
    if (isActive) btn.setAttribute('aria-current', 'true');
    // The colour is drawn as a stripe down the left edge, so it shows for every
    // chat in the group at a glance instead of only on the one being hovered.
    if (s.color) btn.dataset.color = s.color;
    if (s.pinned) btn.classList.add('pinned');

    const busy = open?.[1]?.busy;
    const title = s.name || s.firstMessage || t('untitled');
    // While this row is the one on screen, the border breathes and no dot is drawn:
    // two "working" marks on the same row read as noise. A background tab keeps the
    // dot, in the reserved left slot, so the chat name never shifts sideways.
    if (busy) btn.classList.add('busy');
    const marker = busy && !isActive ? '<span class="s-spin"></span>' : s.pinned ? '\u{1F4CC}' : '';
    btn.innerHTML = `
      <span class="s-row">
        <span class="s-pin-slot" aria-hidden="true">${marker}</span>
        <span class="s-title">${escapeHtml(title)}</span>
        ${isActive ? `<span class="s-current">${t('currentBadge')}</span>` : ''}
      </span>
      <span class="s-meta">${escapeHtml(new Date(s.created || s.modified).toLocaleString())}${
      open ? ` \u00b7 ${t('openBadge')}` : ''
    }</span>
    `;
    btn.title = isActive
      ? `${title} \u2014 ${t('currentBadge')}`
      : t('sessionMenuHint');
    btn.addEventListener('click', async () => {
      const already = [...views.entries()].find(([, v]) => v.sessionId === s.id);
      if (already) {
        await activate(already[0]);
        return;
      }
      await openNewTab(cwd, s.path);
    });

    // Right-click opens Open / Rename / Delete for the session file.
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSessionMenu(e.clientX, e.clientY, cwd, s, btn);
    });

    list.appendChild(btn);
  }
}

/* --------------------------- context menu --------------------------- */

let openMenuEl = null;

function closeSessionMenu() {
  const el = openMenuEl;
  if (!el) return;
  openMenuEl = null;
  // Fade out instead of vanishing. The node stays one transition long, and
  // pointer-events is off immediately so it cannot swallow the next click.
  el.classList.add('is-closing');
  setTimeout(() => el.remove(), 130);
}

function openSessionMenu(x, y, cwd, session, itemEl) {
  closeSessionMenu();
  // A menu still fading out from a moment ago would sit on top of the new one.
  for (const stale of document.querySelectorAll('.ctx-menu.is-closing')) stale.remove();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const openItem = document.createElement('button');
  openItem.textContent = t('open');
  openItem.addEventListener('click', async () => {
    closeSessionMenu();
    const already = [...views.entries()].find(([, v]) => v.sessionId === session.id);
    if (already) await activate(already[0]);
    else await openNewTab(cwd, session.path);
  });
  menu.appendChild(openItem);

  // Pin / unpin. Sits second because it is the reason most people open this
  // menu: "keep this chat where I can find it".
  const pinItem = document.createElement('button');
  pinItem.textContent = session.pinned ? t('unpinChat') : t('pinChat');
  pinItem.addEventListener('click', () => {
    closeSessionMenu();
    setSessionMark(session.path, { pinned: !session.pinned }, cwd);
  });
  menu.appendChild(pinItem);

  // Colour swatches, one row. Clicking the colour that is already set clears it,
  // because a separate "no colour" entry is one more thing to read for a
  // decision you make with your eyes.
  const colorRow = document.createElement('div');
  colorRow.className = 'ctx-colors';
  colorRow.setAttribute('role', 'group');
  colorRow.setAttribute('aria-label', t('chatColor'));
  for (const color of SESSION_COLORS) {
    const swatch = document.createElement('button');
    swatch.className = 'ctx-color';
    swatch.dataset.color = color;
    swatch.title = t(`color_${color}`);
    swatch.setAttribute('aria-label', t(`color_${color}`));
    if (session.color === color) swatch.setAttribute('aria-pressed', 'true');
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSessionMenu();
      // Clicking the active colour removes it.
      setSessionMark(session.path, { color: session.color === color ? null : color }, cwd);
    });
    colorRow.appendChild(swatch);
  }
  const clearColors = document.createElement('button');
  clearColors.className = 'ctx-color ctx-color-none';
  clearColors.title = t('colorNone');
  clearColors.setAttribute('aria-label', t('colorNone'));
  clearColors.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSessionMenu();
    setSessionMark(session.path, { color: null }, cwd);
  });
  colorRow.appendChild(clearColors);
  menu.appendChild(colorRow);

  const renameItem = document.createElement('button');
  renameItem.textContent = t('rename');
  renameItem.addEventListener('click', () => {
    closeSessionMenu();
    beginSessionRename(itemEl, cwd, session);
  });
  menu.appendChild(renameItem);

  const delItem = document.createElement('button');
  delItem.className = 'danger';
  delItem.textContent = t('deleteFromDisk');
  delItem.addEventListener('click', () => {
    closeSessionMenu();
    showConfirmDelete(cwd, session);
  });
  menu.appendChild(delItem);

  document.body.appendChild(menu);
  openMenuEl = menu;

  // Keep the menu inside the window.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
}

/**
 * Rename a saved session in place. Electron never implemented
 * `window.prompt()` — the renderer throws `prompt() is not supported.` — so
 * swapping the list item for an input is the supported way to ask for a name.
 * Committing opens the session first when it is not in a tab yet, because the
 * `session:rename` IPC addresses a tab.
 */
function beginSessionRename(itemEl, cwd, session) {
  if (!itemEl || itemEl.dataset.renaming === '1') return;
  const currentName = session.name || session.firstMessage || t('untitled');

  const wrap = document.createElement('div');
  wrap.className = 'session-item renaming';
  wrap.dataset.renaming = '1';
  const input = document.createElement('input');
  input.className = 's-rename';
  input.type = 'text';
  input.value = currentName;
  input.spellcheck = false;
  input.setAttribute('aria-label', t('rename'));
  wrap.appendChild(input);
  itemEl.replaceWith(wrap);

  let settled = false;
  const finish = async (commit) => {
    if (settled) return;
    settled = true;
    const next = input.value.trim();
    if (!commit || !next || next === currentName) {
      await renderSessions(cwd);
      return;
    }
    try {
      // Match by id or by file path: a tab restored from prefs can carry a
      // different id shape, and opening a second tab for the same file used to
      // rebuild the transcript and drop messages that were still streaming.
      const existing = [...views.entries()].find(
        ([, v]) =>
          v.sessionId === session.id ||
          (v.sessionFile && session.path && v.sessionFile === session.path)
      );
      const tabId = existing?.[0];
      if (tabId) {
        const summary = await api.renameSession(tabId, next);
        const view = views.get(tabId);
        if (view) {
          view.name = summary?.name || next;
          view.label = summary?.name || next;
        }
        // Update the header in place — never rebuild the transcript on rename.
        if (activeTabId === tabId) sessionTitle.value = view?.name || next;
      } else {
        const res = await api.renameSessionFile(cwd, session.path, next);
        if (!res?.ok) throw new Error(res?.error || 'rename failed');
      }
      await renderSessions(cwd);
    } catch (err) {
      showNotice(errorText(err));
      await renderSessions(cwd);
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
  input.focus();
  input.select();
}

window.addEventListener('click', () => closeSessionMenu());
window.addEventListener('blur', () => closeSessionMenu());
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSessionMenu();
});

/* ------------------------- delete confirmation ------------------------- */

let confirmState = null;

function showConfirmDialog({ kind, title, sub, target = '', meta = '', path = '', action, state = {} }) {
  confirmState = { kind, ...state };
  el('confirmTitle').textContent = title;
  el('deleteSub').textContent = sub;
  el('confirmDelete').textContent = action;
  el('confirmText').textContent = target;
  el('confirmMeta').textContent = meta;
  el('confirmTarget').hidden = !target && !meta;
  el('confirmPath').textContent = path;
  el('confirmPath').hidden = !path;
  el('confirmOverlay').hidden = false;
  el('confirmDelete').focus();
}

function showConfirmDelete(cwd, session) {
  showConfirmDialog({
    kind: 'delete',
    state: { cwd, session },
    title: t('deleteTitle'),
    sub: t('deleteSub'),
    target: session.name || session.firstMessage || t('untitled'),
    meta: new Date(session.modified).toLocaleString(),
    path: session.path || '',
    action: t('delete'),
  });
}

/** `/clear`: delete the session text and its attached images, not skills/files. */
function showConfirmClear(tabId) {
  const view = views.get(tabId);
  if (!view) return;
  showConfirmDialog({
    kind: 'clear',
    state: { tabId },
    title: t('clearTitle'),
    sub: t('clearSub'),
    target: view.label || view.name || t('untitled'),
    meta: t('clearMeta'),
    path: view.sessionFile || t('clearNoFile'),
    action: t('clearAction'),
  });
}

/** Themed replacement for window.confirm on Sign out. */
function showConfirmSignOut() {
  showConfirmDialog({
    kind: 'signOut',
    title: t('signOutTitle'),
    sub: t('signOutSub'),
    target: t('signOutMeta'),
    action: t('signOut'),
  });
}

async function clearSession(tabId) {
  const view = views.get(tabId);
  if (!view) return;
  const cwd = view.cwd;
  // `/clear` deletes this chat's file, so its pin and colour must go with it.
  // Keeping them would leave an orphan entry that the next prune would drop
  // anyway — better to forget it now than to have the sidebar briefly disagree.
  const oldKey = sessionMarkKey(view.sessionFile);
  try {
    const res = await api.clearSession(tabId);
    if (oldKey) sessionMarksLocal.delete(oldKey);
    views.delete(tabId);
    if (res?.state) {
      // The new session is genuinely empty (no carried-over context); only the
      // name and model come back, so the header must follow the state.
      const next = views.get(res.state.tabId);
      if (next) next.label = res.state.name || '';
      applyTabState(res.state);
    } else {
      activeTabId = [...views.keys()][0] || null;
      renderActiveTab();
      renderSessions(cwd);
    }
    pendingImages = [];
    renderAttachments();
    input.value = '';
    autoGrow();
    showNotice(
      res?.warningKey
        ? t(res.warningKey, res.warningParams || null)
        : res?.keptName
          ? t('clearKeptName')
          : t('clearDone'),
    );
    setTimeout(() => showNotice(null), 3200);
  } catch (err) {
    showNotice(errorText(err));
  }
}

function hideConfirm() {
  confirmState = null;
  el('confirmOverlay').hidden = true;
}

/* ------------------------------ settings ------------------------------ */

const FOLDER_LABELS = {
  images: { en: 'Generated images', th: 'รูปที่ AI สร้าง' },
  attachments: { en: 'Chat attachments', th: 'ไฟล์/รูปที่แนบในแชท' },
  downloads: { en: 'Downloads', th: 'ไฟล์ที่ดาวน์โหลด' },
};

let settingsData = null;

async function openSettings() {
  if (!settingsSectionsInited) {
    initSettingsSections();
    settingsSectionsInited = true;
  }
  // The overlay is modal: remember what had focus and hide the rest of the app
  // from focus and the accessibility tree while it is open.
  settingsReturnFocus = document.activeElement;
  setBackgroundInert(true);
  showSettingsSection(settingsSection);
  const view = activeView();
  settingsData = await api.getSettings(view?.cwd);
  coarenaStatus = settingsData?.coarena || null;
  zroStatus = settingsData?.zro || null;
  nvidiaStatus = settingsData?.nvidia || null;
  tokenharborStatus = settingsData?.tokenharbor || null;
  llm7Status = settingsData?.llm7 || null;
  paintCoarenaSettings();
  paintZroSettings();
  paintNvidiaSettings();
  paintTokenharborSettings();
  paintLlm7Settings();
  paintMcpSettings();
  paintProviderMeter(activeView());
  renderSettings();
  renderAccount();
  el('settingsOverlay').hidden = false;
  el('settingsClose').focus();
}

/** Pull the saved profile into the title bar and the window title. */
async function loadProfile() {
  const boot = await api.boot();
  const prof = boot.profile || {};
  profile = prof;
  const brandEl = document.querySelector('.tb-brand');
  if (brandEl) brandEl.textContent = prof.brand || 'NTAPI';
  document.title = prof.brand || 'NTAPI';
  const verEl = el('aboutVersion');
  if (verEl) verEl.textContent = `v${boot.version || '0.1.0'}`;
}

function closeSettings() {
  el('settingsOverlay').hidden = true;
  setBackgroundInert(false);
  if (settingsReturnFocus && typeof settingsReturnFocus.focus === 'function') {
    settingsReturnFocus.focus();
  }
  settingsReturnFocus = null;
}

let settingsReturnFocus = null;

/** Keep the app behind the settings overlay out of the focus order. */
function setBackgroundInert(on) {
  for (const id of ['titlebar', 'sidebar', 'main']) {
    const node = el(id);
    if (!node) continue;
    if (on) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
  }
}

/* ------------------------------- MCP -------------------------------- */

// Opt-in MCP servers, configured from <data>/mcp.json right in Settings. The
// bridge reads the same file when a new session starts.
let mcpData = null;

function mcpStatus(text, isError) {
  const node = el('mcpStatus');
  if (!node) return;
  node.textContent = text || '';
  node.classList.toggle('warn', Boolean(isError));
}

async function paintMcpSettings() {
  const enabled = el('mcpEnabled');
  const config = el('mcpConfig');
  if (!enabled || !config) return;
  try {
    mcpData = await api.mcpGet();
  } catch {
    mcpData = null;
  }
  enabled.checked = Boolean(mcpData?.enabled);
  config.value = mcpData?.content || '';
  const pathEl = el('mcpPath');
  if (pathEl) pathEl.textContent = mcpData?.path || '';
  mcpStatus('');
}

async function saveMcpSettings() {
  const enabled = Boolean(el('mcpEnabled')?.checked);
  const content = el('mcpConfig')?.value || '';
  mcpStatus(t('mcpSaving'));
  let res;
  try {
    res = await api.mcpSet({ enabled, content });
  } catch (err) {
    res = { ok: false, error: err?.message || String(err) };
  }
  if (res?.ok) {
    mcpData = { enabled, content, path: mcpData?.path };
    mcpStatus(t('mcpSaved'));
  } else {
    mcpStatus(res?.error || t('mcpSaveFailed'), true);
  }
}

el('mcpSave')?.addEventListener('click', saveMcpSettings);

/* -------------------- system info & crash notice -------------------- */

async function copySystemInfo(btn) {
  let text = '';
  try {
    const info = await api.systemInfo();
    text = info?.text || '';
    await navigator.clipboard.writeText(text);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = t('systemInfoCopied');
      setTimeout(() => {
        btn.textContent = original;
      }, 2000);
    }
  } catch {
    showNotice(t('systemInfoFailed'));
  }
}

/** One visible banner at a time; the user can copy the info or dismiss it. */
function showCrashNotice(reason) {
  const box = el('crashNotice');
  const text = el('crashText');
  if (!box || !text || !box.hidden) return;
  const msg = reason && reason.message ? reason.message : typeof reason === 'string' ? reason : '';
  text.textContent = `${t('crashNotice')}${msg ? ` — ${msg}` : ''}`;
  box.hidden = false;
}

window.addEventListener('error', (e) => showCrashNotice(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showCrashNotice(e.reason));
el('crashCopy')?.addEventListener('click', (e) => copySystemInfo(e.currentTarget));
el('crashClose')?.addEventListener('click', () => {
  el('crashNotice').hidden = true;
});

// Settings section navigation (left list, right panel)
function initSettingsSections() {
  const nav = document.querySelector('.settings-nav');
  if (!nav) return;

  nav.addEventListener('click', (event) => {
    const item = event.target.closest('.settings-nav-item');
    if (!item) return;
    showSettingsSection(item.dataset.section);
  });

  // Arrow keys move between sections, like a tab list.
  nav.addEventListener('keydown', (event) => {
    const items = [...nav.querySelectorAll('.settings-nav-item')];
    const index = items.indexOf(document.activeElement);
    if (index === -1) return;
    let next = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = items[(index + 1) % items.length];
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = items[(index - 1 + items.length) % items.length];
    else if (event.key === 'Home') next = items[0];
    else if (event.key === 'End') next = items[items.length - 1];
    if (!next) return;
    event.preventDefault();
    next.focus();
    showSettingsSection(next.dataset.section);
  });
}

function showSettingsSection(name) {
  const target = name || 'workspace';
  settingsSection = target;
  for (const item of document.querySelectorAll('.settings-nav-item')) {
    const on = item.dataset.section === target;
    item.setAttribute('aria-selected', String(on));
    item.tabIndex = on ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('.settings-panel')) {
    panel.setAttribute('aria-hidden', String(panel.dataset.section !== target));
  }
  fitSettingsDialog();
  watchSettingsPanel();
}

/**
 * Size the settings window to the tab that is open.
 *
 * One fixed height served every tab, which made a short tab leave a tall empty
 * column and made the About tab — the longest page, and the one people read in
 * full rather than scan — need a scrollbar. Sizing to the open panel shows the
 * whole page at once and shrinks back when a shorter tab is chosen.
 *
 * Content height, not `scrollHeight`: the scroll container is currently taller
 * than its content, and `scrollHeight` would report the container and never
 * shrink the window.
 */
function fitSettingsDialog() {
  const dlg = document.querySelector('.settings-dialog');
  const panels = dlg?.querySelector('.settings-panels');
  const panel = dlg?.querySelector('.settings-panel[aria-hidden="false"]');
  if (!dlg || !panels || !panel) return;
  // Closed (or not laid out yet): every measurement would be zero.
  if (!panel.getBoundingClientRect().height) return;

  const header = dlg.querySelector('.settings-header');
  const footer = dlg.querySelector('.settings-footer');
  const cs = getComputedStyle(panels);
  const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const needed =
    (header?.getBoundingClientRect().height || 0) +
    (footer?.getBoundingClientRect().height || 0) +
    panel.getBoundingClientRect().height +
    paddingY;

  // Never taller than the window, and never so short the header and footer
  // collide.
  const max = Math.round(window.innerHeight * 0.92);
  // Floor so a short tab still looks like a window rather than a slip.
  const height = Math.max(420, Math.min(Math.round(needed), max));
  dlg.style.height = `${height}px`;

  // One correction pass. `scrollHeight` reports a few pixels more than the sum of
  // the parts (the leading of a trailing line), and those few pixels are exactly
  // what raises a scrollbar — so grow by whatever the container still reports as
  // overflowing instead of guessing a fixed slack.
  const overflow = panels.scrollHeight - panels.clientHeight;
  if (overflow > 0 && height < max) {
    dlg.style.height = `${Math.min(height + overflow, max)}px`;
  }

  dlg.dataset.fitted = dlg.style.height;
}

/** Refit when the open panel grows or shrinks (a warning, an update row, …). */
let settingsPanelObserver = null;
function watchSettingsPanel() {
  settingsPanelObserver?.disconnect();
  const panel = document.querySelector('.settings-panel[aria-hidden="false"]');
  if (!panel || typeof ResizeObserver !== 'function') return;
  settingsPanelObserver = new ResizeObserver(() => fitSettingsDialog());
  settingsPanelObserver.observe(panel);
}

window.addEventListener('resize', () => {
  if (document.querySelector('.settings-dialog')) fitSettingsDialog();
});

// Call on first settings open
let settingsSectionsInited = false;
let settingsSection = 'workspace';

function renderSettings() {
  const list = el('settingsFolders');
  list.innerHTML = '';
  if (!settingsData) return;

  if (!settingsData.workspace) {
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = t('noWorkspaceHint');
    list.appendChild(hint);
  } else {
    for (const [kind, info] of Object.entries(settingsData.folders)) {
      const row = document.createElement('div');
      row.className = 'settings-row';

    const top = document.createElement('div');
    top.className = 'settings-row-top';

    const label = document.createElement('span');
    label.className = 'settings-label';
    const names = FOLDER_LABELS[kind];
    label.textContent = names ? names[lang] || names.en : kind;
    top.appendChild(label);

    if (info.isDefault) {
      const badge = document.createElement('span');
      badge.className = 'settings-badge';
      badge.textContent = t('defaultTag');
      top.appendChild(badge);
    }
    row.appendChild(top);

    // Relative paths are shown as-is; the resolved absolute path sits underneath.
    const value = document.createElement('div');
    value.className = 'settings-value mono';
    value.textContent = info.value;
    row.appendChild(value);

    const resolved = document.createElement('div');
    resolved.className = 'settings-resolved';
    resolved.textContent = info.resolved;
    resolved.title = info.resolved;
    row.appendChild(resolved);

    const actions = document.createElement('div');
    actions.className = 'settings-actions';

    const pick = document.createElement('button');
    pick.className = 'ghost small';
    pick.textContent = t('chooseFolder');
    pick.addEventListener('click', async () => {
      const dir = await api.pickSettingsFolder();
      if (!dir) return;
      const folders = { ...(settingsData.folders) };
      folders[kind] = dir; // absolute override
      await saveFolders(folders, kind, dir);
    });
    actions.appendChild(pick);

    const reveal = document.createElement('button');
    reveal.className = 'ghost small';
    reveal.textContent = t('openFolder');
    reveal.addEventListener('click', () => api.revealPath(info.resolved));
    actions.appendChild(reveal);

    row.appendChild(actions);
    list.appendChild(row);
  }
  }

  const sys = el('settingsSystem');
  sys.innerHTML = '';
  const sysRows = [
    ...(settingsData.sessionsDir ? [[t('sessionsFolder'), settingsData.sessionsDir]] : []),
    ...(settingsData.skillsDirs || []).map((p) => [t('skillsFolder'), p]),
    [t('prefsFile'), settingsData.prefsPath],
  ];

  // Lead with the data folder: it is the one path a user needs in order to back
  // the app up or hand it to someone else.
  if (settingsData.dataRoot) {
    const band = document.createElement('div');
    band.className = 'settings-datadir';
    const lbl = document.createElement('span');
    lbl.className = 'settings-scope-label';
    lbl.textContent = t('dataRootLabel');
    const val = document.createElement('span');
    val.className = 'mono';
    val.textContent = settingsData.dataRoot;
    val.title = settingsData.dataRoot;
    const open = document.createElement('button');
    open.className = 'ghost small';
    open.textContent = t('openFolder');
    open.addEventListener('click', () => api.revealPath(settingsData.dataRoot));
    band.append(lbl, val, open);
    sys.appendChild(band);
  }

  // Remind which workspace this panel is describing — chat history is per
  // workspace, so the same row means different folders in another tab.
  if (settingsData.workspace) {
    const scope = document.createElement('div');
    scope.className = 'settings-scope';
    const lbl = document.createElement('span');
    lbl.className = 'settings-scope-label';
    lbl.textContent = t('scopeFor');
    const val = document.createElement('span');
    val.className = 'mono';
    val.textContent = settingsData.workspace;
    scope.append(lbl, val);
    sys.appendChild(scope);
  } else {
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = t('noWorkspaceChat');
    sys.appendChild(hint);
  }
  for (const [name, dir] of sysRows) {
    const row = document.createElement('div');
    row.className = 'settings-row compact';
    const label = document.createElement('span');
    label.className = 'settings-label';
    label.textContent = name;
    row.appendChild(label);
    const resolved = document.createElement('div');
    resolved.className = 'settings-resolved';
    resolved.textContent = dir;
    resolved.title = dir;
    row.appendChild(resolved);
    const actions = document.createElement('div');
    actions.className = 'settings-actions';
    const reveal = document.createElement('button');
    reveal.className = 'ghost small';
    reveal.textContent = t('openFolder');
    reveal.addEventListener('click', () => api.revealPath(dir));
    actions.appendChild(reveal);
    row.appendChild(actions);
    sys.appendChild(row);
  }
}

/** Persist one folder override, then refresh the panel. */
async function saveFolders(current, kind, value) {
  const view = activeView();
  await api.setPrefs({ folders: { [kind]: value }, workspace: view?.cwd });
  settingsData = await api.getSettings(view?.cwd);
  renderSettings();
  showNotice(null);
}

el('settingsBtn').addEventListener('click', openSettings);

// First-run empty state: three ways to start without hunting for the sidebar.
el('emptyPickFolder')?.addEventListener('click', () => el('pickFolder')?.click());
el('emptyNewChat')?.addEventListener('click', () => el('newSession')?.click());
el('emptySettings')?.addEventListener('click', openSettings);

// Keep Tab inside the modal while it is open (the background is inert, so this
// only needs to wrap from the last control back to the first).
el('settingsOverlay').addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const overlay = el('settingsOverlay');
  const focusable = [
    ...overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ].filter((n) => !n.disabled && n.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

// ---- custom title bar ----
el('winMin').addEventListener('click', () => api.minimize());
el('winMax').addEventListener('click', () => api.toggleMaximize());
el('winClose').addEventListener('click', () => api.closeWindow());

function applyWinState(state) {
  const maxed = Boolean(state && (state.maximized || state.fullScreen));
  const btn = el('winMax');
  btn.title = maxed ? 'Restore' : 'Maximize';
  btn.setAttribute('aria-label', btn.title);
  // Swap the square for the overlapping-squares "restore" glyph.
  btn.innerHTML = maxed
    ? '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2" y="4.2" width="5.8" height="5.8" rx="1.1" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M4.4 4.2V3.5a1.1 1.1 0 0 1 1.1-1.1h4a1.1 1.1 0 0 1 1.1 1.1v4a1.1 1.1 0 0 1-1.1 1.1h-.7" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
    : '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><rect x="2.6" y="2.6" width="6.8" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>';
}

api.getWinState().then(applyWinState);
api.onWinState(applyWinState);

// ---- resizable sidebar ----
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 520;
const SIDEBAR_DEFAULT = 268;

/**
 * How narrow the sidebar may become: wide enough for its widest single line.
 *
 * Two things set the floor. The top row (icon, name, badges, chips) used to slide
 * under itself at a fixed 200px, so its natural width is measured — every child
 * reports its own content width through `scrollWidth` even while flex squeezes
 * it. The approval note is the other: it is the longest fixed sentence in the
 * column, it is never allowed to wrap to a second line (that is what turns a
 * three-word explanation into a paragraph), so the column may not be dragged
 * narrower than the line it has to show.
 */
function sidebarMinWidth() {
  const brand = document.querySelector('#sidebar .brand');
  const note = document.querySelector('#sidebar .approval-note');
  // 12px padding each side, 1px border, and a little breathing room.
  const chrome = 24 + 2 + 6;
  if (!brand) return SIDEBAR_MIN;
  const root = document.documentElement;
  // Measure while the column is as narrow as it can be. A wide column stretches
  // its flex children, and a stretched child reports the stretched size through
  // scrollWidth just as happily as its content width — measuring there made the
  // floor climb a little on every reset that started from a wide sidebar.
  const prev = root.style.getPropertyValue('--sidebar-w');
  root.style.setProperty('--sidebar-w', `${SIDEBAR_MIN}px`);
  let row = 0;
  let sentence = 0;
  try {
    const gap = parseFloat(getComputedStyle(brand).columnGap) || 0;
    const kids = [...brand.children].filter((n) => !n.hidden);
    row = kids.length
      ? kids.reduce((sum, n) => sum + Math.max(n.scrollWidth, n.offsetWidth), 0) + gap * (kids.length - 1)
      : 0;
    // `scrollWidth` is the unwrapped width even with `white-space: nowrap` and
    // `overflow: hidden`, which is exactly the number this needs.
    sentence = note ? note.scrollWidth : 0;
  } finally {
    if (prev) root.style.setProperty('--sidebar-w', prev);
    else root.style.removeProperty('--sidebar-w');
  }
  return Math.max(SIDEBAR_MIN, Math.ceil(Math.max(row, sentence)) + chrome);
}

/**
 * The sidebar's width is fixed at the narrowest the column's own content allows.
 *
 * It used to be a drag handle, and that cost more than it looked: the sponsor
 * creative is cropped to the column, so two people with two widths saw two
 * different crops of the same ad. The width now comes from `sidebarMinWidth()` —
 * the longest line the column must show — and nothing in the UI can move it. A
 * saved `prefs.sidebarWidth` from an older build is ignored on purpose.
 */
function applySidebarWidth() {
  const w = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, sidebarMinWidth())));
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

(function lockSidebarWidth() {
  applySidebarWidth();

  // A late-loading font and a language switch both change the floor, so the
  // column re-measures itself instead of keeping a number that no longer fits.
  window.addEventListener('resize', () => applySidebarWidth());
  document.fonts?.ready.then(() => applySidebarWidth());
})();
el('settingsClose').addEventListener('click', closeSettings);

/* --------------------------- Coarena key --------------------------- */

el('coarenaSave')?.addEventListener('click', async () => {
  const inputEl = el('coarenaKeyInput');
  const button = el('coarenaSave');
  const key = (inputEl?.value || '').trim();
  if (!key) return;

  button.disabled = true;
  try {
    const res = await api.coarenaSetKey(key);
    if (res?.ok) {
      // Never keep the raw key in the DOM once it is stored.
      if (inputEl) inputEl.value = '';
      coarenaStatus = res.status || null;
      paintCoarenaSettings();
      paintProviderMeter(activeView());
      showNotice(res.unverified ? t('coarenaUnverified') : t('coarenaSaved'));
    } else {
      showNotice(`${t('coarenaSaveFailed')} ${res?.error || ''}`.trim());
    }
  } catch (err) {
    showNotice(`${t('coarenaSaveFailed')} ${err instanceof Error ? err.message : String(err)}`.trim());
  } finally {
    button.disabled = false;
  }
});

el('coarenaRemove')?.addEventListener('click', () => {
  showConfirmDialog({
    kind: 'coarenaRemove',
    title: t('coarenaRemoveTitle'),
    sub: t('coarenaRemoveSub'),
    action: t('coarenaRemove'),
  });
});

el('coarenaGetKey')?.addEventListener('click', () => {
  api.openExternal('https://coarena.ai/developers').catch(() => {});
});

/* ----------------------------- Zro key ----------------------------- */

el('zroSave')?.addEventListener('click', async () => {
  const inputEl = el('zroKeyInput');
  const button = el('zroSave');
  const key = (inputEl?.value || '').trim();
  if (!key) return;

  button.disabled = true;
  try {
    const res = await api.zroSetKey(key);
    if (res?.ok) {
      if (inputEl) inputEl.value = '';
      zroStatus = res.status || null;
      paintZroSettings();
      paintProviderMeter(activeView());
      showNotice(res.unverified ? t('zroUnverified') : t('zroSaved'));
    } else {
      showNotice(`${t('zroSaveFailed')} ${res?.error || ''}`.trim());
    }
  } catch (err) {
    showNotice(`${t('zroSaveFailed')} ${err instanceof Error ? err.message : String(err)}`.trim());
  } finally {
    button.disabled = false;
  }
});

el('zroRemove')?.addEventListener('click', () => {
  showConfirmDialog({
    kind: 'zroRemove',
    title: t('zroRemoveTitle'),
    sub: t('zroRemoveSub'),
    action: t('zroRemove'),
  });
});

el('zroGetKey')?.addEventListener('click', () => {
  api.openExternal('https://zro.moonmath.ai/api-keys').catch(() => {});
});

/* ---------------------------- NVIDIA key ---------------------------- */

el('nvidiaSave')?.addEventListener('click', async () => {
  const inputEl = el('nvidiaKeyInput');
  const button = el('nvidiaSave');
  const key = (inputEl?.value || '').trim();
  if (!key) return;

  button.disabled = true;
  try {
    const res = await api.nvidiaSetKey(key);
    if (res?.ok) {
      if (inputEl) inputEl.value = '';
      nvidiaStatus = res.status || null;
      paintNvidiaSettings();
      paintProviderMeter(activeView());
      if (res.modelMissing) showNotice(t('nvidiaModelMissing'));
      else showNotice(res.unverified ? t('nvidiaUnverified') : t('nvidiaSaved'));
    } else {
      showNotice(`${t('nvidiaSaveFailed')} ${res?.error || ''}`.trim());
    }
  } catch (err) {
    showNotice(`${t('nvidiaSaveFailed')} ${err instanceof Error ? err.message : String(err)}`.trim());
  } finally {
    button.disabled = false;
  }
});

el('nvidiaRemove')?.addEventListener('click', () => {
  showConfirmDialog({
    kind: 'nvidiaRemove',
    title: t('nvidiaRemoveTitle'),
    sub: t('nvidiaRemoveSub'),
    action: t('nvidiaRemove'),
  });
});

el('nvidiaGetKey')?.addEventListener('click', () => {
  api.openExternal('https://build.nvidia.com/settings/api-keys').catch(() => {});
});

/* ------------------------- Token Harbor key ------------------------- */

el('tokenharborSave')?.addEventListener('click', async () => {
  const inputEl = el('tokenharborKeyInput');
  const button = el('tokenharborSave');
  const key = (inputEl?.value || '').trim();
  if (!key) return;

  button.disabled = true;
  try {
    const res = await api.tokenharborSetKey(key);
    if (res?.ok) {
      if (inputEl) inputEl.value = '';
      tokenharborStatus = res.status || null;
      paintTokenharborSettings();
      paintProviderMeter(activeView());
      if (res.modelMissing) showNotice(t('tokenharborModelMissing'));
      else showNotice(res.unverified ? t('tokenharborUnverified') : t('tokenharborSaved'));
    } else {
      showNotice(`${t('tokenharborSaveFailed')} ${res?.error || ''}`.trim());
    }
  } catch (err) {
    showNotice(`${t('tokenharborSaveFailed')} ${err instanceof Error ? err.message : String(err)}`.trim());
  } finally {
    button.disabled = false;
  }
});

el('tokenharborRemove')?.addEventListener('click', () => {
  showConfirmDialog({
    kind: 'tokenharborRemove',
    title: t('tokenharborRemoveTitle'),
    sub: t('tokenharborRemoveSub'),
    action: t('tokenharborRemove'),
  });
});

el('tokenharborGetKey')?.addEventListener('click', () => {
  api.openExternal('https://tokenharbor.ai/dashboard/api-keys').catch(() => {});
});

/* ------------------------- LLM7.io token ------------------------- */

el('llm7Save')?.addEventListener('click', async () => {
  const inputEl = el('llm7KeyInput');
  const button = el('llm7Save');
  const key = (inputEl?.value || '').trim();
  if (!key) return;

  button.disabled = true;
  try {
    const res = await api.llm7SetKey(key);
    if (res?.ok) {
      if (inputEl) inputEl.value = '';
      llm7Status = res.status || null;
      paintLlm7Settings();
      paintProviderMeter(activeView());
      showNotice(res.unverified ? t('llm7Unverified') : t('llm7Saved'));
    } else {
      showNotice(`${t('llm7SaveFailed')} ${res?.error || ''}`.trim());
    }
  } catch (err) {
    showNotice(`${t('llm7SaveFailed')} ${err instanceof Error ? err.message : String(err)}`.trim());
  } finally {
    button.disabled = false;
  }
});

el('llm7Remove')?.addEventListener('click', () => {
  showConfirmDialog({
    kind: 'llm7Remove',
    title: t('llm7RemoveTitle'),
    sub: t('llm7RemoveSub'),
    action: t('llm7Remove'),
  });
});

el('llm7GetKey')?.addEventListener('click', () => {
  api.openExternal('https://dash.llm7.io/').catch(() => {});
});

el('settingsReset').addEventListener('click', async () => {
  const view = activeView();
  const cleared = {};
  for (const kind of Object.keys(settingsData?.folders || {})) cleared[kind] = '';
  await api.setPrefs({ folders: cleared, workspace: view?.cwd });
  settingsData = await api.getSettings(view?.cwd);
  renderSettings();
});

// ---- updates (GitHub Releases) ----
function paintUpdate(state) {
  const st = state || {};
  const verEl = el('updateVersion');
  const statusEl = el('updateStatus');
  const actionBtn = el('updateActionBtn');
  const checkBtn = el('updateCheckBtn');
  const barWrap = el('updateProgressWrap');
  const barEl = el('updateBar');
  const pctEl = el('updatePct');
  if (!verEl || !statusEl || !actionBtn) return;

  if (st.current) verEl.textContent = `v${st.current}`;
  actionBtn.hidden = true;
  actionBtn.disabled = false;
  actionBtn.onclick = null;
  if (checkBtn) {
    checkBtn.disabled = ['checking', 'downloading', 'ready', 'installing'].includes(st.status);
  }
  if (barWrap) barWrap.hidden = true;

  /** Paint the progress bar; `slow` stretches the fill over the install step. */
  const setBar = (pct, slow) => {
    if (!barWrap || !barEl || !pctEl) return;
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    barWrap.hidden = false;
    barEl.style.transition = slow ? 'width 1.9s ease' : 'width .25s ease';
    barEl.style.width = `${p}%`;
    pctEl.textContent = `${p}%`;
  };

  const showAction = (label, handler) => {
    actionBtn.textContent = label;
    actionBtn.hidden = false;
    actionBtn.onclick = handler;
  };

  switch (st.status) {
    case 'checking':
      statusEl.textContent = t('updateChecking');
      break;
    case 'available':
      statusEl.textContent = t('updateAvailable', { v: st.version || '' });
      showAction(t('updateDownload'), async () => {
        actionBtn.disabled = true;
        const res = await api.downloadUpdate();
        actionBtn.disabled = false;
        if (!res?.ok) statusEl.textContent = t('updateError', { e: res?.error || '' });
      });
      break;
    case 'downloading':
      statusEl.textContent = t('updateDownloading', { p: st.progress || 0 });
      setBar(st.progress || 0);
      break;
    case 'latest':
      statusEl.textContent = t('updateLatest');
      break;
    case 'ready':
      statusEl.textContent = t('updateReady', { v: st.version || '' });
      setBar(100);
      showAction(t('updateInstall'), async () => {
        actionBtn.disabled = true;
        await api.installUpdate();
      });
      break;
    case 'installing':
      statusEl.textContent = t('updateInstalling');
      // The window is about to disappear for 20-60 s while the installer swaps
      // the .exe. Say so across the whole window, not just in a settings line.
      el('updateOverlay').hidden = false;
      actionBtn.hidden = true;
      if (checkBtn) checkBtn.disabled = true;
      // Start near zero, then let the bar fill just as the app closes so the
      // step reads as "installing" instead of a sudden quit.
      setBar(6);
      setTimeout(() => setBar(100, true), 80);
      break;
    case 'error':
      el('updateOverlay').hidden = true;
      statusEl.textContent = t('updateError', { e: st.error || '' });
      break;
    default:
      statusEl.textContent = st.packaged === false ? t('updateDev') : t('updateIdle');
  }
}

let updateStateCache = null;

async function initUpdates() {
  const checkBtn = el('updateCheckBtn');
  if (!checkBtn) return;
  try {
    updateStateCache = await api.getUpdateState();
  } catch {
    updateStateCache = { status: 'idle', packaged: false };
  }
  paintUpdate(updateStateCache);

  checkBtn.addEventListener('click', async () => {
    paintUpdate({ ...updateStateCache, status: 'checking' });
    const res = await api.checkForUpdates();
    if (!res?.ok) {
      const devBuild = res?.error === 'not-packaged';
      paintUpdate({
        ...updateStateCache,
        status: devBuild ? 'idle' : 'error',
        error: res?.error,
        packaged: res?.packaged,
      });
    }
  });

  // The app relaunches itself after an update and otherwise looks unchanged.
if (typeof api.onAppUpdated === 'function') {
  api.onAppUpdated((p) => {
    showToast({ title: `NTAPI v${p.to}`, body: t('updatedToast', { v: p.to }) });
  });
}

api.onUpdateStatus?.((s) => {
    updateStateCache = s;
    paintUpdate(s);
  });
}

// ---- presence (online right now) ----

/** "2 online" / "2 คน" — one place so the label follows the language. */
function onlineLabel(n) {
  return lang === 'th' ? `${n.toLocaleString()} คน` : `${n.toLocaleString()} online`;
}

/** Repaint the "online now" pill from a presence snapshot. */
function paintPresence(s) {
  const badge = el('brandOnline');
  if (!badge || !s || !Number.isFinite(s.online)) return;
  badge.dataset.count = String(s.online);
  badge.textContent = onlineLabel(s.online);
  badge.title =
    lang === 'th'
      ? `ออนไลน์ตอนนี้ ${s.online.toLocaleString()} คน`
      : `${s.online.toLocaleString()} online now`;
  badge.hidden = false;
}

// ---- account panel ----
/**
 * The FreePi row: one status line and a row of buttons, exactly like the keyed
 * providers below it. The account details that used to sit in their own labelled
 * grid (kind, credits, lane, token path) are folded into that one line, so the
 * free lane stops looking more important than the paid ones.
 */
async function renderAccount() {
  const status = el('accountStatus');
  if (!status) return;
  const note = el('accountNote');
  note.hidden = true;

  const st = await api.accountStatus();
  accountData = st;

  const kind = !st.hasToken ? 'none' : st.guest ? 'guest' : 'member';
  status.replaceChildren();
  const kindSpan = document.createElement('span');
  kindSpan.className = `acct-${kind}`;
  kindSpan.textContent = t(kind === 'none' ? 'acctNone' : kind === 'guest' ? 'acctGuest' : 'acctMember');
  status.appendChild(kindSpan);
  if (st.credits !== null) status.append(` · ${t('accountCredits')} ${st.credits}`);
  if (st.lane) status.append(` · ${t('accountLane')} ${st.lane}`);

  const tokenDisplay = st.hasToken
    ? st.credentialsPath.startsWith(st.home)
      ? `%USERPROFILE%${st.credentialsPath.slice(st.home.length)}`
      : st.credentialsPath
    : t('accountTokenMissing');

  // The token path keeps its place, just as a muted footnote with the full path
  // in the tooltip instead of a row of its own.
  const tokenNote = el('accountTokenNote');
  tokenNote.textContent = t('accountTokenNote');
  tokenNote.title = `${t('accountFile')}: ${tokenDisplay}`;

  const folder = el('accountFolder');
  folder.hidden = !(st.hasToken && st.credentialsDir);

  el('accountSignOut').disabled = !st.hasToken;

  const signInBtn = el('accountSignIn');
  if (signInBtn) signInBtn.textContent = st.hasToken ? t('refreshAccount') : t('signIn');

  if (st.error) {
    note.hidden = false;
    note.textContent = `${t('accountError')}: ${st.error}`;
  }
}

/** After a sign-in, open the most recent chat if the window has no tab yet. */
async function ensureSessionOpen() {
  if (views.size > 0) {
    showNotice(null);
    return true;
  }
  const boot = await api.boot();
  if (!boot.lastCwd) return false;
  try {
    const resumed = await api.resumeRecent(boot.lastCwd);
    applyTabState(resumed.state);
    showNotice(null);
    return true;
  } catch (err) {
    showNotice(errorText(err));
    return false;
  }
}

/** Refresh the account panel and open the most recent chat. */
async function refreshAccountAndOpen() {
  await renderAccount();
  const note = el('accountNote');
  if (note) {
    note.hidden = false;
    note.textContent = t('signedIn');
  }
  const opened = await ensureSessionOpen();
  if (opened) closeSettings();
}

let loginActive = false;

function closeLoginModal() {
  if (loginOverlay) loginOverlay.hidden = true;
  loginActive = false;
}

async function startInAppLogin() {
  if (loginActive) return;
  const res = await api.authStart();
  if (res?.alreadySignedIn) {
    await refreshAccountAndOpen();
    return;
  }
  if (!res?.ok) {
    showNotice(res?.error || t('loginError'));
    return;
  }

  loginActive = true;
  if (loginError) {
    loginError.hidden = true;
    loginError.textContent = '';
  }
  if (loginStatus) loginStatus.hidden = false;
  if (loginStatusText) {
    loginStatusText.textContent = res.browserOpened ? t('loginWaiting') : t('loginOpenHint');
  }
  if (loginCodeEl) loginCodeEl.textContent = res.confirmCode || '----';
  if (loginCopy) loginCopy.textContent = t('loginCopy');
  if (loginOpen) {
    loginOpen.textContent = t('loginOpen');
    loginOpen.disabled = false;
  }
  loginOverlay.hidden = false;
  // Keep the focus on the primary action; focusing Copy gives it a warning-like
  // ring that reads as an error.
  loginOpen?.focus();
}

el('accountSignIn').addEventListener('click', async () => {
  const st = await api.accountStatus();
  if (st.hasToken) {
    await refreshAccountAndOpen();
    return;
  }
  await startInAppLogin();
});

loginOpen?.addEventListener('click', async () => {
  if (!loginActive) {
    await startInAppLogin();
    return;
  }
  const res = await api.authOpenBrowser();
  if (res?.ok && loginStatusText) loginStatusText.textContent = t('loginOpened');
});

loginCopy?.addEventListener('click', async () => {
  const res = await api.authCopyCode();
  if (res?.ok) {
    loginCopy.textContent = t('loginCopied');
    setTimeout(() => {
      if (loginCopy) loginCopy.textContent = t('loginCopy');
    }, 1500);
  }
});

loginCancel?.addEventListener('click', async () => {
  await api.authCancel();
  closeLoginModal();
});

loginTerminal?.addEventListener('click', async () => {
  await api.authCancel();
  closeLoginModal();
  const res = await api.accountSignIn();
  if (res?.ok && res.alreadySignedIn) {
    await refreshAccountAndOpen();
    return;
  }
  const note = el('accountNote');
  if (note) {
    note.hidden = false;
    note.textContent = res?.ok ? t('signInOpened') : res?.error || t('loginError');
  }
});

api.onAuthStatus(async (p) => {
  if (!p) return;
  if (p.status === 'pending') {
    if (loginStatusText) {
      loginStatusText.textContent = p.opened ? t('loginOpened') : t('loginWaiting');
    }
    return;
  }
  if (p.status === 'done') {
    closeLoginModal();
    await refreshAccountAndOpen();
    showNotice(t('loginSuccess'));
    return;
  }
  if (p.status === 'error') {
    loginActive = false;
    if (loginStatus) loginStatus.hidden = true;
    if (loginError) {
      loginError.hidden = false;
      loginError.textContent = p.message || t('loginError');
    }
    if (loginOpen) loginOpen.textContent = t('loginRetry');
  }
});

el('accountSignOut').addEventListener('click', () => {
  showConfirmSignOut();
});

// "Open" reveals the folder holding the login token; "Sign in at freepi.ai" is
// the link-style row the other providers use for their key pages.
el('accountFolder')?.addEventListener('click', () => {
  const dir = accountData?.credentialsDir;
  if (dir) api.revealPath(dir);
});
el('accountGetKey')?.addEventListener('click', () => {
  api.openExternal('https://freepi.ai/').catch(() => {});
});

el('confirmCancel').addEventListener('click', hideConfirm);

el('confirmDelete').addEventListener('click', async () => {
  const state = confirmState;
  if (!state) return;
  hideConfirm();

  if (state.kind === 'clear') {
    await clearSession(state.tabId);
    return;
  }

  if (state.kind === 'signOut') {
    await api.accountSignOut();
    await renderAccount();
    return;
  }

  if (state.kind === 'coarenaRemove') {
    const res = await api.coarenaClearKey();
    if (res?.ok) {
      coarenaStatus = res.status || null;
      paintCoarenaSettings();
      paintProviderMeter(activeView());
      showNotice(t('coarenaRemoved'));
    } else {
      showNotice(`${t('coarenaSaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  if (state.kind === 'zroRemove') {
    const res = await api.zroClearKey();
    if (res?.ok) {
      zroStatus = res.status || null;
      paintZroSettings();
      paintProviderMeter(activeView());
      showNotice(t('zroRemoved'));
    } else {
      showNotice(`${t('zroSaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  if (state.kind === 'nvidiaRemove') {
    const res = await api.nvidiaClearKey();
    if (res?.ok) {
      nvidiaStatus = res.status || null;
      paintNvidiaSettings();
      paintProviderMeter(activeView());
      showNotice(t('nvidiaRemoved'));
    } else {
      showNotice(`${t('nvidiaSaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  if (state.kind === 'tokenharborRemove') {
    const res = await api.tokenharborClearKey();
    if (res?.ok) {
      tokenharborStatus = res.status || null;
      paintTokenharborSettings();
      paintProviderMeter(activeView());
      showNotice(t('tokenharborRemoved'));
    } else {
      showNotice(`${t('tokenharborSaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  if (state.kind === 'llm7Remove') {
    const res = await api.llm7ClearKey();
    if (res?.ok) {
      llm7Status = res.status || null;
      paintLlm7Settings();
      paintProviderMeter(activeView());
      showNotice(t('llm7Removed'));
    } else {
      showNotice(`${t('llm7SaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  const res = await api.deleteSession(state.cwd, state.session.path);
  if (!res?.ok) {
    showNotice(t('deleteFailed', { error: res?.error || t('unknownError') }));
    return;
  }

  // If the deleted session had a tab open, drop it from the UI.
  for (const [tabId, view] of [...views.entries()]) {
    if (view.sessionId === state.session.id) {
      views.delete(tabId);
      if (activeTabId === tabId) {
        activeTabId = res.activeTabId || [...views.keys()][0] || null;
        if (activeTabId) await activateTabDirect(activeTabId);
        else renderActiveTab();
      }
    }
  }

  showNotice(t('deletedFromDisk'));
  setTimeout(() => showNotice(null), 2500);

  // The chat is gone, so its pin/colour has nothing left to mark.
  const deletedKey = sessionMarkKey(state.session.path);
  if (deletedKey) sessionMarksLocal.delete(deletedKey);

  const active = activeView();
  await renderSessions(active?.cwd || state.cwd);
});

/* ---------------------------- attachments ---------------------------- */

function renderAttachments() {
  attachBar.innerHTML = '';
  if (!pendingImages.length) {
    attachBar.hidden = true;
    updateSendState();
    return;
  }
  attachBar.hidden = false;
  pendingImages.forEach((att, i) => {
    const box = document.createElement('div');
    box.className = 'attachment' + (att.kind === 'file' ? ' file' : '');

    if (att.kind === 'file') {
      const icon = document.createElement('div');
      icon.className = 'file-icon';
      const ext = (att.name.split('.').pop() || 'file').slice(0, 4).toUpperCase();
      icon.textContent = ext;
      box.appendChild(icon);
      box.title = att.path;
      const label = document.createElement('div');
      label.className = 'file-name';
      label.textContent = att.name;
      box.appendChild(label);
    } else {
      const thumb = document.createElement('img');
      thumb.src = att.dataUri;
      thumb.title = att.name || 'image';
      box.appendChild(thumb);
    }

    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', () => {
      pendingImages.splice(i, 1);
      renderAttachments();
    });
    box.appendChild(rm);
    attachBar.appendChild(box);
  });
  updateSendState();
}

function updateSendState() {
  sendBtn.disabled = Boolean(activeView()?.busy) || (!input.value.trim() && pendingImages.length === 0);
}

/**
 * Attachments come in two kinds:
 *   image → base64 data URI, saved to the workspace and viewed via look_at_image
 *   file  → just the path, so the agent can use its own read/grep tools on it
 * Dropped paths only work inside Electron's renderer when the file comes from the
 * OS; the path is available on `file.path` (Electron adds it).
 *
 * Only the raster formats the model can actually open are inlined. An SVG, a
 * video or anything with no type of its own goes by path — that is the whole
 * point of dropping a .mp4 in: the agent opens it with its own tools instead of
 * the app trying to draw it.
 */
const INLINE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']);

async function addAttachmentsFromFiles(files) {
  for (const file of files) {
    if (INLINE_IMAGE_TYPES.has(file.type)) {
      const dataUri = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      if (!dataUri) continue;
      pendingImages.push({ kind: 'image', dataUri, mimeType: file.type, name: file.name });
      continue;
    }

    // Non-image: resolve the real path through the preload (File.path is gone in Electron 32+).
    const fullPath = api.pathForFile(file);
    if (!fullPath) {
      showNotice(t('attachPathFailed', { name: file.name }));
      continue;
    }
    pendingImages.push({
      kind: 'file',
      path: fullPath,
      name: file.name,
      bytes: file.size,
    });
  }
  renderAttachments();
}

/* --------------------------- jump to newest --------------------------- */

/**
 * The reader decides when to follow new output.
 *
 * Two things happen here: the button appears and disappears as you scroll, and a
 * click puts you back at the newest message. `scroll-behavior: smooth` on the
 * transcript animates it, and the button hides once the smooth scroll lands —
 * the scroll event does that, so no timer is needed and nothing can race.
 */
jumpToBottom?.addEventListener('click', () => {
  // The smooth scroll fires many scroll events on the way down. None of them means
  // the reader moved, so the follow state is held until it lands.
  jumpingToBottom = true;
  scrollToBottom(true);
  const settle = () => {
    jumpingToBottom = false;
    syncFollow();
    transcript.removeEventListener('scrollend', settle);
  };
  transcript.addEventListener('scrollend', settle, { once: true });
  // Fallback for engines without scrollend, and for a click when the transcript
  // is already at the bottom (no scroll event is going to arrive at all).
  setTimeout(() => {
    if (!jumpingToBottom) return;
    jumpingToBottom = false;
    syncFollow();
  }, 420);
});

transcript.addEventListener('scroll', syncFollow, { passive: true });

// A resize can make the transcript short enough that there is nothing below to
// jump to, so the button has to be re-checked rather than left showing.
window.addEventListener('resize', syncJumpToBottom);

/* ------------------------------ actions ------------------------------ */

/**
 * The sponsor strip at the floor of the sidebar.
 *
 * Everything about it — who it is, where it goes, and which creative to show —
 * belongs to the main process, which reads the live feed. The renderer paints
 * what it is handed and asks for one creative at a time, so eight sponsors never
 * mean eight downloads before the window is usable.
 */
let sponsorTimer = null;
let sponsorSlotIndex = 0;

/*
 * Sound is off until the reader asks for it.
 *
 * A clip that starts talking by itself is the fastest way to be uninstalled, and
 * Chromium refuses to autoplay with audio anyway — so the default has to be
 * muted, and unmuting has to be a click. The choice is remembered for the
 * session and re-applied on every rotation, because each slot builds a fresh
 * <video> element.
 */
let sponsorSoundOn = false;
// id -> { type, url, poster }. The address is kept once fetched: rotating back to
// a slot that was already shown must not hit the network again. The bytes stay on
// disk — a creative is streamed over `ntapi-sponsor://`, never held as base64.
const sponsorMediaCache = new Map();
const sponsorMediaPending = new Map();

function sponsorPrefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

async function initSponsor() {
  try {
    const cfg = await api.sponsorGet();
    sponsor = cfg && cfg.enabled ? cfg : null;
  } catch {
    sponsor = null;
  }
  sponsorSlotIndex = 0;
  paintSponsor();
  scheduleSponsorRotation();
}

/**
 * A publish landed after the window had already drawn the cached strip.
 *
 * The bytes go too: the main process emptied its media folder on a change, and a
 * slot keeps its id across publishes while the file behind it is replaced — so a
 * kept data URL would be yesterday's picture under today's caption.
 */
function reloadSponsor() {
  sponsorMediaCache.clear();
  sponsorMediaPending.clear();
  initSponsor();
}

function sponsorMediaFor(id) {
  if (sponsorMediaCache.has(id)) return Promise.resolve(sponsorMediaCache.get(id));
  if (sponsorMediaPending.has(id)) return sponsorMediaPending.get(id);
  const pending = api
    .sponsorMedia(id)
    .then((res) => {
      const value = res && res.ok ? { type: res.type, url: res.url, poster: res.poster || '' } : null;
      if (value) sponsorMediaCache.set(id, value);
      return value;
    })
    .catch(() => null)
    .finally(() => sponsorMediaPending.delete(id));
  sponsorMediaPending.set(id, pending);
  return pending;
}

/**
 * A sponsor's creative fills a 2:1 box whatever shape it arrives in — the frame
 * is fixed, so a square logo and a wide banner read as the same size of ad.
 */
function sponsorCreative(slot, value) {
  const alt = (slot.media && slot.media.alt) || (slot.text.th && slot.text.th.title) || 'Sponsor';
  const reduced = sponsorPrefersReducedMotion();

  if (value.type === 'video') {
    // Reduced motion gets the still frame, never a loop. That also means a user
    // who asked for less motion downloads 40KB of poster instead of a video.
    if (reduced && value.poster) {
      const still = document.createElement('img');
      still.src = value.poster;
      still.alt = alt;
      still.decoding = 'async';
      return still;
    }
    const video = document.createElement('video');
    video.src = value.url;
    if (value.poster) video.poster = value.poster;
    // Muted unless the reader turned sound on: an unmuted clip cannot autoplay,
    // and a banner that talks to a room is not decoration.
    video.muted = !sponsorSoundOn;
    video.loop = true;
    video.autoplay = !reduced;
    video.playsInline = true;
    if (!sponsorSoundOn) video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', alt);
    return video;
  }

  const img = document.createElement('img');
  img.src = value.url;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

/**
 * The creative, wrapped in a frame shaped like the creative itself.
 *
 * Drawing every sponsor into one band cropped whatever did not match it: a 1:1
 * image in a 4:5 band lost its left and right edges, and that is where a sponsor
 * puts its wording, so the words vanished. The publisher's own preview frames
 * each creative at its own ratio — this makes the strip agree with it.
 *
 * The band still reserves the tallest shape in the feed, so the sidebar never
 * jumps when the rotation moves between a wide and a tall creative.
 */
function sponsorMediaNode(slot, value) {
  const frame = document.createElement('span');
  frame.className = 'sponsor-frame';
  frame.style.setProperty('--slot-r', String(sponsorRatio(slot)));
  frame.appendChild(sponsorCreative(slot, value));
  return frame;
}

/**
 * A clip is paused whenever the strip cannot be seen or is not being read: a
 * banner that keeps decoding frames behind a minimised window is a battery leak
 * with no audience.
 */
function syncSponsorPlayback() {
  const host = el('sponsorMedia');
  const video = host && host.querySelector('video');
  if (!video) return;
  const visible = !document.hidden && document.hasFocus() && !sponsorPrefersReducedMotion();
  if (visible) video.play().catch(() => {});
  else video.pause();
}

/**
 * Width per height for each published frame, mirrored from the publisher.
 * A slot without a ratio — an older feed, or the bundled fallback — is 2:1.
 */
const SPONSOR_RATIOS = { '2:1': 2, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5, '9:16': 9 / 16 };

/**
 * Width per height. A custom frame the publisher allowed is parsed from its
 * own `w:h`; anything unreadable falls back to 2:1 so the band can never be
 * sized by NaN.
 */
function sponsorRatio(slot) {
  const name = slot && slot.media ? slot.media.ratio : '';
  const known = SPONSOR_RATIOS[name];
  if (known > 0) return known;
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(String(name || ''));
  if (match) {
    const w = Number(match[1]);
    const h = Number(match[2]);
    if (w > 0 && h > 0) return w / h;
  }
  return 2;
}

/**
 * The room the strip reserves: the widest-per-height slot in the feed, so the
 * box is already the height the tallest creative needs. Without this the sidebar
 * would grow and shrink every time the rotation moved between a 2:1 and a 4:5
 * banner, dragging the whole session list up and down with it.
 */
function sponsorReservedRatio() {
  const slots = sponsor && Array.isArray(sponsor.slots) ? sponsor.slots : [];
  if (!slots.length) return 2;
  return slots.reduce((min, slot) => Math.min(min, sponsorRatio(slot)), Infinity) || 2;
}

function paintSponsorMedia(slot) {
  const host = el('sponsorMedia');
  if (!host) return;
  // Reserved before any byte arrives, so the band holds its height while the
  // creative downloads and never snaps the layout around.
  const reserved = sponsorReservedRatio();
  host.style.aspectRatio = String(reserved);
  // The stylesheet caps the band by width: without this number it cannot know how
  // tall the frame wants to be, and a 9:16 clip was squashed into a 2:1 band.
  host.style.setProperty('--sponsor-r', String(reserved));
  host.replaceChildren();
  const hasMedia = Boolean(slot && slot.media);
  host.hidden = !hasMedia;
  if (!hasMedia) return;

  const known = sponsorMediaCache.get(slot.id);
  if (known) {
    host.appendChild(sponsorMediaNode(slot, known));
    syncSponsorPlayback();
    return;
  }

  host.classList.add('is-loading');
  sponsorMediaFor(slot.id).then((value) => {
    host.classList.remove('is-loading');
    // The rotation may have moved on while this was in flight; painting now
    // would put the previous sponsor over the current one's text.
    const current = sponsor && sponsor.slots && sponsor.slots[sponsorSlotIndex];
    if (!value || !current || current.id !== slot.id) return;
    host.replaceChildren(sponsorMediaNode(slot, value));
    syncSponsorPlayback();
  });
}

function paintSponsor() {
  const wrap = el('sponsorSlot');
  if (!wrap) return;
  const slot = sponsor && sponsor.slots ? sponsor.slots[sponsorSlotIndex] : null;
  const text = slot && (slot.text?.[lang] || slot.text?.th);
  if (!slot || !text) {
    wrap.hidden = true;
    return;
  }
  el('sponsorLabel').textContent = text.label;
  el('sponsorText').textContent = text.title;
  const card = el('sponsorCard');
  // The arrow after the text is CSS decoration, so the accessible name has to be
  // spelled out here or it would be announced as "greater than".
  card.setAttribute('aria-label', `${text.label}: ${text.title}`);
  card.title = slot.url;
  wrap.hidden = false;
  paintSponsorMedia(slot);
  updateSponsorSoundButton(slot);
}

/**
 * The sound switch is only meaningful for a clip, so it is not drawn at all for
 * an image. `aria-pressed` carries the state, because a speaker glyph alone reads
 * as "sound is on" whichever way it points.
 */
function updateSponsorSoundButton(slot) {
  const btn = el('sponsorSound');
  if (!btn) return;
  const isVideo = Boolean(slot && slot.media && slot.media.type === 'video');
  btn.hidden = !isVideo;
  if (!isVideo) return;
  const label = sponsorSoundOn ? t('sponsorSoundOff') : t('sponsorSoundOn');
  btn.setAttribute('aria-pressed', sponsorSoundOn ? 'true' : 'false');
  btn.setAttribute('aria-label', label);
  btn.title = label;
  btn.textContent = sponsorSoundOn ? '\u{1F50A}' : '\u{1F507}';
}

/**
 * Pushes the current choice into whatever clip is on screen, and into the button.
 * Called by the switch itself and, indirectly, by every repaint.
 */
function applySponsorSound() {
  const host = el('sponsorMedia');
  const video = host && host.querySelector('video');
  if (video) {
    video.muted = !sponsorSoundOn;
    if (sponsorSoundOn) {
      video.removeAttribute('muted');
      // The click is the user gesture Chromium wants before audio may play.
      video.play().catch(() => {});
    } else {
      video.setAttribute('muted', '');
    }
  }
  const slot = sponsor && sponsor.slots ? sponsor.slots[sponsorSlotIndex] : null;
  updateSponsorSoundButton(slot);
}

/**
 * Rotation is a timer over the feed's own interval; one slot means no timer at
 * all. It does not advance while the window is hidden — coming back to a window
 * should show the sponsor that was on screen, not a random one.
 */
function scheduleSponsorRotation() {
  if (sponsorTimer) {
    clearInterval(sponsorTimer);
    sponsorTimer = null;
  }
  if (!sponsor || !Array.isArray(sponsor.slots) || sponsor.slots.length < 2) return;
  const seconds = Math.max(5, Number(sponsor.rotateSeconds) || 15);
  sponsorTimer = setInterval(() => {
    if (!sponsor || document.hidden) return;
    sponsorSlotIndex = (sponsorSlotIndex + 1) % sponsor.slots.length;
    paintSponsor();
  }, seconds * 1000);
}

el('sponsorCard').addEventListener('click', () => {
  const slot = sponsor && sponsor.slots ? sponsor.slots[sponsorSlotIndex] : null;
  if (!slot) return;
  api.sponsorClick(slot.id).catch(() => {});
});

el('sponsorSound').addEventListener('click', (event) => {
  // The card underneath is the link to the sponsor: a click on the switch must
  // not also open a browser window.
  event.preventDefault();
  event.stopPropagation();
  sponsorSoundOn = !sponsorSoundOn;
  applySponsorSound();
});

document.addEventListener('visibilitychange', syncSponsorPlayback);
window.addEventListener('focus', syncSponsorPlayback);
window.addEventListener('blur', syncSponsorPlayback);

async function boot() {
  const info = await api.boot();
  appPrefs = info.prefs || info;
  profile = info.profile || {};
  if (info.lang) lang = info.lang === 'th' ? 'th' : 'en';
  if (typeof refreshBrowserStatus === 'function') refreshBrowserStatus();
  applyLanguage();
  loadProfile();
  initUpdates();
  api.onPresence(paintPresence);
  api.getPresence().then(paintPresence).catch(() => {});
  refreshCoarenaStatus().catch(() => {});
  refreshZroStatus().catch(() => {});
  refreshNvidiaStatus().catch(() => {});
  refreshTokenharborStatus().catch(() => {});
  refreshLlm7Status().catch(() => {});
  applySidebarWidth();
  if (info.lastCwd) {
    lastWorkspace = info.lastCwd;
    el('cwdLabel').textContent = info.lastCwd;
  }
  api.getApprovalMode().then(applyApprovalMode).catch(() => {});
  initSponsor();
  if (typeof api.onSponsorChanged === 'function') api.onSponsorChanged(reloadSponsor);

  if (info.openTabs?.length) {
    // One tab per session file: the same conversation opened twice would be
    // written to by two agents. Cap the restore to the account's session limit
    // as well — the extra sessions stay on disk and open from the list.
    const seen = new Set();
    let restored = 0;
    for (const t of info.openTabs) {
      const key = t.sessionFile || `${t.cwd}::${t.tabId}`;
      if (seen.has(key) || restored >= MAX_RESTORED_TABS) continue;
      seen.add(key);
      try {
        const res = await api.openTab({ cwd: t.cwd, sessionId: t.sessionFile || undefined, restore: true });
        // Apply the state we were handed. Creating an empty view here threw the
        // state away, so after a reload the window showed a blank tab until
        // the next event happened to refresh it.
        applyTabState(res.state);
        restored += 1;
      } catch {}
    }
  }

  if (views.size === 0 && info.lastCwd) {
    statusHint.textContent = t('restoring');
    try {
      const resumed = await api.resumeRecent(info.lastCwd);
      applyTabState(resumed.state);
      return;
    } catch (err) {
      // Most common cause: no credentials and guest access is disabled, so tell
      // the user to sign in instead of leaving an empty window with no reason.
      showNotice(errorText(err));
    }
  }

  const tabs = await api.listTabs();
  if (tabs.length) {
    await activateTabDirect(tabs[0].tabId);
  } else {
    statusHint.textContent = info.lastCwd
      ? t('readyHint')
      : t('chooseToBegin');
    renderActiveTab();
  }
}

el('pickFolder').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  if (!folder) return;
  lastWorkspace = folder;
  try {
    const res = await api.openTab({ cwd: folder });
    applyTabState(res.state);
  } catch (err) {
    showNotice(errorText(err));
  }
});

el('newSession').addEventListener('click', async () => {
  const view = activeView();
  // A folder picked earlier still counts even with no tab open (all tabs
  // closed, or the app just started): reuse the workspace instead of nagging.
  const cwd = view?.cwd || lastWorkspace;
  if (!cwd) {
    showNotice(t('chooseWorkspace'));
    return;
  }
  try {
    const res = await api.openTab({ cwd });
    applyTabState(res.state);
  } catch (err) {
    showNotice(errorText(err));
  }
});

sessionTitle.addEventListener('change', async () => {
  const view = activeView();
  if (!view) return;
  const name = sessionTitle.value.trim() || null;
  const summary = await api.renameSession(view.tabId, name);
  if (summary) {
    view.name = summary.name;
    view.label = summary.name || view.label;
  }
});

modelSelect.addEventListener('change', async () => {
  const view = activeView();
  if (!view) return;
  const [provider, id] = modelSelect.value.split('||');
  try {
    const m = await api.setModel(view.tabId, provider, id);
    view.model = m;
    paintModelTrigger(m);
    syncModelMenuSelection();
    statusHint.textContent = `Model: ${m.name || m.id}`;
    refreshMessageAuthors();
  } catch (err) {
    showNotice(t('modelSwitchFailed', { error: err.message || err }));
  }
});

/**
 * Re-label assistant replies after the model changes.
 *
 * The label is read from the tab's live model, so every reply in the thread is
 * re-stamped rather than only the next one. One thread, one answering model at a
 * time, so a header that disagreed with the picker would just be confusing.
 */
function refreshMessageAuthors() {
  const label = messageAuthor();
  for (const node of transcript.querySelectorAll('.msg.assistant > .role')) {
    node.textContent = label;
  }
}

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  updateSendState();
}

/**
 * Slash commands shown when the composer starts with "/".
 * Add an entry here and the palette, filtering and keyboard selection work
 * automatically for it.
 */
const SLASH_COMMANDS = [
  {
    name: '/clear',
    en: 'Delete this chat’s messages and attached images',
    th: 'ลบข้อความและรูปที่แนบในแชทนี้',
    run: () => {
      const view = activeView();
      if (view) showConfirmClear(view.tabId);
    },
  },
  {
    name: '/new',
    en: 'Start a new chat in this folder',
    th: 'เริ่มแชทใหม่ในโฟลเดอร์นี้',
    run: () => el('newSession').click(),
  },
  {
    name: '/settings',
    en: 'Open Settings',
    th: 'เปิดหน้าตั้งค่า',
    run: () => openSettings(),
  },
  {
    name: '/stop',
    en: 'Stop the current turn',
    th: 'หยุดงานที่กำลังทำงานอยู่',
    run: () => {
      const view = activeView();
      if (view?.busy) api.abort(view.tabId);
    },
  },
  {
    name: '/usage',
    en: 'Refresh credits and status',
    th: 'อัปเดตเครดิตและสถานะ',
    run: () => el('refreshUsage').click(),
  },
  {
    name: '/help',
    en: 'Show this command list',
    th: 'แสดงรายการคำสั่งนี้',
    run: () => {
      input.value = '/';
      autoGrow();
      updateSlashMenu();
      input.focus();
    },
  },
  {
    // Discovery only: once `/skill` is in the box the palette switches to the
    // skill list, so this entry exists to make that reachable without knowing
    // the word in advance.
    name: '/skill',
    en: 'Search the skills installed on this machine',
    th: 'ค้นหารายชื่อทักษะที่ติดตั้งไว้',
    run: () => {
      input.value = '/skill ';
      autoGrow();
      updateSlashMenu();
      input.focus();
    },
  },
];

const slashState = { open: false, index: 0, items: [] };

function slashDescription(cmd) {
  return (lang === 'th' ? cmd.th : cmd.en) || cmd.en || '';
}

/**
 * `/skill` lists what is installed on this machine, so nobody has to remember
 * the name of all forty-odd of them.
 *
 * Bare `/` stays the command palette: burying twelve commands under forty skills
 * would make both harder to find. The chosen entry is inserted as `@name` — the
 * shorthand people already type — which the send path rewrites to `/skill:name`.
 *
 * Descriptions are shown exactly as the skill's own SKILL.md writes them. They
 * are English because the skills are, and translating them here would need
 * updating every time a skill is installed.
 */
const SKILL_SLASH_RE = /^\/skill(?:\s+(.*))?$/is;

function skillSlashItems(query) {
  const q = String(query || '').trim().toLowerCase();
  return (Array.isArray(skillsCache) ? skillsCache : [])
    .filter(
      (skill) =>
        !q ||
        String(skill.name || '').toLowerCase().includes(q) ||
        String(skill.description || '').toLowerCase().includes(q),
    )
    .map((skill) => ({
      name: `@${skill.name}`,
      en: skill.description || '',
      th: skill.description || '',
      run: () => {
        input.value = `@${skill.name} `;
        autoGrow();
      },
    }));
}

function applySlashItems(items) {
  if (!items.length) {
    hideSlashMenu();
    return;
  }
  // Compared by name, not by identity: the skill entries are rebuilt on every
  // keystroke, so an identity test would reset the highlight each time.
  const same =
    slashState.items.length === items.length &&
    slashState.items.every((cmd, i) => cmd.name === items[i].name);
  slashState.items = items;
  if (!same) slashState.index = 0;
  slashState.index = Math.min(slashState.index, items.length - 1);
  renderSlashMenu();
}

function updateSlashMenu() {
  const text = input.value;
  const skillMatch = SKILL_SLASH_RE.exec(text);
  if (skillMatch) {
    if (!skillsCache) {
      // First time in this run the scan crosses IPC, so paint the list as soon
      // as it lands rather than leaving the menu empty under the cursor.
      loadSkills().then(() => {
        if (SKILL_SLASH_RE.test(input.value)) updateSlashMenu();
      });
    }
    applySlashItems(skillSlashItems(skillMatch[1]));
    return;
  }
  if (!text.startsWith('/') || /\s/.test(text)) {
    hideSlashMenu();
    return;
  }
  const query = text.slice(1).toLowerCase();
  applySlashItems(
    SLASH_COMMANDS.filter((cmd) => {
      const name = cmd.name.slice(1).toLowerCase();
      return name.startsWith(query) || slashDescription(cmd).toLowerCase().includes(query);
    }),
  );
}

function renderSlashMenu() {
  slashMenu.innerHTML = '';
  slashState.items.forEach((cmd, i) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'slash-item' + (i === slashState.index ? ' active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === slashState.index));
    const name = document.createElement('span');
    name.className = 'slash-name';
    name.textContent = cmd.name;
    const desc = document.createElement('span');
    desc.className = 'slash-desc';
    desc.textContent = slashDescription(cmd);
    item.append(name, desc);
    item.addEventListener('mousedown', (e) => e.preventDefault());
    item.addEventListener('click', () => runSlashCommand(cmd));
    slashMenu.appendChild(item);
  });
  slashMenu.hidden = false;
  slashState.open = true;
  slashMenu.children[slashState.index]?.scrollIntoView({ block: 'nearest' });
}

function hideSlashMenu() {
  slashMenu.hidden = true;
  slashState.open = false;
  slashState.items = [];
  slashState.index = 0;
}

function moveSlashSelection(delta) {
  if (!slashState.open || !slashState.items.length) return;
  const n = slashState.items.length;
  slashState.index = (slashState.index + delta + n) % n;
  renderSlashMenu();
}

function runSlashCommand(cmd) {
  hideSlashMenu();
  input.value = '';
  autoGrow();
  cmd.run();
  if (!el('confirmOverlay')?.hidden) return;
  if (!el('settingsOverlay')?.hidden) return;
  input.focus();
}

/**
 * The command a typed line names, if any. Matches on the first word only, so
 * "/compact" and "/compact " both resolve, but "/compact all" does not run the
 * bare command by accident.
 */
function findSlashCommand(text) {
  const first = String(text || '').trim().split(/\s+/)[0];
  if (!first || !first.startsWith('/')) return null;
  return SLASH_COMMANDS.find((cmd) => cmd.name === first) || null;
}

input.addEventListener('input', () => {
  autoGrow();
  updateSlashMenu();
});
input.addEventListener('keydown', (e) => {
  // The @ menu must win over the submit shortcut. Both listeners sit on this
  // element, so stopPropagation() would not have prevented the other one from
  // running: this handler has to check the menu itself, before submit().
  if (fileMenuState.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const n = fileMenuState.items.length;
      fileMenuState.index = (fileMenuState.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderFileMenu();
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      applyFileMention(fileMenuState.items[fileMenuState.index]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideFileMenu();
      return;
    }
  }
  if (slashState.open) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      moveSlashSelection(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      moveSlashSelection(-1);
      return;
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const cmd = slashState.items[slashState.index];
      if (cmd) runSlashCommand(cmd);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideSlashMenu();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    submit();
    return;
  }
  // Ctrl+Enter is the explicit queue path while the agent works. When idle it
  // sends like Enter: a queue with no running turn would never drain.
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    e.stopPropagation();
    const view = activeView();
    if (!view) return;
    if (!view.busy) {
      submit();
      return;
    }
    const text = input.value.trim();
    if (!text && pendingImages.length === 0) return;
    // A queued slash command must stay a command. Queuing "/compact" as text
    // would send those eight characters to the model instead of compacting.
    const queuedCmd = text.startsWith('/') ? findSlashCommand(text) : null;
    if (queuedCmd && queuedCmd.name === '/compact') {
      input.value = '';
      autoGrow();
      compactConversation();
      updateSendState();
      return;
    }
    queueMessage(text, pendingImages.slice());
    pendingImages = [];
    renderAttachments();
    updateSendState();
  }
});

document.addEventListener('click', (e) => {
  if (!slashState.open) return;
  if (slashMenu.contains(e.target) || e.target === input) return;
  hideSlashMenu();
});

input.addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  await addAttachmentsFromFiles(files);
});

el('attachBtn').addEventListener('click', async () => {
  const picked = await api.pickImages();
  for (const img of picked) pendingImages.push(img);
  renderAttachments();
});

// Drag and drop images anywhere on the app.
const dropOverlay = document.createElement('div');
dropOverlay.className = 'drop-hint-overlay';
dropOverlay.hidden = true;
dropOverlay.textContent = t('dropFiles');
document.body.appendChild(dropOverlay);

let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth += 1;
  dropOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('drop', async (e) => {
  dragDepth = 0;
  dropOverlay.hidden = true;
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  e.stopPropagation();
  await addAttachmentsFromFiles(files);
  input.focus();
});

/**
 * Thumbnails for image files a message mentions.
 *
 * The image bytes come from main as a data URI (the CSP allows only self and
 * data:), and every path is validated against the workspace there. A missing or
 * oversized file simply produces no thumbnail.
 */
async function appendImagePreviews(container, text, cwd) {
  if (!container || !cwd || !text) return;
  const paths = FPProvider.extractImagePaths(text);
  if (!paths.length) return;
  // A grouped turn renders in several passes; only one may add a strip, or
  // concurrent reads race into duplicate thumbnails.
  if (container.querySelector('.msg-images') || container.__fpImagesPending) return;
  container.__fpImagesPending = true;

  const strip = document.createElement('div');
  strip.className = 'msg-images';
  for (const rel of paths) {
    const res = await api.readImage(cwd, rel).catch(() => null);
    if (!res?.ok) continue;
    const im = document.createElement('img');
    im.src = res.dataUri;
    im.alt = rel;
    im.title = rel;
    im.addEventListener('click', () => api.openPath(cwd, rel).catch(() => {}));
    strip.appendChild(im);
  }
  if (strip.children.length) container.appendChild(strip);
  container.__fpImagesPending = false;
}

/**
 * Message queue: Ctrl+Enter while the agent is busy stores the message instead
 * of dropping it. It is sent automatically as soon as the current turn
 * settles. Each view keeps its own queue, so background tabs do not steal it.
 */
/**
 * Put a message in the queue, held for a few seconds first when a turn is
 * running so a typo can still be fixed before it is sent.
 */
async function queueMessage(text, attachments) {
  const view = activeView();
  if (!view) return;
  view.queue = view.queue || [];
  const resolved = await resolveForSend(text);
  const item = {
    kind: 'prompt',
    text: resolved,
    images: attachments,
    queueId: `q${(view.queueSeq = (view.queueSeq || 0) + 1)}`,
  };
  view.queue.push(item);

  input.value = '';
  autoGrow();
  renderQueue();
  updateSendState();

  // The queue already waits for the turn to end, but a mistyped message would
  // still be sent as-is once it drains. The countdown buys the same few seconds
  // to fix it that the steer path gets.
  const hold = holdMessage(view, null, {
    text: resolved,
    images: attachments,
    send: () => {},
    what: t('holdWhatQueue'),
    rowInto: () => {
      const row = el('queueBar')?.querySelector(`[data-queue-id="${item.queueId}"]`);
      return row || null;
    },
  });
  hold.item = item;
  hold.onCancel = (taken) => {
    const at = (view.queue || []).indexOf(item);
    if (at !== -1) view.queue.splice(at, 1);
    renderQueue();
    updateSendState();
    if (taken) {
      input.value = resolved || '';
      pendingImages = (attachments || []).slice();
      renderAttachments();
      autoGrow();
      updateSendState();
      input.focus();
    }
  };
}

/**
 * Queue a slash command that acts on the conversation rather than sending text.
 *
 * `/compact` used to refuse outright while a turn was running, which read as
 * "wait for this to finish and try again" — but every other input could already
 * wait in the queue, so there was no reason for this one to be different.
 */
function queueAction(label, run) {
  const view = activeView();
  if (!view) return;
  view.queue = view.queue || [];
  view.queue.push({ kind: 'action', label, run });
  renderQueue();
  updateSendState();
}

/**
 * pi expands `/skill:name`, but users type `@name`. Resolve it at send time so
 * Enter on `@caveman` works even when the mention menu was never used.
 */
async function resolveForSend(text) {
  if (!text.startsWith('@')) return text;
  const skills = await loadSkills().catch(() => []);
  return FPProvider.resolveSkillMention(text, skills);
}

/** Send the next queued message if the tab is idle. */
async function drainQueue(view) {
  if (!view || view.busy) return;
  if (!view.queue || !view.queue.length) return;
  // An item being edited is not ready to go: sending it would ship the text the
  // user is in the middle of changing. It keeps its place and the drain simply
  // waits for it, which is why saving returns it to where it was.
  const blocked = view.queue[0]?.editing;
  if (blocked) {
    renderQueue();
    return;
  }
  const next = view.queue.shift();
  renderQueue();
  // The turn that was running when this was queued has ended, so any countdown
  // still ticking on it is moot: release it before the message goes out, or the
  // timer would later fire a second send for the same text.
  const held = holds.get(view.tabId);
  if (held && !held.finished && held.item === next) {
    held.finished = true;
    clearInterval(held.timer);
    holds.delete(view.tabId);
    held.row.remove();
  }
  if (next.kind === 'action') {
    // An action does not produce a turn, so nothing will call `onSettled` to
    // restart the queue. Run it and keep draining by hand.
    try {
      await next.run();
    } catch (err) {
      if (payloadTabIsActive(view)) showNotice(errorText(err));
    }
    renderQueue();
    await drainQueue(view);
    return;
  }
  await sendQueued(view, next);
}

async function sendQueued(view, item) {
  if (view.messages.length === 0) {
    view.label = item.text ? item.text.slice(0, 42) : 'Attachment';
  }
  // Only paint into the live DOM when this tab is the visible one; otherwise the
  // message is stored and replayed when the user switches to it.
  if (payloadTabIsActive(view)) {
    emptyState.hidden = true;
    renderUserMessage(item.text, item.images);
    scrollToBottom(true);
  }
  view.messages.push({ kind: 'user', text: item.text, images: item.images, pending: true });
  view.liveAssistant = null;
  view.liveTools = null;
  view.busy = true;
  if (payloadTabIsActive(view)) setBusy(true);
  try {
    await api.sendPrompt(view.tabId, item.text, item.images);
  } catch (err) {
    view.busy = false;
    if (payloadTabIsActive(view)) {
      setBusy(false);
      showNotice(errorText(err));
    }
  }
}

/**
 * Show the messages waiting behind the running turn.
 *
 * A queued message can be edited in place, and it keeps its position while it is
 * being edited: the row is not removed and re-added at the end, because the whole
 * point is that you should not have to re-order the queue after a typo. While a
 * row is open for editing it is flagged on the item itself, so the drain skips it
 * and the flag survives a re-render.
 *
 * Rows can also be dragged to a new position. Both a handle and the row itself
 * start a drag: the handle for people who expect one, the row for people who just
 * grab the text.
 */
function renderQueue() {
  const bar = el('queueBar');
  if (!bar) return;
  const view = activeView();
  const items = view?.queue || [];
  bar.innerHTML = '';
  if (!items.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const head = document.createElement('div');
  head.className = 'queue-head';
  head.textContent = items.length === 1 ? t('queuedOne') : t('queuedMany', { n: items.length });
  bar.appendChild(head);

  items.forEach((item, index) => {
    const row = document.createElement('div');
    // One line, always. The number, the handle, the controls and the words used to
    // be direct children of a wrapping flex row: a message long enough to fill the
    // width pushed the words onto a line of their own, so a queue of long messages
    // was twice as tall and read as ragged. They now sit in a single row that does
    // not wrap — the words give way (ellipsis) instead of the row — and only the
    // countdown below is allowed onto its own line.
    const line = document.createElement('div');
    line.className = 'queue-line';
    row.appendChild(line);
    row.className = 'queue-item';
    row.dataset.queueId = item.queueId || '';
    // The item's own position, resolved at click time by queueId rather than by
    // the index captured here — a drag can move it before the click lands.

    // Position in the queue, in front of everything else. Without it the only cue
    // to order was the vertical stacking, and while dragging — the one moment
    // order actually matters — the ghost is away from the list and you cannot
    // tell which of two similar messages is number two. It also says plainly
    // which message is next, because number one is the one that goes out when
    // the current turn ends.
    const num = document.createElement('span');
    num.className = 'queue-num';
    num.textContent = String(index + 1);
    num.setAttribute('aria-label', t('queuePosition', { n: index + 1 }));
    line.appendChild(num);

    if (item.kind !== 'action') {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'queue-grip';
      grip.textContent = '\u28ff';
      grip.title = t('queueReorder');
      grip.setAttribute('aria-label', t('queueReorder'));
      grip.tabIndex = 0;
      // The handle and the row both begin a drag.
      enableQueueDrag(row, grip);
      enableQueueDrag(row, row);
      line.appendChild(grip);
    }

    if (item.editing) {
      row.classList.add('editing');
      const field = document.createElement('input');
      field.className = 'queue-edit';
      field.type = 'text';
      field.value = item.draft ?? item.text ?? '';
      field.setAttribute('aria-label', t('queueEditingNote'));
      field.addEventListener('input', () => {
        item.draft = field.value;
        updateKeepButton(item, row);
      });
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          saveQueueEdit(view, item);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelQueueEdit(view, item);
        }
      });
      line.appendChild(field);

      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'queue-save';
      save.textContent = t('queueSave');
      save.addEventListener('click', () => saveQueueEdit(view, item));
      line.appendChild(save);

      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'queue-cancel';
      stop.textContent = t('queueCancelEdit');
      stop.addEventListener('click', () => cancelQueueEdit(view, item));
      line.appendChild(stop);

      bar.appendChild(row);
      updateKeepButton(item, row);
      // Focus once the field is in the document — focusing a detached node does
      // nothing — and put the caret at the end so typing appends rather than
      // overwrites. A re-render keeps the field that already has focus instead of
      // stealing it back to the start of the list.
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
      return;
    }

    const label = document.createElement('span');
    label.className = 'queue-text';
    // A queued slash command has no message text; show what it will do.
    const text = item.kind === 'action' ? item.label : item.text;
    label.textContent = text || '(attachment)';
    label.title = text || '';

    // The controls sit together in front of the words: drag handle, edit, remove.
    // They used to be split — handle and × on the left, the word "edit" out at the
    // far right — which meant crossing the whole row to change a message, and on a
    // long line the edit control was nowhere near the text it edits.
    //
    // Edit is a pencil rather than the word: at this size a glyph is read at a
    // glance, and the tooltip and aria-label still spell it out.
    if (item.kind !== 'action') {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'queue-edit-btn';
      edit.textContent = '\u270e';
      edit.title = t('queueEdit');
      edit.setAttribute('aria-label', t('queueEdit'));
      edit.addEventListener('click', () => {
        const v = activeView();
        if (!v?.queue) return;
        const at = v.queue.findIndex((q) => q.queueId === item.queueId);
        if (at === -1) return;
        // Stop any countdown still running on this row before opening the editor.
        // Otherwise the clock keeps running under the field and fires while the
        // user is still typing: the *old* text goes out, and the row they are
        // editing is pulled out from under them. Choosing to edit is precisely
        // the statement that this message is not ready to send yet.
        //
        // Silent: the hold is dropped but the queue item stays, because the
        // pencil edits it in place rather than taking the words back to the
        // composer the way the "edit" button in the countdown row does.
        cancelHoldFor(item.queueId);
        v.queue[at].editing = true;
        v.queue[at].draft = v.queue[at].text || '';
        renderQueue();
      });
      line.appendChild(edit);
    }

    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'queue-remove';
    rm.textContent = '\u00d7';
    rm.title = t('removeFromQueue');
    rm.setAttribute('aria-label', t('removeFromQueue'));
    rm.addEventListener('click', () => {
      const v = activeView();
      if (!v?.queue) return;
      const at = v.queue.findIndex((q) => q.queueId === item.queueId);
      if (at === -1) return;
      v.queue.splice(at, 1);
      renderQueue();
      // Removing the head may unblock the queue.
      if (v === activeView()) drainQueue(v);
    });
    line.appendChild(rm);
    line.appendChild(label);

    bar.appendChild(row);
  });

  // Rebuilding the rows throws away the countdown row that was mounted in one,
  // so put it back: a re-render (a second message queued, an item removed) must
  // not silently cancel the countdown.
  const held = view ? holds.get(view.tabId) : null;
  if (held && !held.finished && held.item?.queueId) {
    const target = bar.querySelector(`[data-queue-id="${held.item.queueId}"]`);
    if (target) target.appendChild(held.row);
  }
}

/**
 * Keep Save disabled while the text is empty.
 *
 * Saving an empty message would put a blank prompt into the queue that the AI
 * would then be asked to answer; the guard is here rather than in saveQueueEdit so
 * the button tells the user why it will not work.
 */
function updateKeepButton(item, row) {
  const save = row.querySelector('.queue-save');
  if (!save) return;
  save.disabled = !String(item.draft ?? '').trim();
}

/**
 * Save an edited queue item back where it was.
 *
 * The item is never removed from the array, so its index is untouched — that is
 * what keeps it in place instead of sending it to the back of the queue.
 */
function saveQueueEdit(view, item) {
  const at = (view?.queue || []).findIndex((q) => q.queueId === item.queueId);
  if (at === -1) return;
  const draft = String(view.queue[at].draft ?? '').trim();
  if (!draft) return;
  view.queue[at].text = draft;
  view.queue[at].editing = false;
  delete view.queue[at].draft;
  // The edited text is what will be sent, so a countdown that is still running
  // would send the old wording: release it.
  const held = holds.get(view.tabId);
  if (held && !held.finished && held.item === view.queue[at]) {
    held.finished = true;
    clearInterval(held.timer);
    holds.delete(view.tabId);
    held.row.remove();
  }
  renderQueue();
  updateSendState();
  drainQueue(view);
}

/** Close an edit without keeping the change. */
function cancelQueueEdit(view, item) {
  const at = (view?.queue || []).findIndex((q) => q.queueId === item.queueId);
  if (at === -1) return;
  view.queue[at].editing = false;
  delete view.queue[at].draft;
  renderQueue();
  updateSendState();
  drainQueue(view);
}

/**
 * Drag a queue row to a new position.
 *
 * Two handles start the same drag: the grip, and the row itself. Rows are moved
 * in the array as the pointer passes the midpoint of a neighbour, so the list you
 * see while dragging is the list that gets saved — no separate preview to keep
 * in sync. The reorder is written on drop rather than on every move, so a drag
 * that is cancelled changes nothing.
 *
 * Any row being edited is left alone: dragging it out from under the input would
 * lose what is being typed.
 */
function enableQueueDrag(row, handle) {
  // Buttons inside the row keep their own clicks; only the handle itself and the
  // row background start a drag.
  if (handle !== row && handle.tagName === 'BUTTON') {
    handle.draggable = false;
  }

  const begin = (e) => {
    const item = row.dataset.queueId;
    if (!item || row.classList.contains('editing')) return;
    dragState = { id: item, row };
    row.classList.add('dragging');
    // Only the pointer's own position is passed: the ghost is placed from that
    // pair, and any pre-adjusted value here would be overwritten on the first
    // pointermove, making the pill jump as the drag starts.
    showDragGhost(row, e.clientX, e.clientY);
    e.dataTransfer?.setData('text/plain', item);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (handle === row) {
      // Clicking a button or the text field must not start a drag.
      if (e.target.closest('button, input')) return;
    }
    begin(e);
  });

  // Keyboard path: Alt+Up / Alt+Down moves a focused row.
  handle.addEventListener('keydown', (e) => {
    if (!e.altKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    moveQueueItem(row.dataset.queueId, e.key === 'ArrowUp' ? -1 : 1);
  });
}

/**
 * The translucent copy of the row that follows the pointer while dragging.
 *
 * Without it the only feedback was the original row fading — which says *what* is
 * moving but not *where to*. A ghost under the cursor makes the drag feel like
 * picking the message up and carrying it.
 *
 * It is built from the row's own text rather than a snapshot of its nodes: a
 * cloned row would bring its buttons, and a click on a ghost must never do
 * anything.
 */
function showDragGhost(row, clientX, clientY) {
  hideDragGhost();
  if (!row) return;
  const ghost = document.createElement('div');
  ghost.className = 'queue-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  // A short label, not the whole message. The ghost is a tag that says what is
  // being carried; the words are already on screen in the row it came from, so
  // copying all of them made a full-width band that covered the list you were
  // dragging into — the one thing you need to see.
  const raw = row.querySelector('.queue-text')?.textContent || '';
  ghost.textContent = shortenGhost(raw);
  document.body.appendChild(ghost);
  queueGhost = ghost;
  // Where inside the row it was grabbed, so the pill starts under the pointer
  // instead of jumping to the row's top edge.
  queueGhostGrab = clientY - row.getBoundingClientRect().top;
  moveDragGhost(clientX, clientY);
}

/** Cut the ghost's label to a length that fits a small pill. */
function shortenGhost(text, limit = 32) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  // Iterate by code point: Thai vowels and tone marks are separate code points,
  // and slicing by UTF-16 units can cut a combining mark away from its base.
  const chars = [...flat];
  if (chars.length <= limit) return flat;
  return `${chars.slice(0, limit).join('').trimEnd()}…`;
}

/**
 * Put the ghost under the pointer.
 *
 * Both axes are driven from the event. Only Y was driven before, and the CSS
 * pinned the pill to `left: 8px` — so while dragging a queued message the label
 * sat at the far left edge of the window and ignored where the mouse was.
 *
 * The pill is kept inside the viewport on both edges: dragging toward the right
 * or bottom of the window used to push the label off-screen, where it could not
 * be read at the moment it mattered.
 */
function moveDragGhost(clientX, clientY) {
  if (!queueGhost) return;
  const w = queueGhost.offsetWidth || 0;
  const h = queueGhost.offsetHeight || 0;
  const margin = 8;
  // Sit just right of the cursor, vertically centred on where it was grabbed.
  const wantedX = clientX + 12;
  const wantedY = clientY - (queueGhostGrab != null ? queueGhostGrab : h / 2) - h / 2;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  const x = Math.min(Math.max(wantedX, margin), maxX);
  const y = Math.min(Math.max(wantedY, margin), maxY);
  queueGhost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function hideDragGhost() {
  if (!queueGhost) return;
  queueGhost.remove();
  queueGhost = null;
  queueGhostGrab = null;
}

/** Move one queue item by `delta` positions and repaint. */
function moveQueueItem(queueId, delta) {
  const view = activeView();
  if (!view?.queue || !queueId) return false;
  const from = view.queue.findIndex((q) => q.queueId === queueId);
  if (from === -1) return false;
  const to = from + delta;
  if (to < 0 || to >= view.queue.length) return false;
  const [item] = view.queue.splice(from, 1);
  view.queue.splice(to, 0, item);
  renderQueue();
  return true;
}

/**
 * Where the dragged row should go, from the pointer's position.
 *
 * Compares against each row's vertical midpoint so the swap happens exactly when
 * the pointer crosses the middle, which is what the eye expects.
 */
function queueDropIndex(clientY) {
  const bar = el('queueBar');
  if (!bar) return -1;
  const rows = [...bar.querySelectorAll('.queue-item')].filter((r) => !r.classList.contains('dragging'));
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return rows.length;
}

/** Finish a drag on release: apply the move, or put the row back. */
function endQueueDrag(clientY) {
  if (!dragState) return;
  const { id, row } = dragState;
  dragState = null;
  hideDragGhost();
  row.classList.remove('dragging');
  const view = activeView();
  if (!view?.queue) {
    renderQueue();
    return;
  }
  const from = view.queue.findIndex((q) => q.queueId === id);
  if (from === -1) {
    renderQueue();
    return;
  }
  const [item] = view.queue.splice(from, 1);
  const target = queueDropIndex(clientY);
  // queueDropIndex counted the remaining rows, and the removed row is gone, so
  // the index is already the destination.
  const at = target < 0 ? view.queue.length : Math.min(target, view.queue.length);
  view.queue.splice(at, 0, item);
  renderQueue();
}

/** The row being dragged, or null. */
let dragState = null;

/** The translucent copy following the pointer, or null. */
let queueGhost = null;

/** How far down the row the pointer grabbed it, in px. */
let queueGhostGrab = null;

// The drag ends wherever the pointer is released, which may be outside the queue,
// so the listener is on the window rather than on the row.
window.addEventListener('pointerup', (e) => endQueueDrag(e.clientY));
window.addEventListener('pointercancel', () => endQueueDrag(-1));
// The ghost tracks the pointer everywhere, including outside the queue bar.
window.addEventListener('pointermove', (e) => {
  if (dragState) moveDragGhost(e.clientX, e.clientY);
});

async function submit() {
  const view = activeView();
  if (!view) return;
  const text = input.value.trim();
  if (!text && pendingImages.length === 0) return;

  // `/clear` is handled here, not by the model. It deletes this chat's text
  // and attached images after confirmation.
  if (text.toLowerCase() === '/clear') {
    showConfirmClear(view.tabId);
    return;
  }

  // `@caveman …` becomes `/skill:caveman …` before anything is stored, so the
  // queue, the transcript and the session all see the command pi expands.
  const outgoing = await resolveForSend(text);

  // Enter while the agent works steers the running turn: the model sees the
  // instruction after the current step, before its next call. Ctrl+Enter is
  // the queue path instead.
  if (view.busy) {
    const steerWrap = renderUserMessage(outgoing, pendingImages);
    const steerImages = pendingImages.slice();
    const steerSend = async () => {
      // The reply to this steer will arrive on the next turn. Remember that a
      // boundary is owed so `agent:turnStart` starts that reply below this
      // message instead of appending it to the block already streaming.
      view.steerPending = true;
      try {
        playSound('send');
        await api.sendPrompt(view.tabId, outgoing, steerImages, 'steer');
        showNotice(t('steerSent'), 2600);
      } catch (err) {
        showNotice(errorText(err));
      }
    };
    const hold = holdMessage(view, steerWrap, {
      text: outgoing,
      images: steerImages,
      send: steerSend,
      what: t('holdWhatSteer'),
    });
    view.messages.push({
      kind: 'user',
      text: outgoing,
      images: steerImages.slice(),
      pending: true,
      holdId: hold.id,
    });
    pendingImages = [];
    renderAttachments();
    input.value = '';
    autoGrow();
    hideFileMenu();
    updateSendState();
    return;
  }

  showNotice(null);

  if (view.messages.length === 0) {
    view.label = outgoing ? outgoing.slice(0, 42) : 'Image';
  }

  renderUserMessage(outgoing, pendingImages);
  view.messages.push({ kind: 'user', text: outgoing, images: pendingImages.slice(), pending: true });

  const images = pendingImages.slice();
  pendingImages = [];
  renderAttachments();

  input.value = '';
  autoGrow();
  hideSlashMenu();
  view.liveAssistant = null;
  view.liveTools = null;
  setBusy(true);

  try {
    playSound('send');
    await api.sendPrompt(view.tabId, outgoing, images);
  } catch (err) {
    showNotice(errorText(err));
    setBusy(false);
  }
}

sendBtn.addEventListener('click', submit);
stopBtn.addEventListener('click', async () => {
  const view = activeView();
  if (view) await api.abort(view.tabId);
});

/* ----------------------------- status panel ----------------------------- */

/**
 * Status is polled in the background so the user always sees a live credit
 * balance and a countdown to the refill. Countdown ticks every 15s locally
 * (no network), the numbers refresh every 90s and right after each turn.
 */
let usageRefillAt = null;
let usageTimer = null;
/** Last successful /me/stats payload — reused to re-render labels on language change. */
let lastUsage = null;

function setResets(text, title) {
  const node = el('usageResets');
  if (!node) return;
  node.textContent = text;
  node.title = title || '';
}

/** Recompute "Resets in ..." from the cached timestamp — no network call. */
function tickResets() {
  if (!usageRefillAt || Number.isNaN(usageRefillAt.getTime())) {
    setResets('—');
    return;
  }
  const diffMs = usageRefillAt.getTime() - Date.now();
  if (diffMs <= 0) {
    setResets(lang === 'th' ? 'ตอนนี้' : 'now');
    return;
  }

  // Same formatter as the tool cards, in countdown mode: under a minute used to
  // read "0 นาที", which looks like the reset already happened.
  const countdown = formatSpan(diffMs, { decimals: 0 });

  // Show the wall-clock moment too, so "8 h" is actionable: "| 13/11 10:00".
  const when = formatShortDateTime(usageRefillAt);
  setResets(`${countdown} | ${when}`, usageRefillAt.toLocaleString());
}

/** `13/11 07.00 น.` — short, local, unambiguous enough for a countdown hint. */
function formatShortDateTime(date) {
  const p = (n) => String(n).padStart(2, '0');
  const d = `${p(date.getDate())}/${p(date.getMonth() + 1)}`;
  const t = `${p(date.getHours())}.${p(date.getMinutes())}`;
  return lang === 'th' ? `${d} ${t} น.` : `${d} ${t}`;
}

/** Paint the credits / percentage / bar from a /me/stats payload. */
function applyUsageLabels(d) {
  const remaining = d.remaining_credits_today;
  const allowance = d.allowance_credits;
  const bonus = d.bonus_wallet_credits ?? d.premium_credits;

  if (typeof remaining === 'number' && typeof allowance === 'number' && allowance > 0) {
    el('usageCost').textContent = `${remaining.toLocaleString()} / ${allowance.toLocaleString()}`;
    const usedPct = Math.max(0, Math.min(100, Math.round((1 - remaining / allowance) * 100)));
    el('usageCost').title = `${usedPct}%`;

    const fill = el('usageBarFill');
    fill.style.width = `${usedPct}%`;
    // Green while comfortable, amber when getting low, red when nearly gone.
    fill.className = 'usage-bar-fill' + (usedPct >= 90 ? ' danger' : usedPct >= 70 ? ' warn' : '');
    el('usagePct').textContent = `${usedPct}%`;
    el('usageUsed').textContent = t('spent', {
      n: (allowance - remaining).toLocaleString(),
      total: allowance.toLocaleString(),
    });
  } else {
    el('usageBarFill').style.width = '0%';
    el('usagePct').textContent = '—';
    el('usageUsed').textContent = '';
    el('usageCost').textContent = typeof remaining === 'number' ? remaining.toLocaleString() : '—';
  }

  el('usageTokens').textContent =
    typeof bonus === 'number' && bonus > 0 ? `+${bonus.toLocaleString()}` : '0';
  el('usageContext').textContent = d.lane || d.tier || '—';

  usageRefillAt =
    typeof d.refill_at === 'string' && !Number.isNaN(new Date(d.refill_at).getTime())
      ? new Date(d.refill_at)
      : null;
  tickResets();
}

async function refreshUsage({ silent = false } = {}) {
  if (!silent) el('usageCost').textContent = '…';
  let res;
  try {
    res = await api.fetchUsage();
  } catch (err) {
    res = { ok: false, error: err?.message || String(err) };
  }

  if (!res || !res.ok) {
    lastUsage = null;
    el('usageCost').textContent = 'n/a';
    el('usageCost').title = res?.error || '';
    el('usageTokens').textContent = '—';
    el('usageContext').textContent = '—';
    el('usageBarFill').style.width = '0%';
    el('usagePct').textContent = '—';
    el('usageUsed').textContent = '';
    usageRefillAt = null;
    setResets('—');
    return;
  }

  lastUsage = res.data || {};
  applyUsageLabels(lastUsage);
}

function startUsagePolling() {
  stopUsagePolling();
  refreshUsage({ silent: true });
  // Numbers every 90s, countdown every 15s.
  usageTimer = setInterval(() => refreshUsage({ silent: true }), 90000);
  setInterval(tickResets, 15000);
}

function stopUsagePolling() {
  if (usageTimer) {
    clearInterval(usageTimer);
    usageTimer = null;
  }
}

el('refreshUsage').addEventListener('click', () => refreshUsage());

/* ------------------------- status pill (topbar) ------------------------- */

/*
 * The pill carries the three numbers worth a glance; this popover carries the
 * rest. It is a read-out first and a control second, so the pointer opens it:
 * hovering after a short delay (a pointer crossing the topbar on its way
 * somewhere else must not flash a panel), closing after a longer one, which is
 * the gap between the pill and the panel itself.
 *
 * A click pins it. Without that, the button inside could not be pressed — the
 * panel would close the moment the pointer left the pill. Escape and a click
 * outside always close, pinned or not.
 */
const STATUS_OPEN_DELAY_MS = 110;
const STATUS_CLOSE_DELAY_MS = 260;
let statusHoverTimer = null;
let statusPinned = false;

function statusPopoverOpen() {
  const pop = el('statusPopover');
  return Boolean(pop && !pop.hidden);
}

function setStatusPopover(open) {
  const pop = el('statusPopover');
  const pill = el('statusPill');
  if (!pop || !pill) return;
  pop.hidden = !open;
  pill.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open) statusPinned = false;
}

function cancelStatusHover() {
  if (!statusHoverTimer) return;
  clearTimeout(statusHoverTimer);
  statusHoverTimer = null;
}

function queueStatusPopover(open, delay) {
  cancelStatusHover();
  statusHoverTimer = setTimeout(() => {
    statusHoverTimer = null;
    // A pinned panel ignores the pointer leaving; only an explicit close unpins.
    if (!open && statusPinned) return;
    setStatusPopover(open);
  }, delay);
}

el('statusPill').addEventListener('click', () => {
  if (statusPopoverOpen() && statusPinned) {
    setStatusPopover(false);
    return;
  }
  statusPinned = true;
  cancelStatusHover();
  setStatusPopover(true);
});

const statusStripEl = el('statusStrip');
statusStripEl.addEventListener('pointerenter', () => queueStatusPopover(true, STATUS_OPEN_DELAY_MS));
// `pointerleave` on the strip, not the pill: moving from the pill into the panel
// is not leaving, which is what lets someone reach the refresh button.
statusStripEl.addEventListener('pointerleave', () => queueStatusPopover(false, STATUS_CLOSE_DELAY_MS));

el('statusPopover').addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Escape belongs to the popover while it is open, not to the dialog or the
  // command palette behind it.
  e.stopPropagation();
  setStatusPopover(false);
  el('statusPill').focus();
});

document.addEventListener('pointerdown', (e) => {
  if (!statusPopoverOpen()) return;
  if (e.target && e.target.closest && e.target.closest('#statusStrip')) return;
  cancelStatusHover();
  setStatusPopover(false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && statusPopoverOpen()) {
    cancelStatusHover();
    setStatusPopover(false);
  }
});


// Language toggle: saves the choice so it survives a restart.
el('langBtn').addEventListener('click', () => setLanguage(lang === 'en' ? 'th' : 'en'));

/* ------------------------- browser control chip ------------------------- */

let browserState = { enabled: false, connected: false, port: 0, paired: false, installed: true };
/** The tab the user handed over, if any. Null means the agent's own window. */
let browserClaim = null;
/** Hand-over mode, and how long it has left. */
let autopilotState = { on: false };
/** Every real tab, for the picker. */
let browserTabs = [];


const AUTOPILOT_REASON_KEY = {
  idle: 'autopilotStopIdle',
  tabClosed: 'autopilotStopTabClosed',
  leftSite: 'autopilotStopLeftSite',
  failures: 'autopilotStopFailures',
  featureOff: 'autopilotStopFeatureOff',
  released: 'autopilotStopStopped',
  user: 'autopilotStopStopped',
  stopped: 'autopilotStopStopped',
};

function hostOf(url) {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return '';
  }
}

function renderBrowserChip() {
  const btn = el('browserBtn');
  if (!btn) return;
  const dot = btn.querySelector('.dot');
  const state = !browserState.enabled
    ? 'off'
    : autopilotState.on
      ? 'autopilot'
      : browserClaim
        ? 'claimed'
        : browserState.connected
          ? 'on'
          : 'waiting';
  if (dot) dot.className = `dot ${state}`;
  btn.setAttribute('aria-pressed', browserState.enabled ? 'true' : 'false');
  const key =
    state === 'off'
      ? 'browserChipOff'
      : state === 'waiting'
        ? 'browserChipWaiting'
        : state === 'claimed' || state === 'autopilot'
          ? 'browserClaimed'
          : 'browserChipOn';
  btn.title = t(key);
}

function renderTabList() {
  const list = el('browserTabsList');
  if (!list) return;
  list.textContent = '';
  if (!browserState.enabled) return;
  if (!browserTabs.length) {
    const empty = document.createElement('p');
    empty.className = 'dialog-sub small';
    empty.textContent = t('browserNoTabs');
    list.appendChild(empty);
    return;
  }
  for (const tab of browserTabs) {
    const handedOver = Boolean(browserClaim) && browserClaim.tabId === tab.id;
    const row = document.createElement('div');
    row.className = `tab-row${handedOver ? ' claimed' : ''}`;
    row.setAttribute('role', 'listitem');

    const info = document.createElement('div');
    info.className = 'tab-info';
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || '—';
    const host = document.createElement('span');
    host.className = 'tab-host';
    host.textContent = [hostOf(tab.url), tab.agent ? t('browserTabAgent') : ''].filter(Boolean).join(' · ');
    info.append(title, host);
    row.appendChild(info);

    if (handedOver) {
      const badge = document.createElement('span');
      badge.className = 'tool-chip';
      badge.textContent = t('browserClaimed');
      row.appendChild(badge);
    } else if (!tab.agent) {
      const use = document.createElement('button');
      use.className = 'ghost small';
      use.textContent = t('browserClaimTab');
      use.addEventListener('click', () => claimBrowserTab(tab.id));
      row.appendChild(use);
    }
    list.appendChild(row);
  }
}

function renderAutopilot() {
  const button = el('browserAutopilot');
  if (button) {
    button.hidden = !browserClaim;
    button.textContent = t(autopilotState.on ? 'browserAutopilotOff' : 'browserAutopilotOn');
  }
  const release = el('browserRelease');
  if (release) release.hidden = !browserClaim;

  const note = el('browserAutopilotNote');
  if (note) {
    note.hidden = !autopilotState.on;
    if (autopilotState.on) {
      const left = Math.max(0, Math.round((autopilotState.until - Date.now()) / 60000));
      note.textContent = `${t('browserAutopilotNote')} ${t('browserAutopilotUntil')} ~${left} min.`;
    }
  }
  const stop = el('activityStop');
  if (stop) stop.hidden = !autopilotState.on;
}

function renderBrowserDialog() {
  const line = el('browserStatusLine');
  if (line) {
    line.textContent = t(
      !browserState.enabled ? 'browserOff' : browserState.connected ? 'browserConnected' : 'browserWaiting'
    );
  }
  const code = el('browserCode');
  if (code) code.textContent = browserState.code || '------';
  const toggle = el('browserToggle');
  if (toggle) toggle.textContent = t(browserState.enabled ? 'browserDisconnect' : 'browserConnect');
  const watch = el('browserWatch');
  if (watch) watch.hidden = !browserState.connected;
  renderTabList();
  renderAutopilot();
}

function describeActivity(entry) {
  const where = entry.host ? `${entry.host} · ` : '';
  const what = entry.ref || entry.selector || '';
  const mark = entry.ok ? '✓' : `✗ ${t('activityFailed')}`;
  return `${where}${entry.cmd}${what ? ` ${what}` : ''} ${mark}`;
}

function pushActivity(entry) {
  const strip = el('activityStrip');
  const lines = el('activityLines');
  if (!strip || !lines) return;
  /*
   * One line, always the newest.
   *
   * This used to append and keep six rows, so a burst of browser commands grew
   * the footer upward and shoved the composer and transcript up with it — the
   * chat visibly jumped while the agent worked. The strip is a "what is it doing
   * right now" readout, not a log: the previous command has already been
   * superseded by the time a new one arrives, and a scrolling history belongs in
   * the transcript's tool cards, where it already is.
   */
  lines.replaceChildren();
  const row = document.createElement('div');
  row.className = `activity-line${entry.ok ? '' : ' bad'}`;
  row.textContent = describeActivity(entry);
  row.title = row.textContent;
  lines.appendChild(row);
  strip.hidden = false;
  renderAutopilot();
}

function clearActivity() {
  const strip = el('activityStrip');
  const lines = el('activityLines');
  if (lines) lines.textContent = '';
  if (strip) strip.hidden = true;
}

async function refreshBrowserTabs() {
  const res = await api.browserTabs().catch(() => null);
  browserTabs = res && res.ok ? res.tabs || [] : [];
  renderTabList();
}

async function claimBrowserTab(tabId) {
  const res = await api.browserClaim(tabId).catch(() => null);
  if (!res || !res.ok) {
    showToast({ title: t('browserTitle'), body: String((res && res.error) || t('browserClaimFailed')) });
    return;
  }
  browserClaim = res.claim;
  renderBrowserChip();
  renderBrowserDialog();
  await refreshBrowserTabs();
}

async function releaseBrowserTab() {
  await api.browserRelease().catch(() => null);
  browserClaim = null;
  autopilotState = { on: false };
  clearActivity();
  renderBrowserChip();
  renderBrowserDialog();
  await refreshBrowserTabs();
}

async function refreshBrowserStatus() {
  try {
    const status = await api.browserStatus();
    browserState = { ...browserState, ...status };
  } catch {}
  renderBrowserChip();
  renderBrowserDialog();
}

async function openBrowserDialog() {
  try {
    const info = await api.browserInstallInfo();
    browserState.code = info.code;
  } catch {}
  el('browserOverlay').hidden = false;
  renderBrowserDialog();
  el('browserToggle').focus();
  await refreshBrowserTabs();
}

el('browserBtn').addEventListener('click', async () => {
  // Turning it off is immediate; turning it on opens the setup dialog.
  if (browserState.enabled) {
    const next = await api.browserToggle(false).catch(() => null);
    if (next) browserState = { ...browserState, ...next };
    renderBrowserChip();
    renderBrowserDialog();
    return;
  }
  const next = await api.browserToggle(true).catch(() => null);
  if (next) browserState = { ...browserState, ...next };
  renderBrowserChip();
  await openBrowserDialog();
});

el('browserOpenFolder').addEventListener('click', async () => {
  const res = await api.browserOpenFolder().catch(() => null);
  if (res && !res.ok) showToast({ title: t('browserTitle'), body: t('browserNotInstalled') });
});

el('browserCopyUrl').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('chrome://extensions');
    showToast({ title: t('browserTitle'), body: t('browserCopied') });
  } catch {}
});

el('browserWatch').addEventListener('click', async () => {
  const res = await api.browserWatch().catch(() => null);
  if (res && !res.ok) showToast({ title: t('browserTitle'), body: String(res.error || '') });
});

el('browserToggle').addEventListener('click', async () => {
  const next = await api.browserToggle(!browserState.enabled).catch(() => null);
  if (next) browserState = { ...browserState, ...next };
  renderBrowserChip();
  renderBrowserDialog();
});

el('browserClose').addEventListener('click', () => {
  el('browserOverlay').hidden = true;
});

if (typeof api.onBrowserStatus === 'function') {
  api.onBrowserStatus((status) => {
    browserState = { ...browserState, ...status };
    // The status carries the claim and the mode, so a second window or a
    // restart cannot leave this one showing a tab nobody handed over.
    if ('claim' in status) browserClaim = status.claim || null;
    if (status.autopilot) autopilotState = status.autopilot;
    renderBrowserChip();
    renderBrowserDialog();
  });
}

if (typeof api.onBrowserClaimState === 'function') {
  api.onBrowserClaimState(({ claim }) => {
    browserClaim = claim || null;
    if (!browserClaim) clearActivity();
    renderBrowserChip();
    renderBrowserDialog();
  });
}

if (typeof api.onBrowserAutopilotState === 'function') {
  api.onBrowserAutopilotState(({ state }) => {
    const wasOn = autopilotState.on;
    autopilotState = state || { on: false };
    renderBrowserChip();
    renderAutopilot();
    // Say why the run ended; a mode that just vanishes is worse than one that
    // never turned on.
    if (wasOn && !autopilotState.on) {
      showToast({ title: t('browserTitle'), body: t(AUTOPILOT_REASON_KEY[autopilotState.reason] || 'autopilotStopStopped') });
      clearActivity();
    }
  });
}

if (typeof api.onBrowserActivity === 'function') {
  api.onBrowserActivity(({ entry }) => {
    if (entry) pushActivity(entry);
  });
}

if (typeof api.onBrowserResume === 'function') {
  // The agent is about to look at the page again; the user may have moved or
  // closed the tab while answering, so re-read where things stand.
  api.onBrowserResume(() => refreshBrowserStatus());
}

el('browserRelease').addEventListener('click', releaseBrowserTab);

el('browserAutopilot').addEventListener('click', async () => {
  const res = await api.browserAutopilot(!autopilotState.on).catch(() => null);
  if (res && res.state) autopilotState = res.state;
  if (res && !res.ok && res.error) showToast({ title: t('browserTitle'), body: String(res.error) });
  renderBrowserChip();
  renderAutopilot();
});

el('activityStop').addEventListener('click', async () => {
  // Stop now, do not wait for the round trip: a Stop button that lags is worse
  // than no Stop button.
  autopilotState = { on: false, reason: 'user' };
  renderBrowserChip();
  renderAutopilot();
  clearActivity();
  await api.browserAutopilot(false).catch(() => null);
});


// Refresh the balance as soon as a turn ends — it just spent credits.
api.onSettled(() => refreshUsage({ silent: true }));

// Keyboard shortcuts for tabs.
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === 't') {
    e.preventDefault();
    el('newSession').click();
  } else if (e.key === 'w') {
    e.preventDefault();
    if (activeTabId) closeTab(activeTabId);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const ids = [...views.keys()];
    if (ids.length < 2) return;
    const i = ids.indexOf(activeTabId);
    const next = ids[(i + (e.shiftKey ? -1 : 1) + ids.length) % ids.length];
    activate(next);
  }
});

/* --------------------------- event wiring --------------------------- */

function viewFor(payload) {
  const view = views.get(payload.tabId);
  return view || null;
}

function ensureLive(view) {
  if (payloadTabIsActive(view)) {
    if (!view.liveAssistant || !document.body.contains(view.liveAssistant)) {
      view.liveAssistant = addMessage('assistant');
      view.liveTools = view.liveAssistant.querySelector('.tools');
    }
    return view.liveAssistant;
  }
  // Background tab: build nodes off-screen so history stays correct on switch.
  if (!view.liveAssistant) {
    view.liveAssistant = document.createElement('div');
    view.liveTools = document.createElement('div');
  }
  return view.liveAssistant;
}

const payloadTabIsActive = (view) => view && view.tabId === activeTabId;

/**
 * The bubble the agent is writing into right now.
 *
 * An assistant message used to hold exactly one `.body`, because one turn was
 * assumed to produce one block of prose. It does not: the agent states a plan,
 * calls a tool, then reports again, and each of those is a separate block. The
 * text bubbles are therefore a list, and "the current one" is the last child.
 */
/**
 * Finish the bubble being written and make the next text start a new one.
 *
 * Called at a real boundary in the agent's output — a tool call, which always
 * separates one statement from the next.
 *
 * The bubble being closed is narration, not the answer: it says what the agent
 * is about to do, and a tool result follows it. Long narration was the reason a
 * single turn could fill the whole transcript with prose that nobody needs to
 * read twice, so it is wrapped in a collapsible "stepped through N notes" line.
 * The *last* block of a turn is never sealed, so the real answer always shows.
 */
function sealBody(wrap) {
  const bodies = wrap.querySelectorAll('.body');
  const last = bodies[bodies.length - 1];
  if (last && (last.__fpText || '').trim()) {
    last.__fpDone = true;
    collapseNarration(wrap, last);
  }
}

/**
 * Put one narration block behind a one-line toggle.
 *
 * Built lazily so a turn whose agent calls no tools — one block, nothing after
 * it — never grows a toggle at all. Re-labeling is centralised so the count in
 * "Stepped through 3 notes" stays right as the turn goes on.
 */
function collapseNarration(wrap, body) {
  // Already wrapped (a replay may seal the same node twice).
  if (body.parentElement?.classList.contains('narration')) return;

  let group = wrap.querySelector('.narration-group');
  if (!group) {
    group = document.createElement('div');
    group.className = 'narration-group';
    group.hidden = true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'narration-toggle';
    toggle.setAttribute('aria-expanded', 'false');

    const list = document.createElement('div');
    list.className = 'narration-list';
    list.hidden = true;

    toggle.addEventListener('click', () => {
      const open = list.hidden;
      list.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      const chev = toggle.querySelector('.narration-chevron');
      if (chev) chev.textContent = open ? '\u25be' : '\u25b8';
      if (open) scrollToBottom();
    });

    toggle.append(
      Object.assign(document.createElement('span'), { className: 'narration-chevron', textContent: '\u25b8' }),
      Object.assign(document.createElement('span'), { className: 'narration-text' })
    );
    group.append(toggle, list);
    // The group sits where the first note was, so reading order is preserved.
    body.parentElement.insertBefore(group, body);
  }

  const item = document.createElement('div');
  item.className = 'narration';
  item.appendChild(body);
  group.querySelector('.narration-list').appendChild(item);
  group.hidden = false;
  labelNarration(group);
}

/** Keep the summary line in step with how many notes are folded away. */
function labelNarration(group) {
  const text = group.querySelector('.narration-text');
  if (!text) return;
  const n = group.querySelectorAll('.narration').length;
  text.textContent = n === 1 ? t('narrationOne') : t('narrationMany', { n });
}

function currentBody(wrap) {
  const bodies = wrap.querySelectorAll('.body');
  const last = bodies[bodies.length - 1];
  // A sealed bubble is finished: writing into it would append the new block to
  // the old one, so a fresh bubble goes below instead.
  if (last && !last.__fpDone) return last;
  const created = document.createElement('div');
  created.className = 'body';
  wrap.appendChild(created);
  return created;
}

api.onDelta((p) => {
  const view = viewFor(p);
  if (!view) return;
  const active = payloadTabIsActive(view);
  if (!active) {
    // Accumulate into the stored message instead of the DOM.
    const last = view.messages[view.messages.length - 1];
    if (p.channel === 'text') {
      if (last?.kind === 'assistant') last.text = (last.text || '') + p.delta;
      else view.messages.push({ kind: 'assistant', text: p.delta, thinking: '', tools: [] });
    }
    return;
  }
  const wrap = ensureLive(view);
  if (p.channel === 'thinking') {
    const th = wrap.querySelector('.thinking');
    const toggle = wrap.querySelector('.thinking-toggle');
    if (th) {
      th.textContent += p.delta;
      // Show the toggle only once there is something to read.
      if (toggle && th.textContent.trim().length > 0) {
        toggle.hidden = false;
        if (th.hidden) toggle.textContent = `\u25b8 ${t('thinkingShow')}`;
      }
      setActivity(wrap, 'think', true);
    }
  } else {
    // Prose arrived, so reasoning has handed over to writing.
    setActivity(wrap, 'think', false);
    setActivity(wrap, 'notes', true);
    wrap.classList.add('streaming');
    // The last body, not the first: a turn that already spoke once continues in a
    // new bubble, and appending to the old one would put the new words above the
    // tool result that came between them.
    const body = currentBody(wrap);
    if (body) {
      body.__fpText = (body.__fpText || '') + p.delta;
      MD.renderInto(body, body.__fpText, { streaming: true, copiedLabel: t('copied') });
    }
  }
  scrollToBottom();
});

api.onTextEnd((p) => {
  const view = viewFor(p);
  if (!view || !payloadTabIsActive(view)) return;
  const wrap = ensureLive(view);
  wrap.classList.remove('streaming');
  if (p.text) {
    // A turn can speak more than once — "I will do A" then, after a tool call,
    // "A is done, now C". Each block arrives as its own text_end carrying the whole
    // of that block, so assigning it to the one bubble replaced the previous block
    // and the first thing the agent said disappeared from the transcript.
    // currentBody() starts a new bubble once the last one was sealed at a tool
    // call, which is exactly the boundary between two blocks.
    const body = currentBody(wrap);
    body.__fpText = p.text;
    body.__fpDone = true;
    MD.renderInto(body, p.text, { copiedLabel: t('copied') });
  }
  // Streaming output follows only a reader who is already at the bottom.
  scrollToBottom();
});

api.onToolStart((p) => {
  const view = viewFor(p);
  if (!view) return;
  if (!payloadTabIsActive(view)) {
    view.messages.push({ kind: 'assistant', text: '', thinking: '', tools: [{ id: p.id, name: p.name, args: p.args }] });
    return;
  }
  const wrap = ensureLive(view);
  // A tool call ends the block of prose before it. Closing the bubble here is what
  // makes the next block land in a new one: without it the incoming delta appends
  // to this bubble, and then text_end sees changed text and creates a second one,
  // leaving the words attached to two bubbles at once.
  sealBody(wrap);
  // Writing is over while the tool runs; the tool chip takes over.
  setActivity(wrap, 'notes', false);
  setActivity(wrap, 'think', false);
  // Several tools can be in flight at once, so the chip tracks a count rather
  // than a flag: it must survive until the last one finishes.
  wrap.__runningTools = (wrap.__runningTools || 0) + 1;
  setActivity(wrap, 'tools', true);
  view.liveTools = wrap.querySelector('.tools');
  if (view.liveTools) toolCard(view.liveTools, p);
});

api.onToolUpdate((p) => {
  const view = viewFor(p);
  if (!view || !payloadTabIsActive(view)) return;
  const card = document.querySelector(`[data-tool-id="${p.id}"]`);
  if (card) card.querySelector('.tool-body').textContent = toolText(p.partial);
});

api.onToolEnd((p) => {
  const view = viewFor(p);
  if (!view) return;

  // Remember the result so the card (and its diff) survives a session switch.
  view.toolResults = view.toolResults || new Map();
  view.toolResults.set(p.id, {
    text: toolText(p.result) || t('noOutput'),
    isError: Boolean(p.isError),
    durationMs: p.durationMs,
    diff: p.diff || null,
  });
  if (!payloadTabIsActive(view)) return;

  const card = document.querySelector(`[data-tool-id="${p.id}"]`);
  if (!card) return;
  applyToolResult(card, view.toolResults.get(p.id), view.cwd);
  // The chip goes only when nothing else is still running.
  const wrap = card.closest('.msg');
  if (wrap) {
    wrap.__runningTools = Math.max(0, (wrap.__runningTools || 1) - 1);
    if (!wrap.__runningTools) setActivity(wrap, 'tools', false);
  }
  scrollToBottom();
});

/** Paint one finished tool result onto its card. */
function applyToolResult(card, res, cwd) {
  card.classList.toggle('error', res.isError);
  card.classList.toggle('ok', !res.isError);
  card.querySelector('.tool-status').textContent = res.isError
    ? t('toolFailed')
    : res.durationMs != null
    ? formatSpan(res.durationMs)
    : t('toolDone');

  const hasDiff = res.diff && (res.diff.added || res.diff.removed);
  if (hasDiff) {
    renderDiffInto(card, res.diff);
  } else {
    card.querySelector('.tool-body').textContent = res.text;
  }
  appendImagePreviews(card, res.text, cwd || activeView()?.cwd);

  const copy = card.querySelector('.tool-copy');
  if (copy) copy.hidden = !(card.querySelector('.tool-body')?.textContent || '').trim();

  // Failures used to pop their card open and open the whole tool group. That
  // reads as the app taking over: the box expands by itself and the view is
  // already scrolling toward it. Keep the card where the reader left it — the
  // red border, the "Failed" label and the group's failed count already say
  // what happened, and one click still opens the details.
  if (res.isError) {
    const tools = card.closest('.tools');
    if (tools) refreshToolsSummary(tools);
  }
  refreshToolsSummary(card.parentElement);
}

/** Attach a +/- counter to the tool header and the unified diff to its body. */
function renderDiffInto(card, diff) {
  const head = card.querySelector('.tool-head');
  const argEl = head.querySelector('.tool-arg');
  if (argEl) argEl.textContent = diff.path;

  const counts = document.createElement('span');
  counts.className = 'diff-counts';
  counts.innerHTML =
    `<span class="d-add">+${diff.added}</span>` +
    (diff.removed ? `<span class="d-del">\u2212${diff.removed}</span>` : '');
  head.insertBefore(counts, head.querySelector('.tool-status'));

  const body = card.querySelector('.tool-body');
  body.textContent = '';
  body.classList.add('diff-body');

  if (diff.truncated || !diff.hunks?.length) {
    const note = document.createElement('div');
    note.className = 'diff-note';
    note.textContent = `${diff.added} line(s) added, ${diff.removed} line(s) removed`;
    body.appendChild(note);
    return;
  }

  for (const hunk of diff.hunks) {
    const block = document.createElement('div');
    block.className = 'diff-hunk';
    for (const op of hunk.ops) {
      const row = document.createElement('div');
      row.className = `diff-row ${op.type}`;
      const num = document.createElement('span');
      num.className = 'diff-num';
      num.textContent = op.type === 'ins' ? op.bLine : op.aLine;
      const sign = document.createElement('span');
      sign.className = 'diff-sign';
      sign.textContent = op.type === 'ins' ? '+' : op.type === 'del' ? '-' : ' ';
      const text = document.createElement('span');
      text.className = 'diff-text';
      text.textContent = op.text;
      row.append(num, sign, text);
      block.appendChild(row);
    }
    body.appendChild(block);
  }
}

api.onBusy((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.busy = p.busy;
  refreshSessionBusy();
  if (payloadTabIsActive(view)) {
    setBusy(p.busy);
    if (p.busy) ensureLive(view);
    else if (view.liveAssistant) view.liveAssistant.classList.remove('streaming');
  }
});

api.onTurnStart((p) => {
  const view = viewFor(p);
  if (!view || !view.steerPending) return;
  // The agent's new turn answers the message the user sent mid-run. That reply
  // belongs below the user's message, so seal the block that was streaming
  // before it — otherwise the answer grows in above the message and the
  // transcript reads out of order.
  view.steerPending = false;
  const live = view.liveAssistant;
  if (live && document.body.contains(live)) {
    // Only the live block counts: folded narration is already finished work and
    // would otherwise keep an empty bubble on screen.
    const text = live.querySelector(':scope > .body')?.textContent || '';
    const hasTools = Boolean(live.querySelector('.tool'));
    clearMsgActivity(live);
    if (!text.trim() && !hasTools) live.remove();
    else live.classList.remove('streaming');
  }
  view.liveAssistant = null;
  view.liveTools = null;
});

api.onSettled((p) => {
  const view = viewFor(p);
  if (!view) return;
  // Nothing is producing output any more.
  if (view.liveAssistant) clearMsgActivity(view.liveAssistant);
  // A queued prompt restarts work immediately, so only the last turn of a run
  // deserves the "finished" ping.
  const hadQueue = Boolean(view.queue?.length);
  view.busy = false;
  refreshSessionBusy();
  view.steerPending = false;
  if (view.liveAssistant) view.liveAssistant.classList.remove('streaming');
  view.liveAssistant = null;
  view.liveTools = null;
  if (payloadTabIsActive(view)) setBusy(false);
  if (payloadTabIsActive(view) && noticeIsRetry) showNotice(null);
  // A message held back while this turn ran no longer has anything to wait for:
  // send it now rather than making the user watch a countdown for a turn that
  // already finished.
  const held = holds.get(view.tabId);
  if (held && !held.finished && held.item) {
    held.item.holdReleased = true;
  }
  drainQueue(view);
  if (!hadQueue) notifyFinished(view);
});

api.onNotice((p) => {
  if (!payloadTabIsActive(viewFor(p))) return;
  noticeIsRetry = p.key === 'notice.retrying';
  showNotice(p.key ? t(p.key, p.params || null) : p.text, noticeIsRetry ? 10000 : undefined);
});

/** A failed turn is invisible otherwise: the assistant message has no text. */
function appendErrorBanner(text, scroll = true) {
  const div = document.createElement('div');
  div.className = 'error-banner';
  div.textContent = `${t('errorPrefix')}: ${text}`;
  transcript.appendChild(div);
  // Only follow a reader who is already at the bottom; someone scrolled up to
  // read is never yanked away by an error.
  if (scroll) scrollToBottom();
  return div;
}

api.onError((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.busy = false;
  view.steerPending = false;
  refreshSessionBusy();
  if (!payloadTabIsActive(view)) return;
  showNotice(null);
  // `key` is the same failure in the user's language; `status`/`code` stay
  // attached because they are what support needs when the wording is not enough.
  const body = p.key ? t(p.key) : p.text;
  // `p.text` already carries its "(HTTP 503 · service_busy)" suffix when the
  // failure has no translated sentence. Appending it again printed it twice:
  // "... service_busy) (HTTP 503 · service_busy)".
  const suffix = p.key && p.status ? ` (HTTP ${p.status}${p.code ? ` · ${p.code}` : ''})` : '';
  appendErrorBanner(`${body}${suffix}`);
  setBusy(false);
});


/**
 * Every free route is spent. Say it in the transcript of the tab that hit it and
 * leave the view where the reader put it — no scrolling, no dialog.
 */
api.onFallback((p) => {
  const view = viewFor(p);
  if (!view) return;
  if (payloadTabIsActive(view)) appendErrorBanner(t('fallback.exhausted', { n: p.tried || 0 }));
});

/* ------------------------------ ads ------------------------------ */

/**
 * Ads keep free-pi free — the backend refuses completions for a client that
 * never shows one. Render whatever the bridge fetched for this turn, and open
 * the click-through in the real browser (never in this window).
 */
let currentAd = null;

function renderAd(ad) {
  if (!adSlot) return;
  if (!ad || !ad.creative) {
    adSlot.hidden = true;
    return;
  }
  currentAd = ad;
  const brand = ad.creative.brand_name ? ` · ${ad.creative.brand_name}` : '';
  adSlot.querySelector('.ad-headline').textContent = `${ad.creative.headline || 'Sponsored'}${brand}`;
  const body = adSlot.querySelector('.ad-text');
  body.textContent = ad.creative.body || '';
  body.hidden = !ad.creative.body;
  adSlot.querySelector('.ad-cta').textContent = ad.creative.cta || 'Open';
  adSlot.title = t('adFrom');
  adSlot.hidden = false;
}

function openCurrentAd() {
  if (!currentAd?.click_url) return;
  api.openAd(currentAd.click_url).catch(() => {});
}

if (adSlot) {
  adSlot.addEventListener('click', openCurrentAd);
  adSlot.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCurrentAd();
    }
  });
  adSlot.tabIndex = 0;
  adSlot.querySelector('.ad-cta')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openCurrentAd();
  });
}

// The main process decides whether a rotation is due: focused window, idle tab,
// and at least a minute since the current creative was shown. Auto-rotation is
// always on — the renderer only polls; main enforces the one-minute minimum.
const AD_ROTATE_POLL_MS = 60 * 1000;
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  if (!activeTabId) return;
  const view = views.get(activeTabId);
  if (!view || view.busy) return;
  api.rotateAd({ tabId: activeTabId, auto: true }).catch(() => {});
}, AD_ROTATE_POLL_MS);

api.onAd((p) => {
  // A stray ad must never paint over a Coarena turn.
  const view = activeView();
  if (view && !FPProvider.isFreePiProvider(view.model?.provider)) return;
  renderAd(p?.ad);
});

api.onModelChanged((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.model = p.model;
  if (payloadTabIsActive(view)) {
    // Keep the select honest when the model changed from main (key removal,
    // resumed session) rather than from the dropdown itself.
    if (p.model) modelSelect.value = `${p.model.provider}||${p.model.id}`;
    paintModelTrigger(p.model);
    syncModelMenuSelection();
    syncProviderChrome(view);
    if (p.model?.provider === 'coarena') ensureCoarenaStatus(true).catch(() => {});
  }
  // Coming back to FreePi needs a banner; main decides whether one is due.
  if (FPProvider.isFreePiProvider(p.model?.provider)) {
    api.rotateAd({ tabId: view.tabId, auto: true }).catch(() => {});
  }
});

api.onSessionName((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.name = p.name;
  if (p.name) view.label = p.name;
  if (payloadTabIsActive(view)) sessionTitle.value = p.name || '';
});

api.onApprovalRequest((p) => showApproval(p));

/* ---------------------------- approval UI ---------------------------- */

const approvalOverlay = () => el('approvalOverlay');
let pendingApprovalId = null;

function describeReason(toolName, args) {
  if (toolName === 'bash') return args?.command || '';
  if (toolName === 'write') return args?.path || '';
  if (toolName === 'edit') return args?.path || '';
  return Object.keys(args || {}).length ? JSON.stringify(args, null, 2) : '';
}

function showApproval({ id, toolName, label, args }) {
  pendingApprovalId = id;
  const shown = label || toolName;
  try {
    el('approvalTool').textContent = shown;
    el('approvalCommand').textContent = describeReason(toolName, args) || '(no arguments)';
    approvalOverlay().hidden = false;
    el('approvalAllow').focus();
  } catch (err) {
    console.error('[approval] could not show the prompt:', err);
    if (id) api.respondApproval(id, false);
    pendingApprovalId = null;
  }
}

async function answerApproval(allow) {
  const id = pendingApprovalId;
  pendingApprovalId = null;
  approvalOverlay().hidden = true;
  if (id) await api.respondApproval(id, allow);
  input.focus();
}

el('approvalAllow').addEventListener('click', () => answerApproval(true));
el('approvalDeny').addEventListener('click', () => answerApproval(false));

/*
 * One switch decides whether prompts appear at all: ask, always allow, always
 * deny. It is stored in prefs, so the answer is the same after a restart — the
 * old in-memory grants and the per-tool remember checkbox are gone, because
 * they were why the same command asked on one launch and ran silently on the
 * next. Whenever prompts are off, the sidebar says so permanently.
 */
/*
 * One switch, one row, three positions: ask / always allow / always deny.
 *
 * It used to be a dropdown, which hid the current answer behind a click and left
 * the most consequential setting in the app looking like a form field. The order
 * is deliberately ask -> allow -> deny, so the thumb moves left to right as the
 * setting gets more permissive and then to the far right for "never".
 */
const APPROVAL_TITLES = {
  ask: 'ถามเสมอ — ถามทุกครั้งก่อนให้ AI รันคำสั่ง',
  allow: 'อนุมัติเสมอ — ไม่ถามเลย AI รันคำสั่งได้ทันที',
  deny: 'ไม่อนุมัติเลย — ไม่ถามเลย AI รันคำสั่งไม่ได้',
};

/** The three positions, in the order they appear on the switch. */
const APPROVAL_ORDER = ['ask', 'allow', 'deny'];

/** The radios of the switch, or an empty list before the markup is parsed. */
function approvalRadios() {
  return [...document.querySelectorAll('input[name="approvalPolicy"]')];
}

/** Read the switch. Falls back to `ask`, which is the safe answer. */
function currentApprovalPolicy() {
  const checked = approvalRadios().find((r) => r.checked);
  return checked ? checked.value : 'ask';
}

function applyApprovalMode({ policy } = {}) {
  const mode = policy === 'allow' || policy === 'deny' ? policy : 'ask';
  for (const radio of approvalRadios()) {
    radio.checked = radio.value === mode;
    radio.title = APPROVAL_TITLES[radio.value];
  }
  // Drive the thumb. The index, not a class per position, so adding a position
  // later only means adding one more radio and one more entry in the order.
  const group = el('approvalPolicy');
  if (group) {
    const at = APPROVAL_ORDER.indexOf(mode);
    group.style.setProperty('--at', String(at === -1 ? 0 : at));
    group.title = APPROVAL_TITLES[mode];
  }
  // No banner and no body class: the switch shows its own state, and a second
  // warning that says the same thing is just something else to read.
}

api.onApprovalMode(applyApprovalMode);

for (const radio of approvalRadios()) {
  radio.addEventListener('change', async (e) => {
    if (!e.target.checked) return;
    // Show the move immediately; the answer from main is what makes it real. If
    // the save fails, applyApprovalMode() puts the thumb back where it belongs.
    const group = el('approvalPolicy');
    group?.style.setProperty('--at', String(APPROVAL_ORDER.indexOf(e.target.value)));
    const res = await api.setApprovalMode({ policy: e.target.value }).catch(() => null);
    if (res && res.policy) applyApprovalMode(res);
  });
}

window.addEventListener('keydown', (e) => {
  if (!el('loginOverlay').hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      api.authCancel().catch(() => {});
      closeLoginModal();
    }
    return;
  }
  if (!el('settingsOverlay').hidden) {
    if (e.key === 'Escape') closeSettings();
    return;
  }
  if (!el('confirmOverlay').hidden) {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideConfirm();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      el('confirmDelete').click();
    }
    return;
  }
  if (approvalOverlay().hidden) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    answerApproval(true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    answerApproval(false);
  }
});

api.onLog((p) => console.log(`[${p.tabId}]`, p.text));

/**
 * Tell main the window is worth looking at.
 *
 * The update splash is a separate process that covers the gap while the new build
 * installs itself. It used to be closed when the document finished loading — which
 * is before this window has drawn anything: boot() is still talking to the main
 * process, so the splash vanished onto a blank window. Two frames after the first
 * render is the earliest honest moment to say "ready".
 */
function signalUiReady() {
  const done = () => {
    try {
      api.uiReady?.();
    } catch {}
  };
  requestAnimationFrame(() => requestAnimationFrame(done));
}

boot()
  // A boot that throws must not leave the window blank with the splash gone.
  .catch((err) => console.error('[boot]', err && err.stack ? err.stack : err))
  .then(signalUiReady);
startUsagePolling();
window.addEventListener('beforeunload', stopUsagePolling);


/* ===================================================================== */
/*  Session toolbox: context meter, todo list, shell mode, @files,       */
/*  command palette, in-conversation search, ask_user dialog             */
/* ===================================================================== */

/* ------------------------------- i18n -------------------------------- */

Object.assign(STRINGS.en, {
  context: 'Context',
  commands: 'Commands (Ctrl+P)',
  undo: 'Undo',
  redo: 'Redo',
  compact: 'Compact',
  export: 'Export',
  thinking: 'Reasoning:',
  thinkingOff: 'Off',
  thinkingMinimal: 'Minimal',
  thinkingLow: 'Low',
  thinkingMedium: 'Medium',
  thinkingHigh: 'High',
  thinkingUnsupported: 'This model does not support reasoning',
  shell: 'Shell',
  shellRunning: 'running…',
  shellExit: 'exit {code}',
  shellCancelled: 'cancelled',
  shellHint: 'Type !command to run it in the workspace',
  todos: 'Plan',
  paletteHint: '↑↓ move · Enter run · Esc close',
  questionTitle: 'The agent needs your decision',
  answer: 'Answer',
  skip: 'Skip',
  noMatches: 'No matches',
  undoEmpty: 'Nothing to undo',
  undoBusy: 'Wait for this turn to finish',
  undoDone: 'Back to before your last message — the text is in the composer',
  redoEmpty: 'Nothing to redo',
  compactDone: 'Conversation compacted',
  compactFailed: 'Could not compact this conversation',
  exportDone: 'Conversation exported',
  contextHint: 'Context window used by this conversation',
  mentionHint: '↑↓ choose · Tab/Enter insert · Esc close',
  model: 'Model',
  searchModels: 'Search models...',
  noModelsMatch: 'No models match',
  planFree: 'Free',
  planPaid: 'Paid',
  planLabel: 'Cost',
  planSectionFree: 'Free',
  planSectionPaid: 'Paid',
  planNoteCredit: 'free credit',
  planNoteDaily: 'free daily quota',
  planNoteTrial: 'trial credit',
  planNoteWallet: 'billed to wallet',
  planNoteRouted: 'routed model',
  freeOnly: 'Free only',
  favorites: 'Favorites',
  star: 'Add to favorites',
  unstar: 'Remove from favorites',
  newChat: 'New chat',
  settingsItem: 'Settings',
  searchItem: 'Search conversation',
  attachItem: 'Attach image',
  usageItem: 'Refresh credits',
  languageItem: 'Switch language',
  stopItem: 'Stop the running turn',
});

Object.assign(STRINGS.th, {
  context: 'บริบท',
  commands: 'คำสั่ง (Ctrl+P)',
  undo: 'ย้อนกลับ',
  redo: 'ทำซ้ำ',
  compact: 'ย่อประวัติ',
  export: 'ส่งออก',
  thinking: 'การคิด:',
  thinkingOff: 'ปิด',
  thinkingMinimal: 'น้อย',
  thinkingLow: 'ต่ำ',
  thinkingMedium: 'กลาง',
  thinkingHigh: 'สูง',
  thinkingUnsupported: 'model นี้ไม่รองรับการคิด',
  shell: 'เชลล์',
  shellRunning: 'กำลังรัน…',
  shellExit: 'จบที่ {code}',
  shellCancelled: 'ถูกยกเลิก',
  shellHint: 'พิมพ์ !คำสั่ง เพื่อรันในโฟลเดอร์งาน',
  todos: 'แผนงาน',
  paletteHint: '↑↓ เลือก · Enter รัน · Esc ปิด',
  questionTitle: 'agent ต้องการคำตอบจากคุณ',
  answer: 'ตอบ',
  skip: 'ข้าม',
  noMatches: 'ไม่พบ',
  undoEmpty: 'ไม่มีอะไรให้ย้อน',
  undoBusy: 'รอให้รอบนี้ทำงานเสร็จก่อน',
  undoDone: 'ย้อนกลับไปก่อนข้อความล่าสุด — ข้อความอยู่ในช่องพิมพ์แล้ว',
  redoEmpty: 'ไม่มีอะไรให้ทำซ้ำ',
  compactDone: 'ย่อประวัติแล้ว',
  compactFailed: 'ย่อประวัติไม่สำเร็จ',
  exportDone: 'ส่งออกบทสนทนาแล้ว',
  contextHint: 'พื้นที่บริบทที่บทสนทนานี้ใช้อยู่',
  mentionHint: '↑↓ เลือก · Tab/Enter แทรก · Esc ปิด',
  model: 'โมเดล',
  searchModels: 'ค้นหาโมเดล...',
  noModelsMatch: 'ไม่พบโมเดลที่ตรงกัน',
  planFree: 'ฟรี',
  planPaid: 'เสียเงิน',
  planLabel: 'ค่าใช้จ่าย',
  planSectionFree: 'ฟรี',
  planSectionPaid: 'เสียเงิน',
  planNoteCredit: 'เครดิตฟรี',
  planNoteDaily: 'โควต้าฟรี/วัน',
  planNoteTrial: 'เครดิตทดลอง',
  planNoteWallet: 'หักจากเครดิต',
  planNoteRouted: 'ตามโมเดล',
  freeOnly: 'เฉพาะฟรี',
  favorites: 'รายการโปรด',
  star: 'เพิ่มในรายการโปรด',
  unstar: 'เอาออกจากรายการโปรด',
  newChat: 'แชทใหม่',
  settingsItem: 'ตั้งค่า',
  searchItem: 'ค้นหาในบทสนทนา',
  attachItem: 'แนบรูป',
  usageItem: 'อัปเดตเครดิต',
  languageItem: 'สลับภาษา',
  stopItem: 'หยุดงานที่กำลังรัน',
});

/* --------------------------- context meter --------------------------- */

function paintContext(stats) {
  const pctEl = el('contextPct');
  const fill = el('contextFill');
  if (!pctEl || !fill) return;
  const used = stats?.context?.percent;
  if (typeof used !== 'number' || !Number.isFinite(used)) {
    pctEl.textContent = '—';
    fill.style.width = '0%';
    fill.className = 'ctx-bar-fill';
    pctEl.title = t('contextHint');
    return;
  }
  const pct = Math.max(0, Math.min(100, used));
  pctEl.textContent = `${Math.round(pct)}%`;
  pctEl.title = stats?.context?.tokens
    ? `${stats.context.tokens.toLocaleString()} / ${(stats.context.contextWindow || 0).toLocaleString()} tokens`
    : t('contextHint');
  fill.style.width = `${pct}%`;
  fill.className = 'ctx-bar-fill' + (pct >= 85 ? ' danger' : pct >= 60 ? ' warn' : '');
}

function refreshContextMeter() {
  const view = activeView();
  if (!view?.tabId) return;
  api
    .getStats(view.tabId)
    .then((stats) => {
      view.stats = stats;
      if (view.tabId === activeTabId) paintContext(stats);
    })
    .catch(() => {});
}

/* ------------------------------ todo list ---------------------------- */

function renderTodos(items) {
  const panel = el('todoPanel');
  if (!panel) return;
  const list = (Array.isArray(items) ? items : []).filter((it) => it && it.text);
  if (!list.length) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const done = list.filter((it) => it.status === 'done').length;
  panel.innerHTML =
    `<div class="todo-head"><span class="todo-title">${escapeHtml(t('todos'))}</span>` +
    `<span class="todo-count">${done}/${list.length}</span></div>` +
    `<ul class="todo-list">${list
      .map(
        (it) =>
          `<li class="todo-item ${escapeHtml(it.status || 'pending')}">` +
          `<span class="todo-mark">${it.status === 'done' ? '✓' : it.status === 'in_progress' ? '▸' : '○'}</span>` +
          `<span class="todo-text">${escapeHtml(it.text)}</span></li>`
      )
      .join('')}</ul>`;
  panel.hidden = false;
}

/* ------------------------------ shell mode -------------------------- */

let liveShell = null;

function shellCard(command) {
  const wrap = document.createElement('div');
  wrap.className = 'msg shell';
  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = t('shell');
  const card = document.createElement('div');
  card.className = 'shell-card';
  const head = document.createElement('div');
  head.className = 'shell-head';
  const cmd = document.createElement('span');
  cmd.className = 'shell-cmd';
  cmd.textContent = `$ ${command}`;
  const status = document.createElement('span');
  status.className = 'shell-status';
  status.textContent = t('shellRunning');
  head.append(cmd, status);
  const body = document.createElement('pre');
  body.className = 'shell-output';
  card.append(head, body);
  wrap.append(role, card);
  transcript.appendChild(wrap);
  emptyState.hidden = true;
  scrollToBottom();
  return { wrap, body, status, command };
}

async function runShellCommand(raw) {
  const command = String(raw || '').replace(/^!\s*/, '').trim();
  const view = activeView();
  if (!command || !view) return;
  input.value = '';
  autoGrow();
  hideFileMenu();
  hideSlashMenu();
  updateSendState();
  liveShell = shellCard(command);
  try {
    await api.runShell(view.tabId, command);
  } catch {
    if (liveShell) liveShell.status.textContent = 'error';
  }
}

api.onBashStart((p) => {
  if (!liveShell || liveShell.command !== p.command) liveShell = shellCard(p.command);
});

api.onBashChunk((p) => {
  if (!liveShell) liveShell = shellCard(p.command || '');
  liveShell.body.textContent += p.chunk || '';
  scrollToBottom();
});

api.onBashEnd((p) => {
  if (!liveShell) liveShell = shellCard(p.command || '');
  if (p.output) liveShell.body.textContent = p.output;
  if (!liveShell.body.textContent.trim()) liveShell.body.textContent = t('noOutput');
  liveShell.status.textContent = p.cancelled
    ? t('shellCancelled')
    : p.exitCode == null
    ? t('toolDone')
    : t('shellExit', { code: p.exitCode });
  liveShell.wrap.classList.toggle('error', Number(p.exitCode) > 0);
  liveShell = null;
  refreshContextMeter();
});

/* ----------------------------- @ file menu -------------------------- */

const fileMenuState = { open: false, index: 0, items: [], token: '' };
let fileTimer = null;

function currentMention() {
  const m = /(^|\s)@([^\s@]*)$/.exec(input.value);
  if (!m) return null;
  return { token: m[2], start: input.value.length - m[2].length - 1 };
}

function hideFileMenu() {
  fileMenuState.open = false;
  fileMenuState.items = [];
  fileMenuState.index = 0;
  const menu = el('fileMenu');
  if (menu) {
    menu.hidden = true;
    menu.innerHTML = '';
  }
}

function renderFileMenu() {
  const menu = el('fileMenu');
  if (!menu) return;
  if (!fileMenuState.items.length) {
    hideFileMenu();
    return;
  }
  menu.innerHTML = '';
  fileMenuState.items.forEach((entry, i) => {
    const isSkill = entry && entry.kind === 'skill';
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'slash-item' + (i === fileMenuState.index ? ' active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(i === fileMenuState.index));
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = isSkill ? entry.name : entry.split('/').pop();
    const full = document.createElement('span');
    full.className = 'slash-desc';
    full.textContent = isSkill ? `/skill:${entry.name}` : entry;
    item.append(name, full);
    item.addEventListener('mousedown', (e) => e.preventDefault());
    item.addEventListener('click', () => applyFileMention(entry));
    menu.appendChild(item);
  });
  menu.hidden = false;
  fileMenuState.open = true;
  menu.children[fileMenuState.index]?.scrollIntoView({ block: 'nearest' });
}

function applyFileMention(entry) {
  const match = currentMention();
  if (entry && entry.kind === 'skill') {
    // pi only expands `/skill:name` at the start of a prompt, so move any text
    // already typed to the right of the command.
    const rest = (match ? input.value.slice(0, match.start) : input.value).trim();
    input.value = rest ? `/skill:${entry.name} ${rest}` : `/skill:${entry.name} `;
  } else {
    const at = match ? match.start : input.value.length;
    input.value = `${input.value.slice(0, at)}@${entry} `;
  }
  hideFileMenu();
  autoGrow();
  input.focus();
  updateSendState();
}

function updateFileMenu() {
  const match = currentMention();
  if (!match) {
    if (fileMenuState.open) hideFileMenu();
    return;
  }
  fileMenuState.token = match.token;
  const view = activeView();
  clearTimeout(fileTimer);
  fileTimer = setTimeout(async () => {
    let skills = [];
    if (match.token) {
      try {
        skills = (await loadSkills())
          .filter((skill) => matchSkill(skill, match.token))
          .slice(0, 6)
          .map((skill) => ({ kind: 'skill', name: skill.name, description: skill.description || '' }));
      } catch {
        skills = [];
      }
      if (!activeView()) return;
      if (fileMenuState.token !== match.token) return;
      // Skills are already on disk and answer instantly; the workspace scan is
      // not, so show the skills first and merge files when they arrive.
      if (skills.length) {
        fileMenuState.items = skills;
        fileMenuState.index = 0;
        renderFileMenu();
      }
    }
    let files = [];
    try {
      files = await api.listFiles(view?.cwd, match.token);
    } catch {
      files = [];
    }
    if (!activeView()) return;
    if (fileMenuState.token !== match.token) return;
    const items = [...skills, ...files];
    if (!items.length) {
      hideFileMenu();
      return;
    }
    fileMenuState.items = items;
    fileMenuState.index = 0;
    renderFileMenu();
  }, 90);
}

/* ---------------------------- command palette ----------------------- */

const paletteState = { open: false, index: 0, items: [] };

function paletteActions() {
  const view = activeView();
  const actions = [
    { id: 'new', label: t('newChat'), hint: 'Ctrl+T', run: () => el('newSession').click() },
    { id: 'settings', label: t('settingsItem'), hint: '', run: () => openSettings() },
    { id: 'search', label: t('searchItem'), hint: 'Ctrl+F', run: () => openFind() },
    { id: 'undo', label: t('undo'), hint: 'Ctrl+Z', run: () => undoLastMessage() },
    { id: 'redo', label: t('redo'), hint: '', run: () => redoLastMessage() },
    { id: 'compact', label: t('compact'), hint: '/compact', run: () => compactConversation() },
    { id: 'export', label: t('export'), hint: '/export', run: () => exportConversation() },
    { id: 'usage', label: t('usageItem'), hint: '/usage', run: () => el('refreshUsage').click() },
    { id: 'attach', label: t('attachItem'), hint: '', run: () => el('attachBtn').click() },
    {
      id: 'lang',
      label: t('languageItem'),
      hint: lang === 'en' ? 'EN ⇄ TH' : 'TH ⇄ EN',
      run: () => setLanguage(lang === 'en' ? 'th' : 'en'),
    },
  ];
  if (view?.busy) {
    actions.push({ id: 'stop', label: t('stopItem'), hint: 'Esc', run: () => api.abort(view.tabId) });
  }
  actions.push({
    id: 'changes',
    label: t('changesTitle'),
    hint: `${view?.changes?.length || 0}`,
    run: () => {
      closePalette();
      openChanges();
    },
  });
  actions.push({
    id: 'shell',
    label: t('shellHint'),
    hint: '!',
    run: () => {
      closePalette();
      input.value = '!';
      input.focus();
    },
  });

  const query = (el('paletteInput')?.value || '').trim().toLowerCase();
  for (const skill of skillsCache || []) {
    if (query && !matchSkill(skill, query)) continue;
    actions.push({
      id: `skill:${skill.name}`,
      label: skill.name,
      hint: t('skills'),
      run: () => {
        closePalette();
        input.value = `${t('useSkill')} ${skill.name}: `;
        autoGrow();
        input.focus();
      },
    });
  }
  return actions;
}

function renderPalette() {
  const list = el('paletteList');
  if (!list) return;
  list.innerHTML = '';
  if (!paletteState.items.length) {
    const empty = document.createElement('div');
    empty.className = 'slash-empty';
    empty.textContent = t('noMatches');
    list.appendChild(empty);
    return;
  }
  paletteState.items.forEach((item, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'palette-item' + (i === paletteState.index ? ' active' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(i === paletteState.index));
    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = item.label;
    const hint = document.createElement('span');
    hint.className = 'palette-hint';
    hint.textContent = item.hint || '';
    row.append(label, hint);
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('click', () => runPaletteItem(item));
    list.appendChild(row);
  });
  list.children[paletteState.index]?.scrollIntoView({ block: 'nearest' });
}

function filterPalette() {
  const q = el('paletteInput').value.trim().toLowerCase();
  const all = paletteActions();
  paletteState.items = q ? all.filter((a) => a.label.toLowerCase().includes(q)) : all;
  paletteState.index = 0;
  renderPalette();
}

function openPalette() {
  paletteState.open = true;
  el('paletteOverlay').hidden = false;
  const field = el('paletteInput');
  field.value = '';
  filterPalette();
  field.focus();
}

function closePalette() {
  paletteState.open = false;
  el('paletteOverlay').hidden = true;
  input.focus();
}

function runPaletteItem(item) {
  closePalette();
  try {
    item.run();
  } catch (err) {
    console.error(err);
  }
}

/* ------------------------- find in conversation --------------------- */

const findState = { matches: [], index: 0, open: false };

function transcriptTextNodes() {
  const walker = document.createTreeWalker(transcript, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest('pre, .md-code')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function openFind() {
  findState.open = true;
  el('findBar').hidden = false;
  const field = el('findInput');
  field.focus();
  field.select();
  if (field.value) runFind();
}

function closeFind() {
  findState.open = false;
  el('findBar').hidden = true;
  if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('fp-find');
  findState.matches = [];
}

function runFind() {
  const query = el('findInput').value;
  const count = el('findCount');
  findState.matches = [];
  findState.index = 0;
  if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('fp-find');
  if (!query) {
    count.textContent = '0/0';
    return;
  }
  const needle = query.toLowerCase();
  for (const node of transcriptTextNodes()) {
    const hay = node.nodeValue.toLowerCase();
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at === -1) break;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      findState.matches.push(range);
      from = at + needle.length;
    }
  }
  if (findState.matches.length && typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function') {
    CSS.highlights.set('fp-find', new Highlight(...findState.matches));
  }
  count.textContent = findState.matches.length ? `1/${findState.matches.length}` : t('noMatches');
  if (findState.matches.length) focusFindMatch(0);
}

function focusFindMatch(index) {
  if (!findState.matches.length) return;
  const n = findState.matches.length;
  findState.index = ((index % n) + n) % n;
  const range = findState.matches[findState.index];
  el('findCount').textContent = `${findState.index + 1}/${n}`;
  const rect = range.getBoundingClientRect();
  transcript.scrollTop += rect.top - transcript.getBoundingClientRect().top - transcript.clientHeight / 2;
}

/* ------------------------------ undo / redo ------------------------- */

async function undoLastMessage() {
  const view = activeView();
  if (!view) return;
  if (view.busy) return showNotice(t('undoBusy'));
  const res = await api.undo(view.tabId);
  if (!res?.ok) return showNotice(res?.reason === 'busy' ? t('undoBusy') : t('undoEmpty'));
  view.undoEntryId = res.entryId;
  if (res.text) {
    input.value = res.text;
    autoGrow();
    updateSendState();
    input.focus();
  }
  showNotice(t('undoDone'), 4200);
}

async function redoLastMessage() {
  const view = activeView();
  if (!view) return;
  const entryId = view.undoEntryId;
  if (!entryId) return showNotice(t('redoEmpty'));
  const res = await api.redo(view.tabId, entryId);
  if (!res?.ok) return showNotice(t('redoEmpty'));
  view.undoEntryId = null;
}

async function compactConversation() {
  const view = activeView();
  if (!view) return;
  // While a turn is running, run it when that turn finishes instead of telling
  // the user to come back later: everything else already waits in the queue.
  if (view.busy) {
    queueAction(`/${t('compact')}`, () => runCompact(view));
    return;
  }
  await runCompact(view);
}

async function runCompact(view) {
  if (!view) return;
  showNotice(`${t('compact')}…`, 0);
  const res = await api.compact(view.tabId);
  showNotice(res?.ok ? t('compactDone') : t('compactFailed'), 3200);
  refreshContextMeter();
  // Running the command does not produce a turn, so nothing else would notice
  // that the queue can move again.
  drainQueue(view);
}

async function exportConversation() {
  const view = activeView();
  if (!view) return;
  const res = await api.exportSession(view.tabId);
  showNotice(res?.ok ? `${t('exportDone')}${res.path ? `: ${res.path}` : ''}` : t('noMatches'), 6000);
}

/* --------------------------- ask_user dialog ------------------------ */

let questionPending = null;

function showQuestion(payload) {
  questionPending = payload;
  el('questionText').textContent = payload.question || '';
  const options = el('questionOptions');
  options.innerHTML = '';
  for (const option of payload.options || []) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'question-option';
    btn.textContent = option;
    btn.addEventListener('click', () => answerQuestion(option));
    options.appendChild(btn);
  }
  el('questionInput').value = '';
  el('questionOverlay').hidden = false;
  (payload.options?.length ? options.firstChild : el('questionInput'))?.focus();
}

function answerQuestion(answer) {
  if (!questionPending) return;
  api.respondQuestion(questionPending.id, answer);
  questionPending = null;
  el('questionOverlay').hidden = true;
  input.focus();
}

/* ------------------------------ thinking ---------------------------- */

/** Human label for a reasoning level; unknown levels pass through. */
const THINKING_LEVEL_KEYS = {
  off: 'thinkingOff',
  minimal: 'thinkingMinimal',
  low: 'thinkingLow',
  medium: 'thinkingMedium',
  high: 'thinkingHigh',
};
function thinkingLevelLabel(level) {
  const key = THINKING_LEVEL_KEYS[level];
  return key ? t(key) : level;
}

/**
 * The reasoning-effort switch.
 *
 * Shaped like the approval switch: one radio per level, plus a thumb that slides
 * to the chosen one. Colour runs from green to red across the track, so the cost
 * of the setting is readable without reading the labels — green is the frugal
 * end (thinking off costs nothing), red the expensive one (the model thinks hard
 * on every turn).
 *
 * The control is always present. It used to be removed whenever the model had no
 * reasoning support, so it appeared and vanished as models were switched; now the
 * same slot stays and the switch dims and locks instead. Locks, not lies: a
 * control that accepts a click and does nothing is worse than one that says why.
 */

/** Order levels cheapest-to-dearest, so the colour ramp lines up with cost. */
const THINKING_ORDER = ['off', 'minimal', 'low', 'medium', 'high'];

/** Shown when the level list is empty or the model reports no support. */
function thinkingLevelsFor(thinking) {
  const offered = Array.isArray(thinking?.levels) ? thinking.levels.filter(Boolean) : [];
  if (!thinking?.supported || !offered.length) return null;
  // Keep the SDK's own set; only fall back to a sensible order for display.
  return THINKING_ORDER.filter((level) => offered.includes(level)).concat(
    offered.filter((level) => !THINKING_ORDER.includes(level))
  );
}

function paintThinking(thinking) {
  const wrap = el('thinkingSwitch');
  const note = el('thinkingNote');
  if (!wrap) return;
  const select = el('thinkingSelect');

  const levels = thinkingLevelsFor(thinking);
  const unsupported = !levels;

  // The hidden select stays the value source so the existing change handler and
  // any test that drives it keep working.
  if (!unsupported && select) {
    const key = levels.join(',');
    if (select.dataset.levels !== key) {
      select.dataset.levels = key;
      select.innerHTML = levels
        .map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`)
        .join('');
    }
    select.value = thinking.level || levels[0];
  }

  // Rebuild only when the level set changes or the language does: rebuilding on
  // every paint would reset focus and make clicking feel like it did not take,
  // but the labels are translated, so a language switch must rebuild.
  const key = `${unsupported ? 'unsupported' : levels.join(',')}|${lang}`;
  if (wrap.dataset.levels !== key) {
    wrap.dataset.levels = key;
    wrap.replaceChildren(
      Object.assign(document.createElement('span'), { className: 'think-thumb', ariaHidden: 'true' })
    );
    const shown = unsupported ? ['off'] : levels;
    shown.forEach((level, i) => {
      const label = document.createElement('label');
      label.className = 'think-opt';
      // Position along the ramp: 0 at the green end, 1 at the red end.
      label.style.setProperty('--p', shown.length > 1 ? String(i / (shown.length - 1)) : '0');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'thinkingLevel';
      input.value = level;
      input.disabled = unsupported;
      if (unsupported) label.title = t('thinkingUnsupported');
      label.append(input, Object.assign(document.createElement('span'), { textContent: thinkingLevelLabel(level) }));
      wrap.appendChild(label);
    });
    wrap.style.setProperty('--count', String(shown.length));
  }

  const chosen = unsupported ? 'off' : thinking.level || levels[0];
  const options = [...wrap.querySelectorAll('.think-opt')];
  let at = options.findIndex((o) => o.querySelector('input')?.value === chosen);
  if (at < 0) at = 0;
  for (const opt of options) {
    const input = opt.querySelector('input');
    if (input) input.checked = input.value === chosen;
  }
  wrap.style.setProperty('--at', String(at));
  // The thumb takes the colour of the selected level, so the switch's own `--p`
  // must follow the choice (the per-label `--p` only tints the text).
  wrap.style.setProperty('--p', options.length > 1 ? String(at / (options.length - 1)) : '0');
  wrap.classList.toggle('is-locked', unsupported);
  wrap.setAttribute('aria-disabled', String(unsupported));

  if (note) {
    note.hidden = !unsupported;
    note.textContent = unsupported ? t('thinkingUnsupported') : '';
  }
}

/* --------------------------- wiring: compose ------------------------ */

input.addEventListener('input', () => updateFileMenu());

input.addEventListener('keydown', (e) => {
  // The @ menu and its arrow/Tab/Enter keys are handled by the composer
  // listener above; this one only owns the `!shell` shortcut.
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && input.value.trim().startsWith('!')) {
    e.preventDefault();
    e.stopPropagation();
    runShellCommand(input.value);
  }
});

/* --------------------------- wiring: buttons ------------------------ */

el('thinkingSelect')?.addEventListener('change', async (e) => {
  const view = activeView();
  if (!view) return;
  const thinking = await api.setThinking(view.tabId, e.target.value);
  paintThinking(thinking);
});

// The switch picks a level, then hands it to the hidden select so there is one
// path into `setThinking`. Clicking the already-chosen level is a no-op rather
// than a re-send: the SDK call costs a round trip and changes nothing.
el('thinkingSwitch')?.addEventListener('change', (e) => {
  const level = e.target?.value;
  const select = el('thinkingSelect');
  if (!level || !select || select.value === level) return;
  select.value = level;
  select.dispatchEvent(new Event('change'));
});
el('undoBtn')?.addEventListener('click', undoLastMessage);

el('findInput')?.addEventListener('input', runFind);
el('findInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    focusFindMatch(findState.index + (e.shiftKey ? -1 : 1));
  } else if (e.key === 'Escape') {
    closeFind();
  }
});
el('findNext')?.addEventListener('click', () => focusFindMatch(findState.index + 1));
el('findPrev')?.addEventListener('click', () => focusFindMatch(findState.index - 1));
el('findClose')?.addEventListener('click', closeFind);

el('paletteInput')?.addEventListener('input', filterPalette);
el('paletteInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = paletteState.items.length;
    if (!n) return;
    paletteState.index = (paletteState.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    renderPalette();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = paletteState.items[paletteState.index];
    if (item) runPaletteItem(item);
  } else if (e.key === 'Escape') {
    closePalette();
  }
});
el('paletteOverlay')?.addEventListener('click', (e) => {
  if (e.target === el('paletteOverlay')) closePalette();
});

el('questionSend')?.addEventListener('click', () => answerQuestion(el('questionInput').value));
el('questionSkip')?.addEventListener('click', () => answerQuestion(null));
el('questionInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    answerQuestion(e.target.value);
  } else if (e.key === 'Escape') {
    answerQuestion(null);
  }
});

/* --------------------------- wiring: events ------------------------- */

api.onTodos((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.todos = p.items || [];
  if (view.tabId === activeTabId) renderTodos(view.todos);
});

api.onQuestion((p) => {
  if (p.tabId && p.tabId !== activeTabId) return;
  showQuestion(p);
});

api.onHistory((p) => {
  if (!p?.state) return;
  applyTabState(p.state);
});

api.onSettled(() => {
  refreshContextMeter();
  const view = activeView();
  if (view) paintThinking(view.thinking);
});

/* --------------------------- wiring: shortcuts ---------------------- */

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 'p' || (key === 'k' && !e.shiftKey)) {
    e.preventDefault();
    if (paletteState.open) closePalette();
    else openPalette();
    return;
  }
  if (key === 'f') {
    e.preventDefault();
    openFind();
    return;
  }
  if (key === 't') {
    e.preventDefault();
    el('newSession').click();
    return;
  }
  if (key === 'z' && !e.shiftKey) {
    // Only when the composer is empty, so normal text undo keeps working.
    if (input.value.trim()) return;
    e.preventDefault();
    undoLastMessage();
    return;
  }
  if (key === 'z' && e.shiftKey) {
    if (input.value.trim()) return;
    e.preventDefault();
    redoLastMessage();
  }
});

/* --------------------------- wiring: links -------------------------- */

document.addEventListener('click', (e) => {
  const link = e.target.closest?.('a.md-link');
  if (!link) return;
  e.preventDefault();
  api.openExternal(link.getAttribute('href') || '');
});

/* ---------------------------- initial paint ------------------------- */

paintContext(null);
renderTodos(activeView()?.todos || []);

/* ------------------------- extra slash commands ---------------------- */

SLASH_COMMANDS.push(
  {
    name: '/undo',
    en: 'Undo your last message and the work that followed it',
    th: 'ย้อนกลับข้อความล่าสุดและงานที่ตามมา',
    run: () => undoLastMessage(),
  },
  {
    name: '/redo',
    en: 'Restore what undo took away',
    th: 'ทำซ้ำสิ่งที่เพิ่งย้อนกลับ',
    run: () => redoLastMessage(),
  },
  {
    name: '/compact',
    en: 'Summarize the conversation to free context',
    th: 'ย่อบทสนทนาเพื่อคืนพื้นที่บริบท',
    run: () => compactConversation(),
  },
  {
    name: '/export',
    en: 'Save this conversation as an HTML file',
    th: 'บันทึกบทสนทนาเป็นไฟล์ HTML',
    run: () => exportConversation(),
  },
  {
    name: '/find',
    en: 'Search inside this conversation',
    th: 'ค้นหาข้อความในบทสนทนานี้',
    run: () => openFind(),
  },
  {
    name: '/files',
    en: 'Insert a file path from the workspace',
    th: 'แทรกพาธไฟล์จากโฟลเดอร์งาน',
    run: () => {
      input.value = '@';
      autoGrow();
      updateFileMenu();
      input.focus();
    },
  },
  {
    name: '/thinking',
    en: 'Change how hard the model reasons',
    th: 'ปรับระดับการคิดของโมเดล',
    run: () => {
      // The visible control is the switch; the select behind it is hidden, so
      // focusing it did nothing visible. Focus the chosen position so a
      // keyboard user lands on the control rather than nowhere.
      const chosen = el('thinkingSwitch')?.querySelector('input:checked') || el('thinkingSwitch')?.querySelector('input');
      if (chosen) chosen.focus();
      else showNotice(t('noMatches'), 2000);
    },
  },
  {
    name: '/changes',
    en: 'Review the files the agent changed this session',
    th: 'ตรวจไฟล์ที่ agent แก้ในเซสชันนี้',
    run: () => openChanges(),
  }
);

/* --------------------------- review changes ------------------------- */

Object.assign(STRINGS.en, {
  reviewChanges: 'Review',
  changesTitle: 'Changes in this session',
  changesSub: 'Files the agent edited. Reverting puts back the version from before it touched them.',
  revertAll: 'Revert all',
  revert: 'Revert',
  showDiff: 'Diff',
  hideDiff: 'Hide',
  filesChanged: '{n} file(s) changed',
  changesEmpty: 'No files changed yet',
  reverted: 'Reverted {n} file(s)',
  revertFailed: 'Could not revert: {why}',
  skills: 'Skills',
  useSkill: 'Use the skill',
});

Object.assign(STRINGS.th, {
  reviewChanges: 'ตรวจการแก้ไข',
  changesTitle: 'ไฟล์ที่แก้ในเซสชันนี้',
  changesSub: 'ไฟล์ที่ agent แก้ กดย้อนกลับเพื่อคืนเวอร์ชันก่อนที่ agent จะแตะ',
  revertAll: 'ย้อนทั้งหมด',
  revert: 'ย้อนกลับ',
  showDiff: 'ดู diff',
  hideDiff: 'ซ่อน',
  filesChanged: 'แก้ {n} ไฟล์',
  changesEmpty: 'ยังไม่มีไฟล์ที่ถูกแก้',
  reverted: 'ย้อนกลับแล้ว {n} ไฟล์',
  revertFailed: 'ย้อนไม่สำเร็จ: {why}',
  skills: 'สกิล',
  useSkill: 'ใช้สกิล',
});

/**
 * The "files changed" strip used to sit above the composer on every turn, which
 * crowded the input. It is gone; review stays available from the command
 * palette (Ctrl+P) and from `/changes`. Callers keep calling this so nothing
 * has to know the element disappeared.
 */
function renderChangesBar() {}

/** Rebuild a unified-diff text block from the stored hunks, for the dialog. */
function diffTextFor(change) {
  const lines = [`--- a/${change.rel}`, `+++ b/${change.rel}`];
  for (const hunk of change.hunks || []) {
    const first = hunk.ops.find((op) => op.aLine) || hunk.ops[0];
    const last = [...hunk.ops].reverse().find((op) => op.bLine) || first;
    if (!first) continue;
    lines.push(`@@ -${first.aLine || 0} +${last.bLine || 0} @@`);
    for (const op of hunk.ops) {
      const mark = op.type === 'ins' ? '+' : op.type === 'del' ? '-' : ' ';
      lines.push(`${mark}${op.text}`);
    }
  }
  return `\`\`\`diff\n${lines.join('\n')}\n\`\`\``;
}

function renderChangesList(changes) {
  const list = el('changesList');
  if (!list) return;
  list.innerHTML = '';
  const rows = Array.isArray(changes) ? changes : [];
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'slash-empty';
    empty.textContent = t('changesEmpty');
    list.appendChild(empty);
    return;
  }
  rows.forEach((change, i) => {
    const row = document.createElement('div');
    row.className = 'change-row';
    const head = document.createElement('div');
    head.className = 'change-head';
    const name = document.createElement('span');
    name.className = 'change-path';
    name.textContent = change.rel;
    name.title = change.path;
    const counts = document.createElement('span');
    counts.className = 'diff-counts';
    counts.innerHTML = `<span class="d-add">+${change.added || 0}</span>` +
      (change.removed ? `<span class="d-del">−${change.removed}</span>` : '');
    const diffBtn = document.createElement('button');
    diffBtn.type = 'button';
    diffBtn.className = 'ghost small';
    diffBtn.textContent = t('showDiff');
    const revertBtn = document.createElement('button');
    revertBtn.type = 'button';
    revertBtn.className = 'ghost small danger';
    revertBtn.textContent = t('revert');
    revertBtn.addEventListener('click', () => revertChanges(change.path));

    const body = document.createElement('div');
    body.className = 'change-diff';
    body.hidden = true;
    diffBtn.addEventListener('click', () => {
      body.hidden = !body.hidden;
      diffBtn.textContent = body.hidden ? t('showDiff') : t('hideDiff');
      if (!body.hidden && !body.dataset.painted) {
        body.dataset.painted = '1';
        MD.renderInto(body, diffTextFor(change), { copiedLabel: t('copied') });
      }
    });

    head.append(name, counts, diffBtn, revertBtn);
    row.append(head, body);
    list.appendChild(row);
    if (i === 0 && rows.length === 1) diffBtn.click();
  });
}

async function openChanges() {
  const view = activeView();
  if (!view) return;
  const res = await api.listChanges(view.tabId);
  view.changes = res?.changes || [];
  renderChangesList(view.changes);
  el('changesOverlay').hidden = false;
}

async function revertChanges(path, all) {
  const view = activeView();
  if (!view) return;
  const res = await api.revertChanges(view.tabId, path, Boolean(all));
  if (!res?.ok) {
    showNotice(t('revertFailed', { why: res?.reason || 'error' }), 4000);
    return;
  }
  const fresh = await api.listChanges(view.tabId);
  view.changes = fresh?.changes || [];
  renderChangesList(view.changes);
  renderChangesBar(view.changes);
  showNotice(t('reverted', { n: (res.reverted || []).length }), 2600);
}

el('changesClose')?.addEventListener('click', () => {
  el('changesOverlay').hidden = true;
});
el('changesRevertAll')?.addEventListener('click', () => {
  if (!el('changesList')?.children.length) return;
  revertChanges(null, true);
});
el('changesOverlay')?.addEventListener('click', (e) => {
  if (e.target === el('changesOverlay')) el('changesOverlay').hidden = true;
});

api.onChanges((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.changes = p.changes || [];
  if (view.tabId !== activeTabId) return;
  renderChangesBar(view.changes);
  if (!el('changesOverlay')?.hidden) renderChangesList(view.changes);
});

/* ------------------------------ skills menu ------------------------- */

let skillsCache = null;
// Warm the list once this script has finished evaluating. The first `/skill`
// then opens with the skills already in hand instead of waiting on an IPC scan,
// and a failure is silent — the menu simply loads on demand as before.
setTimeout(() => loadSkills(), 0);
let skillsAt = 0;
let skillsPromise = null;
const SKILLS_TTL_MS = 60_000;

async function loadSkills() {
  // A skill installed while the app is open should appear without a restart;
  // 60 s keeps the IPC scan off every keystroke.
  if (skillsCache && Date.now() - skillsAt < SKILLS_TTL_MS) return skillsCache;
  if (skillsPromise) return skillsPromise;
  skillsPromise = (async () => {
    try {
      skillsCache = await api.listSkills();
    } catch {
      skillsCache = [];
    }
    skillsAt = Date.now();
    return skillsCache;
  })().finally(() => {
    skillsPromise = null;
  });
  return skillsPromise;
}

/** Two chars of the skill's own name or description is enough to match. */
function matchSkill(skill, query) {
  const hay = `${skill.name} ${skill.description || ''}`.toLowerCase();
  return query.split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
}

loadSkills();
