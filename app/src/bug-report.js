/**
 * What a bug report has to say, in the order a reader needs it.
 *
 * The environment block used to be the whole report — version and OS, and
 * nothing about what broke. A maintainer reading that cannot tell a broken
 * button from a broken install, and the two need different answers. So the
 * error comes first, then what the person was doing, and the machine details
 * last, where they belong. Pure functions, testable without Electron.
 *
 * Run from app/:   node scripts/selftest-bug-report.js
 */
'use strict';

const { formatSystemInfo } = require('./system-info');

/** Anything that looks like a credential, and the home path, never leaves here. */
function redact(text, { home } = {}) {
  let out = String(text ?? '');
  if (home) {
    out = out.split(home + '/').join('~/').split(home).join('~');
    const winHome = home.replace(/\//g, '\\');
    out = out.split(winHome + '\\').join('~\\').split(winHome).join('~');
  }
  // A key pasted into an error message is the user's problem twice over.
  out = out.replace(/\b(sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,})\b/g, '[redacted]');
  out = out.replace(/\b(Bearer)\s+[A-Za-z0-9._-]{10,}/gi, '$1 [redacted]');
  return out;
}

/** A stack is useful up to the point it repeats the message. */
function trimStack(stack, lines = 7) {
  const all = String(stack || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!all.length) return '';
  return all.slice(0, lines).join('\n');
}

/**
 * @param {object} report
 * @param {string|Error} report.error     what the window saw
 * @param {object} report.context         what the person was doing
 * @param {object} report.info            version, runtime, OS, data folder
 * @param {string[]} report.logLines      the last few lines the app produced
 * @param {string} report.home            path to fold into "~"
 * @param {string} report.when            ISO timestamp
 */
function formatBugReport({ error, context = {}, info = {}, logLines = [], home = '', when = '' } = {}) {
  const message = typeof error === 'string' ? error : (error && error.message) || '';
  const stack = typeof error === 'object' && error ? error.stack || '' : '';

  const blocks = [];

  const headline = ['## What went wrong'];
  if (message) headline.push(redact(message, { home }));
  else headline.push('(no error message reached the window)');
  const trimmed = trimStack(stack, 7);
  if (trimmed && !trimmed.split('\n')[0].includes(message)) headline.push(trimmed);
  blocks.push(headline.join('\n'));

  const doing = ['## What was happening'];
  if (when) doing.push(`When: ${when}`);
  if (context.screen) doing.push(`Screen: ${context.screen}`);
  if (context.workspace) doing.push(`Workspace: ${redact(context.workspace, { home })}`);
  if (context.model) doing.push(`Model: ${context.model}`);
  if (context.busy !== undefined) doing.push(`Turn running: ${context.busy ? 'yes' : 'no'}`);
  if (context.lastAction) doing.push(`Last action: ${redact(context.lastAction, { home })}`);
  if (context.lastTool) doing.push(`Last tool: ${context.lastTool}`);
  if (doing.length > 1) blocks.push(doing.join('\n'));

  const env = formatSystemInfo(info);
  if (env) blocks.push(`## Environment\n${redact(env, { home })}`);

  const lines = logLines.map((l) => String(l).trim()).filter(Boolean).slice(-15);
  if (lines.length) blocks.push(`## Recent log\n${redact(lines.join('\n'), { home })}`);

  return blocks.join('\n\n');
}

module.exports = { formatBugReport, redact, trimStack };
