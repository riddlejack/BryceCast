# BryceCast Manual Live Monitor Log - 2026-06-21

Codex local command execution is blocked by `Resource temporarily unavailable (os error 35)`, so this log captures manual public-source observations until the automated watcher can be started.

## Pre-green baseline

- Local watcher command attempted from Codex:
  - `LIVE_DRILL_WATCH=1 LIVE_DRILL_INTERVAL_MS=15000 node scripts/diagnostics/live-drill-probe.mjs`
  - Result: failed before process start with `Resource temporarily unavailable (os error 35)`.
- INDY NXT leaderboard:
  - URL: `https://www.indynxt.com/leaderboard`
  - Reachable public shell.
  - Text fetch shows Race 2 as next race but ends with `Browser not compatible. Please try a different browser or device.`
  - Dynamic timing payload not available through text fetch.
- INDY NXT event page:
  - URL: `https://www.indynxt.com/Schedule/2026/Road-America-Race2`
  - Sunday, Jun 21, 12:00 PM ET, INDY NXT - Race 2.
  - Road America track length: 4.014 miles.
  - Race distance: 18 laps / 72.25 miles.
  - Fan resources listed: spotter guide, starting lineup grid, qualification order, pit assignments, driver performance.
- INDY NXT starting grid:
  - URL: `https://www.indynxt.com/Schedule/2026/Road-America-Race2/starting-grid`
  - Bryce Aron starts 15th.
  - Car: 9.
  - Team: Chip Ganassi Racing.
  - Driver radio frequency: 452.7000.
  - INDYCAR Radio frequency: 450.7500.
- INDY NXT spotter guide:
  - URL: `https://www.indynxt.com/Schedule/2026/Road-America-Race2/spotter-guide`
  - Bryce Aron / car 9 / Chip Ganassi Racing / 452.7000 confirmed.

## 10:48 AM CT public-source poll

- Local watcher command retried:
  - Result: still failed before process start with `Resource temporarily unavailable (os error 35)`.
- Computer Use route:
  - Explicit tool discovery for screenshot/click/type/Terminal control did not expose a callable Computer Use namespace.
  - `list_available_plugins_to_install` did not list Computer Use as installable.
- `https://www.indynxt.com/leaderboard`
  - Still reachable.
  - Still only exposes the public shell plus `Browser not compatible. Please try a different browser or device.`
- `https://www.indynxt.com/Schedule/2026/Road-America-Race2`
  - Still pre-green.
  - Schedule/details unchanged: Sunday Jun 21, 12:00 PM ET; 18 laps / 72.25 miles.
  - Fan-resource links still present.
- `https://www.indynxt.com/results/indy-nxt/2026/grand-prix-at-road-america-race-2`
  - Public text fetch returned an internal error before the race.
  - Post-race polling should use session-specific result links when they publish.

## 10:55 AM CT public-source poll

- Local watcher command retried:
  - Result: still failed before process start with `Resource temporarily unavailable (os error 35)`.
- Direct official live timing host:
  - URL: `https://leaderboard.indycar.com/`
  - Reachable via public text fetch.
  - Shows schedule rows: `NTT INDYCAR SERIES Warmup 8:00AM`, `INDY NXT by Firestone Race 9:00AM`, `NTT INDYCAR SERIES Race 11:00AM` in Pacific time.
  - Dynamic timing/scoring data still not exposed through text fetch.
- FOX Sports event page:
  - URL: `https://www.foxsports.com/motor/grand-prix-at-road-america-race-2-indy-nxt-jun-21-2026-racetrax-6072`
  - Shows Grand Prix at Road America Race 2, Road America, Elkhart Lake, WI.
  - Shows 18 laps / 73 miles.
  - Event schedule: Combined Qualifying - Race 2 final; Race Sun Jun 21 4:00 PM UTC / 11:00 AM CT.
  - Weather source: FOX Weather, Plymouth WI, sunny, 71 F, wind 5 mph SE.
  - Starting lineup top five: Alessandro de Tullio #14, Nikita Johnson #21, Max Taylor #28, Jack Beeton #45, Matteo Nannini #20.
- Schedule cross-check:
  - Public fast-facts page matches the weekend schedule: command at 11:01 AM CT; green at 11:06 AM CT; 18 laps / 50 minutes; FS1 live.

## 11:04 AM CT pre-green public-source poll

- Local watcher command retried:
  - Result: still failed before process start with `Resource temporarily unavailable (os error 35)`.
- Official event page:
  - Still returns static countdown/event metadata through text fetch.
  - Race schedule, fan-resource, and event-detail sections remain accessible.
