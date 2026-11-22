/*
 * Which models actually use the tools they are given?
 *
 * A session always ships with bash/read/write listed in its tool list, but some
 * chat-tuned models answer "install this for me" with "I am a text model with no
 * environment" instead of calling one. That is a property of the model, not of
 * the app, so the only honest way to know is to ask each one and watch what it
 * does. This script builds a real session per model — same system prompt, same
 * tools as the app — sends one fixed probe, and reports whether a tool call came
 * back.
 *
 * It spends real API quota: one short turn per model probed. Run it by hand.
 *
 *   electron scripts/check-provider-tooluse.js                       # list models, spend nothing
 *   electron scripts/check-provider-tooluse.js nvidia/nemotron-3.5-super-vl-120b-a12b
 *   electron scripts/check-provider-tooluse.js nvidia all-coarena   # a few models in one go
 *
 * A refusal is task-shaped, not universal: the same model that runs `uname -s`
 * may still answer a multi-step install with "I have no environment". To test
 * that shape, hand it a prompt and stop it before it can finish the work:
 *
 *   electron scripts/check-provider-tooluse.js --prompt "install X and run it" --abort-after 30 <model>
 *
 * A refusal can also be the conversation's doing: four turns of "I will install
 * it myself" are enough to make the next request sound like a spectator's. Send
 * several turns into one session by separating them with `||` and the probe
 * reproduces that:  --prompt "ผมจะติดตั้งเอง || ลองติดตั้งแล้วทำเสียงให้ฟังหน่อย"

 *
 * Exit code is 0 when every probed model used a tool, 1 when any did not, so a
 * regression in the standing prompt rule is visible without reading the output.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const { createFreePiSession } = require('../src/freepi-bridge');
const { createProviderKeyStore } = require('../src/provider-key');
const { sdkCandidatePaths } = require('../src/sdk-path');

// safeStorage ties its key to the app name, and main.js keeps the internal name
// "FreePi" for exactly that reason. Without this line every saved key looks
// undecryptable here and the probe would report a machine with no providers.
app.setName('FreePi');

/** One sentence, no formatting to copy, and a fact only a shell can supply. */
const PROBE = 'Run `uname -s` with bash and tell me exactly what it printed. Do not answer from memory.';
const TURN_TIMEOUT_MS = 150_000;

/**
 * Command line: model targets are positional, everything else is an option.
 *
 *   --prompt <text>       what to ask instead of the default one-liner
 *   --abort-after <secs>  stop the turn after N seconds and report what it had
 *                         done by then: the cheap way to see whether a model
 *                         starts a long install or refuses to start at all
 */
function parseArgs(argv) {
  const wanted = [];
  const options = { prompt: PROBE, abortAfter: 0 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt') {
      options.prompt = argv[i + 1] || PROBE;
      i += 1;
    } else if (arg === '--abort-after') {
      options.abortAfter = Number(argv[i + 1]) || 0;
      i += 1;
    } else if (!arg.startsWith('-')) {
      wanted.push(arg);
    }
  }
  return { wanted, options };
}

/** Provider key file → the option name createFreePiSession wants. */
const KEY_FILES = [
  ['coarena', 'coarena.json', 'coarenaKey'],
  ['zro', 'zro.json', 'zroKey'],
  ['nvidia', 'nvidia.json', 'nvidiaKey'],
  ['tokenharbor', 'tokenharbor.json', 'tokenharborKey'],
  ['llm7', 'llm7.json', 'llm7Key'],
  ['deepseek', 'deepseek.json', 'deepseekKey'],
  ['anthropic', 'anthropic.json', 'anthropicKey'],
  ['google', 'google.json', 'googleKey'],
];

/** Every word that means "I cannot do that", which is what the probe tests for. */
const REFUSAL = /(no environment|can't run|cannot run|can not run|don't have access|do not have access|unable to run|as an ai|text[- ]only|ไม่มีสภาพแวดล้อม|ไม่สามารถรัน|รันคำสั่งไม่ได้)/i;

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

