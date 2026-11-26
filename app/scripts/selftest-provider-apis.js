/**
 * Providers other than the one being talked to, and the rules that keep them safe.
 *
 * The table in `src/provider-apis.js` is what lets a model make a picture with
 * Grok or a voice line with Gemini. Two things must never be true of it: a model
 * naming its own URL, and a call going out for a provider the user has not
 * allowed. Neither is visible by reading a request log, so they are pinned here.
 *
 * Run from app/:   node scripts/selftest-provider-apis.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PROVIDER_APIS, listAccess, describeForTool, callProvider, saveOutput, wavFromPcm } = require('../src/provider-apis');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/** A fetch stand-in: records calls and answers with one canned response. */
function fakeFetch(responder) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const answer = await responder(String(url), init);
    return {
      ok: answer.status ? answer.status < 400 : true,
      status: answer.status || 200,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? answer.contentType || 'application/json' : '') },
      arrayBuffer: async () => Buffer.from(answer.body ?? (answer.json ? JSON.stringify(answer.json) : '')),
    };
  };
  impl.calls = calls;
  return impl;
}

async function main() {
  /* ---- the table itself ---- */
  const providers = Object.keys(PROVIDER_APIS);
  check('table: there is more than one provider', providers.length >= 2, providers.join(','));
  let incomplete = [];
  for (const [id, api] of Object.entries(PROVIDER_APIS)) {
    if (!api.baseUrl || !api.label || typeof api.headers !== 'function') incomplete.push(`${id}:provider`);
    for (const [capId, cap] of Object.entries(api.capabilities)) {
      const ok =
        /^(POST|GET)$/.test(cap.method) &&
        String(cap.path || '').startsWith('/') &&
        cap.summary &&
        cap.cost &&
        cap.params?.type === 'object' &&
        typeof cap.body === 'function' &&
        typeof cap.parse === 'function';
      if (!ok) incomplete.push(`${id}.${capId}`);
    }
  }
  check('table: every capability can be described, priced and called', incomplete.length === 0, incomplete.join(','));
  check(
    'table: no capability lets the model name its own URL',
    Object.values(PROVIDER_APIS).every((api) =>
      Object.values(api.capabilities).every((cap) => !/^https?:/i.test(cap.path) && !cap.path.includes('..'))
    )
  );

  /* ---- permission ---- */
  const allKeys = Object.fromEntries(providers.map((id) => [id, 'key-for-' + id]));
  check('access: nothing is offered until the user turns it on', listAccess({ access: {}, keys: allKeys }).length === 0);
  const onOne = listAccess({ access: { grok: 'on' }, keys: allKeys });
  check('access: an allowed provider is offered', onOne.length === 1 && onOne[0].provider === 'grok');
  check('access: a provider with no key is not offered', listAccess({ access: { grok: 'on' }, keys: {} }).length === 0);
  check(
    'access: the tool description names allowed providers only',
    describeForTool(onOne).includes('Grok') && !describeForTool(onOne).includes('Gemini')
  );

  /* ---- refusals never reach the network ---- */
  let calls = 0;
  const neverFetch = async () => {
    calls += 1;
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, arrayBuffer: async () => Buffer.from('{}') };
  };
  const noKey = await callProvider({ provider: 'grok', capability: 'image.generate', params: { prompt: 'x' }, apiKey: '', fetchImpl: neverFetch });
  check('call: no key means no request', noKey.ok === false && calls === 0, JSON.stringify(noKey));
  const badCap = await callProvider({ provider: 'grok', capability: 'teleport', params: {}, apiKey: 'k', fetchImpl: neverFetch });
  check('call: an unknown capability is refused', badCap.ok === false && calls === 0);

  /* ---- a picture, end to end, without the network ---- */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-papis-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  const fetchImages = fakeFetch((url) => {
    if (url.startsWith('https://imgen.example/')) return { body: png, contentType: 'image/png' };
    return { json: { data: [{ url: 'https://imgen.example/a.png', mime_type: 'image/png' }] } };
  });
  const made = await callProvider({
    provider: 'grok',
    capability: 'image.generate',
    params: { prompt: 'แมวสีส้มบน roofs/../etc', n: 1 },
    apiKey: 'secret-key',
    cwd: dir,
    fetchImpl: fetchImages,
  });
  check('call: a generated picture comes back as a saved path', made.ok && made.files.length === 1, JSON.stringify(made));
  const savedPath = made.files?.[0] || '';
  check('call: the file is under the project folder', savedPath.startsWith(path.join(dir, 'generated') + path.sep), savedPath);
  check('call: the file really exists and has the bytes', fs.existsSync(savedPath) && fs.readFileSync(savedPath).equals(png));
  check(
    'call: the request went to the provider endpoint with the key in a header',
    fetchImages.calls[0].url === 'https://api.x.ai/v1/images/generations' &&
      fetchImages.calls[0].init.headers.Authorization === 'Bearer secret-key',
    fetchImages.calls[0]?.url
  );
  check('call: the key is never echoed back', !JSON.stringify(made).includes('secret-key'));

  /* ---- a provider failure is a sentence, not a thrown turn ---- */
  const failing = fakeFetch(() => ({ status: 403, json: { error: { message: 'no credit on this team' } } }));
  // The model has to suit the capability: Gemini refuses a retired name and a
  // speech model cannot read a picture (2026-11-26, found with a real key).
  check('gemini model per capability', PROVIDER_APIS.google.capabilities['audio.speech'].model === 'gemini-2.5-flash-preview-tts');
  // A bare transcript made the TTS model answer in text (HTTP 400); the request
  // has to tell it to speak (2026-11-26, found with a real key).
  const ttsBody = PROVIDER_APIS.google.capabilities['audio.speech'].body({ text: 'hello' }).json;
  const spokenBody = ttsBody.contents[0].parts[0].text;
  check('gemini tts asks the model to read, not to answer', /Read this aloud/i.test(spokenBody) && spokenBody.includes('hello'));
  check('gemini tts keeps the audio modality', ttsBody.generationConfig.responseModalities.includes('AUDIO'));
  check(
    'the picture reader is not sent to a speech model',
    /-flash$/.test(PROVIDER_APIS.google.capabilities['media.analyze'].model || '')
  );
  fs.writeFileSync(path.join(dir, 'a.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const geminiUrl = [];
  await callProvider({
    provider: 'google',
    capability: 'media.analyze',
    params: { files: ['a.png'], prompt: 'what is this' },
    apiKey: 'g-key',
    cwd: dir,
    fetchImpl: fakeFetch((url) => {
      geminiUrl.push(url);
      return { json: { candidates: [{ content: { parts: [{ text: 'a cat' }] } }] } };
    }),
  });
  check(
    'the capability model reaches the request url',
    String(geminiUrl[0] || '').includes(PROVIDER_APIS.google.capabilities['media.analyze'].model),
    geminiUrl[0]
  );
  const refused = await callProvider({
    provider: 'grok',
    capability: 'audio.speech',
    params: { text: 'hi' },
    apiKey: 'k',
    cwd: dir,
    fetchImpl: failing,
  });
  check('call: a refusal carries the vendor sentence', refused.ok === false && /no credit/.test(refused.error), refused.error);

  /* ---- an unreadable answer is reported, not crashed ---- */
  const weird = fakeFetch(() => ({ json: { data: 'nonsense' } }));
  const odd = await callProvider({
    provider: 'grok',
    capability: 'image.generate',
    params: { prompt: 'x' },
    apiKey: 'k',
    cwd: dir,
    fetchImpl: weird,
  });
  check('call: an empty answer says so', odd.ok === false && /nothing usable/.test(odd.error), odd.error);

  /* ---- Gemini audio becomes a wav ---- */
  const pcm = Buffer.alloc(480, 8);
  const gemini = fakeFetch(() => ({
    json: {
      candidates: [
        { content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } }] } },
      ],
    },
  }));
  const spoken = await callProvider({
    provider: 'google',
    capability: 'audio.speech',
    params: { text: 'สวัสดี' },
    apiKey: 'gk',
    cwd: dir,
    fetchImpl: gemini,
  });
  check('call: gemini speech is saved as a playable wav', spoken.ok && /\.wav$/.test(spoken.files[0] || ''), JSON.stringify(spoken));
  check('call: gemini asks for audio back', /AUDIO/.test(gemini.calls[0]?.init?.body || ''));
  const wav = wavFromPcm(pcm, 24000);
  check('call: the wav header is well formed', wav.subarray(0, 4).toString() === 'RIFF' && wav.readUInt32LE(24) === 24000);

  /* ---- media analysis: an outside path is refused ---- */
  const inlineCall = await callProvider({
    provider: 'google',
    capability: 'media.analyze',
    params: { files: ['../../etc/passwd'], prompt: 'what is this' },
    apiKey: 'gk',
    cwd: dir,
    fetchImpl: neverFetch,
  });
  check('call: a file outside the project is refused', inlineCall.ok === false && /inside the project/.test(inlineCall.error));

  /* ---- saving cannot walk out of the folder ---- */
  const escaped = saveOutput(path.join(dir, 'generated'), '../../evil.jpg', Buffer.from('x'));
  check('files: a hostile name still lands inside the folder', escaped.startsWith(path.join(dir, 'generated') + path.sep), escaped);

  /* ---- the tool wiring, read from the two sources ---- */
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'src', 'freepi-bridge.js'), 'utf8');
  check('tool: the extension is registered with the session', /providerApiExtension/.test(bridge));
  check('tool: the provider list comes from the table', /listAccess\(/.test(bridge));
  check('tool: the call is made through callProvider', /callProvider\(/.test(bridge));
  check('tool: the user is asked before anything is spent', /await askUser\(/.test(bridge));

  check(
    'tool: every provider with a key is offered, not a fixed list',
    /listAccess\(\{ access: true, keys: providerApiKeys \}\)/.test(bridge)
  );
  check(
    'consent: the dialog offers allow once, allow all and cancel',
    /label: 'ยินยอม'/.test(bridge) && /label: 'ยินยอมทั้งหมด'/.test(bridge) && /label: 'ยกเลิก'/.test(bridge)
  );
  check(
    'consent: each answer carries a tone for styling',
    /tone: 'ok'/.test(bridge) && /tone: 'all'/.test(bridge) && /tone: 'cancel'/.test(bridge)
  );
  check('consent: "allow all" is remembered for this session', /providerApiAllowedAll = true/.test(bridge));
  check('consent: the session flag starts closed', /let providerApiAllowedAll = false/.test(bridge));
  check('consent: cancel is recognised in either language', /ยกเลิก\|cancel\|deny/.test(bridge));

  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  check('ui: the settings switch is gone', !/providerApiSet|providerApiStatus/.test(app + html));
  // A removed function must leave no call site behind: a dangling
  // paintProviderApiSettings() blanked the Settings tab with a ReferenceError.
  check('ui: no call site of the removed painter survives', !/ProviderApi|providerApi[A-Z]/.test(app + html));
  check(
    'ui: the question leads with one bold line and greys the fine print',
    /question-lead/.test(app) && /question-note/.test(app) && /\.question-lead \{/.test(css) && /\.question-note \{/.test(css)
  );
  check('ui: the free-text box is hidden when the answer is a button', /options-only/.test(app) && /#questionOverlay\.options-only .dialog-actions/.test(css));
  check(
    'ui: the consent dialog is the app dialog, rendered from the same options',
    /questionOverlay/.test(html) && /questionOptions/.test(html)
  );

  fs.rmSync(dir, { recursive: true, force: true });

  if (failed) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll provider-api checks passed.');
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
