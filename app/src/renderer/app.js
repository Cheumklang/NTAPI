'use strict';

const api = window.freepi;
const MD = window.FPMarkdown;
const FPProvider = window.FPProvider;

const el = (id) => document.getElementById(id);
const transcript = el('transcript');
const input = el('input');
const sendBtn = el('sendBtn');
const stopBtn = el('stopBtn');
const statusHint = el('statusHint');
const noticeEl = el('notice');
const modelSelect = el('modelSelect');
const sessionTitle = el('sessionTitle');
const emptyState = el('emptyState');
const attachBar = el('attachments');
const adSlot = el('adSlot');
const adRefresh = el('adRefresh');
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
    placeholderIdle: 'Ask FreePi to build, fix, or explain… (Enter to send, Shift+Enter for newline)',
    placeholderBusy: 'Agent is working — Enter to queue a message for after it finishes',
    untitled: 'Untitled session',
    noSessions: 'No saved sessions yet.',
    openBadge: 'open',
    settings: 'Settings',
    settingsSub: 'Where this app keeps its files. Everything lives in one folder you can copy or back up.',
    adsSection: 'Ads',
    adsAutoRotate: 'Change the sponsored banner every minute',
    adsAutoRotateHint:
      'Only while this window is focused and no message is running. Each new ad is reported as an impression, as the ad network requires.',
    changeAd: 'Change ad',
    adBusy: 'Wait for the current message to finish before changing the ad.',
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
    dataRootLabel: 'App data folder',
    outputFolders: 'Output folders',
    systemPaths: 'System locations',
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
    loginTitle: 'Sign in to free-pi',
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
      'Deletes every message and attached image in this chat from disk. Skills, generated images and downloaded files are not touched.',
    clearMeta: 'The chat reopens empty in the same folder.',
    clearNoFile: 'No history file yet — only the open messages will be cleared.',
    clearAction: 'Clear chat',
    clearDone: 'Chat cleared — messages and attached images were deleted.',
    chooseWorkspace: 'Choose a workspace folder first.',
    readyHint: 'Ready — press + to start a session',
    chooseToBegin: 'Choose a workspace folder to begin',
    emptyTitle: 'What are we building?',
    emptySub: 'Pick a folder on the left, then describe a task. FreePi runs the agent here — no terminal.',
    dropFiles: 'Drop files to attach',
    removeFromQueue: 'Remove from queue',
    newSession: 'New session',
    noOutput: '(no output)',
    copied: 'Copied',
    copyReply: 'Copy reply',
    copyOutput: 'Copy output',
    toolRunning: 'running…',
    toolFailed: 'failed',
    toolDone: 'done',
    toolsUsed: '{n} tools used',
    toolsUsedOne: '1 tool used',
    toolsFailed: '{n} failed',
    cancel: 'Cancel',
    delete: 'Delete',
    queuedOne: '1 queued — sends when the current turn finishes',
    queuedMany: '{n} queued — sends when the current turn finishes',
    pctUsed: '{n}% used',
    spent: '{n} of {total} used',
    allowOnce: 'Allow',
    deny: 'Deny',
    approvalTitle: 'Allow this command?',
    approvalSub: 'The agent wants to run',
    approvalSub2: 'in this folder.',
    allowAll: 'Allow everything',
    rememberTool: "Don't ask again for {tool} in this session",
    confirmAllowAll:
      'Stop asking before every bash / edit / write for the rest of this session?\n\nThe agent will be able to run commands and change files without showing you first. Turning this off again is a click in the sidebar.',
    allowAllTitle: 'Allow everything?',
    allowAllSub:
      'The agent can run bash, edit and write without asking again until this app restarts. You can turn prompts back on from the sidebar.',
    allowAllMeta: 'Tools: bash · edit · write',
    confirmAllowAllAction: 'Allow everything',
    signOutTitle: 'Sign out on this computer?',
    signOutSub:
      'The saved login token will be deleted from this computer. The next start will ask you to sign in again.',
    signOutMeta: 'This does not delete your chats or files.',
    approvalsOff: 'Not asking for permission',
    turnPromptsBackOn: 'Ask me again',
    waitingForYou: 'Waiting for you — nothing runs until you choose',
    thinkingShow: 'Show thinking',
    thinkingHide: 'Hide thinking',
    you: 'You',
    assistant: 'FreePi',
    system: 'System',
  },
  th: {
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
    placeholderIdle: 'พิมพ์ให้ FreePi สร้าง แก้ หรืออธิบาย… (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)',
    placeholderBusy: 'AI กำลังทำงาน — กด Enter เพื่อต่อคิวข้อความไว้ส่งต่อเมื่อเสร็จ',
    untitled: 'แชทไม่มีชื่อ',
    noSessions: 'ยังไม่มีแชทที่บันทึกไว้',
    openBadge: 'เปิดอยู่',
    settings: 'ตั้งค่า',
    settingsSub: 'ที่เก็บไฟล์ของแอปนี้ — ทุกอย่างอยู่ในโฟลเดอร์เดียว ก๊อปหรือแบ็กอัปได้ทั้งก้อน',
    adsSection: 'โฆษณา',
    adsAutoRotate: 'เปลี่ยนโฆษณาทุก 1 นาที',
    adsAutoRotateHint:
      'เปลี่ยนเฉพาะตอนหน้าต่างนี้ถูกเลือกอยู่และไม่มีข้อความกำลังทำงาน แต่ละโฆษณาใหม่จะถูกรายงานเป็น impression ตามที่ ad network กำหนด',
    changeAd: 'เปลี่ยนโฆษณา',
    adBusy: 'รอให้ข้อความนี้ทำงานเสร็จก่อนเปลี่ยนโฆษณา',
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
    dataRootLabel: 'โฟลเดอร์ข้อมูลของแอป',
    outputFolders: 'โฟลเดอร์ปลายทาง',
    systemPaths: 'ตำแหน่งของระบบ',
    accountSection: 'บัญชีของคุณ',
    accountKind: 'ล็อกอินเป็น',
    accountCredits: 'Credits วันนี้',
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
    loginTitle: 'เข้าสู่ระบบ free-pi',
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
      'ลบข้อความและรูปที่แนบในแชทนี้ออกจากดิสก์ — ไม่แตะ skills, รูปที่ AI สร้าง หรือไฟล์ที่ดาวน์โหลด',
    clearMeta: 'แชทจะเปิดใหม่แบบว่างในโฟลเดอร์เดิม',
    clearNoFile: 'ยังไม่มีไฟล์ประวัติ — จะล้างเฉพาะข้อความที่เปิดอยู่',
    clearAction: 'ล้างแชท',
    clearDone: 'ล้างแชทแล้ว — ลบข้อความและรูปที่แนบเรียบร้อย',
    chooseWorkspace: 'เลือกโฟลเดอร์ทำงานก่อนครับ',
    readyHint: 'พร้อมแล้ว — กด + เพื่อเริ่มเซสชัน',
    chooseToBegin: 'เลือกโฟลเดอร์ทำงานเพื่อเริ่มต้น',
    emptyTitle: 'จะสร้างอะไรกันดี?',
    emptySub: 'เลือกโฟลเดอร์ทางซ้าย แล้วบอกงานที่ต้องการ — FreePi ทำงานให้ที่นี่ ไม่ต้องใช้ terminal',
    dropFiles: 'วางไฟล์เพื่อแนบ',
    removeFromQueue: 'เอาออกจากคิว',
    newSession: 'เซสชันใหม่',
    noOutput: '(ไม่มีผลลัพธ์)',
    copied: 'คัดลอกแล้ว',
    copyReply: 'คัดลอกคำตอบ',
    copyOutput: 'คัดลอกผลลัพธ์',
    toolRunning: 'กำลังรัน…',
    toolFailed: 'ล้มเหลว',
    toolDone: 'เสร็จ',
    toolsUsed: 'ใช้เครื่องมือ {n} ครั้ง',
    toolsUsedOne: 'ใช้เครื่องมือ 1 ครั้ง',
    toolsFailed: 'ล้มเหลว {n}',
    cancel: 'ยกเลิก',
    delete: 'ลบ',
    queuedOne: 'ต่อคิวไว้ 1 ข้อความ — จะส่งเมื่อรอบนี้เสร็จ',
    queuedMany: 'ต่อคิวไว้ {n} ข้อความ — จะส่งเมื่อรอบนี้เสร็จ',
    pctUsed: 'ใช้ไป {n}%',
    spent: 'ใช้ไป {n} จาก {total}',
    allowOnce: 'อนุญาต',
    deny: 'ปฏิเสธ',
    approvalTitle: 'อนุญาตให้รันคําสั่งนี้ไหม?',
    approvalSub: 'AI ต้องการรัน',
    approvalSub2: 'ในโฟลเดอร์นี้',
    allowAll: 'ยินยอมทั้งหมด',
    rememberTool: 'ไม่ต้องถามซ้ำสําหรับ {tool} ในเซสชันนี้',
    confirmAllowAll:
      'หยุดถามก่อนทุกคําสั่ง bash / edit / write ตลอดเซสชันนี้ใช่ไหม?\n\nAI จะรันคําสั่งและแก้ไฟล์ได้โดยไม่แสดงให้คุณดูก่อน — เปิดกลับได้ด้วยคลิกเดียวที่แถบข้าง',
    allowAllTitle: 'ยินยอมทั้งหมด?',
    allowAllSub:
      'AI จะรัน bash / edit / write และแก้ไฟล์ได้โดยไม่ถามอีกจนกว่าจะปิดแอป — เปิดกลับได้จากแถบข้าง',
    allowAllMeta: 'เครื่องมือ: bash · edit · write',
    confirmAllowAllAction: 'ยินยอมทั้งหมด',
    signOutTitle: 'ออกจากระบบบนเครื่องนี้?',
    signOutSub: 'token ล็อกอินจะถูกลบออกจากเครื่องนี้ ครั้งถัดไปต้องล็อกอินใหม่',
    signOutMeta: 'ไม่ลบแชทหรือไฟล์ของคุณ',
    approvalsOff: 'กําลังไม่ถาม permission',
    turnPromptsBackOn: 'กลับมาถาม',
    waitingForYou: 'กำลังรอคุณตัดสินใจ — ยังไม่มีอะไรถูกทำจนคุณเลือก',
    thinkingShow: 'ดูความคิด',
    thinkingHide: 'ซ่อนความคิด',
    you: 'คุณ',
    assistant: 'FreePi',
    system: 'ระบบ',
  },
};

