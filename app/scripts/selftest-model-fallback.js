/**
 * Offline check for src/model-fallback.js — no Electron, no network.
 * Run: node scripts/selftest-model-fallback.js
 *
 * The module no longer switches models: that behaviour was removed because a
 * model changing under the user mid-conversation was confusing. What remains is
 * the reading part (is this a limit? a throttle?) and the memory of a failure
 * pi drops from its own projection. The wiring checks below make sure the app
 * really kept it that way.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
check(
  'the reported free-pi hourly ceiling counts as a limit',
  F.isLimitError({
    text:
      '429: {"message":"This account hit its hourly limit; try again after it resets. free-pi is free because ads pay for it, so ads can\'t be skipped.","code":"hourly_ceiling","type":"free_pi_error"}',
  })
);

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

// A busy turn once ended after a Coarena 429 that said "requests per minute ...
// try again in 21s", with no banner and no notice. Telling the two kinds of 429
// apart is what lets a short throttle be left to pi's own backoff.
const coarenaThrottle = {
  text:
    '429: {"message":"Rate limit reached for requests per minute. Limit: 10. Please try again in 21s.","type":"rate_limit_error","code":"rate_limit_exceeded"}',
  code: 'rate_limit_exceeded',
};
check('a per-minute 429 is a throttle, not a spent route', F.isTransientThrottle(coarenaThrottle));
check('a throttle is still a limit for reporting', F.isLimitError(coarenaThrottle));
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
  'the reported hourly ceiling is not a throttle',
  !F.isTransientThrottle({
    text:
      '429: {"message":"This account hit its hourly limit; try again after it resets.","code":"hourly_ceiling","type":"free_pi_error"}',
  })
);
check(
  'an exhausted quota is not a throttle',
  !F.isTransientThrottle({ text: 'You have exceeded your quota', code: 'insufficient_quota' })
);
check('a daily cap is not a throttle', !F.isTransientThrottle({ text: '429: {"code":"daily_cap"}' }));
check('a bad key is not a throttle', !F.isTransientThrottle({ text: 'Invalid API key' }));
check('an empty error is not a throttle', !F.isTransientThrottle({}));

/* --------------- the failure pi removes from the projection --------------- */
//
// Reported from the window: free-pi answered the first prompt, then the next one
// went completely silent — no reply, no banner, no notice. The session file had
// the 429 `hourly_ceiling`, and the SDK had dropped that attempt from its model
// projection because it scheduled a retry. Cancelling the retry settles the run
// with the list ending on the user's message, so "last message is an error" was
// false and every settle-time reader gave up.

const hourlyCeiling =
  '429: {"message":"This account hit its hourly limit; try again after it resets.","code":"hourly_ceiling","type":"free_pi_error"}';
const onlyUserTurn = [{ role: 'user', content: [{ type: 'text', text: 'ทำงานที่ค้างก่อนคับ' }] }];
const remembered = { seq: 7, text: hourlyCeiling, provider: 'free-pi', model: 'deepseek-v4.1-flash' };

const dropped = F.turnFailure({ messages: onlyUserTurn, limitFailure: remembered, seq: 7 });
check('a failure the projection already dropped is still known', dropped && dropped.text === hourlyCeiling);
check('the dropped failure still names its route', dropped && dropped.provider === 'free-pi' && dropped.model === 'deepseek-v4.1-flash');
check(
  'a failure from an older prompt is not reused',
  F.turnFailure({ messages: onlyUserTurn, limitFailure: remembered, seq: 8 }) === null
);
check('a healthy turn has no failure', F.turnFailure({ messages: [{ role: 'assistant', stopReason: 'stop' }], seq: 7 }) === null);
check('no messages and no memory is safe', F.turnFailure({}) === null && F.turnFailure(undefined) === null);

const stillThere = F.turnFailure({
  messages: [{ role: 'assistant', stopReason: 'error', errorMessage: 'boom', provider: 'zro', model: 'deepseek-r1' }],
  limitFailure: remembered,
  seq: 7,
});
check('an error still in the list is read from the list', stillThere && stillThere.text === 'boom');
check('the list names the route it carries', stillThere && stillThere.provider === 'zro' && stillThere.model === 'deepseek-r1');

/* ------------------ nothing switches models on its own ------------------ */

check('the switcher is gone from the module', !('nextFallbackModel' in F));
check('the ordering helper is gone from the module', !('freeDeepSeekOrder' in F));
check('the switch announcement is gone from the module', !('switchMessage' in F));
check('the "who refused" helper is gone from the module', !('failedModelFromMessage' in F));
check('the exhausted wording is gone from the module', !('exhaustedMessage' in F));

const srcDir = path.join(__dirname, '..', 'src');
const read = (...parts) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8');
const main = read('main.js');
const preload = read('preload.js');
const renderer = read('renderer', 'app.js');
const messages = read('error-messages.js');

