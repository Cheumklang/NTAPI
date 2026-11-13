/**
 * End-to-end check of the desktop bridge, the exact path a chat message takes:
 *
 *   node scripts/selftest-session.js [path-to-image]
 *
 * Builds a real free-pi session with the app's bridge, sends one prompt that
 * references an attached image (same text main.js builds), and prints every
 * assistant error, tool call and the final answer. Use it when "sending an
 * image does nothing": it shows whether the failure is ads, vision or the model.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bridge = require('../src/freepi-bridge');

function resolveSdk() {
  const candidates = [process.env.NTAPI_SDK_PATH, process.env.FREEPI_SDK_PATH].filter(Boolean);
  for (const base of candidates) {
    try {
      return require(base);
    } catch {}
  }
  const npxRoot = path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const dir of fs.readdirSync(npxRoot)) {
    const p = path.join(npxRoot, dir, 'node_modules', '@earendil-works', 'pi-coding-agent');
    if (fs.existsSync(p)) {
      try {
        return require(p);
      } catch {}
    }
  }
  throw new Error('pi SDK not found — run `npx free-pi-cli@latest` once');
}

const image =
  process.argv[2] ||
  (() => {
    const roots = ['C:\\NTAPI', 'C:\\Freepiai'];
    for (const root of roots) {
      for (const box of ['.ntapi-attachments', '.freepi-attachments']) {
        const dir = path.join(root, 'outputs', box);
        try {
          const f = fs
            .readdirSync(dir)
            .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
            .sort()
            .pop();
          if (f) return path.join(dir, f);
        } catch {}
      }
    }
    return null;
  })();

(async () => {
  const sdk = resolveSdk();
  const cwd = process.cwd();
  const sessionDir = path.join(os.tmpdir(), 'freepi-selftest-sessions');
  fs.mkdirSync(sessionDir, { recursive: true });

  let lastAd = null;
  const handle = await bridge.createFreePiSession({
    cwd,
    sessionManager: sdk.SessionManager.create(cwd, sessionDir),
    sdk,
    log: (line) => console.log('log:', line),
    requestApproval: () => true,
    skillsAgentDir: 'C:\\NTAPI',
    imagesDir: path.join(os.tmpdir(), 'freepi-selftest-images'),
    downloadsDir: path.join(os.tmpdir(), 'freepi-selftest-downloads'),
    onAd: (ad) => {
      lastAd = ad;
      console.log('ad:', ad.creative?.headline);
    },
  });

  let settled = false;
  let text = '';
  handle.session.subscribe((event) => {
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const m = event.message;
      if (m.stopReason === 'error') {
        console.error('ASSISTANT ERROR:', m.errorMessage);
      } else {
        text = (m.content || [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('');
      }
    }
    if (event.type === 'tool_execution_start') console.log('tool:', event.toolName);
    if (event.type === 'tool_execution_end') console.log('tool done:', event.toolName, 'error:', Boolean(event.isError));
    if (event.type === 'agent_settled') settled = true;
  });

  const parts = ['บอกสั้นๆ ว่าในรูปมีอะไร'];
  if (image) {
    parts.push(
      `[Attached image saved to: ${image}]\n` +
        'The image is saved on disk. You cannot see images directly: call look_at_image with that path and a specific question to view it.'
    );
  }
  console.log('image:', image || '(none)');
  console.log('ad present:', Boolean(lastAd));

  const started = Date.now();
  await handle.session.prompt(parts.join('\n\n'));

  const deadline = Date.now() + 120000;
  while (!settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));

  console.log('settled:', settled, `(${Math.round((Date.now() - started) / 1000)}s)`);
  console.log('answer:', text.trim() || '(empty)');
  handle.dispose();
  process.exit(!settled || !text.trim() ? 1 : 0);
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
