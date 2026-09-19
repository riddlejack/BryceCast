> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# 2026-06-21 Live Drill Closeout

## Executive State

Race: INDY NXT by Firestone Grand Prix at Road America Race 2
Session: EventID `5537`, EventSessionID `6754`
Race Control final state captured: `COLD`, lap `18/18`
Bryce final Race Control state: P11, 18 laps, gap `0.1027`, best lap `1:55.4879`, running points `159`

Confidence: high for source access, identity guard, 1s upstream polling, archive/replay, API smoke, and post-race COLD state. Medium for continuous final-lap micro-timeline because local process exhaustion created a 14m11s combined archive gap between lap 17 live and the later COLD final snapshot.

## Data Captured

- Normal poller archive: `data/live/snapshots.jsonl`
  - Total rows: 1,188
  - Race 2 rows: 1,175
  - Race 2 first: `2026-06-21T16:07:05.511Z`, WARM lap `0/18`, Bryce P15
  - Race 2 latest: `2026-06-21T17:06:19.787Z`, COLD lap `18/18`, Bryce P11
  - Endpoint failures: 0

- Emergency 1s capture: `data/live/emergency-snapshots.jsonl`
  - Rows: 599
  - Window: `2026-06-21T16:36:19.197Z` to `2026-06-21T16:46:17.880Z`
  - Coverage: laps 13 to 17
  - Max cadence gap: 1.31s
  - Endpoint failures: 0

- Raw emergency payloads: `analysis/live-drill-2026-06-21/raw-racecontrol-1s.jsonl`
  - Rows: 599
  - Size: 206,254,265 bytes
  - Endpoint failures: 0

- SQLite archive: `data/live/brycecast.sqlite`
  - `race_snapshots` Race 2 rows: 1,175
  - `bryce_samples` Race 2 rows: 1,175
  - Best observed rank: 11
  - Worst observed rank: 16
  - Source probe failures: 0

- Latest JSONs:
  - `data/live/latest-snapshot.json`
  - `public/data/live-snapshot.json`
  - Verified identical after post-race COLD update.

## Pressure Tests

- Primary Race Control 1s pressure:
  - File: `data/live/pressure-tests/live-source-pressure-2026-06-21T16-07-16-403Z.json`
  - Endpoints: 5
  - Iterations: 60
  - Requests: 300
  - Errors: 0

- All-source 1s pressure during live race:
  - File: `data/live/pressure-tests/live-source-pressure-2026-06-21T16-08-52-414Z.json`
  - Endpoints: 9
  - Iterations: 30
  - Requests: 270
  - Errors: 0

- All-source 1s pressure post-race:
  - File: `data/live/pressure-tests/live-source-pressure-2026-06-21T17-00-33-114Z.json`
  - Endpoints: 9
  - Iterations: 15
  - Requests: 135
  - Errors: 0
  - Timing headline: Race 2, COLD, lap `18/18`

- API read pressure:
  - File: `analysis/live-drill-2026-06-21/api-read-pressure-1s.jsonl`
  - Iterations: 120
  - Route requests: 720
  - Route errors: 0
  - p95: 488ms
  - max: 645ms

- Subsecond local read pressure:
  - File: `analysis/live-drill-2026-06-21/api-local-read-pressure-subsecond.jsonl`
  - 500ms phase: 240 route reads, 0 errors, p95 10ms, max 380ms
  - 250ms phase: 240 route reads, 0 errors, p95 10ms, max 213ms

## Tests Run After Recovery

- `node scripts/race-poller.mjs --once --all-sources`: passed; wrote final COLD Race 2 snapshot.
- `node scripts/live-source-pressure-test.mjs --endpoints=all --interval-ms=1000 --iterations=15`: passed; 135/135 successful requests.
- REPL post-race monitor: 12 primary endpoint iterations, 0 endpoint errors, Race 2 stayed COLD lap `18/18`.
- REPL wrong-series watcher: started at `2026-06-21T17:09:47.475Z`; writes to `analysis/live-drill-2026-06-21/repl-postrace-wrong-series-watch.jsonl` and `analysis/live-drill-2026-06-21/repl-postrace-wrong-series-watch-status.json`; first six ticks stayed Race 2 COLD with guarded Bryce car #9.
- `node scripts/race-poller.mjs --watch --interval-ms=1000 --iterations=5`: passed; five bounded COLD samples persisted.
- `npm run test:live-readiness`: passed; 54 assertions.
- `npm run weather:live`: passed; NWS ambient weather only, not official INDY NXT weather.
- `npm run weather:live:upcoming`: passed; next INDY NXT events include Mid-Ohio Race 1 on 2026-07-04 and Race 2 on 2026-07-05.
- `node scripts/api-smoke.mjs --port=8899`: passed; `/api/readiness` correctly returned `stale` post-race because timing was old/COLD.
- `npm run analytics:view-models:validate`: passed; 24 manifest items across 5 UI surfaces.
- `npm run analytics:ui-data-package:validate`: passed; 5 screens, 10 live fixtures, context packs valid.
- `npm run build`: passed.

## Official/Public Cross-Checks

- INDY NXT public driver page updated after Race 2:
  - Bryce season stats: rank 17, points 159, starts 10.
  - This matches Race Control final running points `159`.

- INDY NXT public event card updated after Race 2:
  - 2026 Race 2 winner: Alessandro de Tullio.

- Static Race 2 result table was still not fully populated in the fetched HTML at the time of the drill closeout. Treat Race Control final archive as the best available row-level source until the official full table/PDF is published.

## Failure Mode Found

The upstream data sources did not break under 1s pressure. The local Mac did.

Observed failure:

- macOS repeatedly returned `Resource temporarily unavailable (os error 35)`.
- This broke shell process creation, Node REPL startup, Computer Use, and AppleScript-like recovery paths.
- The failure happened after multiple live monitors, pressure tests, terminal sessions, Chrome, MagicPath, LM Studio, and verbose 1s output were active.
- Emergency REPL capture ran for 599 seconds and then stopped at the REPL wrapper timeout, leaving a live gap from lap 17 to the later final COLD snapshot.

Recovery:

- Quit Chrome.
- Quit MagicPath, which had several helper processes and high CPU load.
- Quit LM Studio.
- Process creation recovered enough to run formal tests.

Required fix before the next live event:

- Use exactly one long-running ingestor process per source family.
- Log quietly to files, not the terminal.
- Do not run multiple concurrent shell/REPL/browser monitors during the race.
- API routes should read cached/latest archive state by default and only direct-fetch upstream via explicit refresh/admin paths. Client polling must not multiply Race Control upstream requests per user.
- Add a watchdog/status file that records heartbeat, last write time, row count, endpoint failures, and process PID without relying on a terminal session.
- Add an automatic fallback capture with no short wrapper timeout.

## Product Readiness Conclusion

The live data contract is strong enough for a real app if the runtime architecture is fixed around a single cached ingestor.

Supported with high confidence:

- 1s Race Control source polling.
- Bryce identity guard using INDY NXT heartbeat plus car #9/DriverID `2143`.
- Live rank/lap/gap/best lap/overtake/points fields.
- SQLite replay/archive.
- JSONL/latest/public snapshot publication.
- API smoke/readiness/source-state handling.
- Post-race COLD/stale state.
- NWS ambient weather enrichment with source caveat.

Not supported or still explicitly caveated:

- Official INDY NXT weather/track condition.
- Live GPS/moving-dot telemetry.
- POV/radio proof as an active production source.
- Pit/tire/fuel sequence beyond exposed Race Control fields.
- Official final results table/PDF until the public page publishes full rows.

## Next Drill Setup

The next INDY NXT live windows are not end of August. The current official schedule data shows:

- Mid-Ohio Race 1: 2026-07-04
- Mid-Ohio Race 2: 2026-07-05

Before then, implement the single-ingestor/cache-backed API architecture and rerun this exact test matrix with the terminal/logging discipline fixed.