let lang = 'en';
// Mirrors the prefs blob returned by api.boot(); sidebar width lives here too.
let appPrefs = {};
// Title-bar identity (brand / owner / subtitle), loaded from prefs.
let profile = {};
// Last account snapshot shown in Settings.
let accountData = null;

/** Translate a key, substituting {placeholders}. */
function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let s = table[key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
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
  // Placeholders and dialog titles are not plain text nodes.
  el('sessionTitle').placeholder = t('untitled');
  setBusy(Boolean(activeView()?.busy));
  renderAttachments();
  renderQueue();
  renderActiveTab();
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
/** Images staged for the next message in the active tab. */
let pendingImages = [];

/* ------------------------------ helpers ------------------------------ */

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const activeView = () => (activeTabId ? views.get(activeTabId) : null);

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

function scrollToBottom(force = false) {
  const nearBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 180;
  if (force || nearBottom) transcript.scrollTop = transcript.scrollHeight;
}

function setBusy(value) {
  const view = activeView();
  if (view) view.busy = value;
  sendBtn.hidden = value;
  stopBtn.hidden = !value;
  sendBtn.disabled = value || (!input.value.trim() && pendingImages.length === 0);
  statusHint.textContent = value ? t('working') : t('idle');
  input.placeholder = value ? t('placeholderBusy') : t('placeholderIdle');
}

let noticeTimer = null;

function showNotice(text, ms) {
  clearTimeout(noticeTimer);
  if (!text) {
    noticeEl.hidden = true;
    noticeEl.textContent = '';
    return;
  }
  noticeEl.hidden = false;
  noticeEl.textContent = text;
  if (ms > 0) {
    noticeTimer = setTimeout(() => {
      noticeEl.hidden = true;
      noticeEl.textContent = '';
    }, ms);
  }
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
      .map((c) => (typeof c === 'string' ? c : c.type === 'text' ? c.text : JSON.stringify(c)))
      .join('\n');
  }
  return JSON.stringify(content, null, 2);
}

