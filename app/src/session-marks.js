'use strict';

/**
 * Pins and colours for saved chats.
 *
 * Both belong to the *file on disk*, not to an open tab: `/clear` throws the tab
 * away, and a chat that was never opened in this window still shows up in the
 * sidebar. The key is therefore the session file's own name (`markKey`).
 *
 * Two consequences that shape this module:
 *
 * 1. A path is a poor key — the same file is spelled differently by each machine
 *    that shares the data folder (Linux path vs `Z:\...`), and on Windows even
 *    the drive-letter case varies. The file name does not.
 * 2. Deleting a chat leaves its mark behind. `pruneMarks()` drops marks whose
 *    file is gone, so prefs cannot grow forever.
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

/**
 * The key for one chat.
 *
 * The identity of a session file is its own name: the store names files
 * `<timestamp>_<uuid>.jsonl`, unique across the whole store, while the folder
 * above it is only the workspace's name and adds nothing. Lower-cased, because
 * Windows gives back the same file with a different drive letter, slash style
 * or name case.
 *
 * Why not the path, which is what this module used to store: the data folder is
 * shared with a Windows VM through a mapped drive, so `/home/nt/.../sessions`
 * and `Z:\...\sessions` are the same tree spelled two ways. Each side fed the
 * other's spelling to `path.resolve`, which does not recognise a foreign path as
 * absolute, and the keys grew into things like
 * `/home/nt/NT-ALL/NTAPI/app/z:\home\nt\...\ntapi\ntapi/2026-...jsonl` — a
 * key nobody looks up, so the pin looked lost after a restart. A bare file name
 * is the one spelling both machines produce for the same chat.
 */
function markKey(sessionPath) {
  if (typeof sessionPath !== 'string') return null;
  // Both separators, on every platform: the other side's path arrives as text.
  const name = sessionPath.trim().split(/[\\/]/).filter(Boolean).pop();
  if (!name || name === '.' || name === '..') return null;
  return name.toLowerCase();
}

/**
 * Rewrite a store written under an older key scheme.
 *
 * Called once at startup. Every older spelling — an absolute path, a path
 * relative to the session store, or the mangled mix a shared data folder
 * produced — ends with the session's file name, which is exactly the new key, so
 * an existing pin is recovered rather than lost. Two old keys that collapse into
 * the same chat keep whichever marks they carried.
 */
function migrateMarks(store) {
  const source = store && typeof store === 'object' ? store : {};
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') continue;
    const portable = markKey(key);
    if (!portable) continue;
    const previous = next[portable];
    if (!previous) {
      next[portable] = { ...value };
      continue;
    }
    next[portable] = {
      pinned: previous.pinned === true || value.pinned === true,
      color: previous.color || value.color || null,
    };
  }
  return next;
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

/**
 * Drop marks whose session file is gone. Keeps prefs from growing forever.
 *
 * `exists` is handed the key — a session file's name — and answers whether such
 * a file is still in the store. The caller owns the store and does the looking.
 */
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
  migrateMarks,
  readMark,
  applyMark,
  sortByMark,
  pruneMarks,
  cleanColor,
  isEmptyMark,
};
