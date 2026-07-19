# INDY NXT Section-Lap Deep Dive

Generated: `2026-07-19T21:03:15Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `64c2452b244d1c2ecb1db01df0735b1a0f631db0d4e74397ed7fa3a89b845978`

## Source Scope

This lane uses INDY NXT official `official_section_results` and `official_top_section_times` derived metrics for practice and qualifying sessions. It does not use live timing, telemetry, setup notes, or post-race outcomes for public upcoming-event claims.

## What Became Productized

- `practice_qualifying_bryce_section_observations.csv`: 22660 Bryce section/lap observations with field-relative percentiles and clean-lap flags.
- `practice_qualifying_session_summary.csv`: 91 session summaries across practice and qualifying.
- `practice_qualifying_top_section_times.csv`: 3047 Bryce rows from official Top Section Times.
- `section_family_strengths.csv`: 250 track/session/section-family aggregates.
- `session_to_race_transfer.csv`: 41 historical prep-to-race rows.
- Context packs: `context-packs/indy-nxt-section-lap-context.json`, `context-packs/road-america-prep-context.json`, and the current next-venue prep pack.

## Practice/Qualifying Section-Lap Findings

Highest source-visible section contexts:

- WeatherTech Raceway Laguna Seca qualifying Turn 5: median 0.88 across 34 comparable rows.
- Portland International Raceway qualifying Turn 8: median 0.88 across 14 comparable rows.
- Portland International Raceway qualifying Turn 9: median 0.88 across 14 comparable rows.
- Streets of Arlington practice BS 2: median 0.87 across 19 comparable rows.
- Portland International Raceway qualifying Turn 2: median 0.87 across 14 comparable rows.

Weakest source-visible section contexts:

- Streets of Arlington practice Turn 2: median 0.15 across 20 comparable rows.
- Streets of Arlington practice BS 5: median 0.17 across 19 comparable rows.
- Streets of St. Petersburg qualifying Turn 10: median 0.18 across 23 comparable rows.
- Streets of Arlington qualifying Turns 13/14: median 0.19 across 8 comparable rows.
- Streets of Arlington practice Turn 5: median 0.20 across 20 comparable rows.

## Top Section Times

The Top Section Times table is now mined separately from per-lap Section Results. This matters because it captures official best-section ranks even when a full per-lap story is too noisy for a headline.

## Session-To-Race Transfer

These rows are historical backtests only. They are suitable for analyst features and prep-context language, not public finish forecasts.

- Practice section median vs race finish percentile: n=33, Pearson=0.287, claim=historical_backtest_only.
- Qualifying section median vs race finish percentile: n=40, Pearson=0.243, claim=historical_backtest_only.

## Road America Context

- 2024 Practice 1: median section percentile 0.628, best I4A to I5:0.89 n=10; I7 to I8:0.87 n=10; I1 to I2:0.83 n=10; I2 to I3:0.78 n=10.
- 2024 Practice 2: median section percentile 0.737, best I1 to I2:0.89 n=8; I5 to I6:0.87 n=8; I2 to I3:0.82 n=8; I3 to I3A:0.82 n=8.
- 2024 Qualifications - Group 2: median section percentile 0.7, best n/a.
- 2025 Practice 1: median section percentile 0.611, best I3A to I4:0.83 n=13; I4 to I4A:0.80 n=13; I6 to I7:0.78 n=13; I2 to I3:0.72 n=13.
- 2025 Practice 2: median section percentile 0.571, best I4 to I4A:0.85 n=14; I3A to I4:0.75 n=14; I10 to I11 I11 to I11B I11B to I12 I12 to I13 I13 to I13A:0.69 n=14; I1B to I1:0.69 n=14.
- 2025 Qualifications - Group 2: median section percentile 0.556, best n/a.
- 2026 Practice: median section percentile 0.522, best I9 to I10:0.68 n=15; I2 to I3:0.65 n=15; I4A to I5:0.62 n=15; I10 to I11 I11 to I11B I11B to I12 I12 to I13 I13 to I13A:0.57 n=15.
- 2026 Qualifying - Race 1 Group 2: median section percentile 0.455, best I13A to I14 I14 to I15C I15C to I15:0.82 n=8; I1 to I2:0.73 n=8; I9 to I10:0.65 n=8; I2 to I3:0.64 n=8.
- 2026 Qualifying - Race 2 Group 2: median section percentile 0.455, best I13A to I14 I14 to I15C I15C to I15:0.82 n=8; I1 to I2:0.73 n=8; I9 to I10:0.65 n=8; I2 to I3:0.64 n=8.

## Upcoming Venue Context

Track: `Portland International Raceway`

- 2024 Practice 1: median section percentile 0.667, best Turn 12:0.94 n=19; Turn 8:0.87 n=19; Turn 9:0.80 n=19; Turn 7:0.75 n=19.
- 2024 Practice 2: median section percentile 0.533, best Turn 8:0.81 n=25; Turn 9:0.75 n=25; Turn 3:0.60 n=25; Turn 7:0.56 n=25.
- 2024 Qualifications - Group 2: median section percentile 0.5, best Turn 2:0.88 n=8; Turn 9:0.88 n=8; Turn 3:0.81 n=8; Turn 8:0.81 n=8.
- 2025 Practice 1: median section percentile 0.5, best Turn 1:0.63 n=26; Turn 4:0.61 n=27; Turn 6:0.56 n=27; Turns 10/11:0.50 n=28.
- 2025 Practice 2: median section percentile 0.611, best Turn 12:0.83 n=20; Turn 8:0.76 n=20; Turn 4:0.72 n=20; Turn 3:0.65 n=20.
- 2025 Qualifications - Group 2: median section percentile 0.714, best n/a.

## Caveats

- Section Results rows compare only source-visible field rows, with low-denominator comparisons suppressed.
- Pit/timing-line sections are retained but separated from true track-section aggregates.
- Practice and qualifying formats are not equivalent across sessions or years.
- The context packs intentionally avoid point-prediction language.
