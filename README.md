# FreePi Desktop

A desktop app for **free-pi** — a chat window instead of a terminal. Nothing here is a fork or
a repackaging of someone else's binary: it's an Electron shell that drives the same pi agent
session and the same free-pi backend your `npx free-pi-cli` already logs into.

```
freepi/
├─ FreePi.bat            ← double-click this to start (no terminal)
├─ app/
│  ├─ package.json
│  ├─ scripts/
│  │  ├─ selftest-ads.js      ad → impression → completion probe (cheap)
│  │  ├─ selftest-session.js  one image prompt straight through the bridge
│  │  └─ selftest-ui-send.js  paste+send in the real window over DevTools (needs --remote-debugging-port=9222)
│  └─ src/
│     ├─ main.js         Electron main: window, IPC, session host, workspace memory
│     ├─ preload.js      Narrow bridge exposed to the renderer
│     ├─ freepi-bridge.js  Creates a pi session wired to the free-pi provider
│     └─ renderer/       index.html · styles.css · app.js
├─ shots/                Screenshots used while building
└─ dist/                 Installer output (only after `npm run dist`)
```

## Start it

Double-click **FreePi.bat**. Or from a shell:

```bash
cd app && npm start
```

## Requirements

- Windows, Node.js 18+ (already present if `npx free-pi-cli` works on this machine)
- A free-pi account that has been used once, so `~/.free-pi/agent/credentials.json` exists.
  If it's missing, the app starts a fresh guest session by itself.

## How it works

`free-pi-cli` has no machine-readable mode — its entry point always boots the terminal UI. So
this app does what the CLI's own `launchPi()` does:

1. Read the token from `~/.free-pi/agent/credentials.json` (guest session if absent or rejected).
2. Fetch the live model catalog from `GET /client-version`.
3. Register a `free-pi` provider pointing at `https://api.freepi.ai/v1` with that token.
4. Create a pi agent session with the standard tools (`read`, `bash`, `edit`, `write`, `grep`,
   `find`, `ls`) and stream its events into the window.

Sessions are stored in the same place the CLI uses, so a conversation started in the terminal
appears in this app and vice versa:

```
~/.free-pi/agent/sessions/<encoded-cwd>/*.jsonl
```

## What it does today

- **Full free-pi tool set** — the same tools the CLI registers: `read`, `bash`, `edit`, `write`,
  `grep`, `find`, `ls`, plus `look_at_image`, `web_search`, `docs_lookup`, `generate_image` and
  `free_pi_usage`
- **Multiple sessions in tabs** — each tab is an independent pi session with its own model,
  history and running turn. Tabs keep streaming in the background while you work in another one.
  `Ctrl+T` new tab, `Ctrl+W` close, `Ctrl+Tab` cycle. Open tabs are restored on restart.
- **Image attachments** — attach with the *Image* button, paste with `Ctrl+V`, or drag a file onto
  the window. See the note below on how images actually reach the model.
- **Approval prompt before `bash` / `edit` / `write`** — the agent pauses and you see the exact
  command; Enter allows, Esc denies. Denied calls do not run.
- Chat with streaming text, tool cards you can expand to see arguments and output
- **Visible failures** — when free-pi refuses a request the window shows the reason (ads, credits,
  session limit, model capacity…) instead of a turn that answers nothing. Errors from older turns
  are replayed from history too
- **Sponsored bar** — the ad free-pi serves for the current turn (see below)
- Workspace folder picker, remembered across restarts, last session auto-reopened
- Session list per folder — click to switch, rename inline, **right-click → Delete from disk** to
  remove a conversation permanently (asks for confirmation, then unlinks the `.jsonl` file)
- Model picker populated from the live free-pi catalog (free + defense models)
- Stop button to abort a running turn
- Live free-pi credit balance via `GET /me/stats`

## Backend endpoints these tools use

| Tool | Endpoint | Tested |
|---|---|---|
| `look_at_image` | `POST /tools/vision` | works (retries past intermittent 502) |
| `generate_image` | `POST /tools/image` | works |
| `free_pi_usage` | `GET /me/stats` | works |
| `web_search` | `POST /tools/web-search` | wired, backend returned 502 during testing |
| `docs_lookup` | `POST /tools/docs` | wired, backend returned 502 during testing |

Web search and docs lookup were down on the free-pi side while this was written: direct `curl`-style
calls returned `502 upstream_error` too, so the failure is not in this app. All three POST tools retry
`502/503/504` three times with backoff before reporting the failure to the agent, and the agent is told
the tool failed rather than being allowed to invent an answer. Expect them to work once the backend
recovers.

