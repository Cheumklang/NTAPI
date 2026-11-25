/*
 * Is the todo/plan panel reachable? Two things must both be true, and this
 * checks each with a real NVIDIA session (the free key):
 *
 *   1. the `todo` tool is declared to the model (handle.toolNames()), and
 *   2. a multi-step prompt actually makes the model call it (onTodo fires).
 *
 * The panel above the composer is hidden until the model calls `todo` with
 * items, so (2) is what makes it appear. Spends one short turn. Run by hand:
 *
 *   electron scripts/check-todo-panel.js [provider/modelId]
 *
 * Exit 0 when the tool is declared and the model used it, 1 otherwise.
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
    try { return require(dir); } catch {}
  }
  throw new Error('Could not find @earendil-works/pi-coding-agent. Reinstall NTAPI and try again.');
}

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
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-todo-'));
  const manager = sdk.SessionManager.create(cwd, cwd);
  let todoCalls = 0;
  let lastItems = null;

  const handle = await createFreePiSession({
    cwd,
    sessionManager: manager,
    sdk,
    requestApproval: async (req) => ['bash', 'read', 'ls', 'find', 'grep', 'todo'].includes(req.toolName),
    resolveFreePiAuth: () => null,
    downloadsDir: path.join(cwd, 'downloads'),
    imagesDir: path.join(cwd, 'images'),
    thinkingLevel: 'off',
    nvidiaKey,
    onTodo: (items) => { todoCalls += 1; lastItems = items; },
  });

  let exitCode = 0;
  try {
    const models = (handle.modelList || []).filter((m) => m.provider === 'nvidia');
    if (!models.length) throw new Error('NVIDIA offers no models on this machine.');
    const wanted = positional(process.argv.slice(2))[0];
    const model =
      (wanted && models.find((m) => `nvidia/${m.id}` === wanted || m.id === wanted)) ||
      models.find((m) => /nemotron/i.test(m.id)) ||
      models[0];

    const declared = (() => { try { return handle.toolNames(); } catch { return []; } })();
    const toolDeclared = declared.includes('todo');
    console.log('\n=== todo-panel probe (NVIDIA ' + model.id + ') ===');
    console.log('  todo declared to model: ' + (toolDeclared ? 'YES' : 'NO'));

    await handle.setModel('nvidia', model.id);
    const prompt =
      'Plan a small 3-step task in a todo checklist first (call the todo tool with the full list), ' +
      'then just say "done". The three steps: gather files, edit them, run tests.';
    const run = handle.session.prompt(prompt);
    const timeout = new Promise((r) => setTimeout(() => r('timeout'), TURN_TIMEOUT_MS));
    const state = await Promise.race([run.then(() => 'done', (e) => `error: ${e && e.message}`), timeout]);
    if (state === 'timeout') { console.log('  turn timed out'); try { await handle.session.abort(); } catch {} exitCode = 1; }
    else if (typeof state === 'string' && state.startsWith('error: ')) { console.log('  turn error: ' + state.slice(7)); exitCode = 1; }

    const used = todoCalls > 0;
    console.log('  model called todo:      ' + (used ? `YES (${todoCalls}x, ${lastItems ? lastItems.length : 0} items)` : 'NO'));
    if (!toolDeclared || !used) exitCode = 1;
  } catch (err) {
    console.error('todo-panel probe failed:', err && err.stack ? err.stack : err);
    exitCode = 1;
  } finally {
    try { handle.dispose(); } catch {}
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch {}
  }
  app.exit(exitCode);
}

app.whenReady().then(main);