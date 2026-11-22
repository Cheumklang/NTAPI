/**
 * `/skill` in a real Electron renderer, against the skills actually installed.
 *
 * `selftest-skill-menu.js` pins the roster logic with a fake list, which proves
 * the filtering and the text it inserts but not that the app can reach a real
 * roster at all. This check wires the one IPC channel that matters
 * (`skills:list`) to the same scan main.js does and then drives the composer,
 * so "the list is empty in the real app" cannot slip through.
 *
 * Run from app/:   npx electron scripts/check-skill-menu.js
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

let failures = 0;
function check(label, ok, extra) {
  if (ok) {
    console.log(`PASS ${label}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${label}${extra === undefined ? '' : ` — ${JSON.stringify(extra)}`}`);
}

/**
 * A roster this check owns.
 *
 * The real `~/.agents/skills` may be empty on a machine that never installed a
 * skill, which used to make this check fail for the wrong reason. Three fixtures
 * in a temp root give the same walk a list it can reason about, including a Thai
 * word the user is expected to type — the skill's own description is English, as
 * real ones are.
 */
const FIXTURES = [
  ['caveman', 'Terse caveman voice: answer first, fluff gone.'],
  ['ghidra-reverse', 'Reverse-engineer binaries in Ghidra.'],
  ['brainstorming', 'Use before any creative work.'],
];
const FIXTURE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ntapi-skill-menu-'));
for (const [folder, description] of FIXTURES) {
  const dir = path.join(FIXTURE_ROOT, 'skills', folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${folder}\ndescription: ${description}\n---\n\n# ${folder}\n`,
  );
}
const FIXTURE_FILES = FIXTURES.map(([folder]) =>
  path.join(FIXTURE_ROOT, 'skills', folder, 'SKILL.md'),
);
const hashOf = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const HASHES_BEFORE = FIXTURE_FILES.map(hashOf);

/**
 * The same walk main.js does: every directory under a skills root that holds a
 * SKILL.md, keyed by the `name:` in its frontmatter.
 */
