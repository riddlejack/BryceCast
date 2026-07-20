# Caution Atlas lane

A descriptive, zero-modeling count of full-course cautions per INDY NXT venue:
how many yellows fall per race, where in the race they fall, what the official
caution summary recorded as the cause, and how long each ran before the restart.
Every figure carries its denominator. Nothing here is a probability, a
prediction, or a verdict — it is counting.

## Source (already in the repo)

- **Official caution summaries** — the Results-PDF caution rows carried in
  `data/career/career.dataset.json` as `incidents` (`raw.startLap`..`raw.endLap`,
  `raw.cautionNumber`, `raw.reason`). One caution incident is one official
  caution episode. 74 episodes across the 41 races run through the as-of date.
- **Lap-chart distance** — the leader's last charted lap in the same dataset's
  `lapSamples`, used only as the denominator for "which third of the race".

## Method

1. **Which races count.** Only INDY NXT *race* sessions actually run: official
   status AND `eventStartDate` on or before `BRYCECAST_ANALYTICS_AS_OF_DATE`. A
   not-yet-run race has zero recorded cautions because it has not happened;
   counting it as caution-free would deflate every venue's rate, so it is
   excluded. (41 run races as of 2026-07-19; 4 later 2026 races excluded.)
2. **Count per race.** The number of official caution episodes in the race.
   Summarized per venue as median, range (min–max), and mean across his visits.
3. **Which third.** The caution's *start* lap over the race distance run:
   opening (first third), middle, final. A race with no lap chart contributes
   its count but its cautions are marked `unknown` and left out of the thirds
   tally.
4. **Cause category.** A faithful grouping of the official reason text by its
   leading keyword — Contact, Off course, Spin, Debris, Mechanical, Conditions —
   in that priority order. The raw reason is preserved beside every category;
   the grouping only counts, it never editorializes or invents a cause.
5. **Restart window.** A caution ending on the final lap ran to the flag (no
   restart); every other caution's restart lap is its end lap + 1. Per venue we
   also carry the median caution length in laps.

Everything is a count of official caution episodes: no lap times, no positions,
no inference beyond the official label. Gold (Bryce's marker) is absent by
design — a caution is not a Bryce moment.

## The Nashville reconciliation

The Phase 3 charter's example headline read "Cautions at Nashville: 2 per race
median". Re-derived from the official summaries, Nashville is **1 caution per
race median, range 1–2 across his 3 visits** (2024: 1, 2025: 1, 2026: 2). The
lane's validator pins this so the number can never silently drift back to 2.

## Outputs

- `output/tables/caution_events.csv` — one row per caution (start/end lap,
  duration, distance, lap fraction, third, restart lap, ran-to-flag, category,
  raw reason).
- `output/tables/caution_by_race.csv` — per-race counts, thirds, causes.
- `output/tables/caution_by_venue.csv` — per-venue rollup (median/range/mean,
  thirds, dominant third, causes, median caution length).
- `output/tables/uncovered_races.csv` — run races with no lap-chart distance
  (counted, but their cautions are not placed in a third), with the reason.
- `output/summary.json` — coverage, totals by cause and third, the per-venue
  rollup, and the two-race hand verification.

## Commands

```bash
BRYCECAST_ANALYTICS_AS_OF_DATE=2026-07-19 npm run analytics:caution-atlas
BRYCECAST_ANALYTICS_AS_OF_DATE=2026-07-19 npm run analytics:caution-atlas:validate
```

Pin the as-of date to reproduce the committed tables; the build and validator
both honor it and refuse a summary whose `asOfDate` disagrees.
