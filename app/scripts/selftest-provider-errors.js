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
const nvOffline = friendlyProviderError('fetch failed', { provider: 'nvidia' });
check(
  'nvidia network failure names NVIDIA',
  /NVIDIA/.test(nvOffline.text) && /connection/i.test(nvOffline.text)
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: rate limit and ad block are explained separately');
