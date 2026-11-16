/**
 * The authorship ledger.
 *
 * This app is somebody's work, and the work has to be provable. A folder of source
 * files proves nothing on its own: anyone can copy it and claim they wrote it
 * first. What makes a claim checkable is a record that (a) existed at the time,
 * (b) is tied to the actual content, and (c) cannot be quietly rewritten later.
 *
 * So every meaningful step appends one line to a hash chain:
 *
 *   hash(n) = sha256( seq, kind, at, summary, data, prev = hash(n-1) )
 *
 * Editing any earlier line breaks every hash after it, and `verify` names the first
 * broken entry. The content itself is pinned by git's own hashes (commit and tree),
 * and each published build additionally records the SHA-256 of the installer the
 * world downloaded.
 *
 * What this proves, honestly: the ledger has not been altered since it was written,
 * and the entries were written by the commits they name. Its strength against a
 * forger grows with every independent timestamp of its head hash — a push to
 * GitHub, OneDrive version history, a release asset, a printed manifest. That is
 * why `anchor` exists and why the README asks for copies off this machine.
 *
 * Usage:
 *   node app/scripts/provenance.js genesis
 *   node app/scripts/provenance.js record-session [--id X] [--model Y] [--note "…"]
 *   node app/scripts/provenance.js record-commit
 *   node app/scripts/provenance.js record-release 0.5.12 [--asset name:size:sha256]… [--ci URL]
 *   node app/scripts/provenance.js anchor
 *   node app/scripts/provenance.js verify
 *   node app/scripts/provenance.js status
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'PROVENANCE');
const LEDGER = path.join(DIR, 'ledger.jsonl');
const ZERO = '0'.repeat(64);

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * One stable spelling for hashing.
 *
 * Object key order must not change the hash, or a rewritten file with the same
 * meaning would look like tampering.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
  return JSON.stringify(value);
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function readEntries() {
  try {
    return fs
      .readFileSync(LEDGER, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function appendEntry(kind, summary, data = {}) {
  const entries = readEntries();
  const prev = entries.length ? entries[entries.length - 1].hash : ZERO;
  const entry = { seq: entries.length + 1, kind, at: new Date().toISOString(), summary, data, prev };
  entry.hash = sha256(canonical(entry));
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(LEDGER, JSON.stringify(entry) + '\n');
  return entry;
}

/** What the working tree says right now, as content hashes rather than opinions. */
function treeState() {
  const status = git('status', '--porcelain');
  const changed = status ? status.split('\n').map((line) => line.slice(3).trim()).filter(Boolean) : [];
  const files = [];
  for (const file of changed.slice(0, 40)) {
    const full = path.join(ROOT, file);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) {
        files.push({ file, size: stat.size || null, sha256: null });
        continue;
      }
      files.push({ file, size: stat.size, sha256: sha256(fs.readFileSync(full)) });
    } catch {
      files.push({ file, sha256: null });
    }
  }
  return { changedCount: changed.length, files };
}

