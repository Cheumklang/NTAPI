#!/usr/bin/env node
/**
 * "ผมอยู่ฝั่งไหน" — the one command a session runs before it answers a question
 * that depends on the machine.
 *
 * The repo has two faces: /home/nt/NT-ALL/NTAPI on Ubuntu and Z:\NT-ALL\NTAPI
 * inside the Windows VM. They are the same files, so nothing in the source says
 * which face is running: the answer has to come from the machine itself.
 *
 * Run from app/, on either side:
 *   node scripts/which-side.js
 *   node scripts/which-side.js "Z:\NT-ALL\NTAPI"      # classify a pasted path
 *
 * Exit code is 0 on both sides; it is a report, not a check.
 */
'use strict';

const fs = require('node:fs');
// a source-level newline cannot live inside a string literal, so name it once
const NEWLINE = String.fromCharCode(10);
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { sessionDirName } = require('../src/session-paths');

const isWindows = process.platform === 'win32';

// The two known faces of this repo. Neither is assumed to exist: on the VM the
// Ubuntu home is reachable through the mapped drive, and the other way round
// only if the share is mounted.
const REPO_UBUNTU = '/home/nt/NT-ALL/NTAPI';
const REPO_WINDOWS = 'Z:\\NT-ALL\\NTAPI';

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Does this path look like the repo? (any copy of it, not just the known two) */
function looksLikeRepo(dir) {
  return exists(path.join(dir, 'app', 'package.json'));
}

