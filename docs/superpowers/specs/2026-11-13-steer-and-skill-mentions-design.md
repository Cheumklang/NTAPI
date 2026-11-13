# Steer mid-turn + @skill mentions — design

**Date:** 2026-11-13
**Status:** awaiting approval

## Intent

Two small changes to the composer:

1. **Steer mid-turn.** Today every send while the agent is working is queued in the
   renderer and only runs after `agent_settled`. The user wants to send an
   instruction *into* the running turn, the way the terminal client does.
2. **`@skill` that actually invokes the skill.** Typing `@caveman` looks like it
   should tell the agent to use the installed `caveman` skill, but the prompt
   leaves as the literal text `@caveman` and `/skill:caveman` is inserted into
   the composer *after* the send.

## Why the two are one change

Both are composer behaviour, both touch the same keydown path, and both need the
same end-to-end check through the real window. No other subsystem changes.

## Goals

- Enter while busy = steer. Ctrl+Enter = queue (follow-up). Ctrl+Enter while
  idle = send immediately, because a queue with no running turn never drains.
- `@` menu: arrow keys move, Tab/Enter insert, Esc closes. Skills appear without
  waiting for the workspace file scan.
- Sending `@caveman …` at the start of a prompt invokes the `caveman` skill even
  when the menu was never opened or selected from.

## Non-goals

- Abort-and-resend as a steer strategy (loses the work in flight and splits the
  transcript).
- A skill manager, skill editing, or installing skills from inside the app.
- Changing `/skill:` expansion, which pi already implements.
- Rating/feedback UI.

## Constraints

- pi SDK 1.2: `session.prompt(text, { streamingBehavior: 'steer' | 'followUp' })`.
  Streaming without one of those throws. Steer is delivered after the current
  assistant turn finishes its tool calls, before the next model call; it does not
  abort the run.
- pi expands `/skill:name` only at the **start** of a prompt.
- One free-pi ad/turn covers the whole run, including the extra model call a
  steer causes; steering must not fetch a second ad or a new turn id.
- The Coarena key never enters the repo, a log line, or `prefs.json`.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Native SDK steer; Ctrl+Enter keeps the local queue | **Chosen.** No work lost, matches the CLI, tiny diff. |
| 2 | Abort the run, then send as a fresh prompt | Rejected: throws away in-flight work and forks the transcript. |
| 3 | `@` menu only, fix keydown order; require selecting from the menu | Rejected: Enter on a typed `@caveman` would still send plain text. |
| 4 | Resolve bare `@skill`, render skills before files, fix keydown order | **Chosen.** Matches what the user typed and removes the slow menu. |

## Design

### Composer and IPC

- `prompt:send` accepts `mode: 'steer' | 'followUp'` (absent = normal).
- Main passes `streamingBehavior` only when `session.isStreaming`; otherwise it
  prompts normally and ignores the mode.
- Renderer `submit()`:
  - busy + Enter → paint the user bubble, call `prompt:send` with `mode:'steer'`,
    keep the busy state, show a short "sent mid-turn" notice.
  - Ctrl+Enter while busy → existing queue.
  - Ctrl+Enter while idle → normal send (queue would never drain).
- Queue drain on `agent_settled` is unchanged.

### `@` mention

- Move the file-menu key handling into the first `input` keydown listener, before
  the submit branch, and remove the duplicate listener. (`stopPropagation` does
  not stop a sibling listener on the same element; that ordering is the bug.)
- `updateFileMenu` renders matching skills immediately, then merges file results
  when the main-process scan returns.
- Skills cache gets a 60 s TTL so a skill installed while the app runs appears.
- New pure helper `resolveSkillMention(text, skills)` in
  `src/renderer/provider-ui.js` (already loadable from Node): when the prompt
  starts with `@name` (word boundary) and `name` matches a loaded skill
  case-insensitively, return `/skill:name` + the rest; otherwise return the text
  unchanged. Applied in `submit()`/steer right before sending. File mentions are
  untouched.

## Tests

- `scripts/selftest-provider-ui.js`: cases for `resolveSkillMention` (exact match,
  case-insensitive, trailing text, unknown name, `@path/file` untouched, no
  leading `@`).
- `scripts/selftest-mention-ui.js` (CDP): type `@caveman`, menu shows the skill;
  ArrowDown/Enter inserts `/skill:caveman `; typing `@caveman x` and pressing
  Enter sends a prompt whose stored text starts with `/skill:caveman`.
- `scripts/selftest-steer-live.js`: with a Coarena key, prompt a long-ish task,
  send a second prompt with `mode:'steer'` while streaming, assert the answer
  reflects both instructions in one run and that no second turn/ad was started.
- Existing suite still passes.

## What is left to the builder

- Exact notice copy (EN/TH) and how long it stays.
- Whether the mention menu should keep the file results after a skill row.
- Cache TTL value if 60 s proves wrong in use.
