# NTAPI presence

A ~90-line Node service with no dependencies that answers one question: **how
many people are using NTAPI right now.**

The desktop app POSTs its anonymous session id to `/beat` every 45 seconds. An
id is "online" while it was seen in the last 90 seconds, so a single missed
heartbeat does not flicker the number.

| Route | Purpose |
| --- | --- |
| `GET /` or `GET /count` | `{ "online": 3, "total": 12, "now": 1730000000000 }` |
| `POST /beat` `{ "id": "..." }` | Record a heartbeat, returns the same shape |

State is in memory: no database, no accounts, no personal data. If the service
restarts, every running app re-reports within a minute.

## Run locally

```sh
node server.js          # listens on http://localhost:3000
```

## Deploy on Render

- Build command: *(leave empty — there are no dependencies)*
- Start command: `node server.js`
- Instance type: **Free**
- Root directory: `presence`

Free instances sleep after 15 minutes without traffic, which makes the first
count load slow. Point a free uptime pinger (UptimeRobot, cron-job.org) at the
service URL every 5 minutes to keep it warm.
