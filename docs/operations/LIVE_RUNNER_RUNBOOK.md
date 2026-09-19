# BryceCast Live Runner Runbook

## Purpose

`scripts/live-runner.mjs` is the single race-day ingestor. It owns Race Control polling, archive writes, raw timing capture, status, and quiet events. During a live window, do not run extra long-lived pollers, pressure tests, browser automation, or terminal monitors beside it.

## Install

From the repo root:

```bash
ops/macos/install-live-runner.sh
```

This installs `~/Library/LaunchAgents/com.brycecast.live-runner.plist` and runs:

```text
/usr/bin/caffeinate -i /Users/example/.nvm/versions/node/v24.14.1/bin/node /Users/example/Documents/Bryce POV access/scripts/live-runner.mjs
```

Keep the MacBook plugged in, lid open, and on a stable network. `caffeinate -i` prevents idle sleep while the LaunchAgent is loaded; it does not protect against battery drain, lid sleep, network loss, or manual logout.

## Verify

Use file reads, not process-heavy tooling:

```bash
node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync("data/live/live-runner-status.json","utf8")), null, 2))'
tail -n 20 data/live/live-runner-events.jsonl
```

Healthy status indicators:

- `updatedAt` is less than 60 seconds old while the runner is loaded.
- `phase` is `IDLE`, `ARMED`, `LIVE`, or `COOLDOWN`.
- `endpointFailureCounts.timing` is absent or low.
- `lastSuccessfulWriteAt` advances during `LIVE` and `COOLDOWN`.
- `latestBryce.rank` is non-null only after the INDY NXT Bryce guard passes.
- `processBudget.spareProcessSlots` stays at or above 150.

To unload:

```bash
ops/macos/uninstall-live-runner.sh
```

Archive files under `data/live/` are not removed.

## Mid-Ohio Weekend Procedure

Target windows:

- Practice/qualifying: likely 2026-07-03 and 2026-07-04.
- Mid-Ohio Race 1: 2026-07-04.
- Mid-Ohio Race 2: 2026-07-05.

Before the first 2026-07-03 session:

1. Quit helper-heavy nonessential apps: Chrome, MagicPath, LM Studio, extra dev servers, and unused terminals.
2. Confirm the process-pressure guard is installed if you plan to use it.
3. Run `npm run test:live-runner` and `node scripts/live-runner.mjs --once`.
4. Install or restart the LaunchAgent.
5. Verify the status file and event log.

During sessions:

- Let the runner own Race Control polling.
- Use `/api/readiness` as the app/operator gate.
- Check health with the status JSON and the last 20 event lines.
- Do not start `race-poller --watch`, live pressure tests, browser automation, or multiple API read loops unless the runner is stopped and you are in recovery.

Expected phases:

- `IDLE`: schedule/trackactivity hints plus one timing heartbeat check, about every 5 minutes.
- `ARMED`: near an upcoming NXT window, timing check about every 15 seconds.
- `LIVE`: guarded INDY NXT Bryce heartbeat, 1-second timing archive, raw timing capture under `data/live/raw/`.
- `COOLDOWN`: after COLD/checkered, 15-second capture for about 10 minutes to preserve the final official state.

## Recovery

Fresh lock conflict:

```bash
cat data/live/live-runner.lock
cat data/live/live-runner-status.json
```

If `heartbeatAt` is older than 60 seconds, a new runner can take over. If it is fresh, do not start another runner.

Stale or missing status:

1. Read `data/live/live-runner-events.jsonl`.
2. Restart the LaunchAgent with `ops/macos/install-live-runner.sh`.
3. If launchd cannot start it, run one bounded foreground check:

```bash
node scripts/live-runner.mjs --max-iterations=20
```

Low process budget:

- If `spareProcessSlots < 150`, stop nonessential apps first.
- Do not raise macOS process limits mid-race.
- Keep the runner alive if it is already in `LIVE` or `COOLDOWN`; the status event is an alarm, not an automatic exit.

Emergency fallback:

- If the runner cannot run and process creation still works, use `node scripts/race-poller.mjs --watch --interval-ms=1000 --iterations=<finite>` only as a bounded fallback.
- Record the gap in the event notes or closeout; do not run fallback and live-runner concurrently.

LaunchAgent exits 78 (EX_CONFIG) in a loop, no new events written (seen 2026-07-11):

- Cause: launchd could not open `StandardOutPath`/`StandardErrorPath`. Log files
  that were pre-created from a Terminal context inside `~/Documents` carry a
  `com.apple.macl` xattr that launchd cannot satisfy after a reboot, so spawn
  fails before node ever runs. The runner itself is fine — a manual
  `node scripts/live-runner.mjs --once` will work, which is the tell.
- Fix: launchd log paths must live outside `~/Documents`. The plist now points at
  `~/Library/Logs/brycecast/live-runner-launchd.{out,err}.log`. If the loop
  recurs, check `ls -l@` on the log paths for `com.apple.macl`, move the files
  aside, and `launchctl bootout gui/501/com.brycecast.live-runner && launchctl
  bootstrap gui/501 ~/Library/LaunchAgents/com.brycecast.live-runner.plist`.
- Expect one exit-code-1 relaunch right after a restart while the previous
  instance's lock goes stale (60 s); KeepAlive retries and takes over.
