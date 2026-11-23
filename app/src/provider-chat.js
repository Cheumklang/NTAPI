'use strict';

/**
 * One short answer from a provider, outside any conversation.
 *
 * The app needs exactly one of these: turn a finished reply into a couple of
 * lines for the phone. Doing it through the session would add a turn to the
 * chat the user is reading, so it is a direct call — the same endpoint the
 * provider serves the chat with, with a one-shot prompt and a token cap.
 *
 * Three request shapes cover the providers the app registers:
 *   - OpenAI-compatible (`/chat/completions`): z.ai, OpenRouter, Cloudflare,
 *     Coarena, DeepSeek, LLM7, NVIDIA, Token Harbor, Zro
 *   - Anthropic (`/v1/messages`)
 *   - Google (`/models/<id>:generateContent`)
 *
 * Anything else returns `{ok: false, unsupported: true}` and the caller falls
 * back; a guess at an unknown API is worse than saying it is not supported.
 */

const TIMEOUT_MS = 30000;

const ANTHROPIC_PROVIDERS = new Set(['anthropic']);
const GOOGLE_PROVIDERS = new Set(['google']);

/** The instruction both routes use: short, in the language of the answer. */
function summaryPrompt(text, limit) {
  const max = Math.min(4000, Math.max(20, Math.floor(Number(limit) || 200)));
  return (
    `สรุปข้อความต่อไปนี้ให้เหลือไม่เกิน ${max} ตัวอักษร ` +
    `โดยเก็บสาระสำคัญและคำตอบที่ผู้ใช้ต้องรู้ ตอบเป็นข้อความสรุปสั้น ๆ เท่านั้น ห้ามขึ้นต้นว่า "สรุป" และห้ามอธิบายว่ากำลังทำอะไร\n\n` +
    `---\n${text}`
  );
}

function anthropicBody(model, prompt, maxTokens) {
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
  };
}

function googleBody(prompt, maxTokens) {
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
  };
}

function firstText(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const fromChoice = choice?.message?.content ?? choice?.text;
  if (typeof fromChoice === 'string' && fromChoice.trim()) return fromChoice.trim();
  // Anthropic
  const blocks = Array.isArray(body?.content) ? body.content : null;
  if (blocks) {
    const text = blocks
      .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join(' ')
      .trim();
    if (text) return text;
  }
  // Google
  const parts = body?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .join(' ')
      .trim();
    if (text) return text;
  }
  return '';
}

/**
 * Ask one provider for a short version of `text`.
 *
 * @param {object} input
 * @param {string} input.provider  provider id, e.g. `openrouter`
 * @param {string} input.baseUrl   endpoint root, no trailing slash
 * @param {string} input.apiKey    the credential the app already holds
 * @param {string} input.model     a model id that provider serves
 * @param {string} input.text      the answer to shorten
 * @param {number} input.limit     characters wanted
 * @param {Function} [input.fetchImpl]
 */
async function summarizeWithProvider({ provider, baseUrl, apiKey, model, text, limit, fetchImpl } = {}) {
  const id = String(provider || '').trim();
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const key = String(apiKey || '').trim();
  const name = String(model || '').trim();
  if (!root || !key || !name) return { ok: false, error: 'No provider is configured for this summary.' };
  if (!String(text || '').trim()) return { ok: false, error: 'Nothing to summarize.' };

  const doFetch = fetchImpl || fetch;
  const prompt = summaryPrompt(text, limit);
  const maxTokens = Math.min(1200, Math.max(64, Math.round((Number(limit) || 200) * 0.9)));

  let url;
  let init;
  if (ANTHROPIC_PROVIDERS.has(id)) {
    url = `${root}/v1/messages`;
    init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody(name, prompt, maxTokens)),
    };
  } else if (GOOGLE_PROVIDERS.has(id)) {
    url = `${root}/models/${encodeURIComponent(name)}:generateContent?key=${encodeURIComponent(key)}`;
    init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(googleBody(prompt, maxTokens)),
    };
  } else if (id) {
    url = `${root}/chat/completions`;
    init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: name,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
    };
  } else {
    return { ok: false, unsupported: true, error: 'That provider cannot summarize.' };
  }

  if (doFetch === fetch) init.signal = AbortSignal.timeout(TIMEOUT_MS);

  let res;
  try {
    res = await doFetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, offline: true, error: `Could not reach ${id} (${message}).` };
  }

  const raw = await res.text().catch(() => '');
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!res.ok) {
    const message = body?.error?.message || body?.error || body?.message || `HTTP ${res.status}`;
    // A provider message must never carry the key back into the UI.
    return { ok: false, status: res.status, error: String(message).split(key).join('[key]') };
  }

  const answer = firstText(body);
  if (!answer) return { ok: false, status: res.status, error: 'The provider returned no text.' };
  return { ok: true, status: res.status, summary: answer };
}

module.exports = { summarizeWithProvider, summaryPrompt, firstText };