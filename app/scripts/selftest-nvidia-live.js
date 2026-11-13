/**
 * Live check: a session that only has an NVIDIA key.
 *
 * Run from app/:
 *   $env:NVIDIA_KEY = (Get-Content "$env:TEMP\opencode\nvidia-key.txt" -Raw).Trim()
 *   node scripts/selftest-nvidia-live.js
 *
 * The free DSV4 endpoint has been seen accepting a request and then never
 * answering, so the prompt deadline is bounded (and overridable) instead of
 * letting the run sit for minutes:
 *   $env:NVIDIA_TURN_TIMEOUT_MS = 30000
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bridge = require('../src/freepi-bridge');

function resolveSdk() {
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

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const key = String(process.env.NVIDIA_KEY || '').trim();
if (!key) {
  console.error('Set NVIDIA_KEY first (see the header of this file).');
  process.exit(2);
}

(async () => {
  const sdk = resolveSdk();
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nvidia-live-'));
  for (const dir of ['sessions', 'agent', 'images', 'downloads']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  const handle = await bridge.createFreePiSession({
    cwd,
    sdk,
    sessionManager: sdk.SessionManager.create(cwd, path.join(root, 'sessions')),
    nvidiaKey: key,
    resolveFreePiAuth: async () => null,
    skillsAgentDir: path.join(root, 'agent'),
    imagesDir: path.join(root, 'images'),
    downloadsDir: path.join(root, 'downloads'),
    requestApproval: () => true,
  });

  try {
    check(
      'standalone session uses NVIDIA',
      handle.session.model?.provider === 'nvidia',
      JSON.stringify(handle.session.model)
    );
    check(
      'a working Nemotron model is listed',
      handle.modelList.some((m) => m.provider === 'nvidia' && /nemotron-3/.test(m.id)),
      JSON.stringify(handle.modelList)
    );
    check(
      'DeepSeek is still offered for when its endpoint recovers',
      handle.modelList.some((m) => m.provider === 'nvidia' && /deepseek-v4/.test(m.id)),
      JSON.stringify(handle.modelList)
    );
    check(
      'the default is the responsive Nemotron',
      handle.session.model?.id === 'nvidia/nemotron-3-ultra-550b-a55b',
      JSON.stringify(handle.session.model)
    );
    check('no FreePi entries without auth', !handle.modelList.some((m) => m.provider === 'free-pi'));
    check('no ads for NVIDIA', (await handle.rotateAd()) === false);

    let settled = false;
    let answer = '';
    let assistantError = null;
    handle.session.subscribe((event) => {
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        const m = event.message;
        if (m.stopReason === 'error') assistantError = m.errorMessage;
        else
          answer = (m.content || [])
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
      }
      if (event.type === 'agent_settled') settled = true;
    });

    const started = Date.now();
    await handle.session.prompt('Reply with the single word OK and nothing else.');
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    while (!settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));

    check('turn settled', settled, `${Math.round((Date.now() - started) / 1000)}s`);
    // A silent endpoint has to surface as a readable error, not an empty transcript.
    if (assistantError) console.log('assistant error:', assistantError);
    check('no assistant error', assistantError === null, assistantError);
    check('real completion came back', /OK/i.test(answer), answer.trim() || '(empty)');
    console.log('answer:', answer.trim() || '(empty)');

    const after = await handle.applyNvidiaKey(null);
    check('key removal empties the NVIDIA catalog', !after.models.some((m) => m.provider === 'nvidia'));
    check('handle agrees', !handle.modelList.some((m) => m.provider === 'nvidia'));
  } finally {
    handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: NVIDIA works as the only provider');
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
