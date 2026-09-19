> Current procedure (September 10, 2026): use [Release and data refresh](RELEASE_AND_DATA_REFRESH.md). `npm run deploy:mini` now transfers directly over SSH, builds before publishing, verifies the release identity, and can roll back. The iCloud/hard-reset procedure below is historical.

# BryceCast Deploy Runbook

Updated: 2026-07-11. Owner: Jack (Cloudflare/account steps), Fable (everything else).

Goal: a public link the family can open — long-term on the always-on Mac mini
behind a Cloudflare Tunnel; short-term servable from any Mac that has this repo.

## Architecture

One node process serves everything:

```
npm run build                 # -> dist/
node scripts/api-server.mjs --static=dist    # app + /api on :8787
```

- The API server is cache-backed: N viewers = constant upstream requests.
- The live-runner LaunchAgent (`com.brycecast.live-runner`) is a separate quiet
  process that owns Race Control capture. Both can run on the same machine.
- 2–3 concurrent users expected, no auth gate (household decision 2026-07-02).

## Install as a LaunchAgent (this Mac or the mini)

```bash
npm run build
ops/macos/install-app-server.sh     # com.brycecast.app-server on :8787
```

Health checks:

```bash
curl -s localhost:8787/api/health | head
curl -s localhost:8787/api/next-session
launchctl list | grep brycecast
```

After every deploy/pull: `npm run build` then
`launchctl kickstart -k gui/$(id -u)/com.brycecast.app-server`.

## Public link — option A, this weekend (no account needed)

Ephemeral Cloudflare quick tunnel; URL changes each run, fine for one race
weekend. cloudflared is installed via Homebrew already.

```bash
cloudflared tunnel --url http://localhost:8787
```

It prints an `https://<random>.trycloudflare.com` URL — send that to the
family group chat. Leave the terminal (or a `caffeinate -i` wrapper) running
through the weekend. **Jack runs this** — it publishes the app.

## Public link — option B, durable (Jack's Cloudflare account, one-time)

1. `cloudflared tunnel login` (browser auth — Jack only).
2. `cloudflared tunnel create brycecast`
3. Copy `ops/deploy/cloudflared-config.example.yml` to
   `~/.cloudflared/config.yml`, fill in the tunnel UUID and hostname.
4. `cloudflared tunnel route dns brycecast brycecast.<your-domain>` —
   or use a free `*.cfargotunnel.com` reference via the dashboard.
5. Install as a service: `sudo cloudflared service install` (runs at boot).

## Mac mini migration checklist

1. Install: Xcode CLT, Homebrew, `brew install cloudflared`, nvm + Node 24.
2. Copy the repo (or `git clone` + copy `data/live/` archives — SQLite race
   captures are NOT in git; copy `data/live/brycecast.sqlite*` explicitly).
3. `npm ci && npm run build`.
4. Update the two plists in `ops/macos/` if the username/node path differ,
   then run both installers:
   `ops/macos/install-live-runner.sh` and `ops/macos/install-app-server.sh`.
5. Cloudflare option B steps above.
6. Verify: `/api/health`, `/api/next-session`, `/api/readiness`, open the
   public URL on a phone off-wifi.
7. Power settings: System Settings → Energy → prevent sleep, restart after
   power failure. LaunchAgents need a logged-in user session — enable
   auto-login for the service account.

## Race-weekend checklist (any host)

- Machine plugged in, lid open (laptop) / awake (mini).
- `launchctl list | grep brycecast` → both services with PIDs.
- `cat data/live/live-runner-status.json` → phase IDLE/ARMED, nextSession sane.
- After any reboot: re-check both (the July 11 EX_CONFIG incident is documented
  in docs/operations/LIVE_RUNNER_RUNBOOK.md — logs now live outside ~/Documents, but check).
- Do NOT run monitors/pressure tests during sessions (Road America RCA).

## Known limits

- LaunchAgents die on logout; the mini should stay logged in (or migrate the
  plists to LaunchDaemons with a dedicated user later).
- Quick-tunnel URLs are ephemeral and unauthenticated by design.
- The app has no auth gate; do not post the durable URL anywhere public beyond
  the family/friends circle.

## Production truth as of 2026-07-19 (supersedes the options above)

- **Family URL: https://brycecast.com** (+ www) — named Cloudflare tunnel
  `brycecast` on the Mac mini, `cloudflared tunnel run brycecast` under
  `com.brycecast.cloudflared`. Domain on Jack's Cloudflare account,
  auto-renews yearly (~$10.46). Quick-tunnel URLs are retired; the
  MacBook relay (`~/.brycecast/redirect-server.mjs`) forwards the old
  family quick-tunnel link to brycecast.com and can itself retire once
  nobody uses the old link.
- **Deploy is two commands from the MacBook, no human on the mini:**
  ```bash
  npm run deploy:mini        # bundle -> iCloud kit
  ssh operator@your-host.local 'bash ~/mini-kit/update-mini.sh'
  ```
  update-mini.sh waits for iCloud sync, hard-resets to the bundle,
  rebuilds, restarts ONLY the app-server. Runner + tunnel (and therefore
  the family URL) are never interrupted.
