/**
 * Offline regression guard for how failures behave in the chat view.
 *
 * A failed tool used to pop its card open and force the transcript to the
 * bottom. Users read that as the app taking over: the box "opens itself" and
 * the view jumps to it. This test pins the rule instead — a failure is marked
 * in place, and the transcript only follows when the reader is already at the
 * bottom.
 *
 * src/renderer/app.js needs a live DOM, so this check reads the source and
 * inspects the two functions that own that behaviour.
 *
 * Run: node scripts/selftest-error-ux.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    return;
  }
  failures += 1;
  console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ''}`);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');

/** Pull `function name(...) { ... }` out of the source by brace matching. */
function bodyOf(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const applyToolResult = bodyOf('applyToolResult');
const appendErrorBanner = bodyOf('appendErrorBanner');

check('applyToolResult exists', Boolean(applyToolResult));
check('appendErrorBanner exists', Boolean(appendErrorBanner));

// 1. A failure must not expand its own card.
check(
  'a failed tool card stays collapsed',
  Boolean(applyToolResult) && !/classList\.remove\(\s*'collapsed'\s*\)/.test(applyToolResult),
  'applyToolResult must not remove the collapsed class'
);

// 2. A failure must not expand the whole tools group either.
check(
  'a failed tool does not open the tool group',
  Boolean(applyToolResult) && !/tools\.hidden\s*=\s*false/.test(applyToolResult),
  'applyToolResult must not set tools.hidden = false'
);

// 3. The failure still has to be visible: red card, "Failed" label, group summary.
check(
  'the failure is still marked on the card',
  Boolean(applyToolResult) && /classList\.toggle\(\s*'error'/.test(applyToolResult) && /toolFailed/.test(applyToolResult)
);
check(
  'the group summary is refreshed so the failure is countable',
  Boolean(applyToolResult) && /refreshToolsSummary\(/.test(applyToolResult)
);

// 4. The error banner must never force the transcript to the bottom.
check(
  'the error banner does not force a scroll',
  Boolean(appendErrorBanner) && !/scrollToBottom\(\s*true\s*\)/.test(appendErrorBanner),
  'appendErrorBanner must call scrollToBottom() without the force flag'
);
check(
  'the error banner still follows a reader who is at the bottom',
  Boolean(appendErrorBanner) && /scrollToBottom\(/.test(appendErrorBanner)
);

// The rule moved into the sticky `pinnedToBottom` state, which the jump-to-newest
// button shares through isReadingUp(). It is no longer recomputed from a distance
// on every call, because content growing under a reader who never scrolled made
// the measured gap look like they had left.
const scroll = bodyOf('scrollToBottom');
check(
  'scrollToBottom only moves when the reader is following',
  Boolean(scroll) && /if\s*\(\s*!force\s*&&\s*!pinnedToBottom\s*\)/.test(scroll),
  'scrollToBottom must defer to the follow state when not forced'
);

// 6. The banner carries its own gutter.
//
// `.transcript > *` insets every block by 22px, but a block that sets its own
// padding replaces that inset instead of adding to it — so the banner used to
// hug the transcript edge at 12px while everything around it sat at 22px, and
// the error text looked like it was touching the border.
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
const bannerRule = css.match(/\n\.transcript > \.error-banner \{[\s\S]*?\n\}/);
check('the banner is re-inset to the transcript gutter', Boolean(bannerRule));
check(
  'the inset is expressed against the read width',
  Boolean(bannerRule) && /max-width:\s*calc\(var\(--read-width\) - 44px\)/.test(bannerRule[0])
);
check(
  'the banner keeps padding inside its own border',
  Boolean(bannerRule) && /padding:\s*11px 14px/.test(bannerRule[0])
);
check(
  'the longer form of the rule wins over the shared `> *` inset',
  css.indexOf('.transcript > .error-banner') > css.indexOf('.transcript > *')
);

// 7. The browser dialog's buttons: a tidy helper row, then a footer with the
// destructive action kept away from the way out.
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
const wrapRow = html.match(/<div class="dialog-actions wrap">[\s\S]*?<\/div>/);
check('the helper buttons share one row', Boolean(wrapRow));
check(
  'that row holds the two install helpers',
  Boolean(wrapRow) && ['browserOpenFolder', 'browserCopyUrl'].every((id) => wrapRow[0].includes(id))
);
check('the helper row no longer ends the dialog', Boolean(wrapRow) && !wrapRow[0].includes('browserClose'));

// The footer now nests the on/off pill's own <div>, so the slice runs to the
// next closing tag pair rather than the pill's inner one.
const footerRow = html.match(/<div class="dialog-actions footer">[\s\S]*?<\/div>\s*<\/div>/);
check(
  'the footer holds only the way out',
  Boolean(footerRow) && footerRow[0].includes('browserClose') && !footerRow[0].includes('browserPower')
);
// The on/off pill sits in step 1, next to the instruction it belongs to.
const stepsRow = html.match(/<ol class="browser-steps">[\s\S]*?<\/ol>/);
check(
  'step 1 carries the on/off pill and every step carries its own controls',
  Boolean(stepsRow) &&
    stepsRow[0].includes('browserPower') &&
    stepsRow[0].includes('browserOpenFolder') &&
    stepsRow[0].includes('browserTabsList')
);

const wrapCss = css.match(/\n\.dialog-actions\.wrap \{[\s\S]*?\n\}/);
check('the helper row may wrap instead of overflowing', Boolean(wrapCss) && /flex-wrap:\s*wrap/.test(wrapCss[0]));
check('the helpers share the width evenly', /\n\.dialog-actions\.wrap \.ghost \{[^}]*flex:\s*1 1 auto/.test(css));
const footCss = css.match(/\n\.dialog-actions\.footer \{[\s\S]*?\n\}/);
check(
  'the footer separates the way out from the primary button',
  Boolean(footCss) && /justify-content:\s*space-between/.test(footCss[0])
);
check(
  'the dialog scrolls so its footer is never cut off',
  /\.browser-dialog \{[\s\S]*?overflow-y:\s*auto/.test(css)
);
check('the browser dialog opts into that rule', /class="dialog browser-dialog"/.test(html));

// 8. Red lines must not accumulate: one click removes one, and fifteen seconds
// removes it anyway. A provider that keeps returning 503 used to leave a column
// of red text in the transcript with no way back to the conversation.
const errorBanner = bodyOf('appendErrorBanner');
check('the error banner can be read out of the renderer', Boolean(errorBanner));
check(
  'a red line disappears when clicked',
  Boolean(errorBanner) && /addEventListener\('click', dismiss\)/.test(errorBanner)
);
check(
  'a red line disappears by itself after fifteen seconds',
  /const ERROR_BANNER_MS = 15_000;/.test(source) && /setTimeout\(dismiss, ERROR_BANNER_MS\)/.test(source)
);
check(
  'the keyboard can dismiss it too',
  Boolean(errorBanner) && /e\.key !== 'Enter' && e\.key !== ' '/.test(errorBanner)
);
check(
  'the banner says it is clickable',
  Boolean(errorBanner) && /div\.title = t\('errorBannerClose'\)/.test(errorBanner)
);
check(
  'it fades instead of vanishing instantly',
  Boolean(errorBanner) && /classList\.add\('out'\)/.test(errorBanner) && /remove\(\), 220/.test(errorBanner)
);
check(
  'the dismissible banner is styled as interactive',
  /\n\.error-banner \{[^}]*cursor:\s*pointer/.test(css) && /\n\.error-banner\.out \{[^}]*opacity:\s*0/.test(css)
);

// 9. A spent allowance is a pause, not a dead end.
//
// The turn stops with the question already on screen. Asking the user to retype
// it (or to press Send, which files it a second time) is the tax this removes:
// the red line for a limit failure stays put and carries one Retry button that
// resumes the same request in place.
const onErrorBody = bodyOf('api.onError') || source.slice(source.indexOf('api.onError(('));
check(
  'a limit failure is the only one that offers a retry',
  /p\.limit \? \{ onRetry: \(\) => retryTurn\(view\) \} : \{\}/.test(source)
);
check(
  'the resumable line does not fade away before the reader acts',
  Boolean(errorBanner) && /if \(!onRetry\) setTimeout\(dismiss, ERROR_BANNER_MS\)/.test(errorBanner)
);
check(
  'the retry button does not bubble up and dismiss its own banner',
  Boolean(errorBanner) && /e\.stopPropagation\(\)/.test(errorBanner) && /error-retry/.test(errorBanner)
);
const retryTurn = bodyOf('retryTurn');
check('the retry runs through its own IPC call', Boolean(retryTurn) && /api\.retryPrompt\(view\.tabId\)/.test(retryTurn));
check(
  'a refused retry says why instead of going silent',
  Boolean(retryTurn) && /errorRetryBusy/.test(retryTurn) && /errorRetryFailed/.test(retryTurn)
);
const retryCss = css.match(/\n\.error-banner-retry \{[\s\S]*?\n\}/);
check('the resumable banner is laid out as a column', Boolean(retryCss) && /flex-direction:\s*column/.test(retryCss[0]));
check(
  'the banner itself is no longer an invitation to click it away',
  Boolean(retryCss) && /cursor:\s*default/.test(retryCss[0])
);
check(
  'the retry button reads as the failure\'s own action',
  /\n\.error-banner-actions \.error-retry \{[^}]*color:\s*var\(--danger\)/.test(css)
);

// The main process is the half that can actually resume: it starts a turn from a
// hidden continuation message, so the same prompt is not stored twice.
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
check(
  'the error event says whether the failure is a spent allowance',
  /sendTab\(tabId, 'agent:error', \{[\s\S]{0,220}?limit\s*[,}]/.test(mainSource) &&
    /const limit = isLimitError\(\{ text: raw, code \}\)/.test(mainSource)
);
const retryHandler = mainSource.slice(mainSource.indexOf("ipcMain.handle('prompt:retry'"));
check('the main process can retry a turn', retryHandler.length > 0);
check(
  'the retry continues without a second visible message',
  /sendCustomMessage\([\s\S]{0,320}?display: false[\s\S]{0,80}?\{ triggerTurn: true \}/.test(retryHandler)
);
check(
  'an idle session is required, so two turns never overlap',
  /if \(session\.isStreaming\) return \{ ok: false, reason: 'busy' \}/.test(retryHandler)
);
check(
  'the window can reach it',
  /retryPrompt: \(tabId\) => ipcRenderer\.invoke\('prompt:retry', tabId\)/.test(preloadSource)
);
check('the retry banner is wired from the error handler', Boolean(onErrorBody));

// The live banner is not the only place the failure appears: switching chats
// repaints the transcript from the session, so the retry has to survive that
// round trip. Only the newest entry may offer it — an older failure sits under an
// answer that already went through.
check(
  'a replayed limit failure keeps its retry',
  /const resumable = Boolean\(m\.limit\) && messages\[messages\.length - 1\] === m && !view\.busy/.test(source) &&
    /appendErrorBanner\(m\.text, false, resumable \? \{ onRetry: \(\) => retryTurn\(view\) \} : \{\}\)/.test(source)
);
check(
  'history entries carry the limit flag from the session message',
  /limit: isLimitError\(\{ text: m\.errorMessage \}\)/.test(mainSource)
);
check(
  'the synthetic settle-time failure carries it too',
  /limit: isLimitError\(\{ text: failure\.text \}\)/.test(mainSource)
);

const crashNotice = bodyOf('showCrashNotice');
check('the crash banner can be read out of the renderer', Boolean(crashNotice));
check(
  'the crash banner stays until it is closed or retried',
  Boolean(crashNotice) && !/crashNoticeTimer/.test(crashNotice) && !/15_000/.test(crashNotice)
);
check(
  'the crash banner retries by reloading the page',
  /el\('crashRetry'\)[\s\S]{0,120}?location\.reload\(\)/.test(source)
);

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nPASS: failures stay marked, never in the reader\'s face');
