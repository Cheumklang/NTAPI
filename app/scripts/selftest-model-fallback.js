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

/* --------------------------- transient throttles --------------------------- */

// Reported from the window: a busy turn ended after a Coarena 429 that said
// "requests per minute ... try again in 21s", with no switch, no banner and no
// notice. Telling the two kinds of 429 apart is what fixes it.
const coarenaThrottle = {
  text:
    '429: {"message":"Rate limit reached for requests per minute. Limit: 10. Please try again in 21s.","type":"rate_limit_error","code":"rate_limit_exceeded"}',
  code: 'rate_limit_exceeded',
};
check('a per-minute 429 is a throttle, not a spent route', F.isTransientThrottle(coarenaThrottle));
check('a throttle is still a limit for the retry path', F.isLimitError(coarenaThrottle));
check('a bare too-many-requests answer is a throttle', F.isTransientThrottle({ text: 'Error: 429 Too Many Requests' }));
check(
  'a spent free allowance is not a throttle',
  !F.isTransientThrottle({
    text:
      '429: {"message":"Your free allowance for \':free\' models is used up. It comes back on 22 Nov 2026 at 08:56 UTC.","code":"free_tier_limit_reached"}',
    code: 'free_tier_limit_reached',
  })
);
check(
  'an exhausted quota is not a throttle',
  !F.isTransientThrottle({ text: 'You have exceeded your quota', code: 'insufficient_quota' })
);
check('a daily cap is not a throttle', !F.isTransientThrottle({ text: '429: {"code":"daily_cap"}' }));
check('a bad key is not a throttle', !F.isTransientThrottle({ text: 'Invalid API key' }));
check('an empty error is not a throttle', !F.isTransientThrottle({}));

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

/* -------------------- who actually refused the request -------------------- */
//
// A turn used to stop after one switch: the settle path blamed `session.model`
// for the failure, but that was already the route it had just switched *to*.
// So the next round retired a model that never answered, skipped a candidate,
// and ran the pool dry early. Every assistant message names its own model.

const fromMessage = (m) => {
  const failed = F.failedModelFromMessage(m);
  return failed ? F.modelKey(failed) : null;
};

check(
  'the failing message names its own route',
  fromMessage({ role: 'assistant', provider: 'free-pi', model: 'deepseek/deepseek-v4-flash' }) ===
    'free-pi/deepseek/deepseek-v4-flash'
);
check(
  'a response alias is used when model is absent',
  fromMessage({ role: 'assistant', provider: 'nvidia', responseModel: 'deepseek-ai/deepseek-v4-flash' }) ===
    'nvidia/deepseek-ai/deepseek-v4-flash'
);
check('user messages do not name a route', fromMessage({ role: 'user' }) === null);
check('a message with no provider is refused as a source', fromMessage({ role: 'assistant', model: 'x' }) === null);
check('nothing at all is safe', F.failedModelFromMessage(undefined) === null && F.failedModelFromMessage(null) === null);
check('sameModel compares route, not object identity', F.sameModel({ provider: 'zro', id: 'a' }, { provider: 'zro', id: 'a' }));
check('sameModel rejects two ids on one provider', !F.sameModel({ provider: 'zro', id: 'a' }, { provider: 'zro', id: 'b' }));

/* --------------------- walking the pool, round by round --------------------- */

// Simulate a turn: each round one route refuses, we retire *that* route and pick
// the next. Every candidate must be offered exactly once, and the walk must end.
function walk(candidates, refusedInOrder) {
  const tried = new Set();
  const visited = [];
  for (const key of refusedInOrder) {
    tried.add(key);
    const refused = candidates.find((m) => F.modelKey(m) === key) || null;
    const next = F.nextFallbackModel(candidates, { current: refused, tried });
    if (!next) return { visited, ended: true };
    visited.push(F.modelKey(next));
    tried.add(F.modelKey(next));
  }
  return { visited, ended: false };
}

const pool = F.freeDeepSeekOrder(models);
const keys = pool.map((m) => F.modelKey(m));
const full = walk(pool, keys);
check('walking the pool offers every other route once', full.visited.length === keys.length - 1, `${full.visited.length}`);
check('walking the pool never repeats a route', new Set(full.visited).size === full.visited.length);
check('the walk stops after the last route', full.ended);

// The regression: A refuses, we switch to B, B has not run yet. A settle that
// blamed the *selection* retired B and jumped to C, so B never answered.
const triedOnlyA = new Set([keys[0]]);
const shouldBeB = F.nextFallbackModel(pool, { current: pool[0], tried: triedOnlyA });
check('a route that was only selected stays a candidate', shouldBeB && F.modelKey(shouldBeB) === keys[1]);