/* ------------------------------ messages ------------------------------ */

function addMessage(kind) {
  emptyState.hidden = true;
  const wrap = document.createElement('div');
  wrap.className = `msg ${kind}`;

  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = kind === 'user' ? t('you') : kind === 'system' ? t('system') : t('assistant');
  wrap.appendChild(role);

  if (kind === 'user') {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);
  } else {
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

    // Copy the reply exactly as the model wrote it (markdown source), not the
    // rendered text, so pasting it elsewhere keeps its formatting.
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg-copy';
    copyBtn.textContent = t('copyReply');
    copyBtn.addEventListener('click', () => {
      const text = body.__fpText || body.textContent || '';
      if (!text.trim()) return;
      MD.copyText(text);
      copyBtn.textContent = t('copied');
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = t('copyReply');
        copyBtn.classList.remove('copied');
      }, 1200);
    });
    actions.appendChild(copyBtn);
    wrap.appendChild(actions);
  }

  transcript.appendChild(wrap);
  scrollToBottom(true);
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

function renderActiveTab() {
  const view = activeView();
  if (!view) {
    transcript.innerHTML = '';
    transcript.appendChild(emptyState);
    emptyState.hidden = false;
    sessionTitle.value = '';
    modelSelect.innerHTML = '';
    setBusy(false);
    return;
  }

  sessionTitle.value = view.name || '';
  sessionTitle.placeholder = view.sessionId
    ? `Session ${String(view.sessionId).slice(0, 8)}`
    : t('untitled');
  el('cwdLabel').textContent = view.cwd || '…';
  el('guestBadge').hidden = !view.guest;

  if (view.models?.length) {
    modelSelect.innerHTML = '';
    for (const m of view.models) {
      const opt = document.createElement('option');
      opt.value = `${m.provider}||${m.id}`;
      opt.textContent = FPProvider.modelOptionLabel(m);
      if (view.model && m.id === view.model.id && m.provider === view.model.provider) opt.selected = true;
      modelSelect.appendChild(opt);
    }
  }

  transcript.innerHTML = '';
  transcript.appendChild(emptyState);
  const messages = view.messages || [];
  emptyState.hidden = messages.length > 0;

  let currentAssistant = null;
  for (const m of messages) {
    if (m.kind === 'user') {
      renderUserMessage(m.text, m.images);
      currentAssistant = null;
    } else if (m.kind === 'assistant') {
      const text = m.text || '';
      const tools = m.tools || [];
      // A tool-using turn is stored as several assistant messages (one per
      // step). Group the steps into one bubble so the transcript shows a
      // single "tools used" line and the final answer right below it.
      const bodyText = currentAssistant?.querySelector('.body')?.textContent || '';
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
        const body = wrap.querySelector('.body');
        body.__fpText = body.__fpText ? `${body.__fpText}${text}` : text;
        MD.renderInto(body, body.__fpText, { copiedLabel: t('copied') });
      }
      const tc = wrap.querySelector('.tools');
      for (const tool of tools) toolCard(tc, tool);
    } else if (m.kind === 'error') {
      // Replayed from history: keep the failure visible instead of a blank turn.
      appendErrorBanner(m.text, false);
      currentAssistant = null;
    } else if (m.kind === 'tool') {
      const target = currentAssistant?.querySelector('.tools');
      if (!target) continue;
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
        }
      );
    }
  }

  setBusy(Boolean(view.busy));
  scrollToBottom(true);
  renderAttachments();
  renderQueue();
  syncProviderChrome(view);
}

