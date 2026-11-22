# Skill pins + personal description — design

**Date:** 2026-11-22
**Status:** approved (not implemented)

## Intent

A user can have fifty-odd skills installed and cannot remember what they are
called. `/skill` today is a single filtered column sorted A→Z, and the
descriptions it shows are the skills' own — in English, written for an agent,
not for a person scanning a list. So "I cannot remember the name" turns into
"I cannot find it", and the same two or three skills have to be hunted down
again in every new chat.

This adds two things to that list, for the people who run the app rather than
for its author:

1. **A star.** Pin the skills you actually use; they move to the top.
2. **Your own words.** Write your own one-line description in your own
   language. It is searchable and it shows on the row.

The skill's name never changes, and the skill's files are never touched.

## Goals

- Click a star on a row → that skill is pinned, and pinned skills are listed
  first in `/skill`.
- Edit a row's description → the user's own line replaces the skill's own text
  on that row, is matched by the `/skill` filter, and survives a restart.
- The canonical `name` is always visible, and always first on the row.
- Reset returns a row to the skill's own description.
- The same pins and notes are used by the `@` mention menu and the command
  palette, so the three doors behave the same way.
- Mouse-first: every action above is reachable by clicking. Keyboard is a
  bonus, never the only way.
- Both languages. No leftover English-only or Thai-only string.

## Non-goals

- Renaming a skill. Name is identity — shared with the AI, with other agents on
  the same machine, and with everyone else running the same skill pack.
- Writing the note into `SKILL.md` or anywhere under a skills root.
- Translating the skills' own descriptions for everyone.
- A skill manager page in Settings (v1: the list where the user already is).
- Syncing notes between machines or users.
- Changing `/skill:name` expansion, or how the SDK discovers skills.
- Recency or usage counting. Pins are explicit; nothing reorders behind the
  user's back.

## Anti-goals (failures even if it works)

- A feature only reachable by a shortcut nobody was told about.
- A row that shows the user's words so prominently that the real name becomes
  hard to find.
- Anything that makes the AI see a skill as missing, renamed, or different, and
  so install it a second time.
- A note that makes the skill unfindable by its real name.

## Constraints found in the code

- **Two rosters, on purpose.** The window lists skills from
  `ipcMain.handle('skills:list')` → `scanSkills(skillRoots(cwd))`, cached 60 s in
  the renderer. The **AI** gets its roster from the SDK, fed by
  `skillsAgentDir` (the app data root) plus `extraSkillPaths` (every existing
  root, and each skill pack's container folder). The SDK reads `SKILL.md` from
  disk. Nothing in `prefs.json` reaches it. This is the boundary that makes
  personal notes safe — it must stay that way.
- **`prefs:set` is a whitelist.** It copies only known keys into `allowed`
  (`lang`, `theme`, `guideDone`, `termsAccepted`, …). A new key needs its own
  validated branch; the renderer can never write free-form JSON into prefs.
- **Tab is taken.** In both the `/` menu and the `@` menu, Tab is "choose this
  row". A pin shortcut cannot use it.
- **Menu rows are buttons** and already `preventDefault()` on `mousedown` so the
  composer keeps focus. Any control added inside a row must not break that.
- **Copy is `t()`-based** with `en` and `th` entries, and Thai strings are
  checked by `npm run check:sara` (single U+0E33 for sara am).

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Star only, reorder the top | Rejected on its own: to pin a skill you must first find it among fifty, so the "I cannot remember the name" half is untouched. |
| 2 | Full-height browse overlay, grouped by pack, no user text | Rejected: more UI work than either alternative, still asks the user to read English descriptions, and does nothing for repeat use across chats. |
| 3 | Star + personal description, both local to `prefs.json` | **Chosen.** One store, one IPC branch, solves both halves: the words you remember become search terms, and the skills you use float to the top. |
| 4 | Edit the description in `SKILL.md` itself | Rejected: leaks one user's Thai into every other agent on the machine, is overwritten when a skill pack updates, and changes what the AI reads. |

## Design

### Store

`prefs.json`, one new key:

```json
"skillNotes": {
  "apk-reverse": { "pinned": true, "note": "แกะแอป Android" },
  "ghidra-reverse": { "note": "เปิดใน Ghidra" }
}
```

- Key = the skill's **canonical `name`** from `SKILL.md` frontmatter (the same
  key `scanSkills` dedupes on). Never the path — a reinstall or a pack update
  keeps the pin.
- `pinned`: boolean. `note`: string, trimmed, ≤ 60 characters.
- Whole-map writes: the renderer holds the map (like `collapsedProviders`),
  initialises from `appPrefs.skillNotes` at boot, and sends the whole object on
  every change. Missing key = no pin, no note.
- A note for a skill that is no longer installed stays in the file but is never
  drawn — no ghost rows. It comes back if the skill does.

### `prefs:set` validation

A new branch, in the same style as the existing ones:

- `skillNotes` must be a plain object, at most 300 entries.
- Skill names: strings, ≤ 120 chars, no control characters.
- `pinned`: boolean only.
- `note`: string only, trimmed, ≤ 60 chars after trim, no control characters
  except none at all (single line). Empty string means "delete the note".
- Anything else is dropped silently, as the other branches do.

