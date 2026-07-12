# INDY NXT Race Lap/Section Enhancement

Generated: `2026-07-12T18:24:22Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `900ddfcb701b1977f16e33501302742c328980f5ffcccd190d2e433bba0b5681`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: 1493 Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: 184 caution-aware lap segments.
- `race_lap_inflection_points.csv`: 164 position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations.
- `race_section_session_summary.csv`: 39 race section summaries.
- Context packs: `context-packs/indy-nxt-race-lap-section-context.json`, `context-packs/road-america-race-context.json`, and the current next-venue race context pack.
- Source split: {'official_section_results+official_lap_chart+official_incident_caution_context': 17622, 'official_section_results_only': 219}.

## Lap Microstates

Each Bryce lap row now carries previous position, position delta, net movement from lap one, field-size denominator, running-position percentile, and caution/restart state.

## Caution-Aware Segments

Segments split green runs, caution windows, and restart laps so movement is not presented as generic pace when it happened under race-control context.

## Race Section Shape

Clean-lap race section highlights:

- 2026 Grand Prix at Road America Race 1: clean section median 0.9, best n/a.
- 2024 INDY NXT By Firestone at The Milwaukee Mile: clean section median 0.714, best SS1 to T2:0.79 n=86; T3 to SS2:0.79 n=86; T2 to BS:0.75 n=86; BS to T3:0.72 n=86.
- 2024 Grand Prix of Portland: clean section median 0.688, best Turn 2:0.90 n=32; Turn 3:0.87 n=32; Turn 12:0.81 n=32; Turn 6:0.80 n=32.
- 2024 Grand Prix of Monterey Race 2: clean section median 0.684, best Turn 3:0.89 n=33; Turn 4:0.84 n=33; Turn 2:0.79 n=33; Turn 4A:0.74 n=33.
- 2026 Grand Prix of Alabama Race 2: clean section median 0.674, best Turns 1-3:0.96 n=30; Turn 10:0.86 n=30; Turns 5-6:0.82 n=30; Turn 4:0.73 n=30.
- 2024 Grand Prix of Alabama: clean section median 0.641, best Turn 17:0.93 n=30; Turns 1-3:0.79 n=30; Turns 5-6:0.72 n=30; Turns 12-13 Turns 14-16:0.70 n=30.

## Road America Context

- 2024 Grand Prix at Road America: start 6.0, finish 8.0, best running 5.0, section median 0.6.
- 2025 Grand Prix at Road America: start 10.0, finish 9.0, best running 9.0, section median 0.444.
- 2026 Grand Prix at Road America Race 2: start 12.0, finish 11.0, best running 11.0, section median 0.478.
- 2026 Grand Prix at Road America Race 1: start 16.0, finish 21.0, best running 16.0, section median 0.9.

## Upcoming Venue Race Context

Track: `Nashville Superspeedway`

- 2024 Music City Grand Prix: start 11.0, finish 7.0, best running 6.0, section median 0.5.
- 2025 Music City Grand Prix: start 6.0, finish 6.0, best running 6.0, section median 0.571.

## Caveats

- Lap chart position is race order, not telemetry speed or lap-time pace.
- Caution windows are official incident/caution rows where source-visible; absence of a caution row is not proof of a fully green race in non-INDY NXT series.
- Section percentiles suppress low denominators and aggregate only clean race-lap candidates.
- Context packs are post-race descriptive only.
