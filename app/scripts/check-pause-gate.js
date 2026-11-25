/*
 * Does the Pause button actually freeze the agent between steps?
 *
 * The pause gate (freepi-bridge createPauseGate) blocks the *next* tool_call while
 * a step already in flight is left to finish — the "pause the clock" the Stop
 * button cannot do. This drives a real NVIDIA session (the free key), asks the
 * model to run one shell command and then a second, pauses while the first is in
 * flight, and proves:
 *
 *   A. the command already running still finishes while paused, and
 *   B. the next command does NOT start until resume().
 *
 * It spends a little real NVIDIA quota: one short turn. Run it by hand:
 *
 *   electron scripts/check-pause-gate.js [provider/modelId]
 *
 * Exit 0 when both properties hold, 1 otherwise.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const { createFreePiSession } = require('../src/freepi-bridge');
const { createProviderKeyStore } = require('../src/provider-key');
const { sdkCandidatePaths } = require('../src/sdk-path');

app.setName('FreePi');

const TURN_TIMEOUT_MS = 120_000;
/** How long to watch, after pausing, for a second command that must not appear. */
const FROZEN_WINDOW_MS = 6_000;

function dataRoot() {
  const explicit = process.env.NTAPI_DATA_DIR || process.env.FREPI_DATA_DIR;
  if (explicit) return explicit;
  if (process.platform === 'win32') return 'C:\\NTAPI';
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'ntapi');
}

function resolveSdk() {
  for (const dir of sdkCandidatePaths({ appDir: path.join(__dirname, '..'), home: os.homedir(), env: process.env })) {
    if (!fs.existsSync(dir)) continue;
    try {
      return require(dir);
    } catch {}
  }
  throw new Error('Could not find @earendil-works/pi-coding-agent. Reinstall NTAPI and try again.');
}

/** Positional args only: drop flags and the script path electron leaves in argv. */
function positional(argv) {
  return argv.filter((a) => !a.startsWith('-') && !a.endsWith('.js'));
}

