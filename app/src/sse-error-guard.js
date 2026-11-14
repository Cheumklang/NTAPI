'use strict';

/**
 * Turn "HTTP 200 + an error inside the SSE stream" into a real HTTP error.
 *
 * Several OpenAI-compatible gateways answer a streaming request with 200 and
 * `text/event-stream`, then send the failure as the first event:
 *
 *   data: {"error":{"message":"Unable to process your request...","status_code":502}}
 *   data: [DONE]
 *
 * An OpenAI client ignores a chunk with no `choices`, so pi sees an empty turn
 * that never finishes — the window just sits there until the user stops it.
 * Gateways do this when their upstream is overloaded.
 *
 * This guard peeks at the first SSE event of a guarded host. When that event is
 * an error it returns a JSON error response instead, so pi's own error
 * normalisation and retry logic take over. Anything that is not an error is
 * replayed byte for byte, so normal streaming is untouched.
 */

const DEFAULT_HOSTS = ['api.llm7.io'];
const PEEK_LIMIT_BYTES = 8 * 1024;

function hostOf(input) {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Find the first `error` object in the captured SSE text.
 * @returns {{message: string, status: number, type?: string, code?: string} | null}
 */
function parseSseError(text) {
  for (const event of String(text).split(/\r?\n\r?\n/)) {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }
      const err = parsed?.error;
      if (!err) continue;
      if (typeof err === 'string') return { message: err, status: 502 };
      const status = Number(err.status_code ?? err.status);
      return {
        message: String(err.message || err.code || err.type || 'provider error'),
        status: Number.isFinite(status) && status >= 400 ? status : 502,
        ...(err.type ? { type: String(err.type) } : {}),
        ...(err.code ? { code: String(err.code) } : {}),
      };
    }
  }
  return null;
}

/** Read whole SSE events until the first one is complete (or the limit is hit). */
async function peekFirstEvent(reader) {
  const chunks = [];
  const decoder = new TextDecoder();
  let text = '';
  let done = false;
  while (!done && text.length < PEEK_LIMIT_BYTES && !text.includes('\n\n')) {
    const result = await reader.read();
    if (result.done) {
      done = true;
      break;
    }
    chunks.push(result.value);
    text += decoder.decode(result.value, { stream: true });
  }
  return { chunks, text, done };
}

/** Replay what was peeked, then continue reading the original body. */
function replayBody(reader, chunks) {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
        return;
      }
      const result = await reader.read();
      if (result.done) {
        controller.close();
        return;
      }
      controller.enqueue(result.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Wrap a fetch so the guarded hosts' SSE errors become HTTP errors.
 * Exported for tests; `installSseErrorGuard` is what the app uses.
 */
function createGuardedFetch({ hosts = DEFAULT_HOSTS, fetchImpl = globalThis.fetch } = {}) {
  const guarded = new Set(hosts);

  return async function guardedFetch(input, init) {
    const res = await fetchImpl(input, init);
    if (!res || !guarded.has(hostOf(input))) return res;

    const contentType = res.headers.get('content-type') || '';
    if (!res.body || !contentType.includes('text/event-stream')) return res;
    if (!res.ok) return res;

    const reader = res.body.getReader();
    let peeked;
    try {
      peeked = await peekFirstEvent(reader);
    } catch (err) {
      reader.cancel(err).catch(() => {});
      throw err;
    }

    const error = parseSseError(peeked.text);
    if (error) {
      await reader.cancel().catch(() => {});
      return new Response(
        JSON.stringify({
          error: {
            message: error.message,
            ...(error.type ? { type: error.type } : {}),
            ...(error.code ? { code: error.code } : {}),
          },
        }),
        { status: error.status, headers: { 'content-type': 'application/json' } }
      );
    }

    // Length and encoding describe the bytes the runtime already decoded, not
    // the replayed stream, so they must not be carried over.
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(replayBody(reader, peeked.chunks), {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}

/** Install once, on the main process's global fetch. */
function installSseErrorGuard(options) {
  const current = globalThis.fetch;
  if (typeof current !== 'function' || current.__sseGuarded) return current;
  const guarded = createGuardedFetch({ ...options, fetchImpl: current });
  guarded.__sseGuarded = true;
  globalThis.fetch = guarded;
  return guarded;
}

module.exports = {
  DEFAULT_HOSTS,
  parseSseError,
  createGuardedFetch,
  installSseErrorGuard,
};
