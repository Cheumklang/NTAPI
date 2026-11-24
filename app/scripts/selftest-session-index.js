/**
 * The sidebar's rows come from the chat files themselves, and reading every file
 * on every open was the slow half of the window starting up. `session-index.js`
 * reads each file once and then only the bytes that were appended, so this check
 * pins the three things that could quietly break:
 *
 *   1. the row means what the SDK's own read meant (name, first message, count,
 *      created, last activity),
 *   2. an appended message is picked up without re-reading the file, and
 *   3. a file that was rewritten smaller, or is not a chat at all, is handled the
 *      same way a full read would handle it.
 *
 * Run: node scripts/selftest-session-index.js
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readSessionInfos } = require('../src/session-index');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-session-index-'));

function writeSession(name, { id, cwd, created, messages, sessionName }) {
  const lines = [JSON.stringify({ type: 'session', version: 1, id, cwd, timestamp: created })];
  if (sessionName) lines.push(JSON.stringify({ type: 'session_info', name: sessionName }));
  for (const m of messages) {
    lines.push(
      JSON.stringify({
        type: 'message',
        timestamp: m.at || created,
        message: {
          role: m.role,
          timestamp: m.at || created,
          content: [{ type: 'text', text: m.text }],
        },
      })
    );
  }
  fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');
  return path.join(dir, name);
}

const a = writeSession('a.jsonl', {
  id: 'ses-a',
  cwd: '/work/project',
  created: '2026-11-01T10:00:00.000Z',
  messages: [
    { role: 'user', text: 'Fix the parser please', at: 1000 },
    { role: 'assistant', text: 'Done.', at: 2000 },
  ],
});
const b = writeSession('b.jsonl', {
  id: 'ses-b',
  cwd: '/work/project',
  created: '2026-11-02T10:00:00.000Z',
  sessionName: 'Later renamed chat',
  messages: [{ role: 'user', text: 'Second chat', at: 3000 }],
});
// Not a chat: a file whose first entry is a plain message.
fs.writeFileSync(
  path.join(dir, 'not-a-session.jsonl'),
  JSON.stringify({ type: 'message', message: { role: 'user', content: 'hello' } }) + '\n'
);
// A chat with one corrupt line in the middle: the rest still counts.
fs.writeFileSync(
  path.join(dir, 'corrupt.jsonl'),
  [
    JSON.stringify({ type: 'session', id: 'ses-c', cwd: '/work/project', timestamp: '2026-11-03T10:00:00.000Z' }),
    '{ this is not json',
    JSON.stringify({ type: 'message', timestamp: 4000, message: { role: 'user', content: 'still here', timestamp: 4000 } }),
  ].join('\n') + '\n'
);

const cache = new Map();
const rows = readSessionInfos(dir, cache);
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

check('every chat file becomes a row', rows.length === 3, `got ${rows.length}: ${rows.map((r) => r.id).join(', ')}`);
check('a file that is not a chat is skipped', !rows.some((r) => r.path.endsWith('not-a-session.jsonl')));
check('the first thing the user said is the row title', byId['ses-a']?.firstMessage === 'Fix the parser please', byId['ses-a']?.firstMessage);
check('the message count matches the messages', byId['ses-a']?.messageCount === 2, String(byId['ses-a']?.messageCount));
check('a renamed chat keeps its name', byId['ses-b']?.name === 'Later renamed chat', byId['ses-b']?.name);
check('created comes from the session header', byId['ses-a']?.created.toISOString() === '2026-11-01T10:00:00.000Z');
check(
  'last activity is the newest message, not the file time',
  byId['ses-a']?.modified.getTime() === 2000,
  String(byId['ses-a']?.modified.getTime())
);
check('a corrupt line does not lose the rest of the chat', byId['ses-c']?.messageCount === 1, String(byId['ses-c']?.messageCount));
check('the workspace is carried for the folder filter', byId['ses-a']?.cwd === '/work/project');

// 2. An appended message is picked up without re-reading the whole file.
const before = cache.get(a).offset;
fs.appendFileSync(
  a,
  JSON.stringify({ type: 'message', timestamp: 5000, message: { role: 'user', content: 'One more thing', timestamp: 5000 } }) + '\n'
);
const again = readSessionInfos(dir, cache);
const a2 = again.find((r) => r.id === 'ses-a');
check('an appended message is counted after the reread', a2?.messageCount === 3, String(a2?.messageCount));
check('the read position moved past the new entry', cache.get(a).offset > before);
check(
  'the append moved the row\'s last activity',
  a2?.modified.getTime() === 5000,
  String(a2?.modified.getTime())
);

// A second read with nothing changed does no file reading at all.
const settled = cache.get(b).offset;
readSessionInfos(dir, cache);
check('an unchanged folder reuses what it already read', cache.get(b).offset === settled);

// A partial line (a write landing mid-JSON) must not be counted or consumed.
fs.appendFileSync(a, '{"type":"message","timestamp":6000,"message":{"role":"user","con');
const settledOffset = cache.get(a).offset;
const partial = readSessionInfos(dir, cache).find((r) => r.id === 'ses-a');
check('half a written line is not counted', partial?.messageCount === 3, String(partial?.messageCount));
check(
  'half a written line is left for the next read',
  cache.get(a).offset === settledOffset && cache.get(a).offset < fs.statSync(a).size,
  `offset ${cache.get(a).offset}, size ${fs.statSync(a).size}`
);
// …and once the rest of it arrives, it counts.
fs.appendFileSync(a, 'tent":"finished"}}\n');
const completed = readSessionInfos(dir, cache).find((r) => r.id === 'ses-a');
check('the finished line counts once it is whole', completed?.messageCount === 4, String(completed?.messageCount));

// 3. A file rewritten smaller is read from the top again.
writeSession('b.jsonl', {
  id: 'ses-b',
  cwd: '/work/project',
  created: '2026-11-02T10:00:00.000Z',
  messages: [{ role: 'user', text: 'Trimmed chat', at: 7000 }],
});
const trimmed = readSessionInfos(dir, cache).find((r) => r.id === 'ses-b');
check('a rewritten file is re-read from the start', trimmed?.messageCount === 1 && trimmed?.name === undefined, JSON.stringify(trimmed));

// 4. A deleted chat leaves no row behind, and no record either.
fs.unlinkSync(b);
const afterDelete = readSessionInfos(dir, cache);
check('a deleted chat disappears from the list', !afterDelete.some((r) => r.id === 'ses-b'));
check('a deleted chat leaves no cached record', !cache.has(b));

// 5. The wiring: the sidebar's rows come from this module, and starting the app
// does not wait for them.
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
function bodyOf(name) {
  const start = mainSource.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = mainSource.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < mainSource.length; i += 1) {
    if (mainSource[i] === '{') depth += 1;
    else if (mainSource[i] === '}') {
      depth -= 1;
      if (depth === 0) return mainSource.slice(open, i + 1);
    }
  }
  return null;
}
const bootHandler = mainSource.slice(mainSource.indexOf("ipcMain.handle('app:boot'"));
const bootBody = bootHandler.slice(0, bootHandler.indexOf("ipcMain.handle('prefs:set'"));
check(
  'starting the app does not read the chat list',
  Boolean(bootBody) && !/listSessions\(lastCwd\)/.test(bootBody) && !/await listSessions\(/.test(bootBody)
);
check('the sidebar list goes through the index', Boolean(bodyOf('listSessions')) && /readSessionInfos\(dir\)/.test(bodyOf('listSessions')));
check(
  'the other-workspace list does too',
  Boolean(bodyOf('listOtherSessions')) && /readSessionInfos\(dir\)/.test(bodyOf('listOtherSessions'))
);
check('no full SDK scan is left on the sidebar path', !/SessionManager\.listAll/.test(mainSource));

fs.rmSync(dir, { recursive: true, force: true });

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: the sidebar index reads each chat once, then only what changed');
