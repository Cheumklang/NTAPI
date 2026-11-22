# Skill pins + personal description — design

**Date:** 2026-11-22
**Status:** v1 implemented 2026-11-22 (star + own description; sidecar is v2, not built)

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
- `/skill`, `/skill:`, `/skill q` and `/skill:q` all open the same list, and
  Enter on a row inserts `/skill:name ` into the composer without sending it.
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

### v2 — the label that travels with the skill (`NTAPI.label.json`)

Problem this solves: a note in `prefs.json` belongs to one machine. Copy the
skill folder to another machine, hand it to someone else, or carry the whole
`skills/` folder on a USB stick, and the words are left behind.

A skill folder may carry a sidecar file next to its `SKILL.md`:

```text
skills/apk-reverse/
├── SKILL.md            ← never written, never labelled by us
└── NTAPI.label.json    ← optional; the user's own words, this skill only
```

```json
{ "note": "แกะแอป Android", "v": 1 }
```

Rules:

- **Opt-in per skill.** A toggle in the editor row: "keep this name with the
  skill". Off by default; a note lives in `prefs.json` until the user turns it
  on. Turning it off deletes the sidecar and copies the note back to prefs.
- **Written only into a folder the scan reported.** The path is
  `path.dirname(skill.path)` taken from the roster this build just scanned —
  never a path read from `prefs.json`, never a string from the renderer.
  Filename is fixed: `NTAPI.label.json`.
- **Precedence:** if a readable sidecar exists for a skill, it is the note for
  that skill and wins over `prefs.json`. Unreadable, malformed, or oversized
  (> 2 KB) is ignored with no error on screen — the app falls back to prefs,
  then to the skill's own description.
- **Write failure keeps the note.** A read-only pack folder, a permission
  error, or a full disk must leave the user's words in `prefs.json` and say so
  in one notice ("saved on this machine only"). Nothing is lost.
- **Only the note travels, not the pin.** A pin is an ordering choice for one
  person's list on one machine (`prefs.json`); a folder that arrives already
  pinned on a colleague's machine would be a surprise. It also keeps `prefs.json`
  the only place ordering is decided.
- **`SKILL.md` is still read-only.** The sidecar is never merged into the
  skill's frontmatter, so the AI's roster, the skill's own `description`, and
  "already installed" detection are all exactly as they are today. pi reads
  `SKILL.md` and does not look at other files in the folder.
- **Privacy, said plainly in the UI:** a label travels with the folder. Sharing
  the skill shares the words. Thai text in a label will be visible to whoever
  receives that folder.
- Scan cost: one `readFileSync` per skill folder that contains the file, only
  when the page is open on `/skill` (bounded by the same 60 s cache).

Tests: sidecar present → its note is shown; edit → the sidecar is rewritten and
`SKILL.md`'s hash does not change; malformed sidecar → ignored, prefs used;
read-only folder → note still in prefs + notice; toggle off → sidecar deleted,
note back in prefs; a sidecar with a note but no pin never reorders the list.

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

### Typing `/skill`, and what Enter does

Four spellings open the same list, with the same filtering and the same result:

| typed | menu shows |
|-------|------------|
| `/skill` | every installed skill, pinned group first |
| `/skill:` | the same — today this one does not open the menu at all |
| `/skill <q>` | names starting with `<q>` first, then matches inside a note or the skill's own description |
| `/skill:<q>` | the same |

`<q>` is whatever the user typed — any text, any length, any script. The
letters `c`, `a`, `g` in this document are examples only: there is no fixed set
of accepted letters, no per-letter list, and nothing keyed on a particular
character. `/skill a` → names starting with `a`; `/skill g` → names starting
with `g`; `/skill gh` → names starting with `gh`. Matching is case-insensitive
and the query is trimmed.

- **Enter inserts, it never sends.** Choosing a row puts `/skill:name ` in the
  composer, the caret after it, and closes the menu, so the user can type the
  task on the same line. Today the same key inserts `@name `; the on-the-wire
  form is unchanged (`/skill:name`), only what the user sees in the box changes.
- A query matches on three fields, in this order: name **prefix**, name
  **contains**, then the user's note or the skill's own description
  **contains**. Without the last two, typing a word the user remembers instead
  of the skill's name finds nothing — which is the whole point of the note.
- Pinned rows stay first whenever they match the query; inside each group the
  order is the match rank above, then A→Z by name.
- Group headers are not selectable. `moveSlashSelection` already skips rows
  marked `info`; `applySlashItems` currently starts the highlight at index 0,
  which would be a header, so it has to start on the first selectable row.
- No matches: the menu closes and the text stays exactly as typed. Nothing is
  rewritten.
- `/skill:name …` typed in full is left alone and goes to pi as it does today —
  the menu is only in the way when the caret is still in the first word.

### What does not change

- Bare `/` still lists the commands only. Skills are not merged into it, and
  `/caveman` typed by hand is plain text that invokes nothing: `/skill` is the
  one door to the skill list.
- `@name` keeps resolving to `/skill:name` at send time.
- `/skill:name` expansion is still pi's job.

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
- Same file, the typing rules: `/skill`, `/skill:`, `/skill <q>`, `/skill:<q>`
  all open the list for any query (test at least `a`, `g`, `gh`, an uppercase
  letter, and a Thai word — not just one letter); a chosen row yields
  `/skill:<name> ` and nothing else; a name-prefix match outranks a note match;
  a header row is never the initial highlight; a query matching nothing leaves
  the text untouched.
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

## What shipped, and what changed while building

- **`/skill` opens only while the caret is in the first word.** `/skill:c` and
  `/skill c` open the list; `/skill:c ทดสอบ` does not — a sentence after the
  command is prose, so the menu gets out of the way instead of replacing what
  the user typed. This is stricter than "the query may contain spaces", and it
  is what makes `/skill` safe to type as ordinary text.
- **Multi-word queries are therefore gone.** `/skill cav` and `/skill:cav`
  filter; `/skill caveman now` does not filter at all. The note and the skill's
  own description are still searched, so one word is enough in practice.
- **Choosing a row replaces the command and its query**, and keeps anything
  typed after them. In practice that sentence case cannot be reached (the menu
  closes on the second word), so the code is a guard rather than a feature.
- **`Ctrl+D` did not ship.** The mouse path is complete and the hint line names
  only what exists: `↑↓ move · Enter use · ☆ pin · ✎ edit your description`.
- **The `@` menu and the command palette find a skill by the user's own words**
  (the filter is shared), and pinned skills win the `@` menu's six slots. Their
  rows do not carry the star or the pencil: they are narrower lists, and the
  `/skill` menu is where a star belongs.
- **The sidecar (`NTAPI.label.json`) is not built.** Everything above stores in
  `prefs.json` only.
- **Checks:** `npm run check:skills` (roster logic + the prefs validator) and
  `npx electron --no-sandbox scripts/check-skill-menu.js` (a real window: star,
  note, search by a Thai word, the inline editor, Reset, and a hash of every
  fixture `SKILL.md` before and after).

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
