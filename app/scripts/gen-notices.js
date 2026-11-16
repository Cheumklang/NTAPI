/**
 * Write `THIRD-PARTY-NOTICES.md`: the licences of everything NTAPI ships.
 *
 * Why this exists: two of the bundled packages (pi-coding-agent, Electron) are MIT,
 * and MIT is a *condition*, not a permission slip — the copyright notice and the
 * licence text must travel with the installer. Shipping without them is a licence
 * breach even though the software itself is free. The file is generated rather than
 * written by hand so it cannot drift from what is actually installed.
 *
 * Usage:
 *   node scripts/gen-notices.js           # write ../THIRD-PARTY-NOTICES.md
 *   node scripts/gen-notices.js --check   # exit 1 if the file no longer matches
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const OUT = path.join(APP, '..', 'THIRD-PARTY-NOTICES.md');

/* Packages that are bundled by the builder but are not npm runtime dependencies:
   Electron supplies the runtime itself and is shipped as a binary with its own
   notice files. It is listed here so the document is complete either way. */
const EXTRA = [
  {
    name: 'electron',
    licence: 'MIT',
    url: 'https://github.com/electron/electron',
    note: 'The application runtime. Its own `LICENSE` and `LICENSES.chromium.html` are installed next to the program by the installer.',
  },
  {
    name: 'Chromium / Node.js',
    licence: 'BSD-3-Clause / MIT and others',
    url: 'https://github.com/electron/electron/blob/main/docs/development/README.md',
    note: 'Components of the Electron runtime; the full text list is `LICENSES.chromium.html`, installed with the program.',
  },
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function packageDir(name) {
  // A dependency resolves from its own node_modules first, then the app's. Only the
  // app-level tree is installed here, plus a few nested copies, so two roots cover it.
  const candidates = [
    path.join(APP, 'node_modules', name),
    ...(nested || []).map((dir) => path.join(dir, 'node_modules', name)),
  ];
  for (const dir of candidates) {
    const pkg = readJson(path.join(dir, 'package.json'));
    if (pkg) return { dir, pkg };
  }
  return null;
}

let nested = [];

function collect(names, seen, out) {
  for (const name of names) {
    const found = packageDir(name);
    if (!found) continue;
    const key = `${name}@${found.pkg.version || '?'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ dir: found.dir, pkg: found.pkg });
    nested = [path.join(found.dir)];
    const deps = Object.keys(found.pkg.dependencies || {});
    collect(deps, seen, out);
    nested = [];
  }
  return out;
}

function licenceOf(pkg) {
  const raw = pkg.license || (pkg.licenses && pkg.licenses[0] && (pkg.licenses[0].type || pkg.licenses[0]));
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && raw.type) return raw.type;
  if (pkg.licenses) return 'see package';
  return 'not declared';
}

function homepageOf(pkg) {
  if (typeof pkg.repository === 'string') return pkg.repository.replace(/^git\+/, '').replace(/\.git$/, '');
  if (pkg.repository && pkg.repository.url) return pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
  return pkg.homepage || '';
}

function licenceText(dir) {
  for (const file of fs.readdirSync(dir)) {
    if (/^(licen[cs]e|copying|copyright|notice)(\..*)?$/i.test(file)) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (!stat.isFile() || stat.size > 200_000) continue;
      // Line endings are normalised: a licence file checked out on Windows is CRLF,
      // on CI it is LF, and either way the notice must come out byte-identical —
      // otherwise the file the installer ships is not the file in the repository.
      const text = fs.readFileSync(full, 'utf8').replace(/\r\n?/g, '\n').trim();
      if (text) return { file, text };
    }
  }
  return null;
}

/*
 * The list comes from `package-lock.json`, not from `node_modules`.
 *
 * Walking what happens to be installed made the document depend on the machine:
 * npm resolves nested copies differently between versions and platforms, so the
 * same commit produced a different notice file on CI than on the developer's
 * machine — and the installer, built on CI, then shipped a notice that disagreed
 * with the repository. The lockfile is the one list every machine agrees on.
 */
function runtimePackages() {
  const lock = readJson(path.join(APP, 'package-lock.json'));
  if (!lock || !lock.packages) {
    // No lockfile (a fresh clone before `npm install`): fall back to the tree.
    const root = readJson(path.join(APP, 'package.json')) || {};
    return collect(Object.keys(root.dependencies || {}), new Set(), []);
  }
  const out = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key === '' || !key.startsWith('node_modules/')) continue;
    // Dev-only packages are not shipped: electron-builder, the test tooling.
    if (entry.dev) continue;
    const name = entry.name || key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    out.push({
      dir: path.join(APP, key),
      pkg: {
        name,
        version: entry.version || '',
        license: entry.license,
        repository: entry.repository,
        homepage: entry.homepage,
      },
    });
  }
  // A nested copy of the same name@version is listed once.
  const seen = new Set();
  return out.filter((p) => {
    const k = `${p.pkg.name}@${p.pkg.version}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function build() {
  const packages = runtimePackages();

  const rows = packages.map((p) => {
    const text = licenceText(p.dir);
    return {
      name: p.pkg.name,
      version: p.pkg.version,
      licence: licenceOf(p.pkg),
      url: homepageOf(p.pkg),
      file: text && text.file,
      text: text && text.text,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)));

  const lines = [];
  lines.push('# บริการและซอฟต์แวร์ของบุคคลที่สาม / Third-party notices');
  lines.push('');
  lines.push('NTAPI ใช้งานร่วมกับบริการของบริษัทอื่นด้วย **คีย์ที่ผู้ใช้เป็นผู้ให้มาเอง**');
  lines.push('โปรแกรมนี้ไม่ได้แจกจ่าย ไม่ได้ดัดแปลง และไม่ได้เป็นตัวแทนของบริษัทเหล่านั้น');
  lines.push('NTAPI is not affiliated with, endorsed by, or sponsored by any model provider.');
  lines.push('');
  lines.push('## เงื่อนไขการใช้บริการของผู้ให้บริการ / Provider terms');
  lines.push('');
  lines.push('การเรียกใช้โมเดลผ่าน NTAPI ยังคงอยู่ภายใต้ข้อกำหนดการใช้บริการและนโยบายของแต่ละเจ้าของบริการ');
  lines.push('โปรดอ่านข้อกำหนดของเจ้าของบัญชีที่คุณใช้ก่อนใช้งาน:');
  lines.push('');
  for (const provider of [
    ['Coarena', 'https://coarena.ai'],
    ['Zro (moonmath.ai)', 'https://zro.moonmath.ai'],
    ['NVIDIA build.nvidia.com', 'https://build.nvidia.com'],
    ['Token Harbor', 'https://tokenharbor.ai'],
    ['LLM7.io', 'https://llm7.io'],
  ]) {
    lines.push(`- ${provider[0]} — ${provider[1]}`);
  }
  lines.push('');
  lines.push('## ซอฟต์แวร์ที่รวมอยู่ในตัวติดตั้ง / Software bundled in the installer');
  lines.push('');
  lines.push('| แพ็กเกจ | เวอร์ชัน | สัญญาอนุญาต | ที่มา |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| \`${row.name}\` | ${row.version || '—'} | ${row.licence} | ${row.url || '—'} |`);
  }
  for (const extra of EXTRA) {
    lines.push(`| \`${extra.name}\` | — | ${extra.licence} | ${extra.url} |`);
  }
  lines.push('');
  lines.push('## ข้อความสัญญาอนุญาตฉบับเต็ม / Full licence texts');
  lines.push('');
  for (const row of rows) {
    lines.push(`### ${row.name} ${row.version || ''}`);
    lines.push('');
    lines.push(`Licence: ${row.licence}${row.url ? ` · ${row.url}` : ''}`);
    lines.push('');
    if (row.text) {
      lines.push(`จากไฟล์ \`${row.file}\`:\n`);
      lines.push('```');
      lines.push(row.text);
      lines.push('```');
    } else {
      lines.push('_แพ็กเกจนี้ไม่ได้แนบไฟล์สัญญาอนุญาตมาในตัวแพ็กเกจ โปรดดูที่ต้นทาง._');
    }
    lines.push('');
  }
  for (const extra of EXTRA) {
    lines.push(`### ${extra.name}`);
    lines.push('');
    lines.push(`Licence: ${extra.licence} · ${extra.url}`);
    lines.push('');
    lines.push(extra.note);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('ไฟล์นี้สร้างด้วย `node app/scripts/gen-notices.js` — ห้ามแก้ด้วยมือ');
  lines.push('Generated by `node app/scripts/gen-notices.js`; do not edit by hand.');
  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  const wanted = build();
  if (process.argv.includes('--check')) {
    // The working copy's line endings are a git artifact (`core.autocrlf`), not a
    // difference in content: a checkout on Windows turns every line into CRLF.
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== wanted) {
      console.error('THIRD-PARTY-NOTICES.md is out of date — run: node app/scripts/gen-notices.js');
      process.exit(1);
    }
    console.log('THIRD-PARTY-NOTICES.md matches what is installed');
  } else {
    fs.writeFileSync(OUT, wanted);
    console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
  }
}

module.exports = { build, OUT };
