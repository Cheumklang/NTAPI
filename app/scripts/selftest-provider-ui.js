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
check('zro label', UI.providerLabel('zro') === 'Zro');
check('nvidia label', UI.providerLabel('nvidia') === 'NVIDIA');
check('tokenharbor label', UI.providerLabel('tokenharbor') === 'Token Harbor');
check('free-pi logo', UI.providerLogoPath('free-pi') === 'assets/providers/freepi.svg');
check('defense logo', UI.providerLogoPath('free-pi-defense') === UI.providerLogoPath('free-pi'));
check('coarena logo', UI.providerLogoPath('coarena') === 'assets/providers/coarena.svg');
check('zro logo', UI.providerLogoPath('zro') === 'assets/providers/zro.svg');
check('unknown logo', UI.providerLogoPath('other') === '');
check('unknown initial', UI.providerInitial('other') === 'O' && UI.providerInitial('') === '?');

const groups = UI.groupModelsByProvider([
  { provider: 'free-pi', id: 'a', name: 'A' },
  { provider: 'coarena', id: 'b', name: 'B' },
  { provider: 'free-pi-defense', id: 'c', name: 'C' },
  { provider: 'zro', id: 'd', name: 'D' },
  { provider: 'free-pi', id: 'e', name: 'E' },
  { provider: 'broken', name: 'no id' },
]);
check('groups by visible provider', groups.length === 3, JSON.stringify(groups));
check('free-pi ids share one group', groups[0]?.label === 'FreePi' && groups[0].models.length === 3);
check('group order follows catalog', groups.map((g) => g.label).join() === 'FreePi,Coarena,Zro');
check('group keeps logo', groups.every((g) => g.logo.startsWith('assets/providers/')));
check('defense-only group', UI.groupModelsByProvider([{ provider: 'free-pi-defense', id: 'x' }])[0]?.logo === UI.providerLogoPath('free-pi'));
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
check('coarena hides ads and shows its meter', co.showAds === false && co.meter === 'coarena');
const zo = UI.providerChrome({ provider: 'zro' });
check('zro hides ads and shows its meter', zo.showAds === false && zo.meter === 'zro');
const nv = UI.providerChrome({ provider: 'nvidia' });
check('nvidia hides ads and shows its meter', nv.showAds === false && nv.meter === 'nvidia');
const th = UI.providerChrome({ provider: 'tokenharbor' });
check('tokenharbor hides ads and shows its meter', th.showAds === false && th.meter === 'tokenharbor');
const fp = UI.providerChrome({ provider: 'free-pi' });
check('free-pi shows ads and no keyed meter', fp.showAds === true && fp.meter === null);
const unknown = UI.providerChrome({ provider: 'something-else' });
check('unknown provider shows neither', unknown.showAds === false && unknown.meter === null);
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

check('absolute windows path', UI.extractImagePaths('see C:\\work\\shots\\a.png now').join() === 'C:\\work\\shots\\a.png');
check('relative path with folders', UI.extractImagePaths('rendered shots/ui-render.png.').join() === 'shots/ui-render.png');
check('quoted path', UI.extractImagePaths('path "shots/b.webp" here').join() === 'shots/b.webp');
check('urls ignored', UI.extractImagePaths('https://x.test/a.png').length === 0);
check('data uri ignored', UI.extractImagePaths('data:image/png;base64,AAAA').length === 0);
check('non-image ignored', UI.extractImagePaths('read shots/a.svg now').length === 0);
check('dedupe keeps order', UI.extractImagePaths('a.png b.jpg a.png').join() === 'a.png,b.jpg');
check('caps at three', UI.extractImagePaths('a.png b.jpg c.gif d.webp').length === 3);

console.log(failures ? `\n${failures} check(s) failed` : '\nall provider ui checks passed');
process.exit(failures ? 1 : 0);
