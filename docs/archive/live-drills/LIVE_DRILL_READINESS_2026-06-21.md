> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# BryceCast Live Drill Readiness - 2026-06-21

## Race clock

- INDY NXT by Firestone, Grand Prix at Road America Race 2
  - Official event time: Sunday, June 21, 2026, 12:00 PM ET / 11:00 AM CT.
  - Weekend schedule PDF: live broadcast window starts 10:55 AM CT; listed race start 11:00 AM CT; approximate green 11:06 AM CT.
  - Race distance: 18 laps / 72.25 miles.
  - Bryce Aron: car 9, Chip Ganassi Racing, starting 15th, listed radio frequency 452.7000.

- NTT INDYCAR SERIES, XPEL Grand Prix at Road America
  - Official event time: Sunday, June 21, 2026, 2:00 PM ET / 1:00 PM CT.
  - Weekend schedule PDF: live broadcast window starts 12:30 PM CT; listed race start 1:00 PM CT; approximate green 1:27 PM CT.
  - Race distance: 55 laps / 220.77 miles.

## Live data surfaces to test

| Surface | URL / access method | Live value | Confidence | Drill expectation |
| --- | --- | --- | --- | --- |
| INDY NXT event page | `https://www.indynxt.com/Schedule/2026/Road-America-Race2` | Schedule, race distance, event resources | High | Must return 200 and contain Race 2 schedule details |
| INDY NXT starting grid | `https://www.indynxt.com/Schedule/2026/Road-America-Race2/starting-grid` | Grid, teams, car numbers, radio frequencies | High | Must return Bryce car 9, P15, 452.7000 |
| INDY NXT leaderboard | `https://www.indynxt.com/leaderboard` | Live timing/scoring shell | Medium | 200 is reachable; browser/network capture still needed for dynamic payload |
| INDYCAR leaderboard | `https://www.indycar.com/leaderboard` and `?type=false` | Live timing/scoring shell | Medium | 200 is reachable; dynamic payload endpoint must be captured live |
| RaceControl redirect | `https://racecontrol.indycar.com/` | Legacy live timing entrypoint | High for redirect | Should redirect to official leaderboard |
| INDYCAR app | Official mobile app | In-car cameras, driver-team radio, live timing/scoring, 2D map | Low direct-backend confidence | Treat as protected/app-only unless existing authorized endpoints exist |
| INDYCAR Radio | `indycarradio.com`, official app, leaderboard | Broadcast audio and local affiliates | Medium | Verify page/stream reachability; do not assume driver-team radio |
| Firestone tire tracker | `https://livetiming.net/firestone/` | NTT race tire stint chart, likely image-backed | Medium, NTT only | Check archive/index and likely current Road America image candidates |
| Official results pages | `indynxt.com/results/...`, `indycar.com/results/...` | Post-session classification, lap charts, box score, sections | High after session | Poll after session; parse once official pages populate |
| Weather | NWS/NOAA for Road America coordinates near `43.7975,-87.9999` | Ambient forecast/observations near track | High | Fetch observation/forecast, source-label as off-track weather |

## Failure classification

- `fail`: required static source is unreachable, schedule no longer matches expected date/time, or Bryce grid facts do not parse.
- `warn`: dynamic live surface is reachable but does not expose payload in raw HTML; app-only or protected source is unavailable; race has not started; Firestone current event image has not appeared yet.
- `pass`: source is reachable and expected evidence is present.

## Drill windows

- Immediate capture command:

```bash
LIVE_DRILL_WATCH=1 LIVE_DRILL_INTERVAL_MS=15000 node scripts/diagnostics/live-drill-probe.mjs
```

- Output:
  - `analysis/live-drill-2026-06-21/latest.json`
  - `analysis/live-drill-2026-06-21/snapshots.jsonl`
  - `analysis/live-drill-2026-06-21/<timestamp>.json`

- Pre-NXT: run from 10:30-10:55 AM CT.
- NXT live: run at green, lap 3, lap 9, lap 15, checkered.
- Between races: run immediately after NXT official results appear, then once before INDYCAR warmup/race handoff.
- INDYCAR live: run at FOX broadcast start, green, first pit cycle, final 10 laps, checkered.

## Open risks

- The public leaderboard is confirmed, but the actual dynamic data transport still needs live browser/network capture. Search indexing shows timing fields, but raw non-browser HTML only exposes a compatibility shell.
- App-only in-car camera, driver-team radio, and 2D map features should not be represented as backend-ready until an authorized access path is verified.
- Firestone tire tracking appears to be NTT-series tire strategy only; do not use it for INDY NXT unless today's page proves otherwise.
- Weather from NWS/NOAA is near-track weather, not official INDYCAR track temperature unless the leaderboard or Firestone image exposes ambient/track values.