/** Walk up from a directory until the repo root is found. */
function repoAbove(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (looksLikeRepo(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/**
 * Undo the shell's own rewriting of a path argument.
 *
 * Git-Bash on Windows turns a `/home/...` argument into
 * `C:/Program Files/Git/home/...`, and WSL-style `/c/Users/...` paths appear the
 * same way. The user means the path they typed, so report that one.
 */
function demangle(p) {
  const home = /\/home\/[\s\S]*$/.exec(p);
  if (home && /Git\/home\//i.test(p)) return home[0];
  const drive = /^\/([a-z])\/(.*)$/i.exec(p);
  if (drive) return `${drive[1].toUpperCase()}:/${drive[2]}`;
  return p;
}

/**
 * Which side a path belongs to, by its spelling — the side the *user* means when
 * they paste it. Says nothing about what this machine can see.
 */
function sideOfPath(p) {
  if (!p) return null;
  const value = String(p);
  if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return 'Windows';
  if (value.startsWith('/')) return 'Ubuntu';
  return null;
}

/** The data root this process would use, mirroring main.js and NTAPI.bat. */
function dataRoot() {
  const override = process.env.NTAPI_DATA_DIR || process.env.FREEPI_DATA_DIR;
  if (override) return override;
  if (isWindows) {
    // NTAPI.bat prefers the shared folder when it exists, so share chat history.
    const shared = 'Z:\\.local\\share\\ntapi';
    if (exists(path.join(shared, 'sessions'))) return shared;
    return 'C:\\NTAPI';
  }
  const xdg = process.env.XDG_DATA_HOME;
  return xdg ? path.join(xdg, 'ntapi') : path.join(os.homedir(), '.local', 'share', 'ntapi');
}

function countChats(root) {
  const dir = path.join(root, 'sessions');
  let folders = [];
  try {
    folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return { folders: 0, chats: 0 };
  }
  let chats = 0;
  for (const folder of folders) {
    try {
      chats += fs
        .readdirSync(path.join(dir, folder.name))
        .filter((f) => f.endsWith('.jsonl')).length;
    } catch {}
  }
  return { folders: folders.length, chats };
}

/**
 * Changed files in the repo, or null when git cannot read it.
 *
 * The share is owned by `Everyone` on the Windows side, so git refuses the repo
 * as "dubious ownership" until it is told otherwise; passing safe.directory for
 * this one command keeps the report working without touching the user's config.
 */
function gitDirty(repo) {
  if (!repo) return null;
  try {
    const out = execFileSync(
      'git',
      ['-c', `safe.directory=${repo.split(path.sep).join('/')}`, 'status', '--porcelain'],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return out.split(NEWLINE).filter(Boolean).map((l) => l.replace(/^..\s*/, ''));
  } catch {
    return null;
  }
}

/** The pending-work block the last session left at the top of HANDOFF.md. */
function pendingFromHandoff(repo) {
  if (!repo) return [];
  try {
    const text = fs.readFileSync(path.join(repo, '.AGENT', 'HANDOFF.md'), 'utf8');
    const start = text.indexOf('### 📦');
    if (start < 0) return [];
    const lines = [];
    for (const raw of text.slice(start).split(NEWLINE).slice(1)) {
      const line = raw.replace(/^>\s?/, '').trim();
      if (!line) continue;
      if (line.startsWith('#')) break;
      lines.push(line.replace(/^-\s*/, ''));
      if (lines.length >= 5) break;
    }
    return lines;
  } catch {
    return [];
  }
}

const mark = (ok) => (ok ? '[มีจริง]' : '[มองไม่เห็น]');

const repo = repoAbove(process.cwd());
const other = isWindows ? REPO_UBUNTU : REPO_WINDOWS;
const root = dataRoot();
const counted = countChats(root);
const here = process.cwd();
const script = 'node scripts/which-side.js';

const lines = [];
lines.push(`ฝั่งที่ผมรันอยู่ : ${isWindows ? 'Windows VM' : 'Ubuntu (Linux)'}`);
lines.push(`หลักฐาน         : process.platform=${process.platform} · ${os.release()}`);
lines.push(`repo ที่เห็น     : ${repo || '(ไม่พบ — cwd ไม่ได้อยู่ใน repo)'} ${repo ? mark(true) : ''}`);
lines.push(`repo อีกฝั่ง     : ${other} ${mark(exists(other))}`);
lines.push(`data root       : ${root} ${mark(exists(root))}`);
lines.push(`cwd ที่ผมเรียก   : ${here} → โฟลเดอร์ประวัติ ${sessionDirName(here)}`);
lines.push(`แชทที่มองเห็น    : ${counted.chats} แชท ใน ${counted.folders} โฟลเดอร์ (${path.join(root, 'sessions')})`);

const rawAsked = process.argv.slice(2).join(' ').trim();
const asked = rawAsked ? demangle(rawAsked) : '';
if (asked) {
  const side = sideOfPath(asked);
  const asRepo = looksLikeRepo(asked);
  lines.push(`path ที่ผู้ใช้ให้   : ${asked}`);
  if (asked !== rawAsked) lines.push(`(shell แปลงมาเป็น : ${rawAsked} — ยึดค่าที่ผู้ใช้พิมพ์)`);
  lines.push(`หน้านั้นคือ       : ${side ? `ฝั่ง ${side}` : 'ไม่ใช่ path ของเครื่อง'}${asRepo ? ' (repo นี้)' : ''}`);
  lines.push(`ฝั่งผมเห็นเป็น     : ${exists(asked) ? asked : `มองไม่เห็น ${asked} — ฝั่งผมใช้ ${here} แทน`}`);
  const askedFolder = sessionDirName(asked);
  const sameFolder = askedFolder === sessionDirName(here);
  lines.push(`โฟลเดอร์ประวัติ   : ${askedFolder}${sameFolder ? '' : ` (ของ cwd ผม = ${sessionDirName(here)})`}`);
}

// What a fresh session needs next: the version, what is uncommitted, and what
// the last session left pending. Pasting only a path is how this user opens a
// session, so the answer has to include this.
const dirty = gitDirty(repo);
const pending = pendingFromHandoff(repo);
let version = '';
try {
  version = JSON.parse(fs.readFileSync(path.join(repo, 'app', 'package.json'), 'utf8')).version;
} catch {}
if (repo) {
  lines.push('');
  lines.push('--- งานค้าง ---');
  lines.push(`version         : ${version || '(อ่านไม่ได้)'}${dirty && dirty.length ? ' (มีการแก้ที่ยังไม่ commit)' : ''}`);
  if (dirty === null) {
    lines.push('ไฟล์ที่แก้       : อ่าน git ไม่ได้ (dubious ownership — ต้องใช้ -c safe.directory)');
  } else if (dirty.length) {
    const shown = dirty.slice(0, 6).join(', ');
    lines.push(`ไฟล์ที่แก้       : ${dirty.length} ไฟล์ · ${shown}${dirty.length > 6 ? ` … +${dirty.length - 6}` : ''}`);
  } else {
    lines.push('ไฟล์ที่แก้       : ไม่มี (tree สะอาด)');
  }
  if (pending.length) {
    lines.push('จาก HANDOFF    :');
    for (const line of pending) lines.push(`  · ${line}`);
  } else {
    lines.push('จาก HANDOFF    : ไม่พบบล็อกงานค้าง');
  }
}

lines.push('');
lines.push(`คำสั่งนี้: ${script}${asked ? ` "${asked}"` : ''}`);

console.log(lines.join('\n'));
