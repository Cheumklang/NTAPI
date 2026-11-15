'use strict';

/**
 * Replay a real session transcript through the renderer and count what survives.
 *
 * The bug this exists for: the visible chat stopped at a point in the middle of a
 * conversation while the model still remembered everything after it. A transcript
 * that is rebuilt top-to-bottom on every repaint loses the rest of the list the
 * moment one entry throws — the DOM keeps whatever was drawn before the exception
 * and the missing part never comes back.
 *
 * So: take a session's real messages, hand them to applyTabState() exactly as an
 * agent:history would, and compare the entries drawn with the entries given.
 *
 *   node_modules/electron/dist/electron.exe scripts/probe-transcript-replay.js <messages.json>
 *
 * The JSON is an array of pi transcript messages (role/content) — see
 * .AGENT/HANDOFF.md for how it is exported from a .jsonl session file.
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();

const file = process.argv[2];
if (!file) {
  console.error('usage: probe-transcript-replay.js <messages.json>');
  app.exit(2);
}

const RAW = fs.readFileSync(file, 'utf8');

// Mirrors messagesForUi() in src/main.js, minus the diff parsing this probe has
// no use for: the point is the shape the renderer receives, not the diff content.
const TRANSFORM = `(messages) => {
  const out = [];
  for (const m of messages || []) {
    if (!m || m.role === 'system') continue;
    if (m.role === 'user') {
      const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content || [];
      const text = parts.filter((c) => c.type === 'text').map((c) => c.text).join('\\n');
      const images = parts.filter((c) => c.type === 'image').map((c) => ({ dataUri: 'data:' + c.mimeType + ';base64,' + c.data, mimeType: c.mimeType }));
      if (text || images.length) out.push({ kind: 'user', text, images, ts: m.timestamp });
      continue;
    }
    if (m.role === 'assistant') {
      const content = Array.isArray(m.content) ? m.content : [];
      const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('');
      const thinking = content.filter((c) => c.type === 'thinking').map((c) => c.thinking).join('');
      const tools = content.filter((c) => c.type === 'toolCall').map((c) => ({ id: c.id, name: c.name, args: c.arguments }));
      if (text || thinking || tools.length) out.push({ kind: 'assistant', text, thinking, tools, ts: m.timestamp });
      else if (m.stopReason === 'error') out.push({ kind: 'error', text: String(m.errorMessage || 'error'), ts: m.timestamp });
      continue;
    }
    if (m.role === 'toolResult') {
      const text = (m.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\\n');
      out.push({ kind: 'tool', id: m.toolCallId, name: m.toolName, text, isError: Boolean(m.isError), durationMs: m.durationMs, diff: null, ts: m.timestamp });
    }
  }
  return out;
}`;

const PROBE = `(async () => {
  const raw = ${JSON.stringify(RAW)};
  const messages = (${TRANSFORM})(JSON.parse(raw));
  const state = { tabId: 'probe-tab', cwd: 'C:/NTAPI/NTAPI Chat', sessionId: 'probe', name: 'probe', model: null, messages };

  const before = document.querySelectorAll('#transcript .msg').length;
  let error = null;
  try {
    applyTabState(state);
  } catch (err) {
    error = err && err.stack ? err.stack : String(err);
  }
  const after = document.querySelectorAll('#transcript .msg').length;
  return { messageCount: messages.length, bubbles: after, before, error,
           lastText: (document.querySelector('#transcript .msg:last-child') || {}).textContent?.slice(0, 60) || '' };
})()`;

app.whenReady()
  .then(async () => {
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
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.level, e.message));
    await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
    await new Promise((r) => setTimeout(r, 600));
    const res = await win.webContents.executeJavaScript(PROBE);
    console.log(JSON.stringify(res, null, 2));
    win.destroy();
    app.exit(res.error ? 1 : 0);
  })
  .catch((err) => {
    console.error('probe failed:', err && err.stack ? err.stack : err);
    app.exit(2);
  });