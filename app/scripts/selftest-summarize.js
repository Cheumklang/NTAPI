'use strict';

/**
 * The summarizer that asks a provider, without a provider.
 *
 * Three request shapes are all this has to get right — OpenAI-compatible,
 * Anthropic and Google — plus the two rules that keep it safe: the credential
 * never comes back in an error, and an answer that is not text (a refusal, an
 * empty completion) is reported instead of being sent to a phone.
 */

const { summarizeWithProvider, summaryPrompt, firstText } = require('../src/provider-chat');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.log(`FAIL ${name}`, detail === undefined ? '' : `— ${JSON.stringify(detail)}`);
  }
}

/** A fetch that answers once and remembers the request. */
function stubFetch(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, init });
    const res = handler(url, init);
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      text: async () => (typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? '')),
    };
  };
  impl.calls = calls;
  return impl;
}

const KEY = 'sk-test-should-never-leak';
const ANSWER = '## Goal\nThe build failed.\n\n## Next\nRun the tests again.';

async function main() {
  /* -------------------------------- prompt ------------------------------- */
  const prompt = summaryPrompt(ANSWER, 120);
  check('the prompt carries the length asked for', prompt.includes('ไม่เกิน 120 ตัวอักษร'), prompt.slice(0, 80));
  check('it carries the text to shorten', prompt.includes('The build failed'));
  check('it forbids a preamble', /ห้ามขึ้นต้น/.test(prompt));
  check(
    'the length is clamped into a sane range',
    summaryPrompt('x', 5).includes('ไม่เกิน 20 ตัวอักษร') && summaryPrompt('x', 99999).includes('ไม่เกิน 4000 ตัวอักษร')
  );

  /* ------------------------------ shapes read ---------------------------- */
  check('an OpenAI-style answer is read', firstText({ choices: [{ message: { content: 'hi' } }] }) === 'hi');
  check('an Anthropic answer is read', firstText({ content: [{ type: 'text', text: 'hi' }] }) === 'hi');
  check('a Google answer is read', firstText({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }) === 'hi');
  check('an empty answer reads as nothing', firstText({}) === '' && firstText(null) === '');

  /* ----------------------------- OpenAI-style ---------------------------- */
  const openai = stubFetch(() => ({ status: 200, body: { choices: [{ message: { content: 'สั้น ๆ' } }] } }));
  const openaiRes = await summarizeWithProvider({
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: KEY,
    model: 'deepseek/deepseek-chat-v3.1',
    text: ANSWER,
    limit: 200,
    fetchImpl: openai,
  });
  check('an OpenAI-compatible provider answers', openaiRes.ok && openaiRes.summary === 'สั้น ๆ', openaiRes);
  check('it posts to /chat/completions', openai.calls[0].url === 'https://openrouter.ai/api/v1/chat/completions', openai.calls[0].url);
  check(
    'it sends the key as a Bearer header',
    openai.calls[0].init.headers.authorization === `Bearer ${KEY}`,
    openai.calls[0].init.headers
  );
  const sentBody = JSON.parse(openai.calls[0].init.body);
  check('it names the model that answered', sentBody.model === 'deepseek/deepseek-chat-v3.1', sentBody.model);
  check('it caps the reply length', sentBody.max_tokens > 0 && sentBody.max_tokens <= 1200, sentBody.max_tokens);

  /* -------------------------------- anthropic ---------------------------- */
  const anthropic = stubFetch(() => ({ status: 200, body: { content: [{ type: 'text', text: 'ย่อแล้ว' }] } }));
  const anthropicRes = await summarizeWithProvider({
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: KEY,
    model: 'claude-sonnet-4-5',
    text: ANSWER,
    limit: 200,
    fetchImpl: anthropic,
  });
  check('an Anthropic provider answers', anthropicRes.ok && anthropicRes.summary === 'ย่อแล้ว', anthropicRes);
  check('it posts to /v1/messages', anthropic.calls[0].url === 'https://api.anthropic.com/v1/messages', anthropic.calls[0].url);
  check(
    'it uses the Anthropic headers, not a Bearer',
    anthropic.calls[0].init.headers['x-api-key'] === KEY && !anthropic.calls[0].init.headers.authorization,
    anthropic.calls[0].init.headers
  );
  check('it sends a version header', Boolean(anthropic.calls[0].init.headers['anthropic-version']));

  /* --------------------------------- google ------------------------------ */
  const google = stubFetch(() => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'สรุปให้' }] } }] } }));
  const googleRes = await summarizeWithProvider({
    provider: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKey: 'AIzaTEST',
    model: 'gemini-2.5-flash',
    text: ANSWER,
    limit: 200,
    fetchImpl: google,
  });
  check('a Google provider answers', googleRes.ok && googleRes.summary === 'สรุปให้', googleRes);
  check(
    'it calls generateContent with the key in the query',
    google.calls[0].url.includes(':generateContent?key=AIzaTEST'),
    google.calls[0].url
  );

  /* ------------------------------- failures ------------------------------ */
  const refused = stubFetch(() => ({ status: 401, body: { error: { message: `bad key ${KEY}` } } }));
  const refusedRes = await summarizeWithProvider({
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKey: KEY,
    model: 'glm-4.6',
    text: ANSWER,
    limit: 200,
    fetchImpl: refused,
  });
  check('a refused key is reported', refusedRes.ok === false && refusedRes.status === 401, refusedRes);
  check('and the key is not echoed back', !String(refusedRes.error).includes(KEY), refusedRes.error);

  const empty = stubFetch(() => ({ status: 200, body: { choices: [{ message: { content: '  ' } }] } }));
  const emptyRes = await summarizeWithProvider({
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKey: KEY,
    model: 'glm-4.6',
    text: ANSWER,
    limit: 200,
    fetchImpl: empty,
  });
  check('an empty completion is a failure, not a blank summary', emptyRes.ok === false, emptyRes);

  const offline = stubFetch(() => {
    throw new Error('ENOTFOUND');
  });
  const offlineRes = await summarizeWithProvider({
    provider: 'zai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKey: KEY,
    model: 'glm-4.6',
    text: ANSWER,
    limit: 200,
    fetchImpl: offline,
  });
  check('an unreachable provider is reported as offline', offlineRes.ok === false && offlineRes.offline === true, offlineRes);

  check(
    'no key means no call at all',
    (await summarizeWithProvider({ provider: 'zai', baseUrl: 'https://x', apiKey: '', model: 'm', text: 'x' })).ok === false
  );
  check(
    'nothing to summarize is refused',
    (await summarizeWithProvider({ provider: 'zai', baseUrl: 'https://x', apiKey: KEY, model: 'm', text: '   ' })).ok === false
  );

  console.log(failures ? `\n${failures} summarizer check(s) failed` : '\nAll summarizer checks passed.');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});