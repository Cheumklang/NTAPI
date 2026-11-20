/**
 * "Always allow" in the approval dialog.
 *
 * The dialog used to offer two answers only, while the only way to stop being
 * asked was a switch in the sidebar. The user asked for the third answer to be
 * there (2026-11-21) — but it has to be the switch, not a new private memory:
 * one decision the reader can see and take back.
 *
 * Run from app/:   node scripts/selftest-approval-always.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failed = 0;
function check(name, ok, detail) {
  if (ok) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? `\n  ${detail}` : ''}`);
  }
}

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return '';
  // Keep `async` — an extracted async function without it cannot await.
  const start = at >= 6 && src.slice(at - 6, at) === 'async ' ? at - 6 : at;
  // Past the parameter list first: one of this function's parameters is a
  // destructured object, and its brace looks like the body's opening brace.
  let parens = 0;
  let afterParams = -1;
  for (let i = src.indexOf('(', start); i < src.length; i += 1) {
    if (src[i] === '(') parens += 1;
    else if (src[i] === ')') {
      parens -= 1;
      if (parens === 0) {
        afterParams = i;
        break;
      }
    }
  }
  if (afterParams === -1) return '';
  const brace = src.indexOf('{', afterParams);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return '';
}

/* ------------------------------------------------------------- the markup */

const overlayStart = html.indexOf('id="approvalOverlay"');
const overlayEnd = html.indexOf('id="confirmOverlay"');
const overlay = overlayStart !== -1 && overlayEnd > overlayStart ? html.slice(overlayStart, overlayEnd) : '';

check('the approval dialog is where it was', overlay !== '');
check('it offers an always-allow button', /id="approvalAlways"/.test(overlay));
check('the button is labelled for both languages', /id="approvalAlways"[^>]*data-i18n="allowAlways"/.test(overlay));
check(
  'the order reads deny, always, allow once',
  overlay.indexOf('id="approvalDeny"') < overlay.indexOf('id="approvalAlways"') &&
    overlay.indexOf('id="approvalAlways"') < overlay.indexOf('id="approvalAllow"')
);
check('the one-off answer stays the default focus', /id="approvalAllow" class="send"/.test(overlay));
check('the memory line is translatable', /data-i18n="approvalNoMemory"/.test(overlay));
check('the old hard-coded no-memory line is gone', !/ถามทุกครั้ง · ไม่จำคำตอบ/.test(overlay));

/* ------------------------------------------------------------ the wiring */

check('the button is wired', /el\('approvalAlways'\)\.addEventListener\('click', \(\) => answerApproval\(true, \{ always: true \}\)\)/.test(app));
check('the answer takes the wider choice', /async function answerApproval\(allow, \{ always = false \} = \{\}\)/.test(app));
check('the sidebar switch is what remembers', /api\.setApprovalMode\(\{ policy: 'allow' \}\)/.test(app));
check('and the switch is repainted at once', /applyApprovalMode\(res\)/.test(app));
check('the reader is told where to undo it', /showToast\(\{ title: t\('approvalTitle'\), body: t\('approvalAlwaysDone'\) \}\)/.test(app));

const countOf = (needle) => (app.match(new RegExp(`\\b${needle}:`, 'g')) || []).length;
for (const key of ['allowAlways', 'approvalAlwaysDone', 'approvalNoMemory']) {
  check(`both languages carry ${key}`, countOf(key) === 2);
}

/* ---------------------------------------------- answering once is still once */

check(
  'a plain allow never changes the setting',
  /if \(always && allow\) \{\n\s*const res = await api\.setApprovalMode/.test(app)
);

const respondStart = main.indexOf("ipcMain.handle('approval:respond'");
const respondEnd = main.indexOf("ipcMain.handle('approval:setMode'");
const respond = respondStart !== -1 ? main.slice(respondStart, respondEnd) : '';
check('main handles the answer', respond !== '');
check('and answering does not quietly set the policy', !/setApprovalPolicy/.test(respond));

/* ----------------------------------------------------- run the real function */

function harness({ always, allow, pending = 'approval-7' } = {}) {
  const calls = { respond: [], mode: [], toast: 0 };
  // One element, not a fresh one per call: the dialog's hidden flag is the point.
  const overlayEl = { hidden: false };
  const scope = {
    pendingApprovalId: pending,
    overlayEl,
    approvalOverlay: () => overlayEl,
    input: { focus() {} },
    t: (key) => key,
    api: {
      respondApproval: async (id, value) => {
        calls.respond.push([id, value]);
        return { ok: true };
      },
      setApprovalMode: async (opts) => {
        calls.mode.push(opts);
        return { ok: true, policy: 'allow' };
      },
    },
    applyApprovalMode: (res) => calls.mode.push({ applied: res.policy }),
    showToast: () => {
      calls.toast += 1;
    },
  };
  const fn = new Function('scope', `with (scope) { return (${body(app, 'answerApproval')}); }`)(scope);
  return { fn, scope, calls, always, allow };
}

(async () => {
  const once = harness();
  await once.fn(true);
  check('allow answers the waiting tool', once.calls.respond.length === 1 && once.calls.respond[0][1] === true);
  check('allow leaves the setting alone', once.calls.mode.length === 0 && once.calls.toast === 0);
  check('the dialog closes either way', once.scope.overlayEl.hidden === true);

  const deny = harness();
  await deny.fn(false);
  check('deny refuses without touching the setting', deny.calls.respond[0][1] === false && deny.calls.mode.length === 0);

  const forever = harness({ always: true });
  await forever.fn(true, { always: true });
  check('always answers this one too', forever.calls.respond[0][1] === true);
  check('always turns the sidebar switch on', forever.calls.mode[0]?.policy === 'allow');
  check('and the switch is repainted from the saved value', forever.calls.mode[1]?.applied === 'allow');
  check('the reader gets one toast', forever.calls.toast === 1);

  const nothingWaiting = harness({ pending: null });
  await nothingWaiting.fn(true, { always: true });
  check('always with no dialog still sets the setting', nothingWaiting.calls.mode[0]?.policy === 'allow');
  check('and answers nothing', nothingWaiting.calls.respond.length === 0);

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nPASS: the dialog offers a third answer, and it is the sidebar switch');
})();
