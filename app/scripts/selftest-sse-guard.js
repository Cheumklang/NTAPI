/**
 * SSE error guard: a 200 + `data: {"error": ...}` stream must become an HTTP
 * error, while a normal stream must pass through unchanged.
 *
 * Run from app/:   node scripts/selftest-sse-guard.js
 */
'use strict';

const { parseSseError, createGuardedFetch } = require('../src/sse-error-guard');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const encoder = new TextEncoder();

function streamResponse(chunks, contentType = 'text/event-stream') {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': contentType } }
  );
}

async function readAll(res) {
  return new Response(res.body).text();
}

(async () => {
  // parseSseError
  check(
    'parses an llm7 service_unavailable event',
    (() => {
      const e = parseSseError(
        'data: {"error":{"message":"Unable to process your request right now. (Trace ID: abc)","type":"service_unavailable_error","code":"service_unavailable","status_code":502}}\n\ndata: [DONE]\n\n'
      );
      return e && e.status === 502 && e.message.includes('Trace ID: abc') && e.code === 'service_unavailable';
    })()
  );
  check('ignores normal deltas', parseSseError('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n') === null);
  check('ignores [DONE]', parseSseError('data: [DONE]\n\n') === null);
  check('ignores malformed data', parseSseError('data: not-json\n\n') === null);

  // createGuardedFetch
  const guardedFetch = createGuardedFetch({
    fetchImpl: async (input) =>
      String(input).includes('/error')
        ? streamResponse([
            'data: {"error":{"message":"Unable to process your request right now. (Trace ID: t1)","status_code":502,"code":"service_unavailable"}}\n\n',
            'data: [DONE]\n\n',
          ])
        : String(input).includes('/plain')
          ? streamResponse(['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n', 'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n', 'data: [DONE]\n\n'])
          : streamResponse([], 'application/json'),
  });

  const errorRes = await guardedFetch('https://api.llm7.io/v1/chat/completions/error', {});
  const errorBody = await errorRes.json().catch(() => null);
  check('error event becomes a 502', errorRes.status === 502);
  check('error message survives', String(errorBody?.error?.message || '').includes('Trace ID: t1'));
  check('error content-type is JSON', (errorRes.headers.get('content-type') || '').includes('application/json'));

  const plainRes = await guardedFetch('https://api.llm7.io/v1/chat/completions/plain', {});
  const plainBody = await readAll(plainRes);
  check('normal stream stays 200', plainRes.status === 200);
  check('normal stream keeps SSE content type', (plainRes.headers.get('content-type') || '').includes('text/event-stream'));
  check(
    'normal stream replays every chunk in order',
    plainBody.includes('"Hel"') && plainBody.indexOf('"Hel"') < plainBody.indexOf('"lo"') && plainBody.includes('[DONE]')
  );

  const other = await guardedFetch('https://api.freepi.ai/v1/chat', {});
  check('unrelated hosts are untouched', other.status === 200 && (other.headers.get('content-type') || '').includes('application/json'));

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll SSE guard checks passed');
})();
