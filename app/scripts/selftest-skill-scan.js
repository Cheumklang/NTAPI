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
// A home of our own: the scan reads the user's real one otherwise, and a test
// that depends on what happens to be installed is not a test.
const fakeHome = path.join(tmp, 'home');
fs.mkdirSync(fakeHome, { recursive: true });


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

// A collection installed as a package lands in <agent dir>/git/<host>/<owner>/<repo>
// and never in a `skills` folder at the top — exactly how superpowers arrives.
writeSkill(
  path.join(fakeHome, '.pi', 'agent', 'git', 'github.com', 'obra', 'superpowers', 'skills', 'brainstorming'),
  'brainstorming',
  'a skill from an installed package',
);
writeSkill(path.join(fakeHome, '.pi', 'agent', 'npm', 'node_modules', 'pkg-skills', 'skills', 'npm-skill'), 'npm-skill', 'from npm');


// `process` is in the sandbox because the roots honour PI_CODING_AGENT_DIR.
const sandbox = { require, fs, os: { ...os, homedir: () => fakeHome }, path, process, DATA_ROOT: dataRoot, Map, Set };
vm.createContext(sandbox);
vm.runInContext(`${chunk}\nthis.__roots = skillRoots; this.__scan = scanSkills;`, sandbox);

const roots = sandbox.__roots(path.join(tmp, 'workspace'));
check('the workspace is searched as well as the home folders', roots.some((r) => r.startsWith(tmp) && r.includes('workspace')));
check('the global skill folders are still searched', roots.some((r) => r.endsWith('.pi/agent/skills'.replace(/\//g, path.sep))));
check(
  'the CLI global layout ~/.pi/skills is searched',
  roots.includes(path.join(fakeHome, '.pi', 'skills')),
  roots.join(' | '),
);

// People do not all use the same AI tool, so the roster has to cover the
// folders each one already has. Read from the real list, not a copy of it.
const homeDir = fakeHome;
const brandDirs = [
  ['.claude'],
  ['.cursor'],
  ['.copilot'],
  ['.gemini'],
  ['.gemini', 'config'],
  ['.continue'],
  ['.aider-desk'],
  ['.openclaw'],
  ['.codeium', 'windsurf'],
  ['.config', 'agents'],
  ['.config', 'crush'],
  ['.config', 'devin'],
  ['.config', 'goose'],
];
const missing = brandDirs.filter((parts) => !roots.includes(path.join(homeDir, ...parts, 'skills')));
check('every agent\'s own home folder is searched', missing.length === 0, missing.map((m) => m.join('/')).join(', '));
check('the portable folders come first, so they win a name clash', roots.indexOf(path.join(homeDir, '.agents', 'skills')) < roots.indexOf(path.join(homeDir, '.cursor', 'skills')));

const workspace = path.join(tmp, 'workspace');
const projectExpected = [
  path.join(workspace, 'skills'),
  path.join(workspace, '.claude', 'skills'),
  path.join(workspace, '.agents', 'skills'),
  path.join(workspace, '.pi', 'skills'),
  path.join(workspace, '.cursor', 'skills'),
  path.join(workspace, '.github', 'skills'),
  path.join(workspace, '.gemini', 'skills'),
  path.join(workspace, '.windsurf', 'skills'),
];
const missingProject = projectExpected.filter((dir) => !roots.includes(dir));
check(
  'a project can hold a skill in any of the documented folders',
  missingProject.length === 0,
  missingProject.join(', '),
);

// A collection installed as a package lands in <agent dir>/git/<host>/<owner>/<repo>
// and never in a `skills` folder at the top — exactly how superpowers arrives.
const gitRepoRoot = path.join(fakeHome, '.pi', 'agent', 'git', 'github.com', 'obra', 'superpowers');
check('a package installed from git is searched', roots.includes(gitRepoRoot));
check('a package installed from npm is searched', roots.includes(path.join(fakeHome, '.pi', 'agent', 'npm', 'node_modules', 'pkg-skills')));
check(
  'the skills inside an installed package are in the roster',
  sandbox.__scan(roots).some((s) => s.name === 'brainstorming'),
);

// A repository root one level up must still be searched, and nothing above it:
// walking all the way to C:\ would let an unrelated folder decide what the
// agent can do.
const proj = path.join(tmp, 'proj');
fs.mkdirSync(path.join(proj, '.git'), { recursive: true });
writeSkill(path.join(proj, '.claude', 'skills', 'from-repo'), 'from-repo', 'kept beside the repo');
const deepRoots = sandbox.__roots(path.join(proj, 'pkg', 'sub'));
check('a skill beside the repository root is found from a subfolder', deepRoots.includes(path.join(proj, '.claude', 'skills')));
check('the walk stops at the repository root', !deepRoots.includes(path.join(tmp, '.claude', 'skills')));
check(
  'that repository-level skill is in the roster',
  sandbox.__scan(deepRoots).some((s) => s.name === 'from-repo'),
);

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
