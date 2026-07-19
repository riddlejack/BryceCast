# Restart Report Card lane

Positions gained or held over the two green laps after every INDY NXT restart,
Bryce always shown against the full field so each figure carries a denominator.

## Sources (both already in the repo)

- **Caution-lap index** — official Results-PDF caution summaries carried in
  `data/career/career.dataset.json` as `incidents` (`raw.startLap`..`raw.endLap`,
  `raw.cautionNumber`, `raw.reason`). 72 caution episodes across the career.
- **Full-field lap chart** — official lap-chart PDF positions in the same
  dataset's `lapSamples` (`driverId`, `lapNumber`, `position`). Positions only:
  the lap chart has no lap times or gaps, so this lane never speaks in seconds.

## Method

1. Merge consecutive official caution laps into caution periods.
2. A **restart** is the first green lap after a caution period. A period that
   ends on the final lap produces **no restart** (the race finished under
   yellow) and is recorded, not counted.
3. The **window** is the up-to-two green laps after the restart. If a fresh
   caution or the finish arrives first, the window truncates to the green laps
   actually run and the row records how many (`windowLaps`, `truncateReason`).
4. **Positions gained** for a driver = running position at the last caution lap
   (the restart order) minus running position at the end of the window. Positive
   = moved forward. Only drivers present at both laps are classified.
5. Aggregated per race, per venue, and per season, each alongside the field.
6. A race with no official lap chart is marked **uncovered**, never estimated. A
   race where Bryce has no lap-chart line (e.g. an opening-lap incident) still
   contributes its field restarts; Bryce is marked uncovered for that race.

## Hand verification (re-derived by the validator)

Two races were checked by hand against the official caution summaries:

- **2024 Grand Prix of Alabama (Barber)** — official cautions lap 5–5 and lap
  34–35 (35-lap race). Caution 5–5 → restart lap 6 (Bryce P5 → P5, held).
  Caution 34–35 ends on the final lap → no restart. **1 restart.**
- **2024 Indianapolis Grand Prix Race 1** — official cautions lap 21–25 and lap
  30–31 (35-lap race). Restart lap 26 (Bryce P16 → P15, gained one) and restart
  lap 32 (P14 → P14, held). **2 restarts, gained on one.**

## Outputs

- `output/tables/restart_events.csv` — one row per restart, Bryce plus field summary.
- `output/tables/restart_driver_deltas.csv` — every classified driver's move per restart.
- `output/tables/restart_by_race.csv` — per-race aggregate with the field rank.
- `output/tables/restart_by_venue.csv` — per-venue rollup.
- `output/tables/restart_by_season.csv` — per-season rollup.
- `output/tables/uncovered_races.csv` — races excluded from clean detection, with the reason.
- `output/summary.json` — coverage, career totals, and the hand-verification block.

## Commands

```bash
npm run analytics:restart-report
npm run analytics:restart-report:validate
```