/* ------------------------- provider chrome ------------------------- */

let coarenaStatus = null;

/**
 * One window, two providers: the meter and the ad slot follow the active
 * model. FreePi shows usage and ads; Coarena shows its own published limits.
 */
function syncProviderChrome(view) {
  const chrome = FPProvider.providerChrome(view?.model);
  const freePiUsage = el('freePiUsage');
  const coarenaUsage = el('coarenaUsage');
  if (freePiUsage) freePiUsage.hidden = chrome.showCoarenaMeter;
  if (coarenaUsage) coarenaUsage.hidden = !chrome.showCoarenaMeter;
  if (!chrome.showAds) adSlot.hidden = true;
  paintCoarenaMeter();
}

function paintCoarenaMeter() {
  const node = el('coarenaMeterText');
  if (!node) return;
  node.textContent = coarenaStatus?.info ? FPProvider.coarenaMeterText(coarenaStatus.info) : '—';
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
  try {
    coarenaStatus = await api.coarenaStatus();
  } catch {
    coarenaStatus = null;
  }
  paintCoarenaSettings();
  paintCoarenaMeter();
  return coarenaStatus;
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
    messages: state.messages || [],
    modelFallback: state.modelFallback || null,
    liveAssistant: null,
    liveTools: null,
  });
  if (!view.label) view.label = state.name || deriveLabel(state);
  activeTabId = state.tabId;
  renderActiveTab();
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
  const state = await api.getTabState(tabId);
  applyTabState(state);
}

async function openNewTab(cwd, sessionId) {
  const view = await api.openTab({ cwd, sessionId });
  applyTabState(view.state);
  return view;
}

/* ------------------------------ sessions ------------------------------ */

async function renderSessions(cwd) {
  const list = el('sessionList');
  const sessions = await api.listSessions(cwd);
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

    const busy = open?.[1]?.busy;
    btn.innerHTML = `
      <span class="s-title">${busy ? '<span class="s-spin"></span>' : ''}${escapeHtml(
      s.firstMessage || t('untitled')
    )}</span>
      <span class="s-meta">${escapeHtml(new Date(s.modified).toLocaleString())}${
      open ? ` \u00b7 ${t('openBadge')}` : ''
    }</span>
    `;
    btn.addEventListener('click', async () => {
      const already = [...views.entries()].find(([, v]) => v.sessionId === s.id);
      if (already) {
        await activate(already[0]);
        return;
      }
      await openNewTab(cwd, s.path);
    });

    // Right-click deletes the session file from disk.
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSessionMenu(e.clientX, e.clientY, cwd, s);
    });

    list.appendChild(btn);
  }
}

/* --------------------------- context menu --------------------------- */

let openMenuEl = null;

function closeSessionMenu() {
  if (openMenuEl) {
    openMenuEl.remove();
    openMenuEl = null;
  }
}

function openSessionMenu(x, y, cwd, session) {
  closeSessionMenu();

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
    target: session.firstMessage || t('untitled'),
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

/** Themed replacement for window.confirm on the "Allow everything" button. */
function showConfirmAllowAll() {
  showConfirmDialog({
    kind: 'allowAll',
    title: t('allowAllTitle'),
    sub: t('allowAllSub'),
    target: t('allowAllMeta'),
    action: t('confirmAllowAllAction'),
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
  try {
    const res = await api.clearSession(tabId);
    views.delete(tabId);
    if (res?.state) {
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
    showNotice(res?.warning || t('clearDone'));
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
  const view = activeView();
  settingsData = await api.getSettings(view?.cwd);
  // settings:get already carries the key status (cached server-side for 60 s),
  // so opening the dialog does not spend a rate-limited /key call per open.
  coarenaStatus = settingsData?.coarena || null;
  paintCoarenaSettings();
  paintCoarenaMeter();
  renderSettings();
  renderAccount();
  const adsToggle = el('adsAutoRotate');
  if (adsToggle) adsToggle.checked = appPrefs.adsAutoRotate !== false;
  el('settingsOverlay').hidden = false;
  el('settingsClose').focus();
}

/** Pull the saved profile into the title bar and the window title. */
async function loadProfile() {
  const boot = await api.boot();
  const prof = boot.profile || {};
  profile = prof;
  document.querySelector('.tb-brand').textContent = prof.brand || 'FreePi.AI';  document.querySelector('.tb-title').textContent = prof.owner || '';
  document.querySelector('.tb-sub').textContent = prof.subtitle || '';
  const bits = [prof.owner, prof.subtitle].filter(Boolean);
  document.title = bits.join(' | ') || 'FreePi.AI';
}

function closeSettings() {
  el('settingsOverlay').hidden = true;
}

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

function applySidebarWidth(px) {
  const w = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(px) || SIDEBAR_DEFAULT)));
  document.documentElement.style.setProperty('--sidebar-w', `${w}px`);
  return w;
}

(function initSidebarResize() {
  const bar = el('sidebarResizer');
  if (!bar) return;

  applySidebarWidth(appPrefs.sidebarWidth || SIDEBAR_DEFAULT);

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    applySidebarWidth(e.clientX);
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10);
    appPrefs.sidebarWidth = w;
    api.setPrefs({ sidebarWidth: w });
  };

  bar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    document.body.classList.add('resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Keyboard support: arrow keys nudge, Shift jumps further.
  bar.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 40 : 8;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w'), 10) || SIDEBAR_DEFAULT;
    const w = applySidebarWidth(cur + (e.key === 'ArrowRight' ? step : -step));
    appPrefs.sidebarWidth = w;
    api.setPrefs({ sidebarWidth: w });
  });
})();
el('settingsClose').addEventListener('click', closeSettings);

