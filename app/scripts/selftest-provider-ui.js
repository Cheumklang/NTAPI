/**
 * Offline check for src/renderer/provider-ui.js — no Electron, no network.
 * Run: node scripts/selftest-provider-ui.js
 */
'use strict';

require('../src/renderer/provider-ui.js');
const UI = globalThis.FPProvider;

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

check('free-pi label', UI.providerLabel('free-pi') === 'FreePi' && UI.providerLabel('free-pi-defense') === 'FreePi');
check('coarena label', UI.providerLabel('coarena') === 'Coarena');
check(
  'free-pi detection',
  UI.isFreePiProvider('free-pi') === true &&
    UI.isFreePiProvider('free-pi-defense') === true &&
    UI.isFreePiProvider('coarena') === false
);
check(
  'option label',
  UI.modelOptionLabel({ provider: 'coarena', id: 'x', name: 'Claude Fable 5' }) === 'Coarena · Claude Fable 5',
  JSON.stringify(UI.modelOptionLabel({ provider: 'coarena', id: 'x', name: 'Claude Fable 5' }))
);
check('option falls back to id', UI.modelOptionLabel({ provider: 'coarena', id: 'x' }) === 'Coarena · x');
const co = UI.providerChrome({ provider: 'coarena' });
check('coarena hides ads', co.showAds === false && co.showCoarenaMeter === true);
const fp = UI.providerChrome({ provider: 'free-pi' });
check('free-pi shows ads', fp.showAds === true && fp.showCoarenaMeter === false);
const unknown = UI.providerChrome({ provider: 'something-else' });
check('unknown provider shows neither', unknown.showAds === false && unknown.showCoarenaMeter === false);
check(
  'meter text',
  UI.coarenaMeterText({ limits: { requestsPerMinute: 30, concurrency: 2 }, usageToday: { requests: 4 } }) ===
    '30/min · 2 at once · 4 today',
  JSON.stringify(UI.coarenaMeterText({ limits: { requestsPerMinute: 30, concurrency: 2 }, usageToday: { requests: 4 } }))
);
check('meter empty without info', UI.coarenaMeterText(null) === '');

const skills = [{ name: 'caveman' }, { name: 'brainstorming' }];
check('leading @skill resolves', UI.resolveSkillMention('@caveman hello', skills) === '/skill:caveman hello');
check('bare @skill resolves', UI.resolveSkillMention('@caveman', skills) === '/skill:caveman');
check('case-insensitive name', UI.resolveSkillMention('@Caveman x', skills) === '/skill:caveman x');
check('prefix match is not a skill', UI.resolveSkillMention('@cavemanx', skills) === '@cavemanx');
check('file mention untouched', UI.resolveSkillMention('@src/app.js', skills) === '@src/app.js');
check('mid-sentence mention untouched', UI.resolveSkillMention('hello @caveman', skills) === 'hello @caveman');
check('unknown skill untouched', UI.resolveSkillMention('@nope hi', skills) === '@nope hi');
check('no skills loaded is safe', UI.resolveSkillMention('@caveman hi', null) === '@caveman hi');

console.log(failures ? `\n${failures} check(s) failed` : '\nall provider ui checks passed');
process.exit(failures ? 1 : 0);
