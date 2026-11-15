'use strict';

/**
 * A queued message stays on one line, however long it is.
 *
 * The queue is a list to read at a glance. When a long message could not fit next
 * to its number and controls it dropped the words onto a second line, so a queue of
 * long messages was twice as tall and the rows looked ragged. The words are now the
 * only part that gives way: they truncate with an ellipsis and every row is one line.
 *
 * Checked at a wide and a narrow composer, because the squeeze is the whole point.
 *
 * Run from app/:  node_modules/electron/dist/electron.exe scripts/check-queue-single-line.js
 */

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

const LONG =
  'ช่วยสรุปไฟล์ทั้งหมดในโฟลเดอร์นี้ให้หน่อย แล้วบอกด้วยว่าไฟล์ไหนถูกแก้ล่าสุด ' +
  'และมีอะไรเปลี่ยนไปบ้างจากรอบก่อน พร้อมทั้งอธิบายว่าแต่ละไฟล์ทำหน้าที่อะไร ' +
  'และถ้ามีจุดที่ควรปรับปรุงก็บอกมาด้วยเป็นข้อ ๆ';

const probe = (count) => `(async () => {
  applyTabState({ tabId: 'q', cwd: 'C:/NTAPI/NTAPI Chat', sessionId: 'q', name: 'q', model: null, messages: [] });
  const view = views.get('q');
  view.queue = Array.from({ length: ${count} }, (_, i) => ({
    queueId: 'id' + i,
    text: ${JSON.stringify(LONG)} + ' (ข้อความที่ ' + (i + 1) + ')',
  }));
  renderQueue();
  await new Promise((r) => setTimeout(r, 200));

  const rows = [...document.querySelectorAll('.queue-item')];
  const info = rows.map((row) => {
    const line = row.querySelector('.queue-line');
    const text = row.querySelector('.queue-text');
    const lineBox = line.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    return {
      rowH: Math.round(row.getBoundingClientRect().height),
      lineH: Math.round(lineBox.height),
      lineH2: Math.round(parseFloat(style.lineHeight)),
      textIsInsideLine: textBox.top >= lineBox.top - 1 && textBox.bottom <= lineBox.bottom + 1,
      clipped: text.scrollWidth - text.clientWidth,
      ellipsis: style.textOverflow === 'ellipsis' && style.whiteSpace === 'nowrap',
      // The controls must stay on the same line as the words, not move under them.
      controlsOnLine: [...row.querySelectorAll('.queue-num, .queue-grip, .queue-edit-btn, .queue-remove')].every(
        (c) => {
          const b = c.getBoundingClientRect();
          return b.top >= lineBox.top - 2 && b.bottom <= lineBox.bottom + 2;
        }
      ),
    };
  });

  const barH = Math.round(document.getElementById('queueBar').getBoundingClientRect().height);
  return { rows: info, barH, width: Math.round(document.querySelector('.queue-bar').getBoundingClientRect().width) };
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

  for (const [label, width] of [
    ['wide', 1240],
    ['narrow', 620],
  ]) {
    win.setSize(width, 840);
    await new Promise((r) => setTimeout(r, 300));
    const res = await win.webContents.executeJavaScript(probe(3));
    console.log(`${label} (${res.width}px): ${JSON.stringify(res.rows)}`);

    check(`${label}: every queued message is a single line`, res.rows.every((r) => r.lineH <= r.lineH2 + 6), {
      heights: res.rows.map((r) => r.lineH),
      lineHeight: res.rows[0].lineH2,
    });
    check(`${label}: the row is no taller than its one line`, res.rows.every((r) => r.rowH <= r.rowH2 || r.rowH <= r.lineH + 6), {
      rowHeights: res.rows.map((r) => r.rowH),
    });
    check(`${label}: long text is cut with an ellipsis, not moved down`, res.rows.every((r) => r.textIsInsideLine && r.ellipsis));
    check(`${label}: the number and the controls stay on that line`, res.rows.every((r) => r.controlsOnLine));
    check(`${label}: the text really is longer than the room for it`, res.rows.every((r) => r.clipped > 0), {
      clipped: res.rows.map((r) => r.clipped),
    });
    // Three single-line rows plus the small header; anything near two lines each
    // would push this well past 100px.
    check(`${label}: the whole queue stays compact`, res.barH < 100, { barH: res.barH });
  }

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll queue single-line checks passed');
  app.exit(failures ? 1 : 0);
});
