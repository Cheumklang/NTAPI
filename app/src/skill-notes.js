'use strict';

/**
 * The user's own words for a skill, and the star that pins it.
 *
 * Two rules decide everything here. The store is keyed by the skill's
 * **canonical name** (`SKILL.md` frontmatter), because that name is the identity
 * shared with the AI, with other agents on the same machine, and with the skill's
 * own publisher — renaming is not ours to do. And nothing in this file is ever
 * written into a skill folder: `SKILL.md` stays untouched, so the roster the
 * model reads and the "already installed" test cannot see a user's label at all.
 *
 * Lives in `prefs.json` under `skillNotes`, validated like every other prefs key:
 * the renderer is allowed to send this map, never arbitrary JSON.
 */

/** One line, because a menu row is one line. */
const MAX_NOTE = 60;
/** Chrome's own list is forty-odd; this is a ceiling, not a quota. */
const MAX_ENTRIES = 300;
/** A skill name is a slug in practice; the cap is only here to bound the file. */
const MAX_NAME = 120;

// Control characters would break the row layout or the JSON round-trip.
// Two regexes on purpose: a `g` flag makes `.test()` stateful (lastIndex is kept
// between calls), which silently let names with a newline through.
const CONTROL = /[\u0000-\u001f\u007f]+/g;
const HAS_CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Normalise a `skillNotes` value, or `undefined` when the value is not one.
 *
 * `undefined` means "ignore this patch"; `{}` is a real answer and means "forget
 * every note", which is what the renderer sends after the last reset.
 */
function sanitizeSkillNotes(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out = {};
  let kept = 0;
  for (const [name, entry] of Object.entries(raw)) {
    if (kept >= MAX_ENTRIES) break;
    if (typeof name !== 'string' || !name.length || name.length > MAX_NAME) continue;
    if (HAS_CONTROL.test(name)) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const clean = {};
    if (entry.pinned === true) clean.pinned = true;
    if (typeof entry.note === 'string') {
      // Trimmed, single line, capped. An empty note is a deletion, not a key
      // holding "" — the row then falls back to the skill's own description.
      const note = entry.note.replace(CONTROL, ' ').trim().slice(0, MAX_NOTE);
      if (note) clean.note = note;
    }
    if (clean.pinned || clean.note) {
      out[name] = clean;
      kept += 1;
    }
  }
  return out;
}

module.exports = { sanitizeSkillNotes, MAX_NOTE, MAX_ENTRIES, MAX_NAME };