## Not registered

`codemode`, `tool_search`, `todo`, `subagent`, `send_message`, `ask_user`, `submit_plan`, `fusion_plan`,
`free_pi_docs`, `free_pi_buy_credits`, and MCP servers. MCP is the notable gap: `free-pi-cli mcp add`
writes `~/.free-pi/agent/mcp.json`, but this app does not load it yet.

## Ads: why a turn can go silent

free-pi is free because ads pay for it, and the backend enforces that. A client that never asks for
an ad and never reports the impression gets:

```
403 {"code":"ads_required","message":"... Ads aren't showing for this account, so free completions are paused."}
```

The terminal CLI handles this in its `pi-ads` extension. This app mirrors it in
`src/freepi-bridge.js` (`createAdsClient`):

1. each user message starts a turn (a fresh uuid),
2. `GET /ads/next?slot=banner` is called with `x-turn-id` set to that uuid,
3. the ad is rendered in the sponsored bar and `POST /ads/impression` is sent (plus the Gravity
   impression pixel when the ad comes from the ad network),
4. the completion request carries the same `x-turn-id`, so the backend can see the ad for the turn.

One ad is fetched at session start and one per message. Nothing is fetched in the background beyond
that, and no ad click is ever opened inside the app window — click-through goes to your browser.

## If a turn answers nothing

Read the red banner under the assistant area — it names the reason. To check the plumbing without
typing anything:

```bash
cd app
node scripts/selftest-ads.js        # ad -> impression -> completion
node scripts/selftest-session.js    # one image prompt through the bridge, no window
```

`ads_required` and `concurrent_session` are the two that bit people most: the first means the ad
didn't reach the backend (run `npx free-pi-cli@latest` once, then retry), the second means the
account already has 4 running sessions — close other windows, or run `/close-other-session` in a
terminal. The app now restores at most 4 tabs (one per session file) so it cannot wedge itself
against that limit.

## How images work

free-pi's models are text-only — the catalog declares `input: ["text"]`, so an image cannot be sent
as model content. Attaching an image therefore:

1. saves it to `<workspace>/.freepi-attachments/`,
2. adds the path to your prompt, and
3. tells the agent to call `look_at_image` on it.

`look_at_image` is registered by this app and posts to the backend's `/tools/vision` endpoint, so the
agent gets a text answer about the image. That call uses part of your daily allowance, and the
backend's vision upstream returns `502` intermittently (the tool retries a few times).

Sending an image therefore costs two requests (vision + the model turn), and a vision failure is
reported to the agent as a failed tool rather than as silence. If an image message produces nothing,
the reason is almost always the completion being refused (ads, credits, session limit) — see the
red banner.

## What it does not do (yet)

- MCP servers from `mcp.json` are not loaded
- Usage panel reads `remaining_credits_today` / `allowance_credits`; if free-pi changes that payload
  it shows `n/a` rather than wrong numbers
- The ad bar shows one banner ad per turn; inline ads, `/support` and the credit meter widgets from
  the terminal CLI are not reproduced
- `/close-other-session` has no button yet — it is a terminal command (`POST /session/reset`)

## Build a standalone installer

```bash
cd app
npm run dist
```

Output goes to `../dist` (NSIS installer + portable exe).

## If the app can't find the pi SDK

`main.js` looks for `@earendil-works/pi-coding-agent` in the npx cache. It scans
`AppData/Local/npm-cache/_npx/*/node_modules/@earendil-works/pi-coding-agent` automatically.
If you installed free-pi globally instead, point it there explicitly:

```bash
set FREEPI_SDK_PATH=C:\path\to\node_modules\@earendil-works\pi-coding-agent
```

## Security notes

- The token is read from the same file the CLI uses and is never exposed to the renderer.
- The renderer has `nodeIntegration: false` and `contextIsolation: true`; it can only call the
  IPC methods listed in `preload.js`.
- The agent has real file and shell access to the folder you pick. The approval prompt is the
  guard for `bash`, `edit` and `write`; read-only tools (`read`, `grep`, `find`, `ls`) run without
  asking. If you want every tool gated, add them to `guardedTools` in `freepi-bridge.js`.
- Attachment paths are validated to stay inside the workspace before `look_at_image` reads them.
- Session deletion is refused unless the path is inside `~/.free-pi/agent/sessions` and ends in `.jsonl`,
  so a stray path from the renderer cannot remove arbitrary files. An open tab using that session is
  closed (and its run aborted) before the file is unlinked.
