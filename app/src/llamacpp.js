'use strict';

/**
 * The local vision model: llama.cpp, fetched and run by the app.
 *
 * Looking at a picture normally means putting the picture in the conversation,
 * which costs tokens and leaves the machine. This runs a small vision model
 * beside the app instead: the picture goes to 127.0.0.1, comes back as words,
 * and only those words enter the conversation.
 *
 * The build is the Vulkan one (36 MB) rather than CUDA (210 MB + 567 MB of
 * runtime): it uses the GPU on every card Vulkan knows, Pascal included, and a
 * 7B-class model at Vulkan speed is fast enough that the extra CUDA speed is not
 * worth shipping an 800 MB download.
 *
 * shortcut: Linux x64 only. Windows needs the win-cuda-12 archive instead, and
 * nothing here has been run there — add it when the Windows side wants this.
 */

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { spawn } = require('node:child_process');

/** Pinned so a rebuild of the app cannot silently change the model under it. */
const RELEASE = 'b12648';
const BIN_URL = `https://github.com/ggml-org/llama.cpp/releases/download/${RELEASE}/llama-${RELEASE}-bin-ubuntu-vulkan-x64.tar.gz`;
const MODEL_REPO = 'https://huggingface.co/unsloth/Qwen3-VL-8B-Instruct-GGUF/resolve/main';
const MODEL_FILE = 'Qwen3-VL-8B-Instruct-Q4_K_M.gguf';
const MMPROJ_FILE = 'mmproj-F16.gguf';