function commitInfo() {
  return {
    head: git('rev-parse', 'HEAD'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    subject: git('log', '-1', '--format=%s'),
    authorDate: git('log', '-1', '--format=%aI'),
    commitCount: Number(git('rev-list', '--count', 'HEAD') || 0),
  };
}

const argOf = (name, fallback = '') => {
  const at = process.argv.indexOf(name);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};

const argsOf = (name) => {
  const out = [];
  process.argv.forEach((arg, i) => {
    if (arg === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
};

function cmdGenesis() {
  if (readEntries().length) {
    console.log('ledger already started — nothing to do');
    return 0;
  }
  const entry = appendEntry('genesis', 'Authorship ledger opened for the NTAPI project', {
    project: 'NTAPI',
    repository: 'https://github.com/Cheumklang/NTAPI',
    releases: 'https://github.com/Cheumklang/NTAPI-releases',
    author: git('config', 'user.name'),
    git: commitInfo(),
    // Work that predates the ledger is not lost: git carries every commit with its
    // author and date, and the releases carry the builds that were published.
    note: 'History before this entry lives in git log and in the published releases.',
  });
  console.log(`genesis ${entry.seq} ${entry.hash.slice(0, 16)}…`);
  return 0;
}

function cmdRecordSession() {
  const id = argOf('--id', process.env.PI_SESSION_ID || 'session');
  const model = argOf('--model', process.env.PI_MODEL || '');
  const note = argOf('--note', '');
  const info = commitInfo();
  const state = treeState();
  const stamp = new Date();
  const iso = stamp.toISOString();
  const safeId = String(id).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24) || 'session';
  const name = `${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, '')}-${safeId}.md`;
  const month = iso.slice(0, 7);
  const dir = path.join(DIR, 'sessions', month);
  fs.mkdirSync(dir, { recursive: true });
  // Recorded with forward slashes: the ledger is checked on Linux CI too, and a
  // Windows path separator there names a file that does not exist.
  const rel = path.posix.join('PROVENANCE', 'sessions', month, name);
  const md = [
    `# Work record — ${iso}`,
    '',
    `- session: \`${id}\``,
    model ? `- model: \`${model}\`` : null,
    `- author: ${git('config', 'user.name')} <${git('config', 'user.email')}>`,
    `- git: \`${info.head.slice(0, 12)}\` (${info.branch}) — ${info.subject}`,
    `- commits so far: ${info.commitCount}`,
    `- working tree: ${state.changedCount} file(s) uncommitted`,
    note ? `\n${note}\n` : null,
    state.files.length
      ? [
          '',
          '| file | size | sha256 |',
          '|---|---|---|',
          ...state.files.map(
            (f) => `| \`${f.file}\` | ${f.size ?? '—'} | ${f.sha256 ? `\`${f.sha256.slice(0, 32)}…\`` : '—'} |`
          ),
        ].join('\n')
      : null,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  fs.writeFileSync(path.join(ROOT, rel), md);
  const entry = appendEntry('session', note || `Working session ${id}`, {
    session: id,
    model,
    git: info,
    tree: state,
    record: rel,
    recordSha256: sha256(md),
  });
  console.log(`session ${entry.seq} → ${rel}`);
  return 0;
}

function cmdRecordCommit() {
  const info = commitInfo();
  if (!info.head) return 0;
  const known = readEntries().some((e) => e.kind === 'commit' && e.data?.git?.head === info.head);
  if (known) return 0;
  const entry = appendEntry('commit', info.subject || '(no subject)', { git: info });
  console.log(`commit ${entry.seq} ${info.head.slice(0, 12)}`);
  return 0;
}

function cmdRecordRelease() {
  const version = String(process.argv[3] || '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error('usage: provenance.js record-release <x.y.z> [--asset name:size:sha256]… [--ci URL]');
    return 2;
  }
  const info = commitInfo();
  const assets = argsOf('--asset').map((spec) => {
    const [name, size, hash] = spec.split(':');
    return { name, size: Number(size) || null, sha256: hash || null };
  });
  const ci = argOf('--ci', '');
  const record = {
    version,
    tag: `v${version}`,
    recordedAt: new Date().toISOString(),
    git: info,
    ci,
    assets,
    releaseUrl: `https://github.com/Cheumklang/NTAPI-releases/releases/tag/v${version}`,
  };
  fs.mkdirSync(path.join(DIR, 'releases'), { recursive: true });
  const rel = path.posix.join('PROVENANCE', 'releases', `v${version}.json`);
  const body = JSON.stringify(record, null, 2) + '\n';
  fs.writeFileSync(path.join(ROOT, rel), body);
  const entry = appendEntry('release', `Released version ${version}`, {
    version,
    record: rel,
    recordSha256: sha256(body),
    assets,
    ci,
    git: info,
  });
  console.log(`release ${entry.seq} v${version} → ${rel}`);
  return 0;
}

function cmdVerify() {
  const entries = readEntries();
  if (!entries.length) {
    console.error('the ledger is empty');
    return 1;
  }
  let prev = ZERO;
  for (const entry of entries) {
    const { hash, ...rest } = entry;
    if (entry.prev !== prev) {
      console.error(`BROKEN at seq ${entry.seq}: prev does not match the entry before it`);
      return 1;
    }
    if (hash !== sha256(canonical(rest))) {
      console.error(`BROKEN at seq ${entry.seq}: content changed after it was written`);
      return 1;
    }
    prev = hash;
  }
  // The session and release files are hashed into the chain as well, so rewriting
  // one is caught even though the line that names it is intact.
  let checked = 0;
  for (const entry of entries) {
    const rel = entry.data?.record;
    if (!rel || !entry.data?.recordSha256) continue;
    // Entries written before paths were stored with forward slashes still have to
    // resolve here; the file content is what matters, not the spelling.
    const onDisk = path.join(ROOT, rel.split('\\').join('/'));
    let actual = '';
    try {
      actual = sha256(fs.readFileSync(onDisk));
    } catch {
      console.error(`MISSING at seq ${entry.seq}: ${rel}`);
      return 1;
    }
    if (actual !== entry.data.recordSha256) {
      console.error(`BROKEN at seq ${entry.seq}: ${rel} no longer matches its recorded hash`);
      return 1;
    }
    checked += 1;
  }
  const head = entries[entries.length - 1];
  console.log(`OK ${entries.length} entries, ${checked} record file(s) verified`);
  console.log(`head seq ${head.seq} ${head.at} ${head.hash}`);
  return 0;
}

function cmdAnchor() {
  const entries = readEntries();
  if (!entries.length) {
    console.error('nothing to anchor yet');
    return 1;
  }
  const head = entries[entries.length - 1];
  const now = new Date();
  fs.mkdirSync(path.join(DIR, 'anchors'), { recursive: true });
  const file = path.join(DIR, 'anchors', `${now.toISOString().slice(0, 10)}.txt`);
  fs.appendFileSync(
    file,
    [
      `date ${now.toISOString()}`,
      `entries ${entries.length}`,
      `head_seq ${head.seq}`,
      `head_hash ${head.hash}`,
      `git_head ${git('rev-parse', 'HEAD')}`,
      'verify must print this head_hash',
      '',
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(DIR, 'manifest.txt'),
    [
      'NTAPI — authorship ledger',
      `updated ${now.toISOString()}`,
      `entries ${entries.length}`,
      `head_hash ${head.hash}`,
      `git ${git('rev-parse', 'HEAD')}`,
      '',
      'latest entries:',
      ...entries.slice(-8).map((e) => `  #${e.seq} ${e.at} ${e.kind} — ${e.summary}`),
      '',
    ].join('\n')
  );
  console.log(`anchored seq ${head.seq} ${head.hash.slice(0, 16)}… → ${path.relative(ROOT, file)}`);
  return 0;
}

function cmdStatus() {
  const entries = readEntries();
  const head = entries[entries.length - 1];
  console.log(`entries ${entries.length}${head ? ` · head ${head.hash.slice(0, 16)}… · ${head.at}` : ''}`);
  if (head) console.log(`last ${head.kind} — ${head.summary}`);
  const recorded = entries.some((e) => e.kind === 'commit' && e.data?.git?.head === git('rev-parse', 'HEAD'));
  console.log(recorded ? 'HEAD is recorded' : 'HEAD is NOT recorded yet (run record-commit)');
  return 0;
}

const commands = {
  genesis: cmdGenesis,
  'record-session': cmdRecordSession,
  'record-commit': cmdRecordCommit,
  'record-release': cmdRecordRelease,
  anchor: cmdAnchor,
  verify: cmdVerify,
  status: cmdStatus,
};

const command = process.argv[2];
if (!commands[command]) {
  console.error(`unknown command: ${command || '(none)'}`);
  console.error('commands: genesis | record-session | record-commit | record-release | anchor | verify | status');
  process.exit(2);
}
process.exit(commands[command]());
