/**
 * "เขารู้ว่าเขาอยู่ที่ไหน" — the confirmation the user asked for (2026-11-21).
 *
 * Whenever a project path appears in the conversation the session has to say
 * which face of the repo it is running on. That answer must come from the
 * machine, so a script prints it and this test keeps the script honest — on
 * whichever side the test is run.
 *
 * Run from app/:   node scripts/selftest-which-side.js
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sessionDirName } = require('../src/session-paths');

const script = path.join(__dirname, 'which-side.js');
const run = (...args) =>
  execFileSync(process.execPath, [script, ...args], { cwd: path.dirname(__dirname), encoding: 'utf8' });

// 1) The report names the side, the evidence and the data root, on either OS.
const report = run();
assert.match(report, /ฝั่งที่ผมรันอยู่ : (Windows VM|Ubuntu \(Linux\))/, 'the side is named');
assert.match(report, /process\.platform=(win32|linux|darwin)/, 'the evidence is the machine, not a guess');
assert.match(report, /repo ที่เห็น +: /, 'the repo this side sees is reported');
assert.match(report, /data root +: /, 'the data root this side uses is reported');
assert.match(report, /แชทที่มองเห็น +: \d+ แชท/, 'the chat count is reported');

// 1b) Opening a session by pasting only a path is this user's habit, so the
//     report also has to say what is still pending from the last session.
assert.match(report, /--- งานค้าง ---/, 'pending work is reported');
assert.match(report, /version +: \d+\.\d+\.\d+/, 'the version is reported');
assert.match(report, /ไฟล์ที่แก้ +: /, 'uncommitted files are reported');
assert.match(report, /จาก HANDOFF +:/, 'the handoff note is quoted');

// 2) A path the user pasted is classified by its spelling, and the history
//    folder it would land on is named — that is what makes the pair obvious.
const ubuntu = run('/home/nt/NT-ALL/NTAPI');
assert.match(ubuntu, /path ที่ผู้ใช้ให้ +: \/home\/nt\/NT-ALL\/NTAPI/, 'the pasted path is echoed back');
assert.match(ubuntu, /หน้านั้นคือ +: ฝั่ง Ubuntu/, 'a slash path is the Ubuntu face');
assert.match(ubuntu, /โฟลเดอร์ประวัติ +: NT-ALL-NTAPI/, 'the history folder is named');

const windows = run('Z:\\NT-ALL\\NTAPI');
assert.match(windows, /หน้านั้นคือ +: ฝั่ง Windows/, 'a drive path is the Windows face');
assert.match(windows, /โฟลเดอร์ประวัติ +: NT-ALL-NTAPI/, 'both faces land on one history folder');

// 3) Git-Bash rewrites a /home/... argument; the report must undo that, so the
//    session quotes what the user typed instead of the shell's mangling.
assert.match(
  ubuntu,
  /\(shell แปลงมาเป็น|\n/,
  'the raw argument is either restated or was not mangled'
);
assert.ok(
  !/path ที่ผู้ใช้ให้ +: C:\/Program Files\/Git\/home/.test(ubuntu),
  'the shell-mangled path never replaces the typed one'
);

// 4) The rule is written down where every session reads it.
const agents = fs.readFileSync(path.join(__dirname, '..', '..', 'AGENTS.md'), 'utf8');
assert.ok(agents.includes('which-side.js'), 'AGENTS.md points at this script');
assert.ok(agents.includes('ต้องพิมพ์ยืนยันก่อนทำงานอื่นทุกครั้ง'), 'AGENTS.md makes the confirmation mandatory');

// 5) Same workspace, two spellings — the rule only works if the folder matches.
assert.strictEqual(sessionDirName('/home/nt/NTAPI'), sessionDirName('Z:\\NTAPI'));

console.log('PASS: a path in the conversation always gets a side confirmation');
