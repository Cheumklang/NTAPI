/**
 * Live check: a session that only has a Coarena key.
 *
 * Proves the two things unit tests cannot: the SDK accepts the registered
 * provider, and a real completion comes back. It also proves a key can be
 * removed from a running session without leaving a stuck tab.
 *
 * Run from app/:
 *   $env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
 *   node scripts/selftest-coarena-live.js
 *
 * Add --no-providers to check the "nothing configured" error instead of using
 * a key (no network, no key needed).
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const bridge = require('../src/freepi-bridge');

function resolveSdk() {
  const candidates = [process.env.FREEPI_SDK_PATH].filter(Boolean);
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

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const noProviders = process.argv.includes('--no-providers');
const key = String(process.env.COARENA_KEY || '').trim();

(async () => {
  const sdk = resolveSdk();
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coarena-live-'));
  const sessionDir = path.join(root, 'sessions');
  const skills = path.join(root, 'agent');
  for (const dir of [sessionDir, skills, path.join(root, 'images'), path.join(root, 'downloads')]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const options = {
    cwd,
    sdk,
    sessionManager: sdk.SessionManager.create(cwd, sessionDir),
    log: (line) => console.log('log:', line),
    requestApproval: () => true,
    skillsAgentDir: skills,
    imagesDir: path.join(root, 'images'),
    downloadsDir: path.join(root, 'downloads'),
    // The whole point: this machine has no usable FreePi login.
    resolveFreePiAuth: async () => null,
  };

  if (noProviders) {
    let error = null;
    try {
      await bridge.createFreePiSession({ ...options, coarenaKey: null });
    } catch (err) {
      error = err;
    }
    check(
      'no provider gives one clear error',
      error instanceof Error && /No AI provider available/.test(error.message),
      error && error.message
    );
    check('the error is not a stack trace about credentials', error && !/credentials\.json/.test(error.message));
    fs.rmSync(root, { recursive: true, force: true });
    process.exit(failed ? 1 : 0);
  }

  if (!key) {
    console.error('Set COARENA_KEY first (see the header of this file).');
    process.exit(2);
  }

  const handle = await bridge.createFreePiSession({ ...options, coarenaKey: key });
  try {
    check('standalone session uses Coarena', handle.session.model?.provider === 'coarena', handle.session.model?.provider);
    check('Coarena models are listed', handle.modelList.some((m) => m.provider === 'coarena'));
    check('no FreePi entries without auth', !handle.modelList.some((m) => m.provider === 'free-pi'));
    check('no ads for Coarena', (await handle.rotateAd()) === false);
    const tools = handle.toolNames();
    check('no FreePi-backed tools', !tools.includes('look_at_image') && !tools.includes('web_search'), tools.join(','));

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

    const deadline = Date.now() + 90000;
    while (!settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));

    check('turn settled', settled, `${Math.round((Date.now() - started) / 1000)}s`);
    check('no assistant error', assistantError === null, assistantError);
    check('real completion came back', /OK/i.test(answer), answer.trim() || '(empty)');
    console.log('answer:', answer.trim() || '(empty)');

    const after = await handle.applyCoarenaKey(null);
    check('key removal empties the catalog', !after.models.some((m) => m.provider === 'coarena'));
    check('handle agrees', !handle.modelList.some((m) => m.provider === 'coarena'));
  } finally {
    handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: Coarena works as the only provider');
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
