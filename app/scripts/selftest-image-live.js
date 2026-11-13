/**
 * Live check: a Coarena vision model sees an image without FreePi.
 *
 * Run from app/:
 *   $env:COARENA_KEY = (Get-Content "$env:TEMP\opencode\coarena-key.txt" -Raw).Trim()
 *   node scripts/selftest-image-live.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

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

/** Minimal PNG writer so the test does not depend on an image package. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, crc]);
}

function solidPng(size, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x += 1) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
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
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'image-live-'));
  const root = path.join(cwd, '.state');
  fs.mkdirSync(root, { recursive: true });

  const imagePath = path.join(cwd, 'red.png');
  fs.writeFileSync(imagePath, solidPng(64, [220, 20, 20]));

  const makeSession = (extra = {}) =>
    bridge.createFreePiSession({
      cwd,
      sdk,
      sessionManager: sdk.SessionManager.create(cwd, path.join(root, `sessions-${Date.now()}`)),
      coarenaKey: key,
      skillsAgentDir: path.join(root, 'agent'),
      imagesDir: path.join(root, 'images'),
      downloadsDir: path.join(root, 'downloads'),
      requestApproval: () => true,
      ...extra,
    });

  async function runPrompt(handle, prompt) {
    let settled = false;
    let answer = '';
    const errors = [];
    const tools = [];
    handle.session.subscribe((event) => {
      if (event.type === 'agent_settled') settled = true;
      if (event.type === 'tool_execution_start') tools.push(event.toolName);
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        if (event.message.stopReason === 'error') errors.push(event.message.errorMessage);
        else
          answer = (event.message.content || [])
            .filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('');
      }
    });
    await handle.session.prompt(prompt);
    const deadline = Date.now() + 90000;
    while (!settled && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    return { answer, errors, tools };
  }

  // 1. Coarena alone: no FreePi tools, so the built-in read must carry the image.
  const solo = await makeSession({ resolveFreePiAuth: async () => null });
  try {
    check('model declares image input', solo.session.model?.input?.includes('image'), solo.session.model?.input?.join(','));
    const out = await runPrompt(
      solo,
      'Use the read tool on red.png and tell me the dominant color in one word.'
    );
    check('read ran', out.tools.includes('read'), out.tools.join(','));
    check('no assistant error', out.errors.length === 0, out.errors.join(' | '));
    check('model saw the image through read', /red/i.test(out.answer), out.answer.trim().slice(0, 200));
    console.log('read answer:', out.answer.trim().slice(0, 200));
  } finally {
    solo.dispose();
  }

  // 2. Both providers: look_at_image must hand the image to the active Coarena
  //    model instead of posting it to FreePi's rate-limited vision endpoint.
  const dual = await makeSession();
  try {
    await dual.setModel('coarena', 'deepseek-v4-1-flash-1017');
    check('look_at_image is registered', dual.toolNames().includes('look_at_image'), dual.toolNames().join(','));
    check('active model can see images', dual.session.model?.input?.includes('image'));

    const out = await runPrompt(
      dual,
      'Call the look_at_image tool (not read) on red.png with the question "What is the dominant color? One word."'
    );
    check('look_at_image ran', out.tools.includes('look_at_image'), out.tools.join(','));
    check('no assistant error', out.errors.length === 0, out.errors.join(' | '));
    check('no FreePi 429 leaked into the answer', !/429|hourly limit/i.test(out.answer), out.answer.trim().slice(0, 200));
    check('model saw the image through look_at_image', /red/i.test(out.answer), out.answer.trim().slice(0, 200));
    console.log('look_at_image answer:', out.answer.trim().slice(0, 200));
  } finally {
    dual.dispose();
    fs.rmSync(cwd, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: the model reads images through its own provider');
})().catch((err) => {
  console.error('FAIL:', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