// The real walk, as runModelFallback performs it: retire only the route that
// just answered with a limit error, switch, continue. Every route must get one
// turn at the wheel and the walk must stop on its own.
const retired = new Set();
let on = pool[0];
const wheel = [F.modelKey(on)];
for (let guard = 0; guard < 20; guard += 1) {
  retired.add(F.modelKey(on));
  const next = F.nextFallbackModel(pool, { current: on, tried: retired });
  if (!next) break;
  on = next;
  wheel.push(F.modelKey(on));
}
check('the walk gives every free route a turn', wheel.length === keys.length, `${wheel.length}/${keys.length}`);
check('the walk repeats nobody', new Set(wheel).size === wheel.length);
check('the walk ends instead of circling', F.nextFallbackModel(pool, { tried: retired }) === null);

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
// The comment above this branch grew; measure to the next case rather than to a
// fixed offset, so a longer explanation cannot fail a check that is still true.
const retryEnd = main.indexOf("case 'compaction_start'", retryAt);
const retryWindow = retryAt === -1 ? '' : main.slice(retryAt, retryEnd === -1 ? retryAt + 2400 : retryEnd);
check('a limit error switches before the generic retry', retryWindow.includes('isLimitError('));
check(
  'a short throttle is left to pi backoff instead of cancelling it',
  retryWindow.includes('!isTransientThrottle(') &&
    retryWindow.indexOf('!isTransientThrottle(') < retryWindow.indexOf('session?.abortRetry')
);
check('a throttle still reaches the retry notice', retryWindow.includes("key: 'notice.retrying'"));

const dropAt = main.indexOf('dropFailedAssistant(tab);');
// Continuing moved into resumeAgentTurn(), which is where the "already processing"
// recovery lives; the order that matters is drop first, then resume.
const continueAt = main.indexOf('await resumeAgentTurn(tab);', dropAt);
check(
  'the failed turn is dropped before continuing',
  dropAt !== -1 && continueAt !== -1 && continueAt > dropAt && continueAt - dropAt < 600
);
check('a spent pool is announced once', main.includes('announceFallbackExhausted(tabId, tab)'));

const settleWindow = main.slice(main.indexOf('async function runModelFallback'), main.indexOf('async function runEmptyAnswerRetry'));
check('the settle path blames the failed message', settleWindow.includes('failedModelFromMessage(last)'));
check('the settle path no longer blames the current selection', !settleWindow.includes('switchToNextFreeModel(tabId, tab);'));
// `tab.fallback` is null until something creates it; reading the field directly
// skipped the very first limit failure of every prompt — silently.
check(
  'a fresh prompt creates the fallback pool before reading it',
  settleWindow.includes('const state = fallbackState(tab);') && !settleWindow.includes('const state = tab.fallback;')
);
check(
  'a short throttle never burns a free route',
  /const reason = [\s\S]{0,200}?isTransientThrottle\(\{ text: reason \}\)/.test(settleWindow)
);
check(
  'a failed turn that was never reported is announced at settle',
  /function announceIfUnreported\(tabId, tab\)/.test(main) && main.includes('announceIfUnreported(tabId, tab)')
);
check(
  'a reported failure is remembered per prompt',
  /tab\.lastError = \{ key: dedupe, at: now, seq: tab\.promptSeq \|\| 0 \}/.test(main)
);

const retryWindow2 = main.slice(main.indexOf("case 'auto_retry_start'"), main.indexOf("case 'compaction_start'"));
check('the retry path does not switch: a retry reuses the run-time model', !retryWindow2.includes('switchToNextFreeModel('));
check('the retry path cancels the pointless backoff', retryWindow2.includes('abortRetry'));
check('the abort is repeated after pi creates its controller', retryWindow2.includes('queueMicrotask(stop)'));
check('the retry path leaves exhaustion to the settle path', !retryWindow2.includes('announceFallbackExhausted'));
check('a selected route is not retired before it answers', !main.includes('state.tried.add(modelKey(next))'));
check('a new user message resets the pool', main.includes('tab.fallback = null;'));

/* ------------------- the turn must never end in silence -------------------- */

// The abort this process sends to skip a pointless backoff makes pi report the
// turn as aborted, and "aborted" is deliberately not a limit error — so the rule
// "only continue an un-aborted turn" dropped exactly the turn it had to rescue.
check(
  'an aborted settle still finishes a turn we aborted ourselves',
  /const ownAbort =[\s\S]{0,200}?limitFailure[\s\S]{0,200}?if \(!event\.aborted \|\| ownAbort\)/.test(main),
);
check(
  'the limit is remembered when the retry is cancelled',
  /case 'auto_retry_start'[\s\S]{0,2200}?tab\.limitFailure = \{ seq: tab\.promptSeq \|\| 0/.test(main),
);
check(
  'the limit is remembered when the turn ends on it',
  /case 'message_end'[\s\S]{0,900}?tab\.limitFailure = \{ seq: tab\.promptSeq \|\| 0/.test(main),
);
check('a user Stop is not a spent allowance', /prompt:abort[\s\S]{0,1400}?tab\.limitFailure = null;/.test(main));
check(
  'the settle path accepts an aborted turn when the limit was ours',
  /if \(last\.stopReason !== 'error' && last\.stopReason !== 'aborted'\) return;/.test(main) &&
    /const limit = tab\.limitFailure && tab\.limitFailure\.seq === \(tab\.promptSeq \|\| 0\);/.test(settleWindow) &&
    /if \(!limit && !isLimitError\(\{ text: last\.errorMessage \}\)\) return;/.test(settleWindow),
);
check(
  'continuing the turn survives "agent is already processing"',
  /async function resumeAgentTurn\(tab\)/.test(main) &&
    /already processing/.test(main) &&
    /await resumeAgentTurn\(tab\);/.test(settleWindow) &&
    !/await tab\.handle\.session\.agent\.continue\(\);/.test(main),
);
check(
  'the resumed turn waits for the aborted run to let go first',
  /async function resumeAgentTurn\(tab\)[\s\S]{0,700}?session\.isStreaming[\s\S]{0,300}?await session\.abort\(\)/.test(main),
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: fallback picks only free DeepSeek routes, top down');
