/**
 * Every block the agent says in one turn must survive.
 *
 * This is the user's report, reproduced: "you answer telling me what you will
 * start on, then you answer again, and the first answer is gone." The agent's turn
 * is one turn with several blocks of prose, separated by tool calls, and each
 * block arrives as a text_end carrying the whole of that block.
 *
 * The events are pushed over real IPC, the way main.js sends them, so this tests
 * the wiring the app actually uses rather than a helper.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-turn-blocks.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 900));

  const TAB = 'turnblocks';
  const send = (channel, payload) => win.webContents.send(channel, { tabId: TAB, ...payload });
  const read = () => win.webContents.executeJavaScript(`(() => {
    const wraps = [...document.querySelectorAll('#transcript .msg.assistant')];
    return {
      wraps: wraps.length,
      blocks: wraps.flatMap((w) => [...w.querySelectorAll('.body')].map((b) => b.textContent)),
      toolCards: document.querySelectorAll('#transcript .msg.assistant .tool').length,
    };
  })()`);

  await win.webContents.executeJavaScript(`(() => {
    activeTabId = '${TAB}';
    const v = views.get('${TAB}') || createView('${TAB}');
    views.set('${TAB}', v);
    transcript.innerHTML = '';
    v.busy = true;
    v.liveAssistant = null;
    return true;
  })()`);

  // Block 1: what the agent says it is going to do.
  send('agent:delta', { channel: 'text', delta: 'จะเริ่มจากอ่านโค้ด' });
  send('agent:delta', { channel: 'text', delta: ' แล้วแก้ไฟล์' });
  send('agent:textEnd', { text: 'จะเริ่มจากอ่านโค้ด แล้วแก้ไฟล์' });
  const afterFirst = await read();
  check('the first block is drawn', afterFirst.blocks.length === 1, afterFirst);
  check('the first block keeps its text',
    afterFirst.blocks[0] === 'จะเริ่มจากอ่านโค้ด แล้วแก้ไฟล์', afterFirst.blocks);

  // A tool call runs between the two blocks — this is the boundary.
  send('agent:toolStart', { id: 't1', name: 'read_file', args: { path: 'app.js' } });
  send('agent:toolEnd', { id: 't1', name: 'read_file', ok: true, result: 'ok' });

  // Block 2: the report after the work.
  send('agent:delta', { channel: 'text', delta: 'อ่านเสร็จแล้ว' });
  send('agent:delta', { channel: 'text', delta: ' กำลังจะแก้ต่อ' });
  send('agent:textEnd', { text: 'อ่านเสร็จแล้ว กำลังจะแก้ต่อ' });
  const afterSecond = await read();
  check('the second block is drawn', afterSecond.blocks.length === 2, afterSecond);
  check('the first block is still there after the second',
    afterSecond.blocks[0] === 'จะเริ่มจากอ่านโค้ด แล้วแก้ไฟล์', afterSecond.blocks);
  check('the second block has its own text',
    afterSecond.blocks[1] === 'อ่านเสร็จแล้ว กำลังจะแก้ต่อ', afterSecond.blocks);
  check('both blocks belong to one assistant message', afterSecond.wraps === 1, afterSecond);
  check('the tool card is still shown', afterSecond.toolCards === 1, afterSecond);

  // A third block, to prove it is not a two-block special case.
  send('agent:toolStart', { id: 't2', name: 'edit_file', args: { path: 'app.js' } });
  send('agent:toolEnd', { id: 't2', name: 'edit_file', ok: true, result: 'ok' });
  send('agent:delta', { channel: 'text', delta: 'เสร็จแล้วครับ' });
  send('agent:textEnd', { text: 'เสร็จแล้วครับ' });
  const afterThird = await read();
  check('a third block is drawn', afterThird.blocks.length === 3, afterThird);
  check('no earlier block was lost',
    afterThird.blocks[0] === 'จะเริ่มจากอ่านโค้ด แล้วแก้ไฟล์' &&
      afterThird.blocks[1] === 'อ่านเสร็จแล้ว กำลังจะแก้ต่อ', afterThird.blocks);

  // Settling must not drop them either — this is where the user saw a blank.
  send('agent:busy', { busy: false });
  send('agent:settled', { aborted: false });
  await new Promise((r) => setTimeout(r, 150));
  const afterSettle = await read();
  check('nothing is lost when the turn settles', afterSettle.blocks.length === 3, afterSettle);
  check('the last block still reads correctly',
    afterSettle.blocks[2] === 'เสร็จแล้วครับ', afterSettle.blocks);

  // The bubbles must be separated on screen, not stacked as one paragraph.
  const spacing = await win.webContents.executeJavaScript(`(() => {
    const bodies = [...document.querySelectorAll('#transcript .msg.assistant .body')];
    if (bodies.length < 2) return { error: 'need two blocks' };
    const a = bodies[0].getBoundingClientRect();
    const b = bodies[1].getBoundingClientRect();
    return { gap: Math.round(b.top - a.bottom) };
  })()`);
  check('the two blocks have a visible gap between them',
    typeof spacing.gap === 'number' && spacing.gap >= 4, spacing);

  // A single-block turn must still be a single bubble: this fix must not split
  // ordinary answers into pieces.
  // Same tab: `send` is bound to it, and a different one would deliver the events
  // to a view that is not on screen.
  await win.webContents.executeJavaScript(`(() => {
    activeTabId = '${TAB}';
    const v = views.get('${TAB}');
    if (v) {
      transcript.innerHTML = '';
      v.busy = true;
      v.liveAssistant = null;
      v.liveTools = null;
    }
    return true;
  })()`);
  send('agent:delta', { channel: 'text', delta: 'ก้อนเดียว' });
  send('agent:textEnd', { text: 'ก้อนเดียว' });
  const oneBlock = await win.webContents.executeJavaScript(`(() => ({
    blocks: [...document.querySelectorAll('#transcript .msg.assistant')].flatMap(
      (w) => [...w.querySelectorAll('.body')].map((b) => b.textContent)),
  }))()`);
  check('an ordinary single-block answer stays one bubble',
    oneBlock.blocks.length === 1 && oneBlock.blocks[0] === 'ก้อนเดียว', oneBlock);

  // --- a block boundary with no text_end in front of it -------------------
  //
  // text_end is what normally closes a block, but the tool call is the boundary
  // that actually matters: it is the point past which the agent has stopped
  // speaking and gone to work. Without sealing there, the next delta appends to
  // the same bubble and the two statements run together as one sentence.
  await win.webContents.executeJavaScript(`(() => {
    activeTabId = '${TAB}';
    const v = views.get('${TAB}');
    if (v) {
      transcript.innerHTML = '';
      v.busy = true;
      v.liveAssistant = null;
      v.liveTools = null;
    }
    return true;
  })()`);
  send('agent:delta', { channel: 'text', delta: 'จะทำก่อน' });
  send('agent:toolStart', { id: 't9', name: 'read_file', args: { path: 'a.js' } });
  send('agent:toolEnd', { id: 't9', name: 'read_file', ok: true, result: 'ok' });
  send('agent:delta', { channel: 'text', delta: 'แล้วทำต่อ' });
  const noTextEnd = await read();
  check('a tool call alone separates two statements',
    noTextEnd.blocks.length === 2, noTextEnd.blocks);
  check('the statements are not run together into one block',
    noTextEnd.blocks[0] === 'จะทำก่อน' && noTextEnd.blocks[1] === 'แล้วทำต่อ', noTextEnd.blocks);

  win.destroy();

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    app.exit(1);
    return;
  }
  console.log('\nAll turn-block checks passed in the running renderer');
  app.exit(0);
});
