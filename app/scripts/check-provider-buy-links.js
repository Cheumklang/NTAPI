/**
 * Every provider card shows where to get a key *and* where to buy credits.
 *
 * Free to use was the point, but a satisfied user who runs out of credits must not
 * have to hunt for the shop — the card already names the site for the key, so it
 * names the site for buying too. Each button opens that provider's own site (with
 * the user's own account); NTAPI never sells or resells access itself.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/check-provider-buy-links.js
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

let failures = 0;
function check(name, ok, extra) {
  const tail = extra === undefined ? '' : ` — ${JSON.stringify(extra)}`;
  if (ok) console.log(`PASS ${name}${tail}`);
  else {
    console.log(`FAIL ${name}${tail}`);
    failures += 1;
  }
}

app.whenReady().then(async () => {
  ipcMain.handle('app:boot', async () => ({
    prefs: { lang: 'en' },
    openTabs: [],
    lastCwd: null,
    version: '0',
  }));
  ipcMain.handle('win:state', async () => ({ maximized: false }));
  ipcMain.handle('tab:list', async () => []);
  ipcMain.handle('session:list', async () => []);
  ipcMain.handle('tab:state', async () => null);

  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 700));
  const run = (expr) => win.webContents.executeJavaScript(expr);

  const providers = [
    ['coarena', 'coarena.ai'],
    ['zro', 'zro.moonmath.ai'],
    ['nvidia', 'build.nvidia.com'],
    ['tokenharbor', 'tokenharbor.ai'],
    ['llm7', 'dash.llm7.io'],
  ];

  for (const [pid, domain] of providers) {
    const row = await run(`(() => {
      const card = document.getElementById('${pid}Row');
      const get = document.getElementById('${pid}GetKey');
      const buy = document.getElementById('${pid}Buy');
      const sep = card.querySelector('.link-sep');
      return {
        hasGet: !!get, hasBuy: !!buy,
        getLabel: get && get.textContent, buyLabel: buy && buy.textContent,
        sep: !!sep,
        buyIsLinkBtn: buy && buy.classList.contains('link-btn'),
      };
    })()`);
    check(`${pid}: has both a get-key and a buy button`, row.hasGet && row.hasBuy, row);
    check(`${pid}: the buy button is a real link button`, row.buyIsLinkBtn, row);
    check(`${pid}: buy label names the site`, String(row.buyLabel || '').includes(domain), row.buyLabel);
    check(`${pid}: a separator keeps the two journeys apart`, row.sep === true, {});
  }

  // The Thai UI names the same shop — a hint “ขอคีย์…” with a mixed-language “Buy
  // credits at …” would read as a leftover.
  await run(`setLanguage('th')`);
  const th = await run(`(() => ({
    coarena: document.getElementById('coarenaBuy').textContent,
    zro: document.getElementById('zroBuy').textContent,
    nvidia: document.getElementById('nvidiaBuy').textContent,
    tokenharbor: document.getElementById('tokenharborBuy').textContent,
    llm7: document.getElementById('llm7Buy').textContent,
  }))()`);
  check('thai buy labels are fully Thai', Object.values(th).every((v) => /[ก-๙]/.test(v)), th);
  check('thai buy labels still name the site',
    th.coarena.includes('coarena.ai') && th.zro.includes('zro.moonmath.ai') &&
    th.nvidia.includes('build.nvidia.com') && th.tokenharbor.includes('tokenharbor.ai') &&
    th.llm7.includes('dash.llm7.io'), th);

  // About: the licence statement and its button exist, in both languages.
  await run(`setLanguage('en')`);
  const about = await run(`(() => ({
    text: (document.querySelector('.about-legal-text') || {}).textContent || '',
    btn: (document.getElementById('aboutNotices') || {}).textContent || '',
  }))()`);
  check('about states it has no affiliation', /not affiliated|no affiliation/i.test(about.text), about.text);
  // The About block now holds a row of documents (terms, privacy, licence,
  // security, notices), so the label is "licences", not "notices". This check only
  // cares that a legal document can be reached from About at all; the full row is
  // covered by check-legal-docs.
  check('about offers to open the licence documents', /licen[cs]/i.test(about.btn), about.btn);

  win.destroy();
  console.log(failures ? `\n${failures} check(s) failed` : '\nPASS: buy links and licence notice are in place');
  app.exit(failures ? 1 : 0);
});