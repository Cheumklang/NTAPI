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
check('llm7 label', UI.providerLabel('llm7') === 'LLM7.io');
check('free-pi logo', UI.providerLogoPath('free-pi') === 'assets/providers/freepi.svg');
check('defense logo', UI.providerLogoPath('free-pi-defense') === UI.providerLogoPath('free-pi'));
check('coarena logo', UI.providerLogoPath('coarena') === 'assets/providers/coarena.svg');
check('zro logo', UI.providerLogoPath('zro') === 'assets/providers/zro.svg');
check('nvidia logo', UI.providerLogoPath('nvidia') === 'assets/providers/nvidia.svg');
check('tokenharbor logo', UI.providerLogoPath('tokenharbor') === 'assets/providers/tokenharbor.svg');
check('llm7 logo', UI.providerLogoPath('llm7') === 'assets/providers/llm7.png');
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
const freePiGroup = groups.find((g) => g.label === 'FreePi');
check('free-pi ids share one group', freePiGroup?.models.length === 3);
check('providers are sorted A-Z', groups.map((g) => g.label).join() === 'Coarena,FreePi,Zro');
check('models inside a group are sorted A-Z', freePiGroup?.models.map((m) => m.name).join() === 'A,C,E');
check('group keeps logo', groups.every((g) => g.logo.startsWith('assets/providers/')));
check('defense-only group', UI.groupModelsByProvider([{ provider: 'free-pi-defense', id: 'x' }])[0]?.logo === UI.providerLogoPath('free-pi'));

const sortedNames = UI.groupModelsByProvider([
  { provider: 'free-pi', id: '1', name: 'Zeta' },
  { provider: 'free-pi', id: '2', name: 'alpha' },
  { provider: 'free-pi', id: '3', name: 'Beta' },
]);
check('model names sort A-Z (case-insensitive)', sortedNames[0].models.map((m) => m.name).join() === 'alpha,Beta,Zeta');

// Free / paid split inside a group.
const mixed = UI.groupModelsByProvider([
  { provider: 'free-pi', id: 'a', name: 'A', plan: 'free' },
  { provider: 'free-pi', id: 'b', name: 'B', plan: 'paid', planNote: '18x' },
  { provider: 'free-pi', id: 'c', name: 'C', plan: 'free' },
  { provider: 'coarena', id: 'd', name: 'D', plan: 'free' },
]);
const mixedFreePi = mixed.find((g) => g.label === 'FreePi');
check('a mixed group splits into two sections', mixedFreePi.sections.length === 2, JSON.stringify(mixedFreePi.sections));
check(
  'the free routes come first, A-Z',
  mixedFreePi.sections[0].plan === 'free' && mixedFreePi.sections[0].models.map((m) => m.id).join() === 'a,c'
);
check(
  'the paid routes follow',
  mixedFreePi.sections[1].plan === 'paid' && mixedFreePi.sections[1].models[0].id === 'b'
);
check('an all-free group has one section', mixed[0].label === 'Coarena' && mixed[0].sections.length === 1 && mixed[0].sections[0].plan === 'free');
check('the group still lists every entry', mixedFreePi.models.length === 3);
check(
  'an untagged entry counts as free',
  UI.modelPlan({ id: 'x' }) === 'free' && UI.modelPlan({ id: 'x', plan: 'paid' }) === 'paid'
);
check('no sections without models', UI.planSections([]).length === 0 && UI.planSections(null).length === 0);
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
const l7 = UI.providerChrome({ provider: 'llm7' });
check('llm7 hides ads and shows its meter', l7.showAds === false && l7.meter === 'llm7');
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

const budget = UI.coarenaBudget({
  limits: { usdPerDay: 5 },
  usageToday: { costUsd: 2.5, requests: 12, resetsAt: '2026-01-01T00:00:00Z' },
});
check('coarena budget percent', budget?.limit === 5 && budget.pct === 50 && budget.requests === 12);
check('coarena budget clamps over 100%', UI.coarenaBudget({ limits: { usdPerDay: 1 }, usageToday: { costUsd: 9 } }).pct === 100);
check('coarena budget null without a daily limit', UI.coarenaBudget({ limits: { requestsPerMinute: 30 } }) === null);

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
