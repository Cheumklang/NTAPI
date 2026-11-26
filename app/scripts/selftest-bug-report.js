const fs = require('node:fs');
const path = require('node:path');

/**
 * A bug report is only worth the trip if the person who reads it can tell what
 * broke. The old one was environment details and nothing else, so these checks
 * pin the order (error first), the redaction, and the wiring on both sides.
 */
function main() {
  const root = path.join(__dirname, '..');
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const { formatBugReport, redact, trimStack } = require(path.join(root, 'src', 'bug-report.js'));

  let failed = 0;
  const check = (label, ok) => {
    if (ok) console.log(`PASS ${label}`);
    else {
      failed += 1;
      console.log(`FAIL ${label}`);
    }
  };

  /* ---- the text itself ---- */
  const stack = ['Error: reply was never sent', '    at a', '    at b', '    at c', '    at d', '    at e', '    at f', '    at g', '    at h'].join('\n');
  const text = formatBugReport({
    error: { message: "Error invoking remote method 'fs:openPath': reply was never sent", stack },
    context: {
      screen: 'Chat',
      workspace: '/home/ana/NTAPI',
      model: 'freepi some-model',
      busy: false,
      lastAction: 'แสดงในโฟลเดอร์',
      lastTool: 'fs:openPath',
    },
    info: { version: '0.9.8', electron: '38.8.6', platform: 'linux', release: '7.0.0', arch: 'x64', dataDir: '/home/ana/.local/share/ntapi', packaged: false },
    logLines: ['[error] something failed'],
    home: '/home/ana',
    when: '2026-11-26T16:20:00.000Z',
  });

  check('the report leads with what went wrong', text.startsWith('## What went wrong'));
  check('the error message is in it', text.includes("Error invoking remote method 'fs:openPath': reply was never sent"));
  check('the stack is in it, trimmed', /at f/.test(text) && !/at h/.test(text));
  check('what the person was doing is in it', /## What was happening[\s\S]*Screen: Chat/.test(text));
  check('the last action is in it', text.includes('Last action: แสดงในโฟลเดอร์'));
  check('the failing tool is in it', text.includes('Last tool: fs:openPath'));
  check('the environment comes after the facts', text.indexOf('## Environment') > text.indexOf('## What was happening'));
  check('the recent log is included', /## Recent log[\s\S]*something failed/.test(text));
  check('the home path is folded to ~', text.includes('Workspace: ~/NTAPI') && !text.includes('/home/ana/NTAPI'));
  check('the report never carries a key', redact('sk-abcdef1234567890 and AIzaSyA1234567890abcdef', {}) === '[redacted] and [redacted]');
  check('a missing message is stated, not left blank', /no error message reached the window/.test(formatBugReport({ error: '', info: {} })));
  check('an empty log adds no empty heading', !/## Recent log/.test(formatBugReport({ error: 'x', logLines: [] })));
  check('the stack trim keeps seven lines', trimStack(stack, 7).split('\n').length === 7);

  /* ---- the wiring ---- */
  const mainJs = read('src/main.js');
  const preload = read('src/preload.js');
  const app = read('src/renderer/app.js');

  check('main: a bounded buffer keeps what the app complained about', /recentLog/.test(mainJs) && /RECENT_LOG_MAX/.test(mainJs));
  check('main: the report is built from the payload', /formatBugReport\(\{[\s\S]{0,220}payload\?\.error/.test(mainJs));
  check('main: the home path is redacted with the machine home', /home: os\.homedir\(\)/.test(mainJs));
  check('main: the window lines are merged into the log', /payload\?\.logLines/.test(mainJs));
  check('renderer: what the page complained about is kept', /const uiLog = \[\]/.test(app) && /logLines: uiLog\.slice\(-10\)/.test(app));
  check('preload: the context is passed through', /systemInfo: \(payload\) => ipcRenderer\.invoke\('app:systemInfo', payload \|\| \{\}\)/.test(preload));
  check('renderer: the error is remembered, stack and all', /lastCrash = \{ message: msg, stack:/.test(app));
  check('renderer: the last press is remembered', /lastAction = label\.slice\(0, 80\)/.test(app));
  check(
    'renderer: the context names the screen, workspace and model',
    /screen: el\('settingsOverlay'\)/.test(app) && /workspace: view\?\.cwd/.test(app) && /busy: Boolean\(view\?\.busy\)/.test(app)
  );

  /* ---- a handler that throws must still answer ---- */
  check('main: openPath cannot leave the window waiting', /ipcMain\.handle\('fs:openPath'[\s\S]{0,400}catch \(err\)/.test(mainJs));
  check('main: revealPath and readMedia answer too', /ipcMain\.handle\('fs:revealPath'[\s\S]{0,400}catch \(err\)/.test(mainJs));

  if (failed) {
    console.log(`\n${failed} bug-report check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll bug-report checks passed.');
}

main();
