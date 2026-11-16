/**
 * Coarena's free tier, as its own refusals describe it.
 *
 * The catalog cannot be trusted for free/paid: `GET /models` prices every route
 * `0/0`, Claude included, and a free key then answers 402 `payment_required`.
 * These checks pin the three things that fix depends on:
 *   1. the refusal becomes a translatable sentence, not raw JSON,
 *   2. the free-tier names inside it are read out, and
 *   3. rows outside that list stop being advertised as free.
 *
 * Offline: the catalog is a fixture, no key and no network.
 */
'use strict';

const {
  COARENA_HINTS,
  parseFreeTierModels,
  friendlyProviderError,
} = require('../src/provider-errors');
const { MESSAGES } = require('../src/error-messages');
const {
  fetchCoarenaModels,
  resetCoarenaModelCache,
  retagModels,
  setCoarenaFreeTier,
  coarenaModelEntries,
} = require('../src/coarena');

let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

/** The exact body a free key got for Claude Sonnet 5.5 on 2026-11-16. */
const SONNET_402 =
  '402: {"message":"Claude Sonnet 5.5 is not part of the free tier. Free accounts can use ' +
  'GPT-6 Luna, Gemini 3.8 Flash and DeepSeek V4.1 Flash 1017. Add credits to use every ' +
  'model: https://coarena.ai/account/api/billing","type":"insufficient_quota",' +
  '"param":"model","code":"payment_required"}';

/** Two routes: one the free tier serves, one it refuses. */
const CATALOG = {
  data: [
    {
      id: 'claude-sonnet-5-5',
      display_name: 'Claude Sonnet 5.5',
      owned_by: 'anthropic',
      context_length: 128000,
      max_completion_tokens: 16384,
      pricing: { prompt: '0', completion: '0' },
      capabilities: { vision: true },
    },
    {
      id: 'gpt-6-luna',
      display_name: 'GPT-6 Luna',
      owned_by: 'openai',
      context_length: 128000,
      max_completion_tokens: 16384,
      pricing: { prompt: '0', completion: '0' },
      capabilities: { vision: true },
    },
  ],
};

function fakeCatalog() {
  return async () => ({ ok: true, status: 200, json: async () => CATALOG });
}

(async () => {
  /* ---------------------- what the refusal lists ---------------------- */
  const names = parseFreeTierModels(JSON.parse(SONNET_402.slice(4)).message);
  check(
    'the free-tier names come out of the refusal',
    names.length === 3 && names[0] === 'GPT-6 Luna' && names[2] === 'DeepSeek V4.1 Flash 1017',
    JSON.stringify(names)
  );
  check('an unfamiliar sentence lists nothing', parseFreeTierModels('Nope. Try later.').length === 0);

  /* -------------------- what the window shows ------------------------- */
  const friendly = friendlyProviderError(SONNET_402, { provider: 'coarena' });
  check(
    'a payment_required 402 is not described as a daily quota',
    friendly.key === 'coarena.model_not_free',
    `key=${friendly.key} text=${friendly.text}`
  );
  check(
    'the sentence is the one the translations carry',
    friendly.text === `${MESSAGES['coarena.model_not_free'].en} (HTTP 402 · payment_required)`,
    friendly.text
  );
  check(
    'no raw JSON reaches the chat window',
    !friendly.text.includes('{"message"') && !friendly.text.includes('insufficient_quota'),
    friendly.text
  );
  check(
    'Thai copy exists for it',
    MESSAGES['coarena.model_not_free'].th.includes('แพ็กฟรี'),
    MESSAGES['coarena.model_not_free'].th
  );
  check(
    'the refusal hands the free-tier names to the caller',
    friendly.freeModels.length === 3,
    JSON.stringify(friendly.freeModels)
  );
  check(
    'a JSON body with no readable sentence never leaks through',
    !friendlyProviderError('500: {"error":{"code":"x"}}', { provider: 'coarena' }).text.includes('{'),
    friendlyProviderError('500: {"error":{"code":"x"}}', { provider: 'coarena' }).text
  );
  check(
    'a bare 402 still means the daily quota',
    friendlyProviderError('402: {"message":"Daily limit reached","code":"insufficient_quota"}', {
      provider: 'coarena',
    }).key === 'coarena.insufficient_quota'
  );

  /* ------------------------ the picker's labels ----------------------- */
  resetCoarenaModelCache();
  setCoarenaFreeTier([]);
  const before = await fetchCoarenaModels({ fetchImpl: fakeCatalog(), force: true });
  const claudeBefore = before.models.find((m) => m.id === 'claude-sonnet-5-5');
  check(
    'without anything learned the catalog prices Claude as free',
    claudeBefore.plan === 'free',
    claudeBefore.plan
  );

  resetCoarenaModelCache();
  setCoarenaFreeTier(['GPT-6 Luna']);
  const after = await fetchCoarenaModels({ fetchImpl: fakeCatalog(), force: true });
  const claude = after.models.find((m) => m.id === 'claude-sonnet-5-5');
  const luna = after.models.find((m) => m.id === 'gpt-6-luna');
  check('a refused route is labelled paid once the tier is known', claude.plan === 'paid', claude.plan);
  check('and it says "credit" rather than a $0 price', claude.planNote === 'credit', claude.planNote);
  check('a free-tier route stays free', luna.plan === 'free' && luna.planNote === '', luna.plan);

  const flipped = retagModels([{ ...claude, plan: 'free', planNote: '' }]);
  check(
    'an already-cached catalogue can be re-labelled without a refetch',
    flipped[0].plan === 'paid' && flipped[0].planNote === 'credit',
    JSON.stringify(flipped[0])
  );

  const entries = coarenaModelEntries([claude, luna]);
  check(
    'the dropdown entries carry the corrected tag',
    entries[0].plan === 'paid' && entries[1].plan === 'free',
    JSON.stringify(entries.map((e) => [e.id, e.plan]))
  );

  check(
    'clearing the tier list forgets it (a later refusal may differ)',
    setCoarenaFreeTier([]).names.length === 0,
    'names should be empty'
  );
  check('the hint text has no bare price claim for a refused route', !/USD|\\$/.test(COARENA_HINTS.payment_required));

  if (failed) {
    console.error(`\nFAIL: ${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: coarena free tier');
})();
