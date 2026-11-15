'use strict';

// Looks at a queued message that is longer than the composer, and reports where the
// pieces of the row land: the number, the handle, the words, the buttons.
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

const LONG =
  'ช่วยสรุปไฟล์ทั้งหมดในโฟลเดอร์นี้ให้หน่อย แล้วบอกด้วยว่าไฟล์ไหนถูกแก้ล่าสุด และมีอะไรเปลี่ยนไปบ้างจากรอบก่อน ' +
  'พร้อมทั้งอธิบายว่าแต่ละไฟล์ทำหน้าที่อะไร และถ้ามีจุดที่ควรปรับปรุงก็บอกมาด้วยเป็นข้อ ๆ';

const PROBE = `(async () => {
  const measure = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const view = (views && views.get) || null;
  applyTabState({
    tabId: 'q', cwd: 'C:/NTAPI/NTAPI Chat', sessionId: 'q', name: 'q', model: null, messages: [],
  });
  const made = views.get('q');
  made.queue = [
    { kind: 'prompt', text: 'x'.repeat(300), images: [], queueId: 'k' },
    { queueId: 'a', text: ${JSON.stringify(LONG)} },
    { queueId: 'b', text: 'สั้น ๆ' },
    { queueId: 'c', text: 'x'.repeat(700) },
  ];
  renderQueue();
  await new Promise((r) => setTimeout(r, 400));
  const rows = [...document.querySelectorAll('.queue-item')].map((row) => {
    const kids = [...row.children].map((c) => {
      const r = c.getBoundingClientRect();
      return { cls: c.className, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
    });
    row.__kids = kids;
    const text = row.querySelector('.queue-text');
    const r = row.getBoundingClientRect();
    const t = text ? text.getBoundingClientRect() : null;
    return {
      rowH: Math.round(r.height),
      rowW: Math.round(r.width),
      textW: t ? Math.round(t.width) : null,
      textH: t ? Math.round(t.height) : null,
      textTop: t ? Math.round(t.top) : null,
      lineHeight: text ? Math.round(parseFloat(getComputedStyle(text).lineHeight)) : null,
      whiteSpace: text ? getComputedStyle(text).whiteSpace : null,
      ellipsis: text ? getComputedStyle(text).textOverflow : null,
      // scrollHeight > clientHeight means the words are clipped vertically too.
      clippedY: text ? text.scrollHeight - text.clientHeight : null,
      clippedX: text ? text.scrollWidth - text.clientWidth : null,
      kids: row.__kids,
    };
  });
  // With a countdown running the row is allowed to be two lines — but the line
  // itself must still be one, with the countdown underneath it.
  const holdRow = document.createElement('div');
  holdRow.className = 'hold-row';
  holdRow.innerHTML = '<span class="hold-clock">ส่งในอีก 4 วิ</span><button class="hold-btn">แก้</button><button class="hold-btn hold-drop">ยกเลิก</button>';
  const first = document.querySelector('.queue-item');
  first.appendChild(holdRow);
  await new Promise((r) => setTimeout(r, 100));
  const lineBox = first.querySelector('.queue-line').getBoundingClientRect();
  const textBox = first.querySelector('.queue-text').getBoundingClientRect();
  const holdBox = holdRow.getBoundingClientRect();
  const withHold = {
    rowH: Math.round(first.getBoundingClientRect().height),
    lineH: Math.round(lineBox.height),
    textTopInsideLine: Math.round(textBox.top - lineBox.top),
    lineIsOneLine: lineBox.height <= Math.round(parseFloat(getComputedStyle(first.querySelector('.queue-text')).lineHeight)) + 6,
    holdIsBelowLine: Math.round(holdBox.top) >= Math.round(lineBox.bottom) - 1,
    holdStartsAtLineLeft: Math.round(holdBox.left) === Math.round(lineBox.left),
  };

  return { rows, withHold, barH: Math.round(document.getElementById('queueBar').getBoundingClientRect().height) };
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));
  const res = await win.webContents.executeJavaScript(PROBE);
  console.log(JSON.stringify(res, null, 2));
  const img = await win.webContents.capturePage();
  require('node:fs').writeFileSync(
    'C:/NTAPI/outputs/queue-rows.png',
    img.resize({ width: 1240 }).toPNG()
  );
  win.destroy();
  app.exit(0);
});