el('adsAutoRotate')?.addEventListener('change', (e) => {
  appPrefs.adsAutoRotate = Boolean(e.target.checked);
  api.setPrefs({ adsAutoRotate: Boolean(e.target.checked) }).catch(() => {});
});

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
      paintCoarenaMeter();
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

el('settingsReset').addEventListener('click', async () => {
  const view = activeView();
  const cleared = {};
  for (const kind of Object.keys(settingsData?.folders || {})) cleared[kind] = '';
  await api.setPrefs({ folders: cleared, workspace: view?.cwd });
  settingsData = await api.getSettings(view?.cwd);
  renderSettings();
});

// ---- account panel ----
async function renderAccount() {
  const box = el('accountBox');
  if (!box) return;
  box.innerHTML = '';
  const note = el('accountNote');
  note.hidden = true;

  const st = await api.accountStatus();
  accountData = st;

  const row = (labelKey, value, cls) => {
    const d = document.createElement('div');
    d.className = 'account-row';
    const l = document.createElement('span');
    l.className = 'account-label';
    l.textContent = t(labelKey);
    const v = document.createElement('span');
    v.className = 'account-value' + (cls ? ` ${cls}` : '');
    v.textContent = value;
    d.append(l, v);
    box.appendChild(d);
  };

  const kind = !st.hasToken ? 'none' : st.guest ? 'guest' : 'member';
  row('accountKind', t(kind === 'none' ? 'acctNone' : kind === 'guest' ? 'acctGuest' : 'acctMember'), `acct-${kind}`);

  if (st.credits !== null) row('accountCredits', String(st.credits));
  if (st.lane) row('accountLane', st.lane);

  const tokenDisplay = st.hasToken
    ? st.credentialsPath.startsWith(st.home)
      ? `%USERPROFILE%${st.credentialsPath.slice(st.home.length)}`
      : st.credentialsPath
    : t('accountTokenMissing');

  const pathRow = document.createElement('div');
  pathRow.className = 'account-row account-row-wrap';
  const pl = document.createElement('span');
  pl.className = 'account-label';
  pl.textContent = t('accountFile');
  const pv = document.createElement('span');
  pv.className = 'account-value mono account-path';
  pv.textContent = tokenDisplay;
  pv.title = st.hasToken ? st.credentialsPath : '';
  pathRow.append(pl, pv);
  box.appendChild(pathRow);

  const tokenNote = document.createElement('div');
  tokenNote.className = 'account-token-note';
  tokenNote.textContent = t('accountTokenNote');
  box.appendChild(tokenNote);

  if (st.hasToken && st.credentialsDir) {
    const tokenActions = document.createElement('div');
    tokenActions.className = 'account-actions';
    const openToken = document.createElement('button');
    openToken.className = 'ghost small';
    openToken.textContent = t('openFolder');
    openToken.addEventListener('click', () => api.revealPath(st.credentialsDir));
    tokenActions.appendChild(openToken);
    box.appendChild(tokenActions);
  }

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

el('confirmCancel').addEventListener('click', hideConfirm);

el('confirmDelete').addEventListener('click', async () => {
  const state = confirmState;
  if (!state) return;
  hideConfirm();

  if (state.kind === 'clear') {
    await clearSession(state.tabId);
    return;
  }

  if (state.kind === 'allowAll') {
    await api.setApprovalMode({ allowEverything: true });
    await answerApproval(true);
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
      paintCoarenaMeter();
      showNotice(t('coarenaRemoved'));
    } else {
      showNotice(`${t('coarenaSaveFailed')} ${res?.error || ''}`.trim());
    }
    return;
  }

  const res = await api.deleteSession(state.cwd, state.session.path);
  if (!res?.ok) {
    showNotice(`Could not delete: ${res?.error || 'unknown error'}`);
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

  showNotice(`Deleted session from disk.`);
  setTimeout(() => showNotice(null), 2500);

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
 */
async function addAttachmentsFromFiles(files) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
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
      showNotice(`Could not read the path of "${file.name}". Try the Attach button instead.`);
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

/* ------------------------------ actions ------------------------------ */

async function boot() {
  const info = await api.boot();
  appPrefs = info.prefs || info;
  profile = info.profile || {};
  if (info.lang) lang = info.lang === 'th' ? 'th' : 'en';
  applyLanguage();
  loadProfile();
  refreshCoarenaStatus().catch(() => {});
  applySidebarWidth(appPrefs.sidebarWidth || SIDEBAR_DEFAULT);
  if (info.lastCwd) el('cwdLabel').textContent = info.lastCwd;
  api.getApprovalMode().then(applyApprovalMode).catch(() => {});

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
        const view = await api.openTab({ cwd: t.cwd, sessionId: t.sessionFile || undefined, restore: true });
        views.set(view.state.tabId, createView(view.state.tabId));
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
  try {
    const res = await api.openTab({ cwd: folder });
    applyTabState(res.state);
  } catch (err) {
    showNotice(errorText(err));
  }
});

el('newSession').addEventListener('click', async () => {
  const view = activeView();
  if (!view?.cwd) {
    showNotice(t('chooseWorkspace'));
    return;
  }
  try {
    const res = await api.openTab({ cwd: view.cwd });
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
    statusHint.textContent = `Model: ${m.name || m.id}`;
  } catch (err) {
    showNotice(`Could not switch model: ${err.message || err}`);
  }
});

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
];

const slashState = { open: false, index: 0, items: [] };

function slashDescription(cmd) {
  return (lang === 'th' ? cmd.th : cmd.en) || cmd.en || '';
}

function updateSlashMenu() {
  const text = input.value;
  if (!text.startsWith('/') || /\s/.test(text)) {
    hideSlashMenu();
    return;
  }
  const query = text.slice(1).toLowerCase();
  const items = SLASH_COMMANDS.filter((cmd) => {
    const name = cmd.name.slice(1).toLowerCase();
    return name.startsWith(query) || slashDescription(cmd).toLowerCase().includes(query);
  });
  if (!items.length) {
    hideSlashMenu();
    return;
  }
  const same =
    slashState.items.length === items.length && slashState.items.every((cmd, i) => cmd === items[i]);
  slashState.items = items;
  if (!same) slashState.index = 0;
  slashState.index = Math.min(slashState.index, items.length - 1);
  renderSlashMenu();
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

input.addEventListener('input', () => {
  autoGrow();
  updateSlashMenu();
});
input.addEventListener('keydown', (e) => {
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    submit();
    return;
  }
  // Ctrl+Enter always queues, so a message survives a running turn.
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    const view = activeView();
    if (!view) return;
    const text = input.value.trim();
    if (!text && pendingImages.length === 0) return;
    queueMessage(text, pendingImages.slice());
    pendingImages = [];
    renderAttachments();
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
 * Message queue: pressing Ctrl+Enter while the agent is busy stores the message
 * instead of dropping it. It is sent automatically as soon as the current turn
 * settles. Each view keeps its own queue, so background tabs do not steal it.
 */
function queueMessage(text, attachments) {
  const view = activeView();
  if (!view) return;
  view.queue = view.queue || [];
  view.queue.push({ text, images: attachments });

  input.value = '';
  autoGrow();
  renderQueue();
  updateSendState();
}

/** Send the next queued message if the tab is idle. */
async function drainQueue(view) {
  if (!view || view.busy) return;
  if (!view.queue || !view.queue.length) return;
  const next = view.queue.shift();
  renderQueue();
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
  view.messages.push({ kind: 'user', text: item.text, images: item.images });
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

/** Show the messages waiting behind the running turn, with a cancel button each. */
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

  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'queue-item';
    const label = document.createElement('span');
    label.className = 'queue-text';
    label.textContent = item.text || '(attachment)';
    label.title = item.text;
    row.appendChild(label);

    const rm = document.createElement('button');
    rm.textContent = '×';
    rm.title = t('removeFromQueue');
    rm.addEventListener('click', () => {
      const v = activeView();
      if (!v?.queue) return;
      v.queue.splice(i, 1);
      renderQueue();
    });
    row.appendChild(rm);
    bar.appendChild(row);
  });
}

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

  // While the agent is working, Ctrl+Enter queues instead of interrupting.
  if (view.busy) {
    queueMessage(text, pendingImages.slice());
    pendingImages = [];
    renderAttachments();
    return;
  }

  showNotice(null);

  if (view.messages.length === 0) {
    view.label = text ? text.slice(0, 42) : 'Image';
  }

  renderUserMessage(text, pendingImages);
  view.messages.push({ kind: 'user', text, images: pendingImages.slice() });

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
    await api.sendPrompt(view.tabId, text, images);
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

  const mins = Math.floor(diffMs / 60000);
  let countdown;
  if (mins < 60) countdown = lang === 'th' ? `${mins} นาที` : `${mins} min`;
  else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (lang === 'th') countdown = m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
    else countdown = m ? `${h} h ${m} min` : `${h} h`;
  }

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
    el('usagePct').textContent = t('pctUsed', { n: usedPct });
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

