/**
 * Live check: a second prompt joins the running turn instead of starting a new
 * one.
 *
 * Run from app/:
 *   $env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
 *   node scripts/selftest-steer-live.js
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

const key = String(process.env.COARENA_KEY || '').trim();
if (!key) {
  console.error('Set COARENA_KEY first (see the header of this file).');
  process.exit(2);
}

(async () => {
  const sdk = resolveSdk();
  const cwd = process.cwd();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'steer-live-'));
  for (const dir of ['sessions', 'agent', 'images', 'downloads']) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  }

  const handle = await bridge.createFreePiSession({
    cwd,
    sdk,
    sessionManager: sdk.SessionManager.create(cwd, path.join(root, 'sessions')),
    coarenaKey: key,
    resolveFreePiAuth: async () => null,
    skillsAgentDir: path.join(root, 'agent'),
    imagesDir: path.join(root, 'images'),
    downloadsDir: path.join(root, 'downloads'),
    requestApproval: () => true,
  });

  try {
    const userMessages = () => handle.session.messages.filter((m) => m.role === 'user').length;
    let settled = 0;
    let answer = '';
    let sawTool = false;
    let errored = null;

    handle.session.subscribe((event) => {
      if (event.type === 'agent_settled') settled += 1;
      if (event.type === 'tool_execution_start') sawTool = true;
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        if (event.message.stopReason === 'error') errored = event.message.errorMessage;
        else
          answer = (event.message.content || [])
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
      }
    });

    const run = handle.session.prompt(
      'Run `sleep 3` with the bash tool, then count from 1 to 60, one number per line, and use no other tools.'
    );
    run.catch(() => {});

    // Wait until the run is visibly in flight (a tool started), then steer.
    const steerBy = Date.now() + 30000;
    while (!sawTool && settled === 0 && Date.now() < steerBy) {
      await new Promise((r) => setTimeout(r, 100));
    }
    check('run was streaming before the steer', sawTool && settled === 0);

    const before = settled;
    await handle.session.prompt('Stop counting. Reply with exactly: STEERED', {
      streamingBehavior: 'steer',
    });
    await run.catch(() => {});

    const deadline = Date.now() + 90000;
    while (settled === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));

    check('run settled exactly once', settled === 1 && before === 0, `settled=${settled}`);
    check('steer did not start a new run', userMessages() === 2, `users=${userMessages()}`);
    check('no assistant error', errored === null, errored);
    check('the steer changed the answer', /STEERED/.test(answer), answer.trim().slice(0, 200));
    console.log('answer:', answer.trim().slice(0, 200));
    check('still no ads for Coarena', (await handle.rotateAd()) === false);
  } finally {
    handle.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: a steer joins the running turn');
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
