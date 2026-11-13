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

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: rate limit and ad block are explained separately');