// Language toggle: saves the choice so it survives a restart.
el('langBtn').addEventListener('click', () => setLanguage(lang === 'en' ? 'th' : 'en'));

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
    }
  } else {
    wrap.classList.add('streaming');
    const body = wrap.querySelector('.body');
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
    const body = wrap.querySelector('.body');
    if (body) {
      body.__fpText = p.text;
      MD.renderInto(body, p.text, { copiedLabel: t('copied') });
    }
  }
});

api.onToolStart((p) => {
  const view = viewFor(p);
  if (!view) return;
  if (!payloadTabIsActive(view)) {
    view.messages.push({ kind: 'assistant', text: '', thinking: '', tools: [{ id: p.id, name: p.name, args: p.args }] });
    return;
  }
  const wrap = ensureLive(view);
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
  applyToolResult(card, view.toolResults.get(p.id));
  scrollToBottom();
});

/** Paint one finished tool result onto its card. */
function applyToolResult(card, res) {
  card.classList.toggle('error', res.isError);
  card.classList.toggle('ok', !res.isError);
  card.querySelector('.tool-status').textContent = res.isError
    ? t('toolFailed')
    : res.durationMs != null
    ? `${res.durationMs} ms`
    : t('toolDone');

  const hasDiff = res.diff && (res.diff.added || res.diff.removed);
  if (hasDiff) {
    renderDiffInto(card, res.diff);
  } else {
    card.querySelector('.tool-body').textContent = res.text;
  }

  const copy = card.querySelector('.tool-copy');
  if (copy) copy.hidden = !(card.querySelector('.tool-body')?.textContent || '').trim();

  // A failure or a file change is the important part of the card: open it.
  if (hasDiff || res.isError) {
    card.classList.remove('collapsed');
    const tools = card.closest('.tools');
    if (tools) {
      tools.hidden = false;
      refreshToolsSummary(tools);
    }
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
  if (payloadTabIsActive(view)) {
    setBusy(p.busy);
    if (p.busy) ensureLive(view);
    else if (view.liveAssistant) view.liveAssistant.classList.remove('streaming');
  }
});

