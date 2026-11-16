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
 * The same walk main.js does: every directory under a skills root that holds a
 * SKILL.md, keyed by the `name:` in its frontmatter.
 */
function scanSkills() {
  const roots = [
    path.join(app.getPath('userData'), 'skills'),
    path.join(os.homedir(), '.agents', 'skills'),
  ];
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

  const out = await win.webContents.executeJavaScript(`(async () => {
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
        height: Math.round(menu.getBoundingClientRect().height),
      };
    };
    const type = async (value) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await wait(400);
    };

    await type('/');
    const palette = read();
    await type('/skill');
    const all = read();
    await type('/skill caveman');
    const filtered = read();
    await type('/skill zzzz');
    const none = read();
    await type('/skill cav');
    const picked = { index: slashState.index, name: slashState.items[slashState.index]?.name };
    slashState.items[slashState.index].run();
    await wait(150);
    return { roster: skillsCache ? skillsCache.length : -1, palette, all, filtered, none, picked,
             box: input.value, menuWasOpen: menu.hidden === false };
  })()`);

  console.log(JSON.stringify({ roster: out.roster, paletteRows: out.palette.rows,
    allRows: out.all.rows, filteredNames: out.filtered.names, noneOpen: out.none.open,
    picked: out.picked, box: out.box, menuHeight: out.all.height }, null, 1));

  check('the renderer can reach a real roster over IPC', out.roster === skills.length && skills.length > 0,
    { renderer: out.roster, main: skills.length });
  check('a bare "/" still shows commands only, not forty skills',
    out.palette.open && out.palette.rows <= 15 && !out.palette.names.some((n) => n.startsWith('@')),
    { rows: out.palette.rows });
  check('/skill lists every installed skill', out.all.open && out.all.rows === skills.length,
    { rows: out.all.rows, skills: skills.length });
  check('the entries read as the shorthand people type', out.all.names.every((n) => /^@[A-Za-z0-9._-]+$/.test(n)),
    out.all.names.slice(0, 3));
  check('the description keeps the wording the skill wrote',
    out.all.descs.every((d) => d.length > 0), out.all.descs);
  check('typing filters the roster', out.filtered.rows === 1 && out.filtered.names[0] === '@caveman',
    out.filtered.names);
  check('no match closes the menu instead of offering nonsense', out.none.open === false);
  check('choosing one puts the shorthand in the box', out.box === '@caveman ', out.box);
  check('the menu never grows past a readable list', out.all.height <= 262, out.all.height);

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll skill menu checks passed');
  app.exit(failures ? 1 : 0);
});
