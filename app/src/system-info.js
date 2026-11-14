/**
 * What a bug report needs: version, runtime, OS, locale and where the app keeps
 * its data — assembled into one block the user can paste. Pure functions so the
 * format is testable without Electron.
 *
 * Run from app/:   node scripts/selftest-system-info.js
 */
'use strict';

const PLATFORM_NAMES = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

/** "Windows 10.0.22631 x64" — release is what actually tells two builds apart. */
function describePlatform({ platform, release, arch } = {}) {
  const name = PLATFORM_NAMES[platform] || platform || 'Unknown OS';
  return [name, release, arch].filter(Boolean).join(' ');
}

/** Never let an Error object turn into "[object Object]" in a crash banner. */
function safeErrorMessage(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (typeof err.message === 'string' && err.message) return err.message;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Multi-line plain text. Missing fields are skipped rather than printed as
 * "undefined" — a half-filled report is still useful.
 */
function formatSystemInfo(info = {}) {
  const lines = [];
  const version = info.version ? `v${String(info.version).replace(/^v/, '')}` : '';
  lines.push(['NTAPI', version].filter(Boolean).join(' '));

  const runtime = [info.electron && `Electron ${info.electron}`, info.chrome && `Chrome ${info.chrome}`, info.node && `Node ${info.node}`]
    .filter(Boolean)
    .join(' · ');
  if (runtime) lines.push(runtime);

  const os = describePlatform(info);
  if (os && os !== 'Unknown OS') lines.push(os);
  if (info.locale) lines.push(`Locale: ${info.locale}`);
  if (info.provider) lines.push(`Provider: ${info.provider}`);
  if (info.language) lines.push(`Language: ${info.language}`);
  if (info.dataDir) lines.push(`Data folder: ${info.dataDir}`);
  if (typeof info.packaged === 'boolean') lines.push(`Packaged: ${info.packaged ? 'yes' : 'no'}`);

  return lines.join('\n');
}

module.exports = { describePlatform, safeErrorMessage, formatSystemInfo };