check('main requires the module', main.includes("require('./model-fallback')"));
for (const gone of [
  'runModelFallback',
  'switchToNextFreeModel',
  'fallbackState',
  'announceFallbackExhausted',
  'resumeAgentTurn',
  'dropFailedAssistant',
  'nextFallbackModel',
  'switchMessage',
  'failedModelFromMessage',
]) {
  check(`main no longer mentions ${gone}`, !main.includes(gone));
}
// `tab.fallbackName` is the remembered chat name, not a pool; check the field
// itself and its members rather than the shared prefix.
check(
  'main no longer keeps a fallback pool on the tab',
  !/tab\.fallback\s*=/.test(main) && !/tab\.fallback\?\./.test(main) && !/tab\.fallback\./.test(main)
);
// The LLM7 empty-answer recovery (retry once, then move to a non-reasoning
// model) is gone too: an empty answer is reported and the user decides.
check(
  'the empty-answer recovery is gone',
  !/function runEmptyAnswerRetry|function planEmptyAnswerRetry|nextRecoveryMove/.test(main)
);
check(
  'no tab field is kept for an automatic retry',
  !/tab\.emptyAnswer|tab\.emptyRetryCount|tab\.lastPromptText/.test(main)
);
check(
  'an empty answer is reported, not retried',
  main.includes('announceEmptyAnswer(tabId)') && main.includes("key: 'noticeReasoningOverflow'")
);
check('an empty answer never changes the model', !main.includes("setModel('llm7'"));
check('no tab is moved to another model', !/setModel\(next\.provider/.test(main));
check('the fallback channel is gone from main', !main.includes('agent:fallback'));
check('the fallback channel is gone from preload', !preload.includes('onFallback') && !preload.includes('agent:fallback'));
check('the renderer no longer listens for a fallback', !renderer.includes('onFallback') && !renderer.includes('agent:fallback'));
check('the switch notice is gone from the wording', !messages.includes("'notice.switched'"));
check('the exhausted banner is gone from the wording', !messages.includes("'fallback.exhausted'"));

/* ---------------------------- still wired ---------------------------- */

// The announcer takes the failure the settle path already worked out, so the
// same record is not derived twice from a list pi may have rewritten in between.
check(
  'a failed turn that was never reported is announced at settle',
  /function announceIfUnreported\(tabId, tab(?:, knownFailure)?\)/.test(main) &&
    /announceIfUnreported\(tabId, tab(?:, failure)?\)/.test(main)
);
check(
  'the settle-time announcer uses the remembered failure',
  /function announceIfUnreported\(tabId, tab[\s\S]{0,600}?turnFailure\(/.test(main)
);
check(
  'a dropped failure stays visible after a repaint',
  (() => {
    const at = main.indexOf('function tabState(tabId)');
    const end = main.indexOf('/** Ads and the usage meter belong to FreePi models only. */', at);
    const window = at === -1 ? '' : main.slice(at, end === -1 ? at + 2600 : end);
    return window.includes('turnFailure(') && window.includes("kind: 'error'");
  })()
);
check(
  'a reported failure is remembered per prompt',
  /tab\.lastError = \{ key: dedupe, at: now, seq: tab\.promptSeq \|\| 0 \}/.test(main)
);

const retryAt = main.indexOf("case 'auto_retry_start'");
const retryEnd = main.indexOf("case 'compaction_start'", retryAt);
const retryWindow = retryAt === -1 ? '' : main.slice(retryAt, retryEnd === -1 ? retryAt + 2400 : retryEnd);
check('a spent limit still skips the pointless backoff', retryWindow.includes('abortRetry'));
check('the abort is repeated after pi creates its controller', retryWindow.includes('queueMicrotask(stop)'));
check(
  'a short throttle is still left to pi backoff',
  retryWindow.includes('!isTransientThrottle(') &&
    retryWindow.indexOf('!isTransientThrottle(') < retryWindow.indexOf('session?.abortRetry')
);
check('a throttle still reaches the retry notice', retryWindow.includes("key: 'notice.retrying'"));
check(
  'the limit is remembered when the retry is cancelled',
  /case 'auto_retry_start'[\s\S]{0,2400}?tab\.limitFailure = \{[\s\S]{0,90}?seq: tab\.promptSeq \|\| 0/.test(main)
);
check(
  'the remembered limit carries the route that refused',
  /tab\.limitFailure = \{[\s\S]{0,200}?provider:[\s\S]{0,100}?model:/.test(main)
);
check(
  'the limit is remembered when the turn ends on it',
  /case 'message_end'[\s\S]{0,900}?tab\.limitFailure = \{[\s\S]{0,120}?seq: tab\.promptSeq \|\| 0/.test(main)
);
check('a user Stop is not a spent allowance', /prompt:abort[\s\S]{0,1400}?tab\.limitFailure = null;/.test(main));
check(
  'an aborted settle still reports a turn we aborted ourselves',
  /const ownAbort =[\s\S]{0,200}?limitFailure[\s\S]{0,200}?if \(!event\.aborted \|\| ownAbort\)/.test(main)
);
check(
  'the settle path asks the remembered copy before giving up',
  main.includes('turnFailure({ messages, limitFailure: tab.limitFailure, seq })')
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: limits are reported, never switched behind the user');
