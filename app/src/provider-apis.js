/**
 * What each provider can do besides chat, and how to ask it to do that.
 *
 * The app already holds a key for every provider the user saved. Until now those
 * keys could only open a conversation with that provider. This module is the one
 * place that knows the other half: which provider can make a picture, speak a
 * line of text, transcribe audio, or look at a video — and exactly what request
 * that takes.
 *
 * A model never chooses a URL. It chooses a provider and a capability from this
 * table, and the request is built here (2026-11-26).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GROK_BASE_URL = 'https://api.x.ai/v1';
const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const ZAI_BASE_URL = 'https://api.z.ai/api/paas/v4';
const KILO_BASE_URL = 'https://ai-gateway.kilo.ai/api/v1';
const COARENA_BASE_URL = 'https://coarena.ai/api/v1';
const ZRO_BASE_URL = 'https://zro.moonmath.ai/v1';
const TOKENHARBOR_BASE_URL = 'https://tokenharbor.ai/v1';
const LLM7_BASE_URL = 'https://api.llm7.io/v1';
const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai';

/** Larger inputs are refused rather than silently truncated by the provider. */
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

/** Last-resort extension when a provider sends a mime type nobody listed. */
function extForMime(mime, fallback = '.bin') {
  const clean = String(mime || '').split(';')[0].trim().toLowerCase();
  return EXT_BY_MIME[clean] || fallback;
}

/* ---------------------------------------------------------------- table --- */

/**
 * Asking another model a question.
 *
 * Nearly every provider this app holds a key for speaks the OpenAI chat shape, so
 * one builder covers them all: the current model can hand a question to a model
 * on another provider and read the answer back (2026-11-26, asked for: one model
 * that can reach every other model the user has a key for).
 */
function openAiChat({ model, summary, cost }) {
  return {
    method: 'POST',
    path: '/chat/completions',
    model,
    summary: summary || 'ถามโมเดลอื่นบนเจ้านี้',
    cost: cost || 'เสียเงินตามโทเคนของเจ้านั้น',
    params: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to ask, written as a complete instruction' },
        model: { type: 'string', description: 'Model id on that provider, if the default is not wanted' },
        system: { type: 'string', description: 'Optional system instruction' },
      },
      required: ['prompt'],
    },
    body: (p) => {
      const messages = [];
      if (p.system) messages.push({ role: 'system', content: String(p.system) });
      messages.push({ role: 'user', content: String(p.prompt || '') });
      return { json: { model: String(p.model || model), messages } };
    },
    parse: (res) => ({
      text: String(res.json?.choices?.[0]?.message?.content || '').trim(),
      files: [],
    }),
  };
}