- Official leaderboard:
  - Still returns browser-compatibility shell only through text fetch.
- FOX Sports event page:
  - Base event page remains accessible; direct `?tab=leaderboard` text fetch is not usable.
- Search/indexed live events:
  - No reliable Race 2 green-flag or lap-completion event found yet.
  - Race 1 key events are indexed and confirm FOX can publish lap/caution/key-event text after ingestion.
- Command health:
  - Minimal command `true` also failed before process start with `Resource temporarily unavailable (os error 35)`.
  - This confirms the blocker is host process creation, not the Node watcher command.
- Official static PDFs found and added to probe reachability checks:
  - Weekend schedule PDF: `https://www.indynxt.com/-/media/Files/2026/NICS/10-RA/indycar-weekendschedule-RA26.pdf`
  - Qualification groups PDF: `https://www.indynxt.com/-/media/Files/2026/INXT/09-10-RA/indynxt-qualgroups-RA26.pdf`
    - Confirms Group 2 includes `9 Aron, Bryce`.
  - Pit assignments PDF: `https://www.indynxt.com/-/media/Files/2026/INXT/09-10-RA/indynxt-pitassignments-RA26.pdf`
    - Confirms `CHIP GANASSI RACING #9 14`.

## Live-data architecture notes

- Launch by NTT DATA public case study says the INDYCAR Live Race Leaderboard is active during races and uses NTT Smart Platform data.
- The expected fan-facing data classes include live positions, speeds, driver profiles, overtakes, race strategy / momentum insights, and second-screen visualizations.
- Official NTT/INDYCAR partnership pages describe the underlying data platform as near-real-time, car-and-track sensor driven, with insights such as head-to-head battles, pit-stop impact, fuel strategies, tire wear, leaderboard predictions, and weather impact.
- Current access status from Codex:
  - Confirmed public shell and official pages.
  - Not confirmed direct payload endpoint, because browser/desktop/network-capture tools are not exposed and local process creation is blocked.

## Post-green public-source poll

- Official Race 2 results:
  - `https://www.indynxt.com/results/indy-nxt/2026/grand-prix-at-road-america-race-2/combined-qualifying---race-2`
  - Still combined qualifying only, not race results.
  - Search snippets show Bryce Aron qualifying fact: Chip Ganassi Racing, `01:52.0735`, `128.937`.
- Official Race 2 race result URL/search:
  - No reliable Race 2 `race` report, lap chart, box score, winner, or Bryce final race position found yet.
- Third-party/result-source search:
  - No reliable Race 2 winner or live lap event found yet.

## 11:10 AM CT live backend state

- Local command execution recovered after Codex app restart.
- Started external public-source watcher:
  - Command: `LIVE_DRILL_WATCH=1 LIVE_DRILL_INTERVAL_MS=15000 node scripts/diagnostics/live-drill-probe.mjs --watch`
  - Session: `72067`
  - Output: `analysis/live-drill-2026-06-21/latest.json`, timestamped snapshots, and `snapshots.jsonl`.
  - Current status: `pass=12 warn=10 fail=0`.
- Started app race poller:
  - Command: `npm run poll:race:watch`
  - Session: `59749`
  - Storage targets: `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl`, `data/live/latest-snapshot.json`, `public/data/live-snapshot.json`.
  - First live Race Control session: `5537-6754`.
- Backend tests:
  - `npm run test:live-readiness`: passed, 54 assertions.
  - `node scripts/api-smoke.mjs --port=8899`: passed.
  - `npm run weather:live`: passed; Road America / KSBM observation live, clear, 21 C, SE wind, no alerts.
  - `npm run audit:live:pressure:primary`: passed; 300/300 requests, 0 errors.
  - `npm run audit:live:pressure`: passed; 270/270 requests, 0 errors.
- API service:
  - Command: `npm run serve:api`
  - Session: `6065`
  - URL: `http://0.0.0.0:8787`
- Live Race 2 state from `/api/bryce` and `/api/timing`:
  - Heartbeat: `GREEN`, lap `1/18`, time to go `47:49`, EventID `5537`, EventSessionID `6754`.
  - Bryce Aron: P12, started P15, active, lap 1 `2:02.6203`, best lap `2:02.6203`, last speed / best speed `117.847`, passes `6`, passed `2`, tire `P`, overtake remain `58`.
  - Top five: Alessandro de Tullio, Nikita Johnson, Matteo Nannini, Enzo Fittipaldi, Myles Rowe.
