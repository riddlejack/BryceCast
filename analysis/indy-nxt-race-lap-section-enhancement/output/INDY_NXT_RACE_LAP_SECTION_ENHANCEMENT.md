# INDY NXT Race Lap/Section Enhancement

Generated: `2026-09-10T23:02:18Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `61e7c0e8ca2682cb606c7604b26f433daf6d95c358be5879e2fdbc06135604fd`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: 1748 Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: 220 caution-aware lap segments.
- `race_lap_inflection_points.csv`: 189 position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations (Bryce only).
- `race_section_lap_field_observations.csv.gz`: 522687 FULL-FIELD ranked rows — every car, every lap, every section, plus a synthesized derived-remainder row per car/lap.
- `race_section_field_distribution.json`: per-section field time distributions + Bryce's per-lap derived remainder with real full-field percentiles.
- `race_section_session_summary.csv`: 44 race section summaries.
- Context packs: `context-packs/indy-nxt-race-lap-section-context.json` and the permanent historical `context-packs/road-america-race-context.json`. The next-venue pack is omitted when the canonical schedule has no future event.
- Source split: {'official_section_results+official_lap_chart+official_incident_caution_context': 22322, 'official_section_results_only': 11}.

## Lap Microstates

Each Bryce lap row now carries previous position, position delta, net movement from lap one, field-size denominator, running-position percentile, and caution/restart state.

## Caution-Aware Segments

Segments split green runs, caution windows, and restart laps so movement is not presented as generic pace when it happened under race-control context.

## Race Section Shape

Clean-lap race section highlights:

- 2026 Grand Prix at Road America Race 1: clean section median 0.75, best n/a.
- 2026 Grand Prix of Alabama Race 2: clean section median 0.696, best Turns 1-3:0.96 n=30; Turns 14-16:0.93 n=30; Turn 10:0.86 n=30; Turns 5-6:0.82 n=30.
- 2024 Grand Prix of Portland: clean section median 0.688, best Turn 2:0.90 n=32; Turn 3:0.87 n=32; Turn 12:0.81 n=32; Turn 6:0.80 n=32.
- 2024 Grand Prix of Monterey Race 2: clean section median 0.684, best Turn 3:0.89 n=33; Turn 4:0.84 n=33; Turn 2:0.79 n=33; Turn 1 Exit:0.75 n=33.
- 2024 Grand Prix of Alabama: clean section median 0.65, best Turn 17:0.93 n=30; Turns 1-3:0.79 n=30; Turns 5-6:0.72 n=30; Turns 12-13:0.70 n=30.
- 2025 Music City Grand Prix: clean section median 0.647, best BackStretch Exit:0.88 n=52; Turn 1 Entry:0.80 n=52; BackStretch Entry:0.76 n=52; Turn 4 Exit:0.63 n=52.

## Derived Remainder

The official Section Results carry every car's lap total (the `Lap` section) and
its named section splits. Per lap, `lapTotal - sum(racing-line sections)` is the
exact time spent on everything the loops don't watch — the stopwatch trick — and
because the field's lap totals are present, that remainder ranks against the
whole field, not just Bryce. The remainder is shipped as a shadeable
`Untimed remainder` section only where the racing sections leave a genuine
untimed stretch (>2% of the lap). Sessions at or below that threshold are
classified as fully timed and do not ship a derived row. A negative remainder
(sections overrunning the lap) marks that lap uncovered; it is never clamped.

## Road America Context

- 2024 Grand Prix at Road America: start 6.0, finish 8.0, best running 5.0, section median 0.632.
- 2025 Grand Prix at Road America: start 10.0, finish 9.0, best running 9.0, section median 0.444.
- 2026 Grand Prix at Road America Race 2: start 12.0, finish 11.0, best running 11.0, section median 0.524.
- 2026 Grand Prix at Road America Race 1: start 16.0, finish 21.0, best running 16.0, section median 0.75.

## Upcoming Venue Race Context

Season complete; no next-venue race artifact is emitted.

- No future INDY NXT venue remains on the canonical schedule as of the analysis date.

## Caveats

- Lap chart position is race order, not telemetry speed or lap-time pace.
- Caution windows are official incident/caution rows where source-visible; absence of a caution row is not proof of a fully green race in non-INDY NXT series.
- Section percentiles suppress low denominators and aggregate only clean race-lap candidates.
- Context packs are post-race descriptive only.