/** The picture is described by the model; this is the ceiling on that answer. */
const MAX_ANSWER_TOKENS = 400;
const HEALTH_TIMEOUT_MS = 240000;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Follow redirects: GitHub and Hugging Face both send a 302 to a CDN. */
function download(url, dest, onProgress, token, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { headers: { 'user-agent': 'ntapi' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(download(next, dest, onProgress, token, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      const total = Number(res.headers['content-length']) || 0;
      let done = 0;
      const part = `${dest}.part`;
      const out = fs.createWriteStream(part);
      const fail = (err) => {
        out.destroy();
        res.destroy();
        reject(err);
      };
      token.onAbort = () => fail(new Error('cancelled'));

      res.on('data', (chunk) => {
        if (token.aborted) return fail(new Error('cancelled'));
        done += chunk.length;
        onProgress(done, total);
      });
      res.on('error', fail);
      out.on('error', fail);
      out.on('close', () => {
        if (token.aborted) return;
        try {
          fs.renameSync(part, dest);
        } catch (err) {
          return reject(err);
        }
        resolve({ bytes: done, total });
      });
      res.pipe(out);
    });
    req.on('error', reject);
    // A stalled CDN connection would otherwise hang setup with no way out.
    req.setTimeout(60000, () => req.destroy(new Error('download timed out')));
  });
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function createLlamaCpp({ dir, log = () => {}, enabled = true }) {
  const binDir = path.join(dir, 'llama-' + RELEASE);
  const modelDir = path.join(dir, 'models');
  const serverPath = path.join(binDir, 'llama-server');
  const modelPath = path.join(modelDir, MODEL_FILE);
  const mmprojPath = path.join(modelDir, MMPROJ_FILE);

  let phase = 'idle'; // idle | downloading | starting | running | error
  let progress = null; // { label, done, total }
  let port = null;
  let child = null;
  let lastError = null;
  let lastLog = [];
  let token = null;
  // The user's own switch. Off means no model runs on this machine: every caller
  // goes through start(), so the one check here covers the picture tool, the
  // summarizer and the settings card alike.
  let wantsOn = enabled !== false;

  function status() {
    return {
      phase,
      enabled: wantsOn,
      installed: exists(serverPath) && exists(modelPath) && exists(mmprojPath),
      running: Boolean(child && child.exitCode === null && port),
      port,
      model: MODEL_FILE,
      progress,
      error: lastError,
    };
  }

  function setProgress(label, done, total) {
    progress = { label, done, total };
    log('llamacpp:progress', progress);
  }

  async function unpack() {
    setProgress('unpacking', 0, 0);
    await fsp.mkdir(binDir, { recursive: true });
    await new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-xzf', path.join(dir, 'llama.tar.gz'), '-C', dir]);
      tar.on('error', reject);
      tar.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
    });
    if (!exists(serverPath)) throw new Error('the archive did not contain llama-server');
    fs.chmodSync(serverPath, 0o755);
    await fsp.rm(path.join(dir, 'llama.tar.gz'), { force: true });
  }

  async function ensureFiles(onProgress) {
    await fsp.mkdir(modelDir, { recursive: true });

    if (!exists(serverPath)) {
      setProgress('llama.cpp', 0, 0);
      await download(BIN_URL, path.join(dir, 'llama.tar.gz'), (done, total) => {
        setProgress('llama.cpp', done, total);
        onProgress?.();
      }, token);
      await unpack();
    }

    for (const [name, dest] of [
      [MODEL_FILE, modelPath],
      [MMPROJ_FILE, mmprojPath],
    ]) {
      if (exists(dest)) continue;
      setProgress(name, 0, 0);
      await download(`${MODEL_REPO}/${name}`, dest, (done, total) => {
        setProgress(name, done, total);
        onProgress?.();
      }, token);
    }
  }

  /** Download what is missing. Safe to call twice: existing files are kept. */
  async function setup(onProgress) {
    if (phase === 'downloading') return status();
    token = { aborted: false, onAbort: null };
    phase = 'downloading';
    lastError = null;
    try {
      await ensureFiles(onProgress);
      phase = 'idle';
      progress = null;
      return status();
    } catch (err) {
      phase = 'error';
      lastError = err && err.message ? err.message : String(err);
      progress = null;
      throw err;
    }
  }

  function cancelSetup() {
    if (token) {
      token.aborted = true;
      token.onAbort?.();
    }
    phase = 'idle';
    progress = null;
    return status();
  }

  function waitForHealth(deadline) {
    return new Promise((resolve, reject) => {
      const tick = () => {
        if (child && child.exitCode !== null) {
          return reject(new Error(lastLog.slice(-3).join(' ') || 'llama-server exited'));
        }
        if (Date.now() > deadline) return reject(new Error('llama-server did not become ready'));
        const req = http.get({ host: '127.0.0.1', port, path: '/health', timeout: 2000 }, (res) => {
          let body = '';
          res.on('data', (d) => (body += d));
          res.on('end', () => {
            if (res.statusCode === 200 && body.includes('"ok"')) resolve();
            else setTimeout(tick, 400);
          });
        });
        req.on('error', () => setTimeout(tick, 400));
        req.on('timeout', () => req.destroy());
      };
      tick();
    });
  }

  /**
   * Remember the switch. It does not start or stop anything by itself: the
   * caller (the settings card) decides, so a restart never spins up 5 GB of
   * model on its own.
   */
  function setEnabled(next) {
    wantsOn = next !== false;
    return status();
  }

  async function start() {
    if (!wantsOn) {
      const err = new Error('the local model is switched off in Settings → Providers → llama.cpp');
      err.code = 'DISABLED';
      throw err;
    }
    if (child && child.exitCode === null && port) return status();
    if (!status().installed) {
      const err = new Error('the local model is not installed yet');
      phase = 'error';
      lastError = err.message;
      throw err;
    }

    phase = 'starting';
    lastError = null;
    lastLog = [];
    port = await freePort();

    child = spawn(
      serverPath,
      [
        '-m', modelPath,
        '--mmproj', mmprojPath,
        '-ngl', '99',
        '-c', '8192',
        '--host', '127.0.0.1',
        '--port', String(port),
        '--no-webui',
      ],
      {
        cwd: binDir,
        // The build ships its ggml backends as .so beside the binary.
        env: { ...process.env, LD_LIBRARY_PATH: binDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const keep = (buf) => {
      lastLog.push(String(buf).trim());
      if (lastLog.length > 40) lastLog.shift();
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('exit', (code) => {
      if (phase === 'running') {
        phase = 'error';
        lastError = `llama-server stopped (${code})`;
      }
      port = null;
    });

    try {
      await waitForHealth(Date.now() + HEALTH_TIMEOUT_MS);
    } catch (err) {
      phase = 'error';
      lastError = err.message;
      await stop();
      throw err;
    }
    phase = 'running';
    return status();
  }

  async function stop() {
    const proc = child;
    child = null;
    port = null;
    if (phase === 'running' || phase === 'starting') phase = 'idle';
    if (!proc || proc.exitCode !== null) return status();
    proc.kill('SIGTERM');
    // A model holding the GPU does not always let go on the first signal.
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve();
      }, 5000);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return status();
  }

  /**
   * Ask the local model about one picture. The answer is words: the caller puts
   * those words in the conversation, never the image.
   */
  async function describeImage({ base64, mime = 'image/png', question, maxTokens = MAX_ANSWER_TOKENS }) {
    if (!(child && child.exitCode === null && port)) {
      const err = new Error('the local vision model is not running');
      err.code = 'NOT_RUNNING';
      throw err;
    }
    const body = JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: String(question || 'Describe this image for someone who cannot see it.') },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      cache_prompt: true,
    });

    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`local model answered ${res.status}`);
    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error('the local model returned no answer');
    return { text: String(text).trim(), usage: json.usage || null };
  }

  /**
   * Turn a finished answer into a couple of lines, on this machine.
   *
   * The same server that describes pictures is a chat model, so a summary costs
   * nothing but GPU seconds: the text goes in, a short version comes back, and
   * nothing leaves the machine.
   */
  async function summarize({ text, limit = 200, maxTokens = 400 } = {}) {
    if (!(child && child.exitCode === null && port)) {
      const err = new Error('the local model is not running');
      err.code = 'NOT_RUNNING';
      throw err;
    }
    const max = Math.min(4000, Math.max(20, Math.floor(Number(limit) || 200)));
    const body = JSON.stringify({
      messages: [
        {
          role: 'system',
          content:
            'You shorten text. Reply with the summary only: no preamble, no headings, no mention of what you are doing.',
        },
        {
          role: 'user',
          content:
            `สรุปข้อความต่อไปนี้ให้เหลือไม่เกิน ${max} ตัวอักษร เก็บสาระสำคัญและคำตอบที่ผู้ใช้ต้องรู้ ` +
            `ตอบเป็นข้อความสรุปสั้น ๆ เท่านั้น\n\n---\n${String(text || '').slice(0, 12000)}`,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
      cache_prompt: false,
    });

    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) throw new Error(`local model answered ${res.status}`);
    const json = await res.json();
    const answer = json?.choices?.[0]?.message?.content;
    if (!answer) throw new Error('the local model returned no summary');
    return { text: String(answer).trim(), usage: json.usage || null };
  }

  return { status, setEnabled, setup, cancelSetup, start, stop, describeImage, summarize, RELEASE, MODEL_FILE };
}

module.exports = { createLlamaCpp, RELEASE, MODEL_FILE, MMPROJ_FILE };