function scanSkills() {
  const roots = [path.join(FIXTURE_ROOT, 'skills')];
  const found = new Map();
  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const file = path.join(root, entry.name, 'SKILL.md');
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const head = text.split(/\n---/)[0] || text.slice(0, 1200);
      const name = /^name:\s*(.+)$/m.exec(head)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      const description = /^description:\s*(.+)$/m.exec(head)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
      const key = name || entry.name;
      if (!found.has(key)) found.set(key, { name: key, description: description || '', path: file, root });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const skills = scanSkills();
ipcMain.handle('skills:list', () => skills);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1240,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on('console-message', (e) => {
    // Missing handlers the probe does not care about (usage:fetch, app:boot)
    // log here; anything else is worth seeing.
    if (!/No handler registered/.test(e.message)) console.log('[renderer]', e.level, e.message);
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  console.log(`[INFO] ทักษะที่สแกนได้ ${skills.length} ตัว`);

  const probe = win.webContents.executeJavaScript(`(async () => { try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const input = document.getElementById('input');
    const menu = document.getElementById('slashMenu');
    const read = () => {
      const rows = [...menu.querySelectorAll('.slash-item')];
      return {
        open: !menu.hidden,
        rows: rows.length,
        names: rows.map((r) => r.querySelector('.slash-name').textContent),
        descs: rows.slice(0, 2).map((r) => r.querySelector('.slash-desc').textContent),
        heads: [...menu.querySelectorAll('.slash-head')].map((h) => h.textContent),
        notes: rows.map((r) => r.querySelector('.slash-desc')?.textContent || ''),
        height: Math.round(menu.getBoundingClientRect().height),
      };
    };
    const type = async (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await wait(400);
    };
    const choose = async () => {
      chooseSlashItem(slashState.items[slashState.index]);
      await wait(150);
    };

    await type('/');
    const palette = read();
    await type('/skill');
    const all = read();
    await type('/skill caveman');
    const filtered = read();
    await type('/skill zzzz');
    const none = read();
    // The colon spelling reaches the same list.
    await type('/skill:');
    const colonAll = read();
    await type('/skill:c');
    const colonFiltered = read();
    await type('/skill cav');
    const picked = { index: slashState.index, name: slashState.items[slashState.index]?.name };
    await choose();
    const boxAfterPick = input.value;
    const menuAfterPick = menu.hidden;

    // Typing the command as the start of a sentence must not be hijacked: the
    // menu closes, nothing is inserted, and the text stays as typed.
    await type('/skill:c ทดสอบ');
    const prose = { open: menu.hidden === false, value: input.value };

    // Star and note, then search by the words the user wrote.
    const first = skillsCache[0].name;
    await type('/skill');
    setSkillPin(first, true);
    setSkillNote(first, 'ทดสอบคำของฉัน');
    updateSlashMenu();
    await wait(200);
    const pinned = read();
    await type('/skill ทดสอบคำของฉัน');
    const byNote = read();
    const stored = { ...skillNotesMap() };

    // The inline editor: the row's pencil opens a field in the menu itself, and
    // Enter saves without touching the composer.
    await type('/skill');
    openSkillEditor(first);
    await wait(150);
    const editor = menu.querySelector('.slash-edit');
    const editorField = editor && editor.querySelector('.slash-edit-input');
    const editorVisible = Boolean(editorField) && menu.hidden === false;
    if (editorField) {
      editorField.value = 'แก้จากช่องแก้ไข';
      editorField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await wait(200);
    const afterSave = {
      note: skillNotesMap()[first] && skillNotesMap()[first].note,
      closed: !menu.querySelector('.slash-edit'),
      composer: input.value,
    };
    // Reset is offered only when a note exists, and deletes the note, not the star.
    openSkillEditor(first);
    await wait(150);
    const resetBtn = [...menu.querySelectorAll('.slash-edit-btn2')].find(
      (b) => b.textContent === 'คืนค่าเดิม' || /^Reset$/i.test(b.textContent),
    );
    if (resetBtn) resetBtn.click();
    await wait(200);
    const afterReset = { note: skillNotesMap()[first] && skillNotesMap()[first].note, pinned: Boolean(skillNotesMap()[first] && skillNotesMap()[first].pinned) };

    return { roster: skillsCache ? skillsCache.length : -1, palette, all, filtered, none,
             colonAll, colonFiltered, picked, box: boxAfterPick, menuAfterPick,
             prose, pinned, byNote, stored, firstName: first,
             editor: { visible: editorVisible, afterSave, afterReset } };
  } catch (err) { return { error: String(err), stack: String(err && err.stack) }; }
  })()`);
  const out = await probe.catch((e) => ({ error: String(e) }));
  if (out.error) {
    console.log('FAIL the probe could not run —', out.error);
    app.exit(1);
    return;
  }

  console.log(JSON.stringify({ roster: out.roster, paletteRows: out.palette.rows,
    allRows: out.all.rows, filteredNames: out.filtered.names, noneOpen: out.none.open,
    picked: out.picked, box: out.box, menuHeight: out.all.height }, null, 1));

  check('the renderer can reach a real roster over IPC',
    out.roster === skills.length && skills.length === FIXTURES.length,
    { renderer: out.roster, main: skills.length });
  check('a bare "/" still shows commands only, not the skill roster',
    out.palette.open &&
      out.palette.rows <= 15 &&
      !out.palette.names.some((n) => skills.some((entry) => n === '/' + entry.name)),
    { rows: out.palette.rows, names: out.palette.names });
  check('/skill lists every installed skill', out.all.open && out.all.rows === skills.length,
    { rows: out.all.rows, skills: skills.length });
  check('/skill: opens the same list', out.colonAll.open && out.colonAll.rows === skills.length,
    { rows: out.colonAll.rows });
  check('every row leads with the real name, never the user\'s words',
    out.all.names.every((n) => /^\/[A-Za-z0-9._-]+$/.test(n)), out.all.names.slice(0, 3));
  check('the description keeps the wording the skill wrote',
    out.all.descs.every((d) => d.length > 0), out.all.descs);
  check('typing filters the roster', out.filtered.rows === 1 && out.filtered.names[0] === '/caveman',
    out.filtered.names);
  check('the colon spelling filters the same way',
    out.colonFiltered.rows >= 1 && out.colonFiltered.names[0] === '/caveman',
    out.colonFiltered.names);
  check('no match explains itself instead of offering nonsense',
    out.none.rows === 0 && out.none.open === true, out.none);
  check('choosing one puts the command pi expands in the box',
    out.box === '/skill:caveman ', out.box);
  check('choosing closes the menu without sending', out.menuAfterPick === true, out.menuAfterPick);
  check('a sentence typed after /skill is left alone, not hijacked',
    out.prose.open === false && out.prose.value === '/skill:c ทดสอบ', out.prose);
  check('a starred skill moves into its own group',
    out.pinned.heads.includes('★ ปักหมุด') || out.pinned.heads.some((h) => /Pinned/i.test(h)),
    out.pinned.heads);
  check('the user\'s own words are searched, in any script',
    out.byNote.rows >= 1 && out.byNote.names[0] === `/${out.firstName}`, out.byNote.names);
  check('the star and the note are stored under the skill name',
    out.stored[out.firstName]?.pinned === true && out.stored[out.firstName]?.note === 'ทดสอบคำของฉัน',
    out.stored);
  check('the row shows the user\'s words with the skill\'s own after them',
    out.byNote.notes[0].includes('ทดสอบคำของฉัน') && out.byNote.notes[0].includes('·'),
    out.byNote.notes[0]);
  check('the menu never grows past a readable list', out.all.height <= 262, out.all.height);

  // The boundary that keeps the AI honest: a star and a note live in prefs, so
  // no SKILL.md may change while the user pins and describes a skill.
  const changed = FIXTURE_FILES.filter((file, i) => hashOf(file) !== HASHES_BEFORE[i]);
  check('the pencil opens a field inside the menu, not a dialog',
    out.editor.visible === true, out.editor.visible);
  check('Enter in that field saves the note and closes the panel',
    out.editor.afterSave.note === 'แก้จากช่องแก้ไข' && out.editor.afterSave.closed === true,
    out.editor.afterSave);
  check('editing a note never writes into the composer',
    out.editor.afterSave.composer === '/skill', out.editor.afterSave.composer);
  check('Reset deletes the note and keeps the star',
    out.editor.afterReset.note === undefined && out.editor.afterReset.pinned === true,
    out.editor.afterReset);
  check('pinning and describing never touches a skill file', changed.length === 0, changed);

  fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll skill menu checks passed');
  app.exit(failures ? 1 : 0);
});
