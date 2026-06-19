# INDY NXT Section-Lap Deep Dive

Generated: `2026-06-18T10:49:39Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`

## Source Scope

This lane uses INDY NXT official `official_section_results` and `official_top_section_times` derived metrics for practice and qualifying sessions. It does not use live timing, telemetry, setup notes, or post-race outcomes for public upcoming-event claims.

## What Became Productized

- `practice_qualifying_bryce_section_observations.csv`: 21044 Bryce section/lap observations with field-relative percentiles and clean-lap flags.
- `practice_qualifying_session_summary.csv`: 83 session summaries across practice and qualifying.
- `practice_qualifying_top_section_times.csv`: 2678 Bryce rows from official Top Section Times.
- `section_family_strengths.csv`: 248 track/session/section-family aggregates.
- `session_to_race_transfer.csv`: 36 historical prep-to-race rows.
- Context packs: `context-packs/indy-nxt-section-lap-context.json` and `context-packs/road-america-prep-context.json`.

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

- Practice section median vs race finish percentile: n=30, Pearson=0.265, claim=historical_backtest_only.
- Qualifying section median vs race finish percentile: n=35, Pearson=0.232, claim=historical_backtest_only.

## Road America Context

- 2024 Practice 1: median section percentile 0.628, best I4A to I5:0.89 n=10; I7 to I8:0.87 n=10; I1 to I2:0.83 n=10; I2 to I3:0.78 n=10.
- 2024 Practice 2: median section percentile 0.737, best I1 to I2:0.89 n=8; I5 to I6:0.87 n=8; I2 to I3:0.82 n=8; I3 to I3A:0.82 n=8.
- 2024 Qualifications - Group 2: median section percentile 0.7, best n/a.
- 2025 Practice 1: median section percentile 0.611, best I3A to I4:0.83 n=13; I4 to I4A:0.80 n=13; I6 to I7:0.78 n=13; I2 to I3:0.72 n=13.
- 2025 Practice 2: median section percentile 0.571, best I4 to I4A:0.85 n=14; I3A to I4:0.75 n=14; I10 to I11 I11 to I11B I11B to I12 I12 to I13 I13 to I13A:0.69 n=14; I1B to I1:0.69 n=14.
- 2025 Qualifications - Group 2: median section percentile 0.556, best n/a.

## Caveats

- Section Results rows compare only source-visible field rows, with low-denominator comparisons suppressed.
- Pit/timing-line sections are retained but separated from true track-section aggregates.
- Practice and qualifying formats are not equivalent across sessions or years.
- The context packs intentionally avoid point-prediction language.
