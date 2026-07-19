# INDY NXT Race Lap/Section Enhancement

Generated: `2026-07-19T21:07:12Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `64c2452b244d1c2ecb1db01df0735b1a0f631db0d4e74397ed7fa3a89b845978`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: 1558 Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: 191 caution-aware lap segments.
- `race_lap_inflection_points.csv`: 170 position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations (Bryce only).
- `race_section_lap_field_observations.csv.gz`: 429209 FULL-FIELD ranked rows — every car, every lap, every section, plus a synthesized derived-remainder row per car/lap.
- `race_section_field_distribution.json`: per-section field time distributions + Bryce's per-lap derived remainder with real full-field percentiles.
- `race_section_session_summary.csv`: 40 race section summaries.
- Context packs: `context-packs/indy-nxt-race-lap-section-context.json`, `context-packs/road-america-race-context.json`, and the current next-venue race context pack.
- Source split: {'official_section_results+official_lap_chart+official_incident_caution_context': 17882, 'official_section_results_only': 222}.

## Lap Microstates

Each Bryce lap row now carries previous position, position delta, net movement from lap one, field-size denominator, running-position percentile, and caution/restart state.

## Caution-Aware Segments

Segments split green runs, caution windows, and restart laps so movement is not presented as generic pace when it happened under race-control context.

## Race Section Shape

Clean-lap race section highlights:

- 2026 Grand Prix at Road America Race 1: clean section median 0.75, best n/a.
- 2024 Grand Prix of Portland: clean section median 0.688, best Turn 2:0.90 n=32; Turn 3:0.87 n=32; Turn 12:0.81 n=32; Turn 6:0.80 n=32.
- 2024 Grand Prix of Monterey Race 2: clean section median 0.684, best Turn 3:0.89 n=33; Turn 4:0.84 n=33; Turn 2:0.79 n=33; Turn 4A:0.74 n=33.
- 2026 Grand Prix of Alabama Race 2: clean section median 0.674, best Turns 1-3:0.96 n=30; Turn 10:0.86 n=30; Turns 5-6:0.82 n=30; Turn 4:0.73 n=30.
- 2024 INDY NXT By Firestone at The Milwaukee Mile: clean section median 0.643, best SS1 to T2:0.79 n=86; T3 to SS2:0.79 n=86; T2 to BS:0.75 n=86; BS to T3:0.72 n=86.
- 2025 INDY NXT by Firestone at the Milwaukee Mile: clean section median 0.643, best SF to T1:0.88 n=83; T3 to SS2:0.85 n=83; FS to SF:0.71 n=83; T1 to SS1:0.65 n=83.

## Derived Remainder

The official Section Results carry every car's lap total (the `Lap` section) and
its named section splits. Per lap, `lapTotal - sum(racing-line sections)` is the
exact time spent on everything the loops don't watch — the stopwatch trick — and
because the field's lap totals are present, that remainder ranks against the
whole field, not just Bryce. The remainder is shipped as a shadeable
`Untimed remainder` section ONLY where the racing sections leave a genuine
untimed stretch (>2% of the lap): Nashville's straights carry no loops (~56% of
the lap). Iowa and Milwaukee tile to 0.00% — their `SF to T1` / `T4 to SF` /
`FS to SF` frontstretch sections are racing line measured loop-to-loop across
the start/finish line. (An earlier classification regex over-matched `SF` and
filed those as pit lines; `classify_section` now delegates to the corrected
`is_pit_line` rule, which moved exactly 7 of 109 distinct section names to
track_section and left every PI/PO/Alt pit split untouched.) A negative
remainder (sections overrunning the lap) marks that lap uncovered; it is never
clamped.

## Road America Context

- 2024 Grand Prix at Road America: start 6.0, finish 8.0, best running 5.0, section median 0.6.
- 2025 Grand Prix at Road America: start 10.0, finish 9.0, best running 9.0, section median 0.444.
- 2026 Grand Prix at Road America Race 2: start 12.0, finish 11.0, best running 11.0, section median 0.522.
- 2026 Grand Prix at Road America Race 1: start 16.0, finish 21.0, best running 16.0, section median 0.75.

## Upcoming Venue Race Context

Track: `Portland International Raceway`

- 2024 Grand Prix of Portland: start 3.0, finish 3.0, best running 3.0, section median 0.688.

## Caveats

- Lap chart position is race order, not telemetry speed or lap-time pace.
- Caution windows are official incident/caution rows where source-visible; absence of a caution row is not proof of a fully green race in non-INDY NXT series.
- Section percentiles suppress low denominators and aggregate only clean race-lap candidates.
- Context packs are post-race descriptive only.