/** Only the keys that still decrypt on this machine; the rest are reported, not skipped silently. */
function readKeys(dir) {
  const keys = {};
  const notes = [];
  for (const [provider, fileName, option] of KEY_FILES) {
    const store = createProviderKeyStore({ dir, safeStorage, fileName });
    const status = store.status();
    if (!status.configured) continue;
    const value = store.read();
    if (!value) {
      notes.push(`${provider}: key file present but unreadable here (re-enter it in Settings)`);
      continue;
    }
    keys[option] = value;
  }
  return { keys, notes };
}

/** One real session, exactly as the app builds it, with nothing but this probe in it. */
async function openSession({ sdk, cwd, dir, keys }) {
  const manager = sdk.SessionManager.create(cwd, dir);
  const handle = await createFreePiSession({
    cwd,
    sessionManager: manager,
    sdk,
    // Approved here and nowhere else: the probe may look at the machine, not
    // change it. Anything else is refused, which is also a result worth seeing.
    requestApproval: async (req) => ['bash', 'read', 'ls', 'find', 'grep'].includes(req.toolName),
    // No FreePi login, no ads, no MCP, no browser: this measures the model alone.
    resolveFreePiAuth: () => null,
    downloadsDir: path.join(cwd, 'downloads'),
    imagesDir: path.join(cwd, 'images'),
    thinkingLevel: 'off',
    ...keys,
  });
  return handle;
}

async function probeModel({ sdk, keys, provider, id, prompt, abortAfter }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-tooluse-'));
  const handle = await openSession({ sdk, cwd, dir: cwd, keys });
  const calls = [];
  const refusals = [];
  let text = '';
  let failure = null;

  const unsubscribe = handle.session.subscribe((event) => {
    if (!event) return;
    if (event.type === 'tool_execution_start' && event.toolName) calls.push(event.toolName);
    if (event.type === 'message_end' && event.message && event.message.role === 'assistant') {
      for (const part of event.message.content || []) {
        if (part && part.type === 'text' && part.text) text += part.text;
      }
      if (event.message.stopReason === 'error' && event.message.errorMessage) failure = event.message.errorMessage;
    }
    if (event.type === 'agent_settled' && event.aborted && !failure) failure = 'turn aborted';
  });

  const started = Date.now();
  let stoppedAfter = 0;
  // `||` splits one session into several user turns, in order.
  const turns = String(prompt)
    .split('||')
    .map((line) => line.trim())
    .filter(Boolean);
  try {
    await handle.setModel(provider, id);
    const stopper =
      abortAfter > 0
        ? setTimeout(() => {
            stoppedAfter = abortAfter;
            Promise.resolve()
              .then(() => handle.session.abort())
              .catch(() => {});
          }, abortAfter * 1000)
        : null;
    if (stopper) stopper.unref && stopper.unref();
    let settled = 'done';
    for (const turn of turns) {
      const run = handle.session.prompt(turn);
      const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), TURN_TIMEOUT_MS));
      settled = await Promise.race([run.then(() => 'done', (err) => `error: ${err && err.message}`), timeout]);
      if (settled !== 'done' || stoppedAfter) break;
    }
    if (stopper) clearTimeout(stopper);
    if (settled === 'timeout') {
      failure = failure || `no answer within ${Math.round(TURN_TIMEOUT_MS / 1000)}s`;
      try {
        await handle.session.abort();
      } catch {}
    } else if (settled.startsWith('error: ')) {
      failure = failure || settled.slice(7);
    }
    if (stoppedAfter) {
      try {
        await handle.session.abort();
      } catch {}
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      unsubscribe();
    } catch {}
    try {
      handle.dispose();
    } catch {}
    try {
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {}
  }

  const stopped = stoppedAfter ? ` (stopped after ${stoppedAfter}s)` : '';
  const verdict = calls.length
    ? calls.includes('bash')
      ? 'USES TOOLS'
      : `TOOLS, NO BASH (${[...new Set(calls)].join(',')})`
    : failure
      ? 'FAILED'
      : REFUSAL.test(text)
        ? 'REFUSES (claims it cannot)'
        : `NO TOOL CALL${stopped}`;
  if (verdict.startsWith('REFUSES') && !refusals.length) refusals.push(text.trim().slice(0, 160));

  return {
    provider,
    id,
    verdict,
    calls: [...new Set(calls)],
    seconds: Math.round((Date.now() - started) / 1000),
    stoppedAfter,
    failure,
    text: text.trim().slice(0, 200),
  };
}