async function main() {
  const dir = dataRoot();
  const store = createProviderKeyStore({ dir, safeStorage, fileName: 'nvidia.json' });
  if (!store.status().configured) throw new Error('No NVIDIA key on this machine (Settings → Providers → NVIDIA).');
  const nvidiaKey = store.read();
  if (!nvidiaKey) throw new Error('NVIDIA key present but unreadable here — re-enter it in Settings.');

  const sdk = resolveSdk();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-pause-'));
  const manager = sdk.SessionManager.create(cwd, cwd);
  const handle = await createFreePiSession({
    cwd,
    sessionManager: manager,
    sdk,
    requestApproval: async (req) => ['bash'].includes(req.toolName),
    resolveFreePiAuth: () => null,
    downloadsDir: path.join(cwd, 'downloads'),
    imagesDir: path.join(cwd, 'images'),
    thinkingLevel: 'off',
    nvidiaKey,
  });

  const models = (handle.modelList || []).filter((m) => m.provider === 'nvidia');
  if (!models.length) throw new Error('NVIDIA offers no models on this machine.');
  const wanted = positional(process.argv.slice(2))[0];
  const model =
    (wanted && models.find((m) => `nvidia/${m.id}` === wanted || m.id === wanted)) ||
    models.find((m) => /nemotron/i.test(m.id)) ||
    models[0];

  const log = [];
  const t0 = Date.now();
  const stamp = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  let paused = false;
  let firstBashSeen = false;
  let pauseTime = 0;
  let resumeTime = 0;
  const bashEnds = [];
  let failure = null;

  const unsubscribe = handle.session.subscribe((event) => {
    if (!event) return;
    if (event.type === 'tool_execution_start') {
      const cmd = event.input && (event.input.command || event.input.cmd);
      log.push(`${stamp()} start ${event.toolName}${cmd ? ' :: ' + String(cmd).slice(0, 40) : ''}`);
    }
    if (event.type === 'tool_execution_end') {
      log.push(`${stamp()} end   ${event.toolName}`);
      if (event.toolName === 'bash') bashEnds.push(Date.now());
    }
    if (event.type === 'agent_settled') {
      log.push(`${stamp()} settled aborted=${Boolean(event.aborted)}`);
    }
    // `tool_execution_start` fires before the tool_call gate, so pausing the
    // instant it fires would block this very command. A short delay lets the
    // gate pass so the first command is genuinely in flight when pause lands.
    if (event.type === 'tool_execution_start' && event.toolName === 'bash' && !firstBashSeen) {
      firstBashSeen = true;
      setTimeout(() => {
        handle.pause();
        paused = true;
        pauseTime = Date.now();
        log.push(`${stamp()} >>> PAUSED while first bash in flight`);
      }, 800);
    }
    if (event.type === 'message_end' && event.message && event.message.role === 'assistant' &&
        event.message.stopReason === 'error' && event.message.errorMessage) {
      failure = event.message.errorMessage;
    }
  });

  let exitCode = 0;
  try {
    await handle.setModel('nvidia', model.id);
    const prompt =
      'Do this in exactly two separate bash calls, one after the other, waiting for each to finish. ' +
      'First bash call: `sleep 4`. After it returns, second bash call: `echo SECOND`. Do not combine them.';
    const run = handle.session.prompt(prompt);
    const timeout = new Promise((r) => setTimeout(() => r('timeout'), TURN_TIMEOUT_MS));
    const settle = run.then(() => 'done', (e) => `error: ${e && e.message}`);

    // Wait until the first bash has ended (proves A) or the turn settles/times out.
    while (bashEnds.length < 1) {
      const state = await Promise.race([settle, timeout, new Promise((r) => setTimeout(() => r('tick'), 150))]);
      if (state === 'timeout' || (typeof state === 'string' && state.startsWith('error'))) { failure = failure || state; break; }
      if (state === 'done') break;
    }
    const firstEnd = bashEnds[0] || 0;
    // A: the first command was in flight when pause landed, and still finished.
    const aHolds = Boolean(pauseTime && firstEnd && pauseTime < firstEnd);

    // Hold: the next command must not COMPLETE while paused. (Its start event
    // fires before the gate, so only the end proves it actually ran.)
    await new Promise((r) => setTimeout(r, FROZEN_WINDOW_MS));
    const secondEndWhilePaused = bashEnds.length >= 2 && bashEnds[1] <= Date.now();

    // Release and let the turn finish; the second command should now complete.
    resumeTime = Date.now();
    handle.resume();
    log.push(`${stamp()} >>> RESUMED`);
    const finalState = await Promise.race([settle, timeout]);
    if (finalState === 'timeout') {
      failure = failure || 'turn did not settle after resume';
      try { await handle.session.abort(); } catch {}
    } else if (typeof finalState === 'string' && finalState.startsWith('error: ')) {
      failure = failure || finalState.slice(7);
    }

    const secondEnd = bashEnds[1] || 0;
    const bHolds = !secondEndWhilePaused && Boolean(secondEnd && secondEnd > resumeTime);

    console.log('\n=== pause-gate probe (NVIDIA ' + model.id + ') ===');
    for (const line of log) console.log('  ' + line);
    console.log(`  bash calls that ran to completion: ${bashEnds.length}`);
    console.log(`  A (running step finishes while paused): ${aHolds ? 'PASS' : 'FAIL'}`);
    console.log(`  B (next step waits for resume):        ${bHolds ? 'PASS' : 'FAIL'}`);
    if (failure) console.log('  failure: ' + failure);
    if (!aHolds || !bHolds || failure) exitCode = 1;
  } catch (err) {
    console.error('pause-gate probe failed:', err && err.stack ? err.stack : err);
    exitCode = 1;
  } finally {
    try { unsubscribe(); } catch {}
    try { handle.dispose(); } catch {}
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
  }
  app.exit(exitCode);
}

app.whenReady().then(main);