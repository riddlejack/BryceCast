# INDY NXT Race Lap/Section Enhancement

Generated: `2026-09-19T22:02:22Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `61e7c0e8ca2682cb606c7604b26f433daf6d95c358be5879e2fdbc06135604fd`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: 1748 Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: 220 caution-aware lap segments.
- `race_lap_inflection_points.csv`: 189 position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations (Bryce only).
- `race_section_lap_field_observations.csv.gz`: 522884 FULL-FIELD ranked rows — every car, every lap, every section, plus a synthesized derived-remainder row per car/lap.
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
- 2024 Grand Prix of Monterey Race 2: clean section median 0.684, best Turn 3:0.89 n=33; Turn 4:0.84 n=33; Turn 2:0.79 n=33; Turn 1 Exit:0.75 n=33.
- 2026 Grand Prix of Alabama Race 2: clean section median 0.682, best Turns 1-3:0.96 n=30; Turns 14-16:0.93 n=30; Turn 10:0.86 n=30; Turns 5-6:0.82 n=30.
- 2024 Grand Prix of Portland: clean section median 0.677, best Turn 2:0.90 n=32; Turn 3:0.87 n=32; Turn 12:0.81 n=32; Turn 6:0.80 n=32.
- 2024 Grand Prix of Alabama: clean section median 0.65, best Turn 17:0.93 n=30; FS-PO:0.80 n=30; Turns 1-3:0.79 n=30; Turns 5-6:0.72 n=30.
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
(sections overrunning the lap) marks that lap uncovered; it is never clamped,
but a remainder inside the source's own 0.0001 s print precision counts as
zero rather than as an overrun.

As of the 2026-09-19 front-straight ruling below, **every one of the 44
race sessions is fully timed** and no session ships a derived row. The lane
keeps the machinery: a future venue, or a venue whose report drops a family,
falls back to the derived remainder automatically.

## The Front-Straight Ruling (2026-09-19)

This supersedes the 2026-07-19 SF over-match fix on its second half.

July corrected one error and introduced another. It established — rightly —
that an `SF`/`S/F` reference does not make a section a pit split, rescuing
`SF to T1`, `T4 to SF`, `FS to SF`, `SF to I1` and friends at Iowa, Milwaukee,
Road America and Detroit. But it kept the converse as an axiom: *"pit means
PI/PO or the alternate start, nothing else"*, and so it left every `FS-PO` /
`FS-PI` / `FS - PO 2` family classified as a pit split. Those families are the
start/finish straight. The result was that the S/F straight went uncoloured on
the heat map at eight venues, and at four of them (Laguna Seca, Mid-Ohio, WWTR,
Arlington) the discarded time reappeared as a "genuine untimed gap" that the
curated map assets then described as a stretch carrying no timing loop.

The evidence that overturns it, measured across all 44 race sessions:

- **Speed.** These families run at full racing pace on every green lap —
  86-172 mph depending on venue. The genuine pit-transit families
  (`PI to PO`, `PO to SF`, `SF to PI`, `PO to Alt`, `Alt S/F to PI`,
  `PO to I13A`) run at 0.4-33 mph.
- **Presence.** They are recorded on every lap. The pit-transit families appear
  once or twice per race — only on the laps the car actually pitted.
- **Tiling.** `sum(track sections) + sum(these families)` equals the official
  `Lap` row to 0.000 s on green laps at every affected venue. Before the fix
  the same venues left 2.8% (Barber) to 24.1% (WWTR) of the lap unexplained,
  and that residual was exactly these families. No venue carries an
  overlapping alternative span, so there is one tiling and no double count.
- **Geometry.** The semantic layer's decoded loop inventory puts the pit-in
  loop at a *negative* distance from S/F and the pit-out loop just past it:
  both sit on the main straight, either side of the line, not in the pit lane.
  The family lengths reproduce those loop distances to the foot — Barber
  `FS-PO` = SF→I1 = 5,352 units = 0.0845 mi; Indianapolis `FS - PO` = SF→I1B
  and `FS - PO 2` = I1B→I1; St. Petersburg `FS-PO` = SF→I1 = 8,244 units.
- **Ranking.** Every reclassified row resolves a field percentile against a
  median of 20 cars (min 12), so the comparison the map draws is real.
- **Precedent.** The qualifying lane has always read them as mainline sections
  (`analysis/quali-lab/scripts/official-qualifying.mjs`), and the curated map
  anchors at Barber, Indianapolis, Portland and St. Petersburg were derived
  from the qualifying packs and had been waiting for these names since July.

Fourteen (venue, family) pairs move to `track_section`; every pit-transit
family stays excluded at every venue. Pit laps cannot pollute the new spans:
the clean-lap filter drops any lap over 110% of the car's own median green lap,
and all 188 laps above 140% of the session median were already flagged `no`, so
no pit-in or pit-out lap counts as a clean comparison. That was verified, not
assumed; no new guard was added, and caution/clean-lap semantics are unchanged.

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