app.whenReady().then(async () => {
  let exitCode = 0;
  try {
    const dir = dataRoot();
    const { keys, notes } = readKeys(dir);
    for (const note of notes) console.log(`note: ${note}`);

    const sdk = resolveSdk();
    const { wanted, options } = parseArgs(process.argv.slice(2));

    if (!wanted.length) {
      const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-tooluse-list-'));
      const handle = await openSession({ sdk, cwd, dir: cwd, keys });
      const models = handle.modelList || [];
      handle.dispose();
      fs.rmSync(cwd, { recursive: true, force: true });
      if (!models.length) {
        console.log('No models available: no readable provider key in ' + dir);
        app.exit(1);
        return;
      }
      const byProvider = new Map();
      for (const model of models) {
        if (!byProvider.has(model.provider)) byProvider.set(model.provider, []);
        byProvider.get(model.provider).push(model.id);
      }
      console.log(`${models.length} model(s) on this machine:\n`);
      for (const [provider, ids] of byProvider) {
        console.log(`${provider} (${ids.length})`);
        for (const id of ids.slice(0, 12)) console.log(`  ${provider}/${id}`);
        if (ids.length > 12) console.log(`  … ${ids.length - 12} more`);
      }
      console.log('\nProbe one with:  electron scripts/check-provider-tooluse.js <provider/modelId>');
      console.log('This run spent nothing.');
      app.exit(0);
      return;
    }

    // `all-<provider>` probes every model that provider offers, in order.
    const targets = [];
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-tooluse-list-'));
    const lister = await openSession({ sdk, cwd, dir: cwd, keys });
    const models = lister.modelList || [];
    lister.dispose();
    fs.rmSync(cwd, { recursive: true, force: true });
    for (const arg of wanted) {
      if (arg.startsWith('all-')) {
        const provider = arg.slice(4);
        targets.push(...models.filter((m) => m.provider === provider));
        continue;
      }
      const [provider, ...rest] = arg.split('/');
      const id = rest.join('/');
      const found = models.find((m) => m.provider === provider && m.id === id);
      if (!found) {
        console.log(`skip ${arg}: not offered on this machine`);
        exitCode = 1;
        continue;
      }
      targets.push(found);
    }

    const seen = new Set();
    const results = [];
    for (const target of targets) {
      const key = `${target.provider}/${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`\nprobing ${key} …`);
      const result = await probeModel({
        sdk,
        keys,
        provider: target.provider,
        id: target.id,
        prompt: options.prompt,
        abortAfter: options.abortAfter,
      });
      results.push(result);
      if (!result.verdict.startsWith('USES TOOLS')) exitCode = 1;
    }

    console.log('\n=== result ===');
    for (const row of results) {
      const detail = row.failure ? ` — ${row.failure}` : row.text ? ` — "${row.text.replace(/\s+/g, ' ').slice(0, 120)}"` : '';
      const calls = row.calls.length ? `  calls: ${row.calls.join(',')}` : '';
      console.log(`${row.verdict.padEnd(28)} ${row.provider}/${row.id}  [${row.seconds}s]${calls}${detail}`);
    }
  } catch (err) {
    console.error('probe failed:', err && err.stack ? err.stack : err);
    exitCode = 1;
  }
  app.exit(exitCode);
});
