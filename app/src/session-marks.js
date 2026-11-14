'use strict';

const path = require('node:path');

/**
 * Pins and colours for saved chats.
 *
 * Both belong to the *file on disk*, not to an open tab: `/clear` throws the tab
 * away, and a chat that was never opened in this window still shows up in the
 * sidebar. The key is therefore the session file's absolute path.
 *
 * Two consequences that shape this module:
 *
 * 1. A path is a poor key on Windows — the same file can be reached with a
 *    different drive-letter case or with forward slashes. Every key is
 *    normalised before it is read or written, otherwise a pin set from the
 *    sidebar and a pin looked up after a restart would miss each other.
 * 2. Deleting a chat leaves its mark behind. `prune()` drops marks whose file no
 *    longer exists, so prefs cannot grow forever.
 *
 * The marks live inside `prefs.json`. That keeps the pi session format untouched
 * — the SDK owns those `.jsonl` files, and writing our own entry kind into them
 * would risk confusing it on the next version.
 */

/**
 * The palette. Deliberately seven named hues instead of a colour picker: the
 * point is to *tell groups of work apart* at a glance, and a free picker would
 * mostly produce colours too close to each other to separate.
 *
 * `key` is what is stored; the renderer maps it to a CSS custom property so the
 * stripe stays readable on the dark sidebar.
 */
const COLORS = [
  { key: 'red', en: 'Red', th: 'แดง' },
  { key: 'orange', en: 'Orange', th: 'ส้ม' },
  { key: 'yellow', en: 'Yellow', th: 'เหลือง' },
  { key: 'green', en: 'Green', th: 'เขียว' },
  { key: 'blue', en: 'Blue', th: 'ฟ้า' },
  { key: 'purple', en: 'Purple', th: 'ม่วง' },
  { key: 'pink', en: 'Pink', th: 'ชมพู' },
];

const COLOR_KEYS = COLORS.map((c) => c.key);

/** Normalise a session file path so the same file always yields the same key. */
function markKey(sessionPath) {
  if (typeof sessionPath !== 'string' || !sessionPath.trim()) return null;
  const resolved = path.resolve(sessionPath.trim());
  // Windows is case-insensitive; `path.resolve` already made the slashes native.
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** A mark with no pin and no colour is nothing to store. */
function isEmptyMark(mark) {
  return !mark || (!mark.pinned && !mark.color);
}

/** Drop anything that is not a known colour, so a typo cannot become a value. */
function cleanColor(color) {
  return COLOR_KEYS.includes(color) ? color : null;
}

/** A stored record, in the shape the renderer reads. */
function readMark(marks, sessionPath) {
  const key = markKey(sessionPath);
  if (!key) return { pinned: false, color: null };
  const raw = marks && typeof marks === 'object' ? marks[key] : null;
  if (!raw || typeof raw !== 'object') return { pinned: false, color: null };
  return { pinned: raw.pinned === true, color: cleanColor(raw.color) };
}

/**
 * Return new mark for one chat. Pure: it never touches the object it is given.
 *
 * Unknown fields are ignored rather than copied, so a corrupt prefs entry cannot
 * travel forward with every write.
 */
function applyMark(marks, sessionPath, patch = {}) {
  const key = markKey(sessionPath);
  const next = { ...(marks && typeof marks === 'object' ? marks : {}) };
  if (!key) return next;

  const current = readMark(next, sessionPath);
  const merged = { pinned: current.pinned, color: current.color };

  if ('pinned' in patch) merged.pinned = patch.pinned === true;
  if ('color' in patch) merged.color = cleanColor(patch.color);

  if (isEmptyMark(merged)) delete next[key];
  else next[key] = merged;
  return next;
}

/**
 * Order for the sidebar: pinned chats first, everything else exactly as the
 * caller handed it over.
 *
 * This deliberately does **not** re-sort by time. The sidebar is already sorted
 * by creation time (`listSessions`), and re-sorting here would be a second,
 * competing order: a chat written to a moment ago would jump above a chat you
 * started earlier, which is the reshuffle-by-`modified` bug the creation-time
 * sort exists to prevent. Pinning is the only reason to move a row.
 */
function sortByMark(marks, sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const pinned = [];
  const rest = [];
  for (const session of list) {
    if (readMark(marks, session?.path).pinned) pinned.push(session);
    else rest.push(session);
  }
  return [...pinned, ...rest];
}

/** Drop marks whose session file is gone. Keeps prefs from growing forever. */
function pruneMarks(marks, exists) {
  const source = marks && typeof marks === 'object' ? marks : {};
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') continue;
    let alive = true;
    try {
      alive = exists(key);
    } catch {
      alive = false;
    }
    if (alive) next[key] = { ...value };
  }
  return next;
}

module.exports = {
  COLORS,
  COLOR_KEYS,
  markKey,
  readMark,
  applyMark,
  sortByMark,
  pruneMarks,
  cleanColor,
  isEmptyMark,
};