api.onSettled((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.busy = false;
  if (view.liveAssistant) view.liveAssistant.classList.remove('streaming');
  view.liveAssistant = null;
  view.liveTools = null;
  if (payloadTabIsActive(view)) setBusy(false);
  // Send anything the user queued while this turn was running.
  drainQueue(view);
});

api.onNotice((p) => {
  if (payloadTabIsActive(viewFor(p))) showNotice(p.text);
});

/** A failed turn is invisible otherwise: the assistant message has no text. */
function appendErrorBanner(text, scroll = true) {
  const div = document.createElement('div');
  div.className = 'error-banner';
  div.textContent = `Error: ${text}`;
  transcript.appendChild(div);
  if (scroll) scrollToBottom(true);
  return div;
}

api.onError((p) => {
  const view = viewFor(p);
  if (!view) return;
  view.busy = false;
  if (!payloadTabIsActive(view)) return;
  showNotice(null);
  appendErrorBanner(p.text);
  setBusy(false);
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
  adSlot.title = 'Ads keep free-pi free — click to open in your browser';
  if (adRefresh) {
    adRefresh.title = t('changeAd');
    adRefresh.setAttribute('aria-label', t('changeAd'));
  }
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

if (adRefresh) {
  adRefresh.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (adRefresh.disabled) return;
    if (activeView()?.busy) {
      showNotice(t('adBusy'));
      return;
    }
    adRefresh.disabled = true;
    adRefresh.classList.add('busy');
    try {
      const res = await api.rotateAd({ tabId: activeTabId, auto: false });
      if (res?.reason === 'busy') showNotice(t('adBusy'));
    } catch {}
    adRefresh.classList.remove('busy');
    adRefresh.disabled = false;
  });
}

