/**
 * Which SKILL.md files `/skill` actually finds.
 *
 * A user reported an empty roster on a machine that clearly had skills, and the
 * scan is the half of that path nobody could see: the palette was fine, the
 * folders were not visited. The scan is read out of main.js rather than copied,
 * so this test fails if the real discovery logic regresses — nested packs, a
 * symlinked skill folder (how plenty of people install one), and a bundled
 * `node_modules` that must never be walked.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    console.log(`PASS ${name}`);
    return;
  }
  failed += 1;
  console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const start = src.indexOf('function skillRoots(');
const end = src.indexOf("ipcMain.handle('skills:list'");
const chunk = src.slice(start, end);
if (!chunk.includes('function scanSkills(') || !chunk.includes('function readSkillMeta(')) {
  console.log('FAIL the skill scan could not be read out of main.js');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-skill-scan-'));
const dataRoot = path.join(tmp, 'appdata');
const elsewhere = path.join(tmp, 'elsewhere');

function writeSkill(dir, name, description) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
  );
}

writeSkill(path.join(dataRoot, 'skills', 'alpha'), 'alpha', 'plain skill');
writeSkill(path.join(dataRoot, 'skills', 'pack', 'beta'), 'beta', 'skill inside a pack');
writeSkill(path.join(dataRoot, 'skills', 'a', 'b', 'c'), 'deep', 'three levels down');
writeSkill(path.join(dataRoot, 'skills', 'a', 'b', 'c', 'd'), 'too-deep', 'four levels down');
writeSkill(path.join(dataRoot, 'skills', 'node_modules', 'dep'), 'dep', 'a dependency, not a skill');
writeSkill(path.join(elsewhere, 'gamma'), 'gamma', 'a skill reached through a symlink');
fs.symlinkSync(path.join(elsewhere, 'gamma'), path.join(dataRoot, 'skills', 'linked'), 'dir');

const sandbox = { require, fs, os, path, DATA_ROOT: dataRoot, Map, Set };
vm.createContext(sandbox);
vm.runInContext(`${chunk}\nthis.__roots = skillRoots; this.__scan = scanSkills;`, sandbox);

const roots = sandbox.__roots(path.join(tmp, 'workspace'));
check('the workspace is searched as well as the home folders', roots.some((r) => r.startsWith(tmp) && r.includes('workspace')));
check('the global skill folders are still searched', roots.some((r) => r.endsWith('.pi/agent/skills'.replace(/\//g, path.sep))));

const skills = sandbox.__scan(roots);
const names = skills.map((s) => s.name);

check('a plain skill is found', names.includes('alpha'), names.join(','));
check('a skill inside a pack folder is found', names.includes('beta'), names.join(','));
check('a skill three levels down is found', names.includes('deep'), names.join(','));
check('a skill four levels down is not walked', !names.includes('too-deep'), names.join(','));
check('a symlinked skill folder is followed', names.includes('gamma'), names.join(','));
check('node_modules is never walked', !names.includes('dep'), names.join(','));
check(
  'a folder appears once even when reached twice',
  names.filter((n) => n === 'alpha').length === 1,
  names.join(','),
);
check('every hit carries the file and root it came from', skills.every((s) => s.path.endsWith('SKILL.md') && typeof s.root === 'string'));

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('All skill scan checks passed');
