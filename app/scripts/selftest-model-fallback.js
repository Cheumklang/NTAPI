/**
 * Offline check for src/model-fallback.js — no Electron, no network.
 * Run: node scripts/selftest-model-fallback.js
 */
'use strict';

const F = require('../src/model-fallback');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

/* ------------------------------ limit errors ------------------------------ */

check('429 free tier body counts as a limit', F.isLimitError({ text: 'HTTP 429 · free_tier_limit_reached' }));
check('bare 429 counts as a limit', F.isLimitError({ text: 'Error: 429 Too Many Requests' }));
check('rate_limit code counts as a limit', F.isLimitError({ code: 'rate_limit', text: 'slow down' }));
check('insufficient_quota code counts as a limit', F.isLimitError({ code: 'insufficient_quota' }));
check('quota exceeded text counts as a limit', F.isLimitError({ text: 'You have exceeded your quota' }));
check('used-up allowance text counts as a limit', F.isLimitError({ text: 'You have used up your daily allowance' }));

check('bad key is not a limit', !F.isLimitError({ text: 'Invalid API key', code: 'invalid_api_key' }));
check('401 is not a limit', !F.isLimitError({ text: 'HTTP 401 unauthorized' }));
check('network failure is not a limit', !F.isLimitError({ text: 'fetch failed' }));
check('context overflow is not a limit', !F.isLimitError({ text: 'maximum context length exceeded' }));
check('user abort is not a limit', !F.isLimitError({ text: 'cancelled by the user' }));
check('unknown model is not a limit', !F.isLimitError({ text: 'model_not_found: gpt-9' }));
check('empty error is not a limit', !F.isLimitError({}));
check(
  'a limit word inside a bad-key error stays a bad key',
  !F.isLimitError({ text: 'invalid api key: quota check failed' })
);

/* --------------------------- candidate ordering --------------------------- */

const models = [
  { provider: 'free-pi', id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', plan: 'free' },
  { provider: 'free-pi', id: 'gpt-oss-120b', name: 'GPT OSS', plan: 'free' },
  { provider: 'coarena', id: 'deepseek-v4-1-flash-1017', name: 'DeepSeek V4.1 Flash', plan: 'free' },
  { provider: 'coarena', id: 'deepseek-paid', name: 'DeepSeek Paid', plan: 'paid' },
  { provider: 'zro', id: 'deepseek-r1', name: 'DeepSeek R1', plan: 'free' },
  { provider: 'nvidia', id: 'deepseek-ai/deepseek-v4-flash', name: 'DeepSeek V4 Flash', plan: 'free' },
  { provider: 'llm7', id: 'DeepSeek-V4-Flash-0731', name: 'DeepSeek V4 Flash', plan: 'free' },
  { provider: 'coarena', id: 'deepseek-v4-1-flash-1017', name: 'duplicate', plan: 'free' },
];

const order = F.freeDeepSeekOrder(models);
check('only free DeepSeek routes are candidates', order.length === 5, `got ${order.length}`);
check('paid DeepSeek is excluded', !order.some((m) => m.plan === 'paid'));
check('non-DeepSeek is excluded', !order.some((m) => /gpt/i.test(m.id)));
check('duplicates collapse', order.filter((m) => m.id === 'deepseek-v4-1-flash-1017').length === 1);
check(
  'order follows the picker, top down',
  order.map((m) => `${m.provider}/${m.id}`).join(',') ===
    [
      'free-pi/deepseek/deepseek-v4-flash',
      'coarena/deepseek-v4-1-flash-1017',
      'zro/deepseek-r1',
      'nvidia/deepseek-ai/deepseek-v4-flash',
      'llm7/DeepSeek-V4-Flash-0731',
    ].join(',')
);

const first = F.nextFallbackModel(models, { current: models[0] });
check('the failing model is skipped', first && first.provider === 'coarena', first && first.provider);

const afterTwo = F.nextFallbackModel(models, {
  current: models[0],
  tried: ['coarena/deepseek-v4-1-flash-1017'],
});
check('models already tried are skipped', afterTwo && afterTwo.provider === 'zro', afterTwo && afterTwo.provider);

const allTried = F.nextFallbackModel(models, {
  tried: order.map((m) => F.modelKey(m)),
});
check('a spent pool returns null', allTried === null);

check('empty catalog returns null', F.nextFallbackModel(null) === null && F.nextFallbackModel([]) === null);

/* ------------------------------- wording ------------------------------- */

const dead = F.exhaustedMessage(5);
check('exhausted message says what to do', /used up/i.test(dead) && /wait/i.test(dead) && /reset/i.test(dead));
check('switch message names both models', /DeepSeek/.test(F.switchMessage({ name: 'DeepSeek A' }, { name: 'DeepSeek B' })));

/* ------------------------------ wiring ------------------------------ */

// The module is only useful if the app actually calls it at the right moments.
// String checks, not regexes: this is about presence and order, not syntax.
const fs = require('node:fs');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

check('main requires the fallback module', main.includes("require('./model-fallback')"));
check('a settled turn runs the fallback', main.includes('runModelFallback(tabId, tab)'));

const retryAt = main.indexOf("case 'auto_retry_start'");
const retryWindow = retryAt === -1 ? '' : main.slice(retryAt, retryAt + 900);
check('a limit error switches before the generic retry', retryWindow.includes('isLimitError('));

const dropAt = main.indexOf('dropFailedAssistant(tab);');
const continueAt = main.indexOf('agent.continue()', dropAt);
check(
  'the failed turn is dropped before continuing',
  dropAt !== -1 && continueAt !== -1 && continueAt > dropAt && continueAt - dropAt < 600
);
check('a spent pool is announced once', main.includes('announceFallbackExhausted(tabId, tab)'));
check('a new user message resets the pool', main.includes('tab.fallback = null;'));

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: fallback picks only free DeepSeek routes, top down');