// The main process decides whether a rotation is due: focused window, idle tab,
// and at least a minute since the current creative was shown.
const AD_ROTATE_POLL_MS = 30 * 1000;
setInterval(() => {
  if (appPrefs.adsAutoRotate === false) return;
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
  if (payloadTabIsActive(view)) syncProviderChrome(view);
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

function showApproval({ id, toolName, args }) {
  pendingApprovalId = id;
  el('approvalTool').textContent = toolName;
  el('approvalCommand').textContent = describeReason(toolName, args) || '(no arguments)';
  // Keep the persist checkbox off by default: the safe answer is the default.
  el('approvalRemember').checked = false;
  el('approvalRememberLabel').textContent = t('rememberTool').replace('{tool}', toolName);
  approvalOverlay().hidden = false;
  el('approvalAllow').focus();
}

async function answerApproval(allow, opts = {}) {
  const id = pendingApprovalId;
  pendingApprovalId = null;
  approvalOverlay().hidden = true;
  if (id) await api.respondApproval(id, allow, opts);
  input.focus();
}

el('approvalAllow').addEventListener('click', () =>
  answerApproval(true, { remember: el('approvalRemember').checked })
);
el('approvalDeny').addEventListener('click', () => answerApproval(false));

/*
 * While "allow everything" is on, prompts stop arriving — which is easy to
 * forget about mid-task. A permanent banner in the sidebar plus one click to
 * restore is the cheapest way to keep that visible.
 */
function applyApprovalMode({ allowEverything, allowedTools = [] } = {}) {
  const on = Boolean(allowEverything);
  const banner = el('approvalModeBanner');
  if (banner) {
    banner.hidden = !on;
    if (on) {
      const label = banner.querySelector('.approval-banner-text');
      if (label) label.textContent = t('approvalsOff');
    }
  }
  document.body.classList.toggle('approvals-off', on);
  // Remembered tool grants are also "not asking", just narrower — surface them
  // with the same banner so the state is never invisible.
  if (!on && allowedTools.length) {
    if (banner) banner.hidden = false;
    document.body.classList.add('approvals-off');
  }
}

api.onApprovalMode(applyApprovalMode);

el('approvalModeReset').addEventListener('click', async () => {
  await api.setApprovalMode({ reset: true });
  applyApprovalMode({ allowEverything: false, allowedTools: [] });
});
// "Allow everything" is a big hammer, so it takes one confirmation after the
// click rather than firing straight away — a mis-click here removes every
// remaining safety prompt for the session.
el('approvalAllowAll').addEventListener('click', () => {
  showConfirmAllowAll();
});
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
    answerApproval(true, { remember: el('approvalRemember').checked });
  } else if (e.key === 'Escape') {
    e.preventDefault();
    answerApproval(false);
  }
});

api.onLog((p) => console.log(`[${p.tabId}]`, p.text));

boot();
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
  thinking: 'Reasoning',
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
  exportDone: 'Conversation exported',
  contextHint: 'Context window used by this conversation',
  mentionHint: '↑↓ choose · Tab/Enter insert · Esc close',
  model: 'Model',
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
  thinking: 'การคิด',
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
  exportDone: 'ส่งออกบทสนทนาแล้ว',
  contextHint: 'พื้นที่บริบทที่บทสนทนานี้ใช้อยู่',
  mentionHint: '↑↓ เลือก · Tab/Enter แทรก · Esc ปิด',
  model: 'โมเดล',
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
  scrollToBottom(true);
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
    }
    if (!activeView()) return;
    if (fileMenuState.token !== match.token) return;
    let files = [];
    try {
      files = await api.listFiles(view?.cwd, match.token);
    } catch {
      files = [];
    }
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
  if (view.busy) return showNotice(t('undoBusy'));
  showNotice(`${t('compact')}…`, 0);
  const res = await api.compact(view.tabId);
  showNotice(res?.ok ? t('compactDone') : t('undoBusy'), 3200);
  refreshContextMeter();
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

function paintThinking(thinking) {
  const select = el('thinkingSelect');
  if (!select) return;
  if (!thinking?.supported || !Array.isArray(thinking.levels) || !thinking.levels.length) {
    select.hidden = true;
    return;
  }
  select.hidden = false;
  if (select.dataset.levels !== thinking.levels.join(',')) {
    select.dataset.levels = thinking.levels.join(',');
    select.innerHTML = thinking.levels
      .map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(t('thinking'))}: ${escapeHtml(level)}</option>`)
      .join('');
  }
  select.value = thinking.level || 'off';
}

/* --------------------------- wiring: compose ------------------------ */

input.addEventListener('input', () => updateFileMenu());

input.addEventListener('keydown', (e) => {
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
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && input.value.trim().startsWith('!')) {
    e.preventDefault();
    e.stopPropagation();
    runShellCommand(input.value);
  }
});

/* --------------------------- wiring: buttons ------------------------ */

el('openPalette')?.addEventListener('click', openPalette);
el('thinkingSelect')?.addEventListener('change', async (e) => {
  const view = activeView();
  if (!view) return;
  const thinking = await api.setThinking(view.tabId, e.target.value);
  paintThinking(thinking);
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
      const select = el('thinkingSelect');
      if (select && !select.hidden) select.focus();
      else showNotice(t('noMatches'), 2000);
    },
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

function renderChangesBar(changes) {
  const bar = el('changesBar');
  const summary = el('changesSummary');
  if (!bar || !summary) return;
  const list = Array.isArray(changes) ? changes : [];
  if (!list.length) {
    bar.hidden = true;
    summary.textContent = '';
    return;
  }
  const added = list.reduce((n, c) => n + (c.added || 0), 0);
  const removed = list.reduce((n, c) => n + (c.removed || 0), 0);
  summary.textContent = `${t('filesChanged', { n: list.length })} · +${added} −${removed}`;
  bar.hidden = false;
}

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

el('changesReview')?.addEventListener('click', openChanges);
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

async function loadSkills() {
  if (skillsCache) return skillsCache;
  try {
    skillsCache = await api.listSkills();
  } catch {
    skillsCache = [];
  }
  return skillsCache;
}

/** Two chars of the skill's own name or description is enough to match. */
function matchSkill(skill, query) {
  const hay = `${skill.name} ${skill.description || ''}`.toLowerCase();
  return query.split(/\s+/).filter(Boolean).every((part) => hay.includes(part));
}

loadSkills();