### Row anatomy

```
┌──────────────────────────────────────────────────────────────┐
│ ★ Pinned                                                     │
│  ★ apk-reverse      แกะแอป Android · Reverse-engineer an APK  │
│  ★ mobile-reverse   …                                        │
├──────────────────────────────────────────────────────────────┤
│    ghidra-reverse   …                                   ☆ ✎  │
│    binary-ninja-reverse  …                              ☆ ✎  │
└──────────────────────────────────────────────────────────────┘
   ↑↓ move · Enter use · ☆ pin · ✎ edit · Esc close
```

- Name first, always, in the skill's own spelling.
- When a note exists: note, then the skill's own description in a dimmed span
  after it (separator `·`). When it does not: the skill's own description as
  today. Overflow is ellipsised by CSS, not by cutting the string.
- Pinned rows keep the star filled; unpinned rows show a hollow one.
- Sorting: pinned group first (A→Z inside it by name), then the rest A→Z as
  today. The filter still matches any part of name, own description, or note.

### Editing

- ✎ opens an inline text field on that row, prefilled with the note (or empty),
  with the skill's own description underneath as a reference.
- Enter saves, Esc cancels, both without leaving the menu. A "Reset" button
  appears only when a note exists, and deletes the note (never the pin).
- A live counter or a hard cap at 60 characters; input is single-line.
- Saving re-renders the list in place, keeping the highlight on the same row.
- Because it is inline in the menu, nothing new has to be learned: the field is
  where the row already was.

### Keyboard (bonus, after the mouse path works)

- `Ctrl+D` on the highlighted row = same as clicking ✎.
- Nothing else changes: Tab and Enter keep their current meaning.

### Where it applies

- `/skill` list: pins order the rows, notes show and are searchable.
- `@` menu: at most six skill rows; same filter (so a Thai word finds the
  skill) and pinned skills win the six slots.
- Command palette: same filter for the skill entries.
- Nothing here is written into the prompt, the transcript, or the session file.

### The AI boundary (the part that must not break)

- `SKILL.md` is read-only for this feature. No handler under this change opens a
  skill file for writing.
- "Already installed" is decided by **canonical name**. Not by description, and
  never by the user's note: if the AI were to compare descriptions, one edited
  note would make an installed skill look like a different one, and the next
  "install this skill" would put a duplicate next to it.
- A note never participates in the SDK's roster. `skillsAgentDir` and
  `extraSkillPaths` are unchanged.
- Because the name is always on screen, the user can still hand the AI the exact
  spelling — the note is a memory aid, not a rename.

### Copy (en / th)

| key | en | th |
|-----|----|----|
| `skillsPinned` | `★ Pinned` | `★ ปักหมุด` |
| `skillsPin` | `Pin this skill` | `ปักหมุดสกิลนี้` |
| `skillsEditNote` | `Edit description` | `แก้คำอธิบาย` |
| `skillsNotePlaceholder` | `Your words for this skill (searchable)` | `คำของคุณสำหรับสกิลนี้ (ใช้ค้นหาได้)` |
| `skillsNoteSave` | `Save` | `บันทึก` |
| `skillsNoteCancel` | `Cancel` | `ยกเลิก` |
| `skillsNoteReset` | `Reset` | `คืนค่าเดิม` |
| `skillsHint` | `↑↓ move · Enter use · ☆ pin · ✎ edit` | `↑↓ เลือก · Enter ใช้ · ☆ ปักหมุด · ✎ แก้คำอธิบาย` |

`/skill` currently shows the skills' own English descriptions with a comment
explaining why they are not translated. A note is the user's own text and is
never translated by the app.

## Tests

- `scripts/selftest-skill-menu.js` (plain Node, fake roster): pinned-first
  ordering; A→Z inside each group; filter matches an ASCII word in a note, a
  Thai word in a note, and the canonical name; a note that repeats the name does
  not duplicate a row; unknown key in the store is ignored; `pinned` without a
  note renders the own description; `note` alone shows note + dimmed own text.
- `scripts/selftest-prefs-skill-notes.js` (new, plain Node against the
  validator): rejects non-objects, oversized maps, control characters, a note
  over 60 chars, a non-boolean `pinned`; accepts an empty note as deletion.
- `scripts/check-skill-menu.js` (real Electron window): star a row → it moves
  into the Pinned group; type a Thai note → filtering by that Thai word finds
  the row; press Reset → the own description is back; relaunch (or reload) →
  pin and note are still there.
- Skill files untouched: hash every `SKILL.md` under the scanned roots before
  and after the UI flow above, and assert no change. This is the test that
  protects the AI boundary.
- Existing checks still pass; `npm run check:sara`.

## What is left to the builder

- Exact row markup and CSS (the list is shared with the `@` menu, which has no
  room for the two icon buttons — decide whether `@` rows get the star only, or
  none; the palette has no per-row controls at all).
- Whether the inline editor is a real `<input>` inside the row or a small popup
  anchored to it; the row is a `<button>`, so a nested input needs care with
  focus and with the existing `mousedown` handler.
- The 60-character cap: if 60 proves too small for Thai sentences, raise it to
  80 in one place (the validator and the counter).
- Whether `Ctrl+D` ships in v1 or waits until the mouse path is proven.
