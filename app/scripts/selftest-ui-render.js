/**
 * Offline UI render check — no free-pi account, no network, no credits.
 *
 * Loads the real styles.css and markdown.js into a headless window with a
 * fixture that mirrors the transcript, then measures the result and writes a
 * screenshot to shots/ui-render.png.
 *
 * Run: node_modules/electron/dist/electron.exe scripts/selftest-ui-render.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RENDERER = path.join(ROOT, 'src', 'renderer');
const SHOTS = path.join(ROOT, '..', 'shots');

// Isolate this run from the user's real profile (prefs, tabs, sessions).
app.setPath('userData', path.join(app.getPath('temp'), 'freepi-ui-render'));

const SAMPLE = [
  'Here is the plan, with **bold** text, `inline code` and a [link](https://pi.dev).',
  '',
  '## Steps',
  '',
  '1. Read the file',
  '2. Patch the parser',
  '   - keep streaming safe',
  '3. Run the tests',
  '',
  '```js',
  'const parser = require("./markdown.js"); // comment',
  'function render(text) { return parser.parse(text); }',
  '```',
  '',
  '| Check | Result |',
  '| --- | ---: |',
  '| escaping | ok |',
  '| tables | ok |',
  '',
  '> Note: quotes keep their formatting.',
].join('\n');

const TODO_ITEMS = [
  { text: 'Read the existing renderer', status: 'done' },
  { text: 'Add markdown + code blocks', status: 'in_progress' },
  { text: 'Verify with a screenshot', status: 'pending' },
];

function fixtureHtml() {
  const todos = TODO_ITEMS.map(
    (it) =>
      `<li class="todo-item ${it.status}"><span class="todo-mark">${
        it.status === 'done' ? '✓' : it.status === 'in_progress' ? '▸' : '○'
      }</span><span class="todo-text">${it.text}</span></li>`
  ).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<link rel="stylesheet" href="file://${RENDERER.replace(/\\/g, '/')}/styles.css" />
<style>html,body{overflow:auto;height:auto}</style>
</head>
<body>
<div id="app" style="display:flex;min-height:100vh">
  <aside id="sidebar" style="width:260px;flex:0 0 260px;border-right:1px solid var(--line);padding:12px">
    <div class="section usage">
      <div class="usage-title"><span class="live-dot"></span><span>Status</span></div>
      <div class="usage-bar-wrap">
        <div class="usage-bar"><div class="usage-bar-fill" style="width:6%"></div></div>
        <div class="usage-bar-legend"><span>6% used</span><span>used 845</span></div>
      </div>
      <div class="usage-row"><span>Credits</span><span class="mono">14,155 / 15,000</span></div>
      <div class="usage-row"><span>Bonus</span><span class="mono">+2,000</span></div>
      <div class="usage-row"><span>Lane</span><span class="mono">standard</span></div>
      <div class="usage-row"><span>Resets</span><span class="mono">in 12 h 40 m | 14/11 07:00</span></div>
      <div class="usage-row"><span>Context</span><span class="mono">14%</span></div>
      <div class="ctx-bar"><div class="ctx-bar-fill" style="width:14%"></div></div>
    </div>
  </aside>
  <main id="main" style="flex:1;min-width:0;padding:16px 20px;display:flex;flex-direction:column;gap:10px">
    <section id="transcript" class="transcript" style="overflow:visible">
      <div class="msg assistant" id="assistantMsg">
        <div class="role">Assistant</div>
        <div class="tools-wrap"><div class="tools"></div></div>
        <div class="body" id="mdBody"></div>
      </div>
      <div class="msg shell">
        <div class="role">Shell</div>
        <div class="shell-card">
          <div class="shell-head"><span class="shell-cmd">$ npm run dist</span><span class="shell-status">exit 0</span></div>
          <pre class="shell-output">built ../dist/FreePi Setup 0.1.0.exe</pre>
        </div>
      </div>
    </section>
    <footer id="composer">
      <div class="change-row" id="changeRow" style="margin-bottom:10px">
        <div class="change-head">
          <span class="change-path">src/renderer/markdown.js</span>
          <span class="diff-counts"><span class="d-add">+18</span><span class="d-del">−4</span></span>
          <button class="ghost small">Diff</button>
          <button class="ghost small danger">Revert</button>
        </div>
        <div class="change-diff" id="changeDiff"></div>
      </div>
      <div id="todoPanel" class="todo-panel">
        <div class="todo-head"><span class="todo-title">Plan</span><span class="todo-count">1/3</span></div>
        <ul class="todo-list">${todos}</ul>
      </div>
      <div class="composer-box"><textarea id="input" rows="1" placeholder="Ask FreePi…"></textarea></div>
    </footer>
  </main>
</div>
<script src="file://${RENDERER.replace(/\\/g, '/')}/markdown.js"></script>
<script>
  const body = document.getElementById('mdBody');
  FPMarkdown.renderInto(body, ${JSON.stringify(SAMPLE)}, { copiedLabel: 'Copied' });
  const fence = String.fromCharCode(96).repeat(3);
  FPMarkdown.renderInto(
    document.getElementById('changeDiff'),
    [fence + 'diff', '--- a/markdown.js', '+++ b/markdown.js', '@@ -10 +10 @@',
      '-  const old = 1;', '+  const next = 2;', '   unchanged();', fence].join('\\n'),
    { copiedLabel: 'Copied' }
  );
</script>
</body></html>`;
}

app.whenReady().then(async () => {
  const file = path.join(app.getPath('temp'), 'freepi-ui-fixture.html');
  fs.writeFileSync(file, fixtureHtml(), 'utf8');

  const win = new BrowserWindow({
    width: 1100,
    height: 1000,
    show: false,
    backgroundColor: '#0f1115',
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  });
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 400));

  const report = await win.webContents.executeJavaScript(`(() => {
    const cs = (sel, prop) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return getComputedStyle(el)[prop];
    };
    const overflow = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflows: el.scrollWidth > el.clientWidth + 1 };
    };
    return {
      bodyFont: cs('.body', 'fontSize'),
      paragraphFont: cs('.md p', 'fontSize'),
      inlineCodeFont: cs('.md-code-inline', 'fontSize'),
      codeFont: cs('.md-code code', 'fontSize'),
      todoFont: cs('.todo-item', 'fontSize'),
      usageRowFont: cs('.usage-row', 'fontSize'),
      copyButton: Boolean(document.querySelector('[data-copy-block]')),
      copyLabel: document.querySelector('[data-copy-block]')?.textContent,
      codeBlocks: document.querySelectorAll('.md-code').length,
      tables: document.querySelectorAll('.md table').length,
      lists: document.querySelectorAll('.md ul, .md ol').length,
      headings: document.querySelectorAll('.md h2, .md h3').length,
      links: document.querySelectorAll('.md a.md-link').length,
      keywordSpans: document.querySelectorAll('.hl-kw').length,
      stringSpans: document.querySelectorAll('.hl-str').length,
      rawBackticks: document.getElementById('mdBody').textContent.includes('\\u0060\\u0060\\u0060'),
      usageRowOverflow: overflow('.usage-row'),
      todoOverflow: overflow('.todo-panel'),
      diffAdd: document.querySelectorAll('.hl-diff-add').length,
      diffDel: document.querySelectorAll('.hl-diff-del').length,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  })()`);

  fs.mkdirSync(SHOTS, { recursive: true });
  const image = await win.webContents.capturePage();
  const shot = path.join(SHOTS, 'ui-render.png');
  fs.writeFileSync(shot, image.toPNG());

  console.log(JSON.stringify(report, null, 2));
  console.log(`screenshot: ${shot}`);

  const fail = [];
  if (!report.copyButton) fail.push('no copy button');
  if (report.codeBlocks !== 2) fail.push(`expected 2 code blocks, got ${report.codeBlocks}`);
  if (report.tables !== 1) fail.push(`expected 1 table, got ${report.tables}`);
  if (report.lists !== 2) fail.push(`expected 2 lists, got ${report.lists}`);
  if (report.rawBackticks) fail.push('raw backticks visible');
  if (report.usageRowOverflow?.overflows) fail.push('usage row overflows');
  if (!report.diffAdd || !report.diffDel) fail.push('diff lines not colored');
  if (report.docOverflowX) fail.push('page scrolls horizontally');
  const px = (v) => parseFloat(v || '0');
  if (px(report.paragraphFont) < 13) fail.push(`paragraph font ${report.paragraphFont} < 13px`);
  if (px(report.usageRowFont) < 12) fail.push(`usage row font ${report.usageRowFont} < 12px`);

  console.log(fail.length ? `FAIL: ${fail.join('; ')}` : 'ui render checks passed');
  app.exit(fail.length ? 1 : 0);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