const PROVIDER_APIS = {
  grok: {
    label: 'Grok',
    baseUrl: GROK_BASE_URL,
    keyName: 'grok',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'grok-4-fast' }),

      'image.generate': {
        method: 'POST',
        path: '/images/generations',
        summary: 'สร้างภาพจากคำบรรยาย',
        cost: 'ประมาณ $0.02 ต่อภาพ',
        params: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What the picture should show' },
            n: { type: 'integer', minimum: 1, maximum: 10, description: 'How many pictures, default 1' },
          },
          required: ['prompt'],
        },
        body: (p) => ({
          json: {
            model: p.model || 'grok-imagine-image-2.0',
            prompt: String(p.prompt || ''),
            n: Number.isSafeInteger(p.n) && p.n > 0 ? Math.min(p.n, 10) : 1,
            response_format: 'url',
          },
        }),
        parse: (res) => {
          const items = Array.isArray(res.json?.data) ? res.json.data : [];
          const files = items
            .map((item) =>
              item?.url
                ? { kind: 'url', url: item.url, ext: extForMime(item.mime_type, '.jpg') }
                : item?.b64_json
                  ? { kind: 'base64', data: item.b64_json, ext: extForMime(item.mime_type, '.jpg') }
                  : null
            )
            .filter(Boolean);
          const revised = items.map((i) => i?.revised_prompt).filter(Boolean)[0];
          return { text: revised ? `Revised prompt: ${revised}` : '', files };
        },
      },
      'image.edit': {
        method: 'POST',
        path: '/images/edits',
        summary: 'แก้ภาพที่มีอยู่ตามคำสั่ง',
        cost: 'ประมาณ $0.02 ต่อภาพ',
        params: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'How the picture should change' },
            image: { type: 'string', description: 'Path to an image inside the project' },
          },
          required: ['prompt', 'image'],
        },
        body: (p, ctx) => {
          const file = ctx.inline(p.image);
          if (file.error) return { error: file.error };
          return {
            json: {
              model: p.model || 'grok-imagine-image-2.0',
              prompt: String(p.prompt || ''),
              image: { type: 'image_url', url: `data:${file.mime};base64,${file.base64}` },
            },
          };
        },
        parse: (res) => {
          const items = Array.isArray(res.json?.data) ? res.json.data : [];
          const files = items
            .map((item) =>
              item?.url
                ? { kind: 'url', url: item.url, ext: extForMime(item.mime_type, '.jpg') }
                : item?.b64_json
                  ? { kind: 'base64', data: item.b64_json, ext: extForMime(item.mime_type, '.jpg') }
                  : null
            )
            .filter(Boolean);
          return { text: '', files };
        },
      },
      'audio.speech': {
        method: 'POST',
        path: '/tts',
        summary: 'ทำเสียงพูดจากข้อความ (mp3)',
        cost: 'ประมาณ $15 ต่อ 1 ล้านตัวอักษร',
        params: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What should be spoken' },
            voice_id: { type: 'string', description: 'Voice name, e.g. eve' },
            language: { type: 'string', description: 'BCP-47 code such as th or en, or auto' },
          },
          required: ['text'],
        },
        body: (p) => ({
          json: {
            text: String(p.text || '').slice(0, 60000),
            voice_id: p.voice_id || 'eve',
            language: p.language || 'auto',
          },
        }),
        parse: (res) => ({
          text: '',
          files: res.buffer ? [{ kind: 'bytes', buffer: res.buffer, ext: extForMime(res.contentType, '.mp3') }] : [],
        }),
      },
      'audio.transcribe': {
        method: 'POST',
        path: '/stt',
        summary: 'ถอดเสียงเป็นข้อความ',
        cost: 'ประมาณ $0.10 ต่อชั่วโมงเสียง',
        params: {
          type: 'object',
          properties: {
            audio: { type: 'string', description: 'Path to an audio file inside the project' },
            language: { type: 'string', description: 'BCP-47 code, optional' },
          },
          required: ['audio'],
        },
        body: (p, ctx) => {
          const file = ctx.read(p.audio);
          if (file.error) return { error: file.error };
          const form = new FormData();
          form.append('file', new Blob([file.buffer], { type: file.mime }), path.basename(file.path));
          if (p.language) form.append('language', String(p.language));
          return { form };
        },
        parse: (res) => ({ text: String(res.json?.text || ''), files: [] }),
      },
    },
  },

  google: {
    label: 'Gemini',
    baseUrl: GOOGLE_BASE_URL,
    keyName: 'google',
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    capabilities: {
      chat: {
        method: 'POST',
        path: '/models/{model}:generateContent',
        model: 'gemini-3.7-flash',
        summary: 'ถามโมเดลอื่นบนเจ้านี้',
        cost: 'เสียเงินตามโทเคนของเจ้านั้น',
        params: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What to ask, written as a complete instruction' },
            model: { type: 'string', description: 'Model id, if the default is not wanted' },
          },
          required: ['prompt'],
        },
        body: (p) => ({
          json: { contents: [{ parts: [{ text: String(p.prompt || '') }] }] },
        }),
        parse: (res) => ({
          text: (res.json?.candidates?.[0]?.content?.parts || [])
            .map((part) => part?.text || '')
            .join('')
            .trim(),
          files: [],
        }),
      },

      'audio.speech': {
        method: 'POST',
        path: '/models/{model}:generateContent',
        model: 'gemini-2.5-flash-preview-tts',
        summary: 'ทำเสียงพูดจากข้อความ (wav)',
        cost: 'ขึ้นกับโมเดล เสียเงินตามโทเคนเสียง',
        params: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'What should be spoken' },
            voice: { type: 'string', description: 'Voice name, e.g. Kore' },
          },
          required: ['text'],
        },
        // The TTS model is the flash model with audio output: handed a bare
        // transcript it answers in text instead (HTTP 400). The instruction is
        // what makes it speak (2026-11-26).
        body: (p) => ({
          json: {
            contents: [
              {
                parts: [
                  {
                    text: `Read this aloud exactly as written, natural pace, no additions:\n\n${String(p.text || '').slice(0, 4000)}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: p.voice || 'Kore' } } },
            },
          },
        }),
        parse: (res) => {
          const parts = res.json?.candidates?.[0]?.content?.parts || [];
          const audio = parts.map((part) => part?.inlineData || part?.inline_data).find(Boolean);
          if (!audio?.data) return { text: '', files: [] };
          // Gemini hands back raw 16-bit PCM; a wav header is what makes it a file
          // the user can play.
          const pcm = Buffer.from(audio.data, 'base64');
          const rate = Number((/rate=(\d+)/.exec(audio.mimeType || audio.mime_type || '') || [])[1]) || 24000;
          return { text: '', files: [{ kind: 'bytes', buffer: wavFromPcm(pcm, rate), ext: '.wav' }] };
        },
      },
      'media.analyze': {
        method: 'POST',
        path: '/models/{model}:generateContent',
        model: 'gemini-3.7-flash',
        summary: 'อ่าน/วิเคราะห์ภาพ เสียง หรือวิดีโอในโปรเจกต์',
        cost: 'ขึ้นกับขนาดไฟล์และโมเดล',
        params: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Paths to image, audio or video files inside the project',
            },
            prompt: { type: 'string', description: 'What to find out about them' },
          },
          required: ['files', 'prompt'],
        },
        body: (p, ctx) => {
          const list = Array.isArray(p.files) ? p.files : [];
          if (!list.length) return { error: 'No files given.' };
          const parts = [];
          for (const rel of list) {
            const file = ctx.inline(rel);
            if (file.error) return { error: file.error };
            parts.push({ inline_data: { mime_type: file.mime, data: file.base64 } });
          }
          parts.push({ text: String(p.prompt || '') });
          return {
            json: {
              contents: [{ parts }],
              generationConfig: { responseModalities: ['TEXT'] },
            },
          };
        },
        parse: (res) => {
          const parts = res.json?.candidates?.[0]?.content?.parts || [];
          return { text: parts.map((p) => p?.text || '').join('').trim(), files: [] };
        },
      },
    },
  },
  mistral: {
    label: 'Mistral',
    baseUrl: MISTRAL_BASE_URL,
    keyName: 'mistral',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'mistral-small-latest' }),
    },
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    keyName: 'openrouter',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'openai/gpt-4o-mini' }),
    },
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: DEEPSEEK_BASE_URL,
    keyName: 'deepseek',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'deepseek-chat' }),
    },
  },
  zai: {
    label: 'Z.ai',
    baseUrl: ZAI_BASE_URL,
    keyName: 'zai',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'glm-4.5-air' }),
    },
  },
  kilo: {
    label: 'Kilo',
    baseUrl: KILO_BASE_URL,
    keyName: 'kilo',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'kilo-auto/free' }),
    },
  },
  coarena: {
    label: 'Coarena',
    baseUrl: COARENA_BASE_URL,
    keyName: 'coarena',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: '' }),
    },
  },
  zro: {
    label: 'Zro',
    baseUrl: ZRO_BASE_URL,
    keyName: 'zro',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: '' }),
    },
  },
  tokenharbor: {
    label: 'TokenHarbor',
    baseUrl: TOKENHARBOR_BASE_URL,
    keyName: 'tokenharbor',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: '' }),
    },
  },
  llm7: {
    label: 'LLM7',
    baseUrl: LLM7_BASE_URL,
    keyName: 'llm7',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: '' }),
    },
  },
  nvidia: {
    label: 'NVIDIA',
    baseUrl: NVIDIA_BASE_URL,
    keyName: 'nvidia',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    capabilities: {
      chat: openAiChat({ model: 'nvidia/nemotron-3.5-lightning-30b-a3b' }),
    },
  },
  pollinations: {
    label: 'Pollinations',
    baseUrl: POLLINATIONS_BASE_URL,
    keyName: 'pollinations',
    headers: () => ({}),
    capabilities: {
      'image.generate': {
        method: 'GET',
        path: '/prompt/{prompt}',
        summary: 'สร้างภาพฟรี (ไม่ต้องใช้คีย์)',
        cost: 'ฟรี',
        params: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'What the picture should show' },
            width: { type: 'integer', description: 'Pixels wide, default 1024' },
            height: { type: 'integer', description: 'Pixels tall, default 1024' },
          },
          required: ['prompt'],
        },
        body: (p) => ({
          query: {
            width: String(p.width || 1024),
            height: String(p.height || 1024),
            nologo: 'true',
          },
        }),
        parse: (res) => ({ text: '', files: [{ kind: 'bytes', buffer: res.body, ext: extForMime(res.contentType) }] }),
      },
    },
  },
};

/** A 44-byte wav header in front of raw PCM. */
function wavFromPcm(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/* ------------------------------------------------------------ discovery --- */

/**
 * What this user can actually use right now.
 *
 * Both halves are required: the permission switch has to be on, and a key has to
 * be saved. A provider missing either is left out entirely, so the model is
 * never told about a capability it would only be refused on.
 */
function listAccess({ access, keys } = {}) {
  const out = [];
  // One switch for all of them: the reader decides once whether the model in
  // front of them may reach other providers at all, not once per provider.
  const allowed = (id) =>
    typeof access === 'boolean' ? access : String(access?.[id] || 'off') === 'on';
  for (const [id, api] of Object.entries(PROVIDER_APIS)) {
    if (!allowed(id)) continue;
    if (!String(keys?.[id] || '').trim()) continue;
    out.push({
      provider: id,
      label: api.label,
      capabilities: Object.entries(api.capabilities).map(([capId, cap]) => ({
        id: capId,
        summary: cap.summary,
        cost: cap.cost,
      })),
    });
  }
  return out;
}

/** One line per provider for the tool description, so the model knows what exists. */
function describeForTool(entries = []) {
  return entries
    .map((entry) => `${entry.label}: ${entry.capabilities.map((c) => `${c.id} (${c.summary})`).join(', ')}`)
    .join(' · ');
}

/* ---------------------------------------------------------------- files --- */

function slugOf(text, fallback = 'output') {
  const clean = String(text || '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return clean || fallback;
}

/** Write a file under `saveDir` and return its absolute path — never outside it. */
function saveOutput(saveDir, name, buffer, ext = '') {
  const root = path.resolve(saveDir);
  fs.mkdirSync(root, { recursive: true });
  // The extension is added after the slug, not inside it: slugging
  // "picture.png" turned the dot into a dash and the file opened as "picture-png".
  const base = `${Date.now()}-${slugOf(name)}${ext}`;
  let target = path.resolve(root, base);
  if (!target.startsWith(root + path.sep)) target = path.resolve(root, 'output');
  let unique = target;
  let n = 1;
  while (fs.existsSync(unique)) unique = `${target}-${n++}`;
  fs.writeFileSync(unique, buffer);
  return unique;
}

/* ---------------------------------------------------------------- calling --- */

/**
 * Ask one provider to do one thing, and bring the answer back as text and files.
 *
 * Never throws: a refusal, a bad request or a broken response comes back as
 * `{ ok: false, error }` so the model can read why instead of losing the turn.
 */
async function callProvider({
  provider,
  capability,
  params = {},
  apiKey,
  cwd = process.cwd(),
  saveDir = path.join(cwd, 'generated'),
  fetchImpl = globalThis.fetch,
  readFile = (p) => fs.readFileSync(p),
} = {}) {
  const api = PROVIDER_APIS[provider];
  if (!api) return { ok: false, error: `Unknown provider: ${provider}` };
  const cap = api.capabilities[capability];
  if (!cap) return { ok: false, error: `Unknown capability for ${api.label}: ${capability}` };
  if (!String(apiKey || '').trim()) return { ok: false, error: `${api.label} has no saved key.` };

  const root = path.resolve(cwd);
  const inside = (rel) => {
    const full = path.resolve(root, String(rel || ''));
    if (full !== root && !full.startsWith(root + path.sep)) return null;
    return full;
  };
  const ctx = {
    read(rel) {
      const full = inside(rel);
      if (!full) return { error: `File must be inside the project: ${rel}` };
      if (!fs.existsSync(full)) return { error: `No such file: ${rel}` };
      const buffer = readFile(full);
      if (buffer.length > MAX_INLINE_BYTES) {
        return { error: `${path.basename(full)} is larger than ${Math.round(MAX_INLINE_BYTES / 1024 / 1024)} MB.` };
      }
      return {
        path: full,
        buffer,
        mime: MIME_BY_EXT[path.extname(full).toLowerCase()] || 'application/octet-stream',
      };
    },
    inline(rel) {
      const file = ctx.read(rel);
      if (file.error) return file;
      return { mime: file.mime, base64: file.buffer.toString('base64') };
    },
  };

  const built = cap.body(params, ctx);
  if (built?.error) return { ok: false, error: built.error };

  // A capability knows which model suits it: the text-to-speech model cannot read
  // a picture, and Gemini refuses a retired name outright (2026-11-26: audio still
  // answers on 2.5-flash-preview-tts, and 3.8-flash was overloaded so 3.7 is the
  // one that answered).
  const model = String(params.model || cap.model || '');
  let url = api.baseUrl + cap.path.replace('{model}', encodeURIComponent(model));
  // A picture can be named in the path itself (Pollinations asks that way).
  if (url.includes('{prompt}')) url = url.replace('{prompt}', encodeURIComponent(String(params.prompt || '')));
  if (built.query) {
    const qs = new URLSearchParams(built.query).toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const headers = { ...api.headers(apiKey) };
  let body;
  if (built.form) {
    body = built.form;
  } else if (cap.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(built.json ?? {});
  }

  let res;
  try {
    res = await fetchImpl(url, { method: cap.method, headers, body });
  } catch (err) {
    return { ok: false, error: `${api.label} could not be reached: ${err?.message || err}` };
  }

  const contentType = String(res.headers?.get?.('content-type') || '');
  let buffer = null;
  let json = null;
  try {
    buffer = Buffer.from(await res.arrayBuffer());
  } catch {
    buffer = Buffer.alloc(0);
  }
  if (contentType.includes('json') || buffer.length === 0) {
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const message =
      json?.error?.message ||
      json?.error ||
      json?.message ||
      (buffer.length ? buffer.toString('utf8').slice(0, 300) : '') ||
      `HTTP ${res.status}`;
    return { ok: false, error: `${api.label} refused (HTTP ${res.status}): ${message}` };
  }

  let parsed;
  try {
    parsed = cap.parse({ json, buffer, body: buffer, contentType }, ctx) || { text: '', files: [] };
  } catch (err) {
    return { ok: false, error: `${api.label} sent something this app cannot read: ${err?.message || err}` };
  }

  const saved = [];
  for (const file of parsed.files || []) {
    let bytes = null;
    if (file.kind === 'bytes') bytes = file.buffer;
    else if (file.kind === 'base64') bytes = Buffer.from(String(file.data || ''), 'base64');
    else if (file.kind === 'url') {
      try {
        const download = await fetchImpl(file.url);
        if (!download.ok) throw new Error(`HTTP ${download.status}`);
        bytes = Buffer.from(await download.arrayBuffer());
      } catch (err) {
        return { ok: false, error: `${api.label} made the file but it could not be downloaded: ${err?.message || err}` };
      }
    }
    if (!bytes || !bytes.length) continue;
    // The extension is ours, not the provider's: a name ending in ".jpg/../../x"
    // must not walk out of the folder the user can see.
    const ext = /^\.[a-z0-9]{1,5}$/i.test(file.ext || '') ? file.ext : '.bin';
    saved.push(saveOutput(saveDir, params.prompt || capability, bytes, ext));
  }

  if (!saved.length && !parsed.text) {
    return { ok: false, error: `${api.label} returned nothing usable for ${capability}.` };
  }
  return { ok: true, text: parsed.text || '', files: saved };
}

module.exports = {
  PROVIDER_APIS,
  MAX_INLINE_BYTES,
  listAccess,
  describeForTool,
  callProvider,
  saveOutput,
  wavFromPcm,
  slugOf,
};
