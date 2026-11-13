/**
 * Diagnostic: the two blocks users confuse must read differently.
 *
 * 429 hourly_ceiling = temporary rate limit (not a ban, not an ad problem)
 * 403 ads_required   = the backend really did not see an ad
 *
 * Run from app/:   node scripts/selftest-provider-errors.js
 */
'use strict';

const { parseProviderError, friendlyProviderError } = require('../src/provider-errors');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const hourlyRaw =
  '429: {"message":"This account hit its hourly limit; try again after it resets. free-pi is free because ads pay for it, so ads can\'t be skipped.","code":"hourly_ceiling","type":"free_pi_error"}';
const hourly = friendlyProviderError(hourlyRaw);
console.log('hourly_ceiling ->', hourly.text);
check('parses hourly_ceiling', hourly.code === 'hourly_ceiling');
check('keeps the HTTP status', hourly.text.includes('HTTP 429'));
check('says it is not a ban', /not a ban/i.test(hourly.text));
check('says it is not an ad block', /not an ad block/i.test(hourly.text));
check('drops the scary backend wording', !/ads can't be skipped/i.test(hourly.text));

const adsRaw =
  '403: {"message":"free-pi is free because ads pay for it, so ads can\'t be skipped. Ads aren\'t showing for this account, so free completions are paused.","code":"ads_required","type":"free_pi_error"}';
const ads = friendlyProviderError(adsRaw);
console.log('ads_required  ->', ads.text);
check('parses ads_required', ads.code === 'ads_required');
check('ads message is about ads', /ad/i.test(ads.text));

const unknown = friendlyProviderError('500: {"message":"kaboom","code":"weird_new_code"}');
check('unknown code keeps the server message', unknown.text.includes('kaboom'));

const badKey = friendlyProviderError('401: {"error":{"message":"Invalid API key","type":"invalid_request_error","code":"invalid_api_key"}}', { provider: 'coarena' });
check('coarena bad key names Settings', /API key/i.test(badKey.text) && /Settings/i.test(badKey.text));
check('coarena bad key keeps status', badKey.text.includes('HTTP 401'));

const limited = friendlyProviderError('429: {"error":{"message":"rate limited","code":"rate_limit_exceeded"}}', { provider: 'coarena' });
check('coarena rate limit names the limit', /30 requests per minute/i.test(limited.text));

const offline = friendlyProviderError('fetch failed', { provider: 'coarena' });
check('coarena network failure names Coarena', /Coarena/.test(offline.text) && /connection/i.test(offline.text));

const freePiOffline = friendlyProviderError('fetch failed');
check('one-argument calls unchanged', /fetch failed/.test(freePiOffline.text));

const zroBad = friendlyProviderError('401: {"error":{"message":"Invalid API key"}}', { provider: 'zro' });
check('zro bad key names Settings', /Zro/.test(zroBad.text) && /Settings/.test(zroBad.text));
const zroBroke = friendlyProviderError('402: {"error":{"message":"Payment required"}}', { provider: 'zro' });
check('zro empty balance is explained', /balance/i.test(zroBroke.text));
const zroLimited = friendlyProviderError('429: {"error":{"message":"rate limited"}}', { provider: 'zro' });
check('zro rate limit is explained', /rate limiting/i.test(zroLimited.text));
const zroOffline = friendlyProviderError('fetch failed', { provider: 'zro' });
check('zro network failure names Zro', /Zro/.test(zroOffline.text) && /connection/i.test(zroOffline.text));

const nvBad = friendlyProviderError('401: {"error":{"message":"Unauthorized"}}', { provider: 'nvidia' });
check('nvidia bad key names Settings', /NVIDIA/.test(nvBad.text) && /Settings/.test(nvBad.text));
const nvTrial = friendlyProviderError('403: {"error":{"message":"forbidden"}}', { provider: 'nvidia' });
check('nvidia trial end is explained', /trial/i.test(nvTrial.text));
const nvBusy = friendlyProviderError('429: {"error":{"message":"Too Many Requests"}}', { provider: 'nvidia' });
check(
  'nvidia 429 is shared capacity, not quota',
  /shared capacity/i.test(nvBusy.text) && !/quota/i.test(nvBusy.text)
);
const nvRetired = friendlyProviderError('404: {"error":{"message":"Function not found"}}', { provider: 'nvidia' });
check('nvidia retired model points at the dropdown', /retired/i.test(nvRetired.text) && /model/i.test(nvRetired.text));

// The real 404 from this API names a function the account does not own.
const nvBlocked = friendlyProviderError(
  '404: {"status":404,"title":"Not Found","detail":"Function \'e503b15c\': Not found for account \'abc\'"}',
  { provider: 'nvidia' }
);
check(
  'nvidia entitlement 404 is explained',
  /Public API Endpoints/i.test(nvBlocked.text) && /not have/i.test(nvBlocked.text)
);
const nvOffline = friendlyProviderError('fetch failed', { provider: 'nvidia' });
check(
  'nvidia network failure names NVIDIA',
  /NVIDIA/.test(nvOffline.text) && /connection/i.test(nvOffline.text)
);

const thUnverified = friendlyProviderError(
  '403: {"error":{"message":"Verify your email address","code":"email_verification_required"}}',
  { provider: 'tokenharbor' }
);
check('tokenharbor unverified email is explained', /email verified/i.test(thUnverified.text));
const thFreeOff = friendlyProviderError(
  '403: {"error":{"message":"Free models are disabled for this account"}}',
  { provider: 'tokenharbor' }
);
check('tokenharbor free models off is explained', /Free models are switched off/i.test(thFreeOff.text));
const thEmpty = friendlyProviderError('402: {"error":{"message":"Payment required"}}', { provider: 'tokenharbor' });
check('tokenharbor weekly allowance is explained', /7-day window/i.test(thEmpty.text) && /no charge/i.test(thEmpty.text));
const thBusy = friendlyProviderError('429: {"error":{"message":"Too many requests"}}', { provider: 'tokenharbor' });
check('tokenharbor rate limit is explained', /60 requests per minute/i.test(thBusy.text));
const thBig = friendlyProviderError('413: {"error":{"message":"request_too_large"}}', { provider: 'tokenharbor' });
check('tokenharbor 4 MB limit is explained', /4 MB/i.test(thBig.text));

// A stalled request is not the user pressing Stop. pi reports both as an abort,
// so the copy has to say who went quiet and what to do about it.
const nvStall = friendlyProviderError('This operation was aborted', { provider: 'nvidia' });
check('nvidia stall says it was accepted then silent', /never answered/i.test(nvStall.text));
check('nvidia stall suggests another model', /another model/i.test(nvStall.text));
check('nvidia stall is not billed as a network failure', !/check your connection/i.test(nvStall.text));
const caStall = friendlyProviderError('Request timed out.', { provider: 'coarena' });
check('coarena stall is provider specific', /Coarena stopped responding/i.test(caStall.text));
const freeStall = friendlyProviderError('The operation was aborted due to timeout');
check('a stall without a provider still makes sense', /stopped responding/i.test(freeStall.text));
check('a stall never reads as a user cancel', !/aborted/i.test(freeStall.text));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: rate limit and ad block are explained separately');
