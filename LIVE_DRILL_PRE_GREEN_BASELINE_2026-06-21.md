# BryceCast Pre-Green Baseline - 2026-06-21

Captured from current public web fetches because Codex local process spawning is blocked with `Resource temporarily unavailable (os error 35)`.

## Public source baseline

- `https://www.indynxt.com/leaderboard`
  - Reachable.
  - Shows Race 2 as the next race at 12:00 PM ET.
  - Text fetch ends with `Browser not compatible. Please try a different browser or device.`
  - Status: shell reachable; dynamic timing payload still needs browser/network capture.

- `https://www.indynxt.com/Schedule/2026/Road-America-Race2`
  - Race: Grand Prix at Road America Race 2.
  - Date/location: June 19-21, Elkhart Lake, Wisconsin.
  - Schedule row: Sunday, Jun 21, 12:00 PM ET, INDY NXT - Race 2.
  - Event details: Road America, 4.014 miles, race distance 18 laps / 72.25 miles.
  - Fan resources present: spotter guide, starting lineup grid, qualification order, pit assignments, driver performance.

- `https://www.indynxt.com/Schedule/2026/Road-America-Race2/starting-grid`
  - Starting grid is reachable.
  - INDYCAR Radio frequency listed: 450.7500.
  - Bryce Aron baseline:
    - Starting position: 15th.
    - Car: 9.
    - Team: Chip Ganassi Racing.
    - Radio frequency: 452.7000.

## Immediate action if a local terminal is available

```bash
cd "/Users/example/Documents/Bryce POV access"
LIVE_DRILL_WATCH=1 LIVE_DRILL_INTERVAL_MS=15000 node live-drill-probe.mjs
```

Expected output files:

- `analysis/live-drill-2026-06-21/latest.json`
- `analysis/live-drill-2026-06-21/snapshots.jsonl`
- `analysis/live-drill-2026-06-21/<timestamp>.json`

