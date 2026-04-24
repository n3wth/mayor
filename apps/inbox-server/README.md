# inbox-server

The adapter running on the mini (`ssh mini`) that receives emails for
`um@mayor.wtf` and hands them to Claude Code in a per-sender workspace.

## What it does

- Listens on `127.0.0.1:8420`, exposed publicly via Cloudflare Tunnel at
  `https://inbox.mayor.wtf` (`mayor-inbox` tunnel on the mini).
- Each sender gets `~/.local/mayor-inbox/sessions/<session_hash>/`, seeded
  with `CLAUDE.md`, `SENDER.md`, and `incoming.md`.
- On each email, appends to `incoming.md` and runs `claude --print` in the
  session dir with `--permission-mode=bypassPermissions` so the agent has
  full shell access inside that directory.
- Returns the agent's final message as the `reply` to the Vercel webhook,
  which sends it back via Resend.

## Deploy

The file on the mini is `~/.local/mayor-inbox/server.mjs`. This repo copy is
the source of truth — to update:

```sh
scp apps/inbox-server/server.mjs mini:~/.local/mayor-inbox/server.mjs
ssh mini 'launchctl kickstart -k gui/$(id -u)/com.n3wth.mayor-inbox'
```

## Config

| Env var | Purpose | Default |
|---|---|---|
| `MAYOR_INBOX_PORT` | Port to listen on | `8420` |
| `CLAUDE_BIN` | Path to `claude` CLI | `~/.local/bin/claude` |
| `CLAUDE_TIMEOUT_MS` | Max time per reply | `180000` (3 min) |

The shared secret with the Vercel webhook is in `./.token` (not checked in).

## launchd

- `~/Library/LaunchAgents/com.n3wth.mayor-inbox.plist` — the server
- `~/Library/LaunchAgents/com.n3wth.mayor-inbox-tunnel.plist` — cloudflared
