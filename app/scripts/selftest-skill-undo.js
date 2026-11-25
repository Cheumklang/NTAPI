/**
 * A `/skill:name …` prompt, taken back, is short again.
 *
 * What went wrong (2026-11-25): pi stores the message the model saw, and for a
 * skill that means the whole SKILL.md inside a `<skill name="…">…</skill>` block
 * ahead of the user's words. Undo put that stored text back in the composer, and
 * the repaint drew it in the chat — five thousand characters of instructions
 * where the person's one-line request used to be.
 *
 * The two halves are tested where they live, without launching Electron: the
 * main-process splitter and the renderer's composer/display helpers are pulled
 * out of their sources and run as real code.
 *
 * Run from app/:   node scripts/selftest-skill-undo.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

/** `const NAME = …;` — a regex literal never contains the `;\n` that ends it. */
function constDecl(src, name) {
  const at = src.indexOf(`const ${name} = `);
  if (at === -1) return '';
  const end = src.indexOf(';\n', at);
  return end === -1 ? '' : src.slice(at, end + 1);
}

/** A whole function declaration by brace matching, so assertions run real code. */
function fnDecl(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return '';
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        i += 1;
        break;
      }
    }
  }
  for (; i < src.length; i += 1) if (src[i] === '{') break;
  if (i >= src.length) return '';
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  return '';
}

function load(src, consts, fns, name) {
  const code = [...consts.map((c) => constDecl(src, c)), ...fns.map((f) => fnDecl(src, f)), `return ${name};`].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(code)();
}

const splitSkillExpansion = load(mainSrc, ['SKILL_BLOCK'], ['splitSkillExpansion'], 'splitSkillExpansion');
const composerText = load(appSrc, ['SKILL_EXPANSION'], ['composerText'], 'composerText');
const displayPrompt = load(appSrc, ['SKILL_COMMAND'], ['displayPrompt'], 'displayPrompt');
const userEntryText = load(appSrc, [], ['userEntryText'], 'userEntryText');

check('main: the skill splitter exists', typeof splitSkillExpansion === 'function');
check('renderer: the composer rebuild exists', typeof composerText === 'function');
check('renderer: the bubble display helper exists', typeof displayPrompt === 'function');
check('renderer: the entry-to-composer helper exists', typeof userEntryText === 'function');

const ASK = 'Style: Sci-Fi Sitcom Toon ขนาดของวิดีโอ 9:16 สร้างวิดีโอเกี่ยวกับ พลังย้อนเวลา 5 นาที';
const EXPANDED = `<skill name="lemo-opuscar" location="/home/nt/.agents/skills/lemo-opuscar/SKILL.md">\nReferences are relative to /home/nt/.agents/skills/lemo-opuscar.\n\n# Lemo-Opuscar\n\nlong manual\n</skill>\n\n${ASK}`;

if (typeof splitSkillExpansion === 'function') {
  const split = splitSkillExpansion(EXPANDED);
  check('main: the expansion is cut away', split.text === ASK, split.text);
  check('main: the skill name survives for the command', split.skill === 'lemo-opuscar', split.skill);
  check(
    'main: a plain message is untouched',
    splitSkillExpansion('hello').text === 'hello' && splitSkillExpansion('hello').skill === '',
  );
  check(
    'main: a block that is not at the front is text, not an expansion',
    splitSkillExpansion(`hi\n${EXPANDED}`).text === `hi\n${EXPANDED}`,
  );
}

if (typeof composerText === 'function') {
  check(
    'renderer: undo rebuilds the /skill: command, not the manual',
    composerText(EXPANDED) === `/skill:lemo-opuscar ${ASK}`,
    composerText(EXPANDED),
  );
  check('renderer: a plain prompt comes back as typed', composerText(ASK) === ASK);
  check(
    'renderer: a skill with no words after it is still a command',
    composerText('<skill name="x">\nbody\n</skill>\n\n') === '/skill:x',
  );
}

if (typeof displayPrompt === 'function') {
  check('renderer: the bubble shows the words, not the command', displayPrompt(`/skill:lemo-opuscar ${ASK}`) === ASK);
  check('renderer: an ordinary message is shown as is', displayPrompt('hello') === 'hello');
}

if (typeof userEntryText === 'function') {
  check(
    'renderer: history entry plus skill name becomes the command again',
    userEntryText({ kind: 'user', text: ASK, skill: 'lemo-opuscar' }) === `/skill:lemo-opuscar ${ASK}`,
  );
  check(
    'renderer: a skill-only entry is not doubled',
    userEntryText({ kind: 'user', text: '/skill:lemo-opuscar', skill: 'lemo-opuscar' }) === '/skill:lemo-opuscar',
  );
  check('renderer: an entry without a skill is untouched', userEntryText({ kind: 'user', text: ASK }) === ASK);
}

// The renderer must not put the stored expansion back when the live bubble is
// already the short form; undo takes the on-screen text first.
check(
  'undo prefers the on-screen text over the stored expansion',
  /const typed = lastUserText\(view\);\s*const res = await api\.undo\(view\.tabId\);\s*[\s\S]{0,160}finishUndo\(view, res\.entryId, typed \|\| res\.text\)/.test(
    appSrc,
  ),
);

if (failures) {
  console.log(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nPASS: a skill prompt taken back is short again');
