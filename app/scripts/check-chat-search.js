/*
 * The sidebar's chat search.
 *
 * Typing has to narrow the list to chats that match, and a chat that matched
 * inside its body has to say where, because two chats can share a title prefix.
 * The styles are checked too: this box sits in the sidebar, so it has to look
 * like the rest of the column (themed surface, themed placeholder) rather than
 * like an unstyled <input>.
 *
 * It also writes a screenshot so the box can be looked at.
 *
 * Run: npm run check:search
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const failures = [];
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failures.push(name);
    console.log(`FAIL ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  }
}

const SESSIONS = [
  { id: 'a.jsonl', path: '/tmp/a.jsonl', created: '2026-11-24T01:00:00Z', modified: '2026-11-24T01:00:00Z', name: 'Fix the parser', firstMessage: 'Fix the parser', messageCount: 4 },
  { id: 'b.jsonl', path: '/tmp/b.jsonl', created: '2026-11-23T01:00:00Z', modified: '2026-11-23T01:00:00Z', name: 'Style the sidebar', firstMessage: 'Style the sidebar', messageCount: 2 },
  { id: 'c.jsonl', path: '/tmp/c.jsonl', created: '2026-11-22T01:00:00Z', modified: '2026-11-22T01:00:00Z', name: 'Release notes', firstMessage: 'Release notes', messageCount: 7 },
];

/** The one body hit: a title that does not match, text that does. */
const HITS = [{ id: 'c.jsonl', snippet: '…we should mention the parser rewrite in the notes…' }];

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({
    prefs: {},
    openTabs: [],
    lastCwd: '/tmp/ntapi-search-demo',
    cwd: '/tmp/ntapi-search-demo',
    version: '0.0.0',
  }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('tab:state', async () => null);
  ipcMain.handle('session:list', async () => SESSIONS);
  ipcMain.handle('session:listOther', async () => []);
  ipcMain.handle('session:colors', async () => ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink']);
  ipcMain.handle('session:search', async (_e, { q } = {}) =>
    String(q || '').toLowerCase().includes('parser') ? HITS : []
  );
  ipcMain.handle('usage:fetch', async () => ({ ok: false }));
  ipcMain.handle('skills:list', async () => []);
  ipcMain.handle('account:status', async () => ({ hasToken: true, guest: false, signedIn: true }));
  ipcMain.handle('providers:key-health', async () => []);
  ipcMain.handle('settings:get', async () => ({ dataRoot: '/tmp/ntapi' }));
  ipcMain.handle('system:getState', async () => ({ enabled: false }));
  ipcMain.handle('anthropic:status', async () => ({ configured: false }));
  ipcMain.handle('google:status', async () => ({ configured: false }));
  ipcMain.handle('approval:getMode', async () => 'ask');
  ipcMain.handle('sponsor:get', async () => ({ ads: [] }));
  // No saved tab to restore: the app opens an empty window, which is what this
  // check wants — the sidebar is the thing under test.
  ipcMain.handle('tab:resumeRecent', async () => {
    throw new Error('no recent session');
  });

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    x: 40,
    y: 40,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1000));

  const result = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // The first-run dialog sits above the sidebar.
    if (el('termsOverlay')) el('termsOverlay').hidden = true;
    // Boot gives up on a workspace when there is no recent session to resume, so
    // the list is drawn here: the sidebar is what this check is about.
    lastWorkspace = '/tmp/ntapi-search-demo';
    await renderSessions(lastWorkspace);
    await wait(300);

    const rows = () => [...document.querySelectorAll('#sessionList .session-item')];
    const titles = () => rows().map((n) => n.querySelector('.s-title')?.textContent.trim() || '');
    const input = el('sessionSearch');
    const before = titles();

    input.value = 'parser';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(700);
    const afterTitles = titles();
    const snippet = document.querySelector('#sessionList .s-snippet')?.textContent.trim() || '';
    const snippetStyle = document.querySelector('#sessionList .s-snippet')
      ? getComputedStyle(document.querySelector('#sessionList .s-snippet'))
      : null;
    const inputStyle = getComputedStyle(input);
    const rootStyle = getComputedStyle(document.documentElement);
    const surface = {
      bg: inputStyle.backgroundColor,
      radius: inputStyle.borderRadius,
      color: inputStyle.color,
      height: Math.round(input.getBoundingClientRect().height),
      width: Math.round(input.getBoundingClientRect().width),
      columnWidth: Math.round(el('sessionList').getBoundingClientRect().width),
    };
    const snippetColor = snippetStyle ? snippetStyle.color : '';
    const muted = rootStyle.getPropertyValue('--muted').trim();

    // A hex token and a computed colour are the same colour in two spellings.
    const hex2rgb = (h) => {
      const v = h.replace('#', '');
      return \`rgb(\${parseInt(v.slice(0, 2), 16)}, \${parseInt(v.slice(2, 4), 16)}, \${parseInt(v.slice(4, 6), 16)})\`;
    };
    return { before, afterTitles, snippet, surface, snippetColor, muted, mutedRgb: hex2rgb(muted) };
  })()`);

  check('three chats are listed before searching', result.before.length === 3, result.before);
  // Two survive: the chat whose title has the word, and the one whose body does.
  check(
    'a title match and a body match both survive, the rest drop',
    result.afterTitles.length === 2 &&
      result.afterTitles.includes('Fix the parser') &&
      result.afterTitles.includes('Release notes'),
    result.afterTitles
  );
  check('the matched line is shown under the row', /parser rewrite/.test(result.snippet), result.snippet);
  check('the box fills the sidebar column', result.surface.width >= result.surface.columnWidth - 2, result.surface);
  check('the box is themed, not a default input', result.surface.bg !== 'rgba(0, 0, 0, 0)', result.surface.bg);
  check('the box has the app radius', parseFloat(result.surface.radius) >= 6, result.surface.radius);
  check('the snippet is drawn in the muted text colour', result.snippetColor === result.mutedRgb, {
    snippet: result.snippetColor,
    muted: result.mutedRgb,
  });
  // The screenshot is taken while the search is in force: that is the state
  // worth looking at, and the one a person would screenshot themselves.
  fs.mkdirSync(path.join(__dirname, '..', '..', 'shots'), { recursive: true });
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', '..', 'shots', 'chat-search-dark.png'), img.toPNG());

  const escaped = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const input = el('sessionSearch');
    const titles = () => [...document.querySelectorAll('#sessionList .session-item')]
      .map((n) => n.querySelector('.s-title')?.textContent.trim() || '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wait(500);
    return { cleared: input.value === '', restored: titles() };
  })()`);
  check('Escape clears the box', escaped.cleared === true);
  check('Escape brings every chat back', escaped.restored.length === 3, escaped.restored);

  if (failures.length) {
    console.log(`\nFAIL ${failures.length} check(s)`);
    app.exit(1);
    return;
  }
  console.log('\nAll chat-search checks passed.');
  app.exit(0);
});
