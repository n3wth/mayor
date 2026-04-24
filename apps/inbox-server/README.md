# inbox-server

The adapter on the mini (`ssh mini`) that receives emails for `um@mayor.wtf`
and hands them to **gastown**'s `mayor-respond`.

## Architecture

```
sender → um@mayor.wtf
       → Cloudflare Email Routing (MX)
       → mayor-inbox-worker (CF Email Worker, parses MIME)
       → POST /api/inbox on mayor.wtf (Vercel, gates: secret, allow-list, rate limit, bot filter)
       → POST /inbox on inbox.mayor.wtf (Cloudflare Tunnel → mini :8420)
       → this server writes ~/gt/.runtime/inbound/<timestamp>.json
       → spawns ~/gt/bin/mayor-respond <json>
       → gastown handles Claude session + reply (via its own Resend bridge)
```

This adapter's only job is transport. Gastown owns the brain, tools, persona,
and outbound mail.

## File on the mini

- `~/.local/mayor-inbox/server.mjs` — this server (source of truth: this repo)
- `~/.local/mayor-inbox/.token` — shared bearer token (not checked in)
- `~/Library/LaunchAgents/com.n3wth.mayor-inbox.plist` — launchd for the server
- `~/Library/LaunchAgents/com.n3wth.mayor-inbox-tunnel.plist` — launchd for cloudflared

## Deploy

```sh
scp apps/inbox-server/server.mjs mini:~/.local/mayor-inbox/server.mjs
ssh mini 'launchctl kickstart -k gui/$(id -u)/com.n3wth.mayor-inbox'
```

## Gastown expectations

The inbound JSON written to `~/gt/.runtime/inbound/` follows gastown's schema:

```json
{
  "received_at": "2026-04-24T17:29:04.678Z",
  "source": "mayor-wtf-email",
  "payload": {
    "data": {
      "email_id": "string",
      "from": "sender@example.com",
      "to": ["um@mayor.wtf"],
      "subject": "string",
      "text": "string",
      "html": "string"
    }
  },
  "meta": { "session_id": "stable-hash" }
}
```

## Why two layers (Vercel + mini)

- Vercel webhook: public HTTPS endpoint, CF Email Worker calls it. Gates traffic.
- Mini adapter: can't be reached from the internet directly; tunnel is
  token-gated and only mayor.wtf's webhook knows the token.

This separation keeps gastown internals off the public net while still
letting anyone email `um@mayor.wtf` and reach it.
