# INDY NXT Section-Lap Deep Dive

Generated: `2026-09-10T23:02:15Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `61e7c0e8ca2682cb606c7604b26f433daf6d95c358be5879e2fdbc06135604fd`

## Source Scope

This lane uses INDY NXT official `official_section_results` and `official_top_section_times` derived metrics for practice and qualifying sessions. It does not use live timing, telemetry, setup notes, or post-race outcomes for public upcoming-event claims.

## What Became Productized

- `practice_qualifying_bryce_section_observations.csv`: 26304 Bryce section/lap observations with field-relative percentiles and clean-lap flags.
- `practice_qualifying_session_summary.csv`: 100 session summaries across practice and qualifying.
- `practice_qualifying_top_section_times.csv`: 3357 Bryce rows from official Top Section Times.
- `section_family_strengths.csv`: 264 track/session/section-family aggregates.
- `session_to_race_transfer.csv`: 45 historical prep-to-race rows.
- Context packs: `context-packs/indy-nxt-section-lap-context.json` and the permanent historical `context-packs/road-america-prep-context.json`; The next-venue pack is omitted when the canonical schedule has no future event.

## Practice/Qualifying Section-Lap Findings

Highest source-visible section contexts:

- Portland International Raceway qualifying Turn 9: median 0.88 across 21 comparable rows.
- Streets of Arlington practice BS 2: median 0.86 across 19 comparable rows.
- Portland International Raceway qualifying Turn 2: median 0.86 across 21 comparable rows.
- Streets of Arlington practice BS 3: median 0.81 across 19 comparable rows.
- Indianapolis Motor Speedway Road Course qualifying Turn 12/13: median 0.80 across 52 comparable rows.

Weakest source-visible section contexts:

- Streets of Arlington practice Turn 2: median 0.15 across 19 comparable rows.
- Streets of Arlington practice BS 5: median 0.18 across 19 comparable rows.
- Streets of Arlington practice Turn 5: median 0.18 across 19 comparable rows.
- Road America qualifying I8 to I9: median 0.18 across 23 comparable rows.
- Streets of St. Petersburg qualifying Turn 10: median 0.18 across 23 comparable rows.

## Top Section Times

The Top Section Times table is now mined separately from per-lap Section Results. This matters because it captures official best-section ranks even when a full per-lap story is too noisy for a headline.

## Session-To-Race Transfer

These rows are historical backtests only. They are suitable for analyst features and prep-context language, not public finish forecasts.

- Practice section median vs race finish percentile: n=36, Pearson=0.198, claim=historical_backtest_only.
- Qualifying section median vs race finish percentile: n=44, Pearson=0.16, claim=historical_backtest_only.

## Road America Context

- 2024 Practice 1: median section percentile 0.628, best I4A to I5:0.91 n=10; I13A to I14:0.89 n=10; I7 to I8:0.86 n=10; I1 to I2:0.83 n=10.
- 2024 Practice 2: median section percentile 0.778, best I12 to I13:0.95 n=8; I1 to I2:0.89 n=8; I5 to I6:0.87 n=8; I13A to I14:0.84 n=8.
- 2024 Qualifications - Group 2: median section percentile 0.65, best n/a.
- 2025 Practice 1: median section percentile 0.594, best I3A to I4:0.83 n=13; I4 to I4A:0.80 n=13; I6 to I7:0.78 n=13; I14 to I15C:0.72 n=13.
- 2025 Practice 2: median section percentile 0.571, best I4 to I4A:0.85 n=14; I3A to I4:0.75 n=14; I14 to I15C:0.72 n=14; I11B to I12:0.69 n=14.
- 2025 Qualifications - Group 2: median section percentile 0.444, best n/a.
- 2026 Practice: median section percentile 0.522, best I9 to I10:0.68 n=15; I2 to I3:0.65 n=15; I13A to I14:0.62 n=15; I4A to I5:0.62 n=15.
- 2026 Qualifying - Race 1 Group 2: median section percentile 0.455, best n/a.
- 2026 Qualifying - Race 2 Group 2: median section percentile 0.455, best n/a.

## Upcoming Venue Context

Season complete; no next-venue prep artifact is emitted.

- No future INDY NXT venue remains on the canonical schedule as of the analysis date.

## Caveats

- Section Results rows compare only source-visible field rows, with low-denominator comparisons suppressed.
- Pit/timing-line sections are retained but separated from true track-section aggregates.
- Practice and qualifying formats are not equivalent across sessions or years.
- The context packs intentionally avoid point-prediction language.
