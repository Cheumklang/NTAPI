'use strict';

const path = require('node:path');

/**
 * Characters allowed in a chat-history folder name.
 *
 * `\p{M}` (combining marks) is the important part: Thai vowels and tone marks
 * are separate code points that Unicode classifies as marks, not letters. The
 * older pattern dropped them, so "เดสก์ท็อป" turned into "เดสก-ท-อป".
 */
const CLEAN_RE = /[^\p{L}\p{M}\p{N}._-]+/gu;
const LEGACY_CLEAN_RE = /[^\p{L}\p{N}._-]+/gu;

/**
 * Readable folder name for a workspace's chat history: the last two path
 * segments, e.g. "OneDrive/เดสก์ท็อป/freepi" becomes "เดสก์ท็อป-freepi".
 */
function sessionDirNameFor(cwd, { legacy = false } = {}) {
  const resolved = path.resolve(cwd);
  const parts = resolved.split(/[/\\]/).filter(Boolean);
  // Drop the drive letter and the user's name; keep the meaningful tail.
  const useful = parts.filter((p, i) => !(i === 0 && /^[A-Za-z]:$/.test(p)) && i > 1);
  const tail = (useful.length ? useful : parts).slice(-2).join('-') || 'workspace';
  const clean = tail
    .normalize('NFC')
    .replace(legacy ? LEGACY_CLEAN_RE : CLEAN_RE, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'workspace';
}

/** Folder name new sessions are written to. */
function sessionDirName(cwd) {
  return sessionDirNameFor(cwd);
}

/**
 * Folder name an older build produced for the same workspace. Used only to find
 * and rename history that is already on disk.
 */
function legacySessionDirName(cwd) {
  return sessionDirNameFor(cwd, { legacy: true });
}

module.exports = { sessionDirName, legacySessionDirName };
