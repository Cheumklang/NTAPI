/**
 * Repro: ข้อความหายเมื่อเปลี่ยนแชท / แชทสลับเอง
 *
 * จำลองด้วย renderer จริง + preload จริง แล้วยิง IPC event แบบเดียวกับที่
 * main process ส่ง (win.webContents.send) — ไม่ต้องต่อ provider
 *
 * รัน: node_modules/electron/dist/electron.exe scripts/repro-message-loss.js
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain } = require('electron');

app.disableHardwareAcceleration();

// The terminal that launched this may close its pipe before the run ends, and a
// console write then throws EPIPE in the main process (which shows a dialog).
// Everything goes to a file; the console is best effort only.
const LOG = path.join(require('node:os').tmpdir(), 'ntapi-repro-out.log');
fs.writeFileSync(LOG, '');
function line(text) {
  fs.appendFileSync(LOG, `${text}\n`);
  try {
    process.stdout.write(`${text}\n`);
  } catch {}
}

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) line(`PASS ${name}${tail}`);
  else {
    line(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const state = (tabId, name, messages, extra = {}) => ({
  tabId,
  cwd: 'C:/work',
  sessionId: `sess-${tabId}`,
  sessionFile: `C:/work/sess-${tabId}.jsonl`,
  name,
  model: null,
  models: [],
  guest: false,
  busy: false,
  messages,
  stats: null,
  todos: [],
  thinking: null,
  tools: [],
  changes: [],
  usage: null,
  ...extra,
});

const user = (text) => ({ kind: 'user', text });
const assistant = (text) => ({ kind: 'assistant', text, thinking: '', tools: [] });

app.whenReady().then(async () => {
  const tabStates = new Map();
  ipcMain.handle('app:boot', async () => ({ prefs: {}, openTabs: [], lastCwd: null, version: '0' }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('tab:state', async (_e, tabId) => tabStates.get(tabId) || null);
  ipcMain.handle('tab:activate', async (_e, tabId) => tabStates.get(tabId) || null);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('prefs:set', async () => ({}));

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, level, message) => line(`[console ${level}] ${message}`));
  await new Promise((r) => setTimeout(r, 900));

  const run = (expr) => win.webContents.executeJavaScript(expr);
  const transcript = () => run(`document.getElementById('transcript').innerText`);
  const active = () => run(`activeTabId`);

  const one = state('tab-1', 'One', [user('hello one')]);
  const two = state('tab-2', 'Two', [user('hello two')]);
  tabStates.set('tab-1', one);
  tabStates.set('tab-2', two);

  /* ---------- A: agent:history ของแท็บอื่นต้องไม่สลับแท็บที่กำลังดู ---------- */
  await run(`applyTabState(${JSON.stringify(one)}); applyTabState(${JSON.stringify(two)});`);
  let text = await transcript();
  check('ก่อนทดสอบ แท็บ 2 แสดงข้อความของตัวเอง', text.includes('hello two'), text.trim());

  win.webContents.send('agent:history', { tabId: 'tab-1', state: one });
  await new Promise((r) => setTimeout(r, 250));
  text = await transcript();
  const nowActive = await active();
  check('history ของแท็บอื่นไม่ดึงหน้าจอไปแท็บนั้น', nowActive === 'tab-2', nowActive);
  check('ข้อความของแท็บที่กำลังดูยังอยู่', text.includes('hello two'), text.trim());

  /* ---------- B: เปลี่ยนแท็บระหว่างสตรีม ข้อความที่พิมพ์ไปแล้วต้องไม่หาย ---------- */
  const streaming = state('tab-1', 'One', [user('q1')], { busy: true });
  tabStates.set('tab-1', streaming);
  await run(`applyTabState(${JSON.stringify(streaming)});`);
  win.webContents.send('agent:delta', { tabId: 'tab-1', channel: 'text', delta: 'partial ' });
  win.webContents.send('agent:delta', { tabId: 'tab-1', channel: 'text', delta: 'answer' });
  await new Promise((r) => setTimeout(r, 200));
  text = await transcript();
  check('เห็นข้อความที่กำลังสตรีมก่อนเปลี่ยนแท็บ', text.includes('partial answer'), text.trim());

  // เปลี่ยนไปแท็บ 2 แล้วกลับมา — เหมือนผู้ใช้กดแชทอื่นระหว่างรอคำตอบ
  await run(`applyTabState(${JSON.stringify(two)}); applyTabState(${JSON.stringify(streaming)});`);
  await new Promise((r) => setTimeout(r, 200));
  text = await transcript();
  check('กลับมาแล้วข้อความที่สตรีมไว้ไม่หาย', text.includes('partial answer'), text.trim());

  // จบเทิร์น: main มีข้อความเต็มแล้ว — หน้าจอต้องได้ข้อความเต็ม
  const settled = state('tab-1', 'One', [user('q1'), assistant('partial answer and the rest')], { busy: false });
  tabStates.set('tab-1', settled);
  win.webContents.send('agent:settled', { tabId: 'tab-1', aborted: false });
  await new Promise((r) => setTimeout(r, 400));
  text = await transcript();
  const dbg = await run(`(() => {
    const v = views.get('tab-1');
    return v ? { active: activeTabId, busy: v.busy, live: (v.liveMessages || []).length,
      msgs: (v.messages || []).map((m) => m.text) } : { missing: true };
  })()`);
  check('จบเทิร์นแล้วหน้าจอตรงกับประวัติจริง', text.includes('partial answer and the rest'), { text: text.trim(), dbg });

  /* ---------- C: แชทที่ยังไม่มีไฟล์ก็ต้องอยู่ในรายการด้านข้าง ---------- */
  await run(`renderSessions('C:/work')`);
  await new Promise((r) => setTimeout(r, 300));
  const rows = await run(`document.querySelectorAll('#sessionList .session-item').length`);
  check('ทุกแชทที่เปิดอยู่มีแถวในรายการด้านข้าง', rows >= 2, rows);

  line(failures ? `\n${failures} check(s) failed` : '\nAll message-loss checks passed');
  app.exit(failures ? 1 : 0);
}).catch((err) => {
  line(`runner error: ${err && err.stack ? err.stack : err}`);
  app.exit(1);
});
