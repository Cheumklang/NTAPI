'use strict';

/**
 * Characters allowed in a chat-history folder name.
 *
 * `\p{M}` (combining marks) is the important part: Thai vowels and tone marks
 * are separate code points that Unicode classifies as marks, not letters. The
 * older pattern dropped them, so "เดสก์ท็อป" turned into "เดสก์ท-อป".
 */
const CLEAN_RE = /[^\p{L}\p{M}\p{N}._-]+/gu;
const LEGACY_CLEAN_RE = /[^\p{L}\p{N}._-]+/gu;

const DRIVE_RE = /^[A-Za-z]:$/;
const HOME_RE = /^(Users|home)$/i;

/** Path pieces, on either platform, whatever spelling the string arrived in. */
function segments(input) {
  return String(input).split(/[/\\]+/).filter(Boolean);
}

/**
 * Drop the part of a path that says nothing about the project.
 *
 * This is what makes one workspace get one history folder on two machines.
 * A mapped drive (`Z:\NTAPI`, the Ubuntu home shared into a VM) and the real
 * home path (`/home/nt/NTAPI`) both reduce to `NTAPI`, so a conversation
 * started on either side shows up on the other. Without it the Windows side
 * looked for `Z-NTAPI` and found an empty folder, while the chats sat in
 * `NTAPI`.
 *
 *   Z:\NTAPI                      -> NTAPI
 *   /home/nt/NTAPI                -> NTAPI
 *   Z:\NT-ALL\NTAPI               -> NT-ALL-NTAPI
 *   /home/nt/NT-ALL/NTAPI         -> NT-ALL-NTAPI
 *   C:\Users\nt\Projects\my-app   -> Projects-my-app
 */
function stripRoot(parts) {
  let out = parts.slice();
  if (out.length && DRIVE_RE.test(out[0])) out = out.slice(1);
  if (out.length > 1 && HOME_RE.test(out[0])) {
    // "/home/nt" and "C:\Users\nt" are the machine, not the project; a path
    // that IS the home folder keeps the user's name so it stays readable.
    out = out.length > 2 ? out.slice(2) : out.slice(1);
  }
  return out;
}

/**
 * Readable folder name for a workspace's chat history: the last two meaningful
 * path segments, e.g. "OneDrive/เดสก์ท็อป/freepi" becomes "เดสก์ท็อป-freepi".
 */
function sessionDirNameFor(cwd, { legacy = false } = {}) {
  const all = segments(cwd);
  // Older builds kept the second segment no matter what it was, which is why a
  // drive-lettered path and a home path disagreed. `legacy` still reproduces
  // that spelling so history written by those builds can be found.
  const kept = legacy
    ? all.filter((p, i) => !(i === 0 && DRIVE_RE.test(p)) && i > 1)
    : stripRoot(all);
  const tail = (kept.length ? kept : all).slice(-2).join('-') || 'workspace';
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

/** Folder name an older build produced for the same workspace. Used only to find
 * and rename history that is already on disk. */
function legacySessionDirName(cwd) {
  return sessionDirNameFor(cwd, { legacy: true });
}

/**
 * Two workspace strings that mean the same project.
 *
 * Only the history-folder name is compared, deliberately: `Z:\NTAPI` and
 * `/home/nt/NTAPI` are one folder on two machines, and a chat written by one
 * side must still count as this workspace's chat on the other.
 */
function sameWorkspace(a, b) {
  if (!a || !b) return false;
  return sessionDirName(a) === sessionDirName(b);
}

module.exports = { sessionDirName, legacySessionDirName, sameWorkspace };
