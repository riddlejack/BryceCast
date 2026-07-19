# INDY NXT Analytics Discovery

Generated from `data/career/career.dataset.json` at repo head `f3e5e32` after the INDY NXT weather enrichment commit.

## Executive Readout

- Analyzable Bryce INDY NXT race rows: **41**. Weather-enriched race rows: **40** of 36 race rows, all modeled/non-official.
- Mean start: **11.5**. Mean finish: **12.5**. Mean position gain: **-1.0**.
- Top-10 rate: **46%**. Top-5 rate: **10%**. Running/classified rate: **88%**.
- Races where Bryce finished ahead of or tied his best same-team comparison: **29%** of races with teammate rows.
- Causal regression should stay out of the headline product for now. The useful near-term product is decomposition, race-shape analysis, context-aware comparisons, and confidence-labeled modeled weather.

## Most UI-Worthy Findings To Build Around

1. **Race debrief should be the spine.** The data supports race-level stories that combine start/finish, lap-position shape, cautions, penalties, pit count, section timing, and weather.
2. **Position-gain alone is too shallow.** The lap chart adds separate dimensions: volatility, early/mid/late movement, best/worst running position, and whether the result was a steady conversion or chaotic recovery.
3. **Section timing is a premium analysis layer.** Top Section Times can identify where Bryce had standout micro-sectors even when the finish result is ordinary.
4. **Head-to-head context is UI-worthy when labeled carefully.** Same-team and repeated-rival comparisons are source-backed and useful, but they need cohort counts beside every claim.
5. **Weather belongs as context, not causality.** Modeled weather can make race cards richer, but claims like 'hot weather caused X' need much more evidence.
6. **The app needs denominators everywhere.** Race-only, completed-race, weather-enriched, section-comparable, lap-chart-available, and exact-window cohorts must be visible.

## Best Finish Results

| raceLabel | trackType | startPosition | finishPosition | positionGain | points | status |
| --- | --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Monterey Race 2 R2 | road | 5 | 3 | 2 | 35 | running |
| 2024 Grand Prix of Portland | road | 6 | 3 | 3 | 35 | running |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | oval | 7 | 4 | 3 | 32 | running |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | oval | 6 | 5 | 1 | 30 | running |
| 2025 Music City Grand Prix | oval | 8 | 6 | 2 | 28 | running |

## Biggest Position Gains

| raceLabel | trackType | startPosition | finishPosition | positionGain | points | cautionLaps | pitStops |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 OUTFRONT Showdown | oval | 13 | 6 | 7 | 28 | 19 | 0 |
| 2025 Grand Prix of St. Petersburg | street | 20 | 13 | 7 | 17 | 10 | 0 |
| 2026 Detroit Grand Prix | street | 14 | 8 | 6 | 24 | 14 | 0 |
| 2025 Detroit Grand Prix | street | 15 | 10 | 5 | 20 | 5 | 1 |
| 2026 Grand Prix at Road America Race 2 R2 | road | 15 | 10 | 5 | 20 | 3 | 0 |

## Qualifying-To-Race Conversion

Use this as a core debrief module. It is stronger than a generic result card because it answers whether qualifying was converted, rescued, or squandered.

### Best conversions

| raceLabel | qualifyingPosition | qualifyingSource | startPosition | finishPosition | qualifyingToFinishDelta | positionGain | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 OUTFRONT Showdown | 13.00 | Qualifications | 13 | 6 | 7.00 | 7 | running |
| 2026 Detroit Grand Prix | 14.00 | Combined Qualifying | 14 | 8 | 6.00 | 6 | running |
| 2025 Detroit Grand Prix | 15.00 | Combined Qualifications | 15 | 10 | 5.00 | 5 | running |
| 2026 Grand Prix at Road America Race 2 R2 | 15.00 | Combined Qualifying - Race 2 | 15 | 10 | 5.00 | 5 | running |
| 2026 Grand Prix of Arlington | 23.00 | Combined Qualifications | 23 | 18 | 5.00 | 5 | running |
| 2024 Grand Prix of Portland | 7.00 | Combined Qualifications | 6 | 3 | 4.00 | 3 | running |
| 2026 Grand Prix of Alabama Race 2 R2 | 11.00 | Combined Qualifying - Race 2 | 11 | 7 | 4.00 | 4 | running |
| 2025 Grand Prix of Monterey Race 1 R1 | 14.00 | Combined Qualifications | 14 | 10 | 4.00 | 4 | running |

### Weakest conversions

| raceLabel | qualifyingPosition | qualifyingSource | startPosition | finishPosition | qualifyingToFinishDelta | positionGain | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Grand Prix of Portland | 5.00 | Combined Qualifications | 5 | 19 | -14.00 | -14 | contact |
| 2025 Grand Prix of Alabama | 3.00 | Combined Qualifications | 6 | 15 | -12.00 | -9 | running |
| 2024 Grand Prix of St. Petersburg | 8.00 | Combined Qualifications | 8 | 19 | -11.00 | -11 | contact |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 12.00 | Qualifying | 12 | 23 | -11.00 | -11 | mechanical |
| 2024 Detroit Grand Prix | 11.00 | Combined Qualifications | 11 | 20 | -9.00 | -9 | contact |
| 2026 Indianapolis Grand Prix Race 1 R1 | 13.00 | Combined Qualifying - Race 1 | 13 | 22 | -9.00 | -9 | running |
| 2024 Indianapolis Grand Prix Race 2 R2 | 11.00 | Combined Qualifications | 11 | 19 | -8.00 | -8 | running |
| 2024 Grand Prix of Monterey Race 1 R1 | 9.00 | Combined Qualifications | 9 | 16 | -7.00 | -7 | running |

## Biggest Position Losses

| raceLabel | trackType | startPosition | finishPosition | positionGain | status | pitStops | sessionIncidentCount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Grand Prix of Portland | road | 5 | 19 | -14 | contact | 0 | 2 |
| 2024 Grand Prix of St. Petersburg | street | 8 | 19 | -11 | contact | 0 | 5 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | oval | 12 | 23 | -11 | mechanical | 0 | 7 |
| 2025 Grand Prix of Alabama | road | 6 | 15 | -9 | running | 0 | 4 |
| 2024 Detroit Grand Prix | street | 11 | 20 | -9 | contact | 0 | 7 |

## Race Shape Extremes

High-volatility races are the best candidates for annotated lap-position storytelling.

| raceLabel | lapSamples | netLapChartGain | positionVolatility | bestRunningPosition | worstRunningPosition | earlyDelta | middleDelta | lateDelta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Indianapolis Grand Prix Race 1 R1 | 28.00 | -8.00 | 24.00 | 10.00 | 22.00 | 1.00 | 2.00 | -10.00 |
| 2024 Indianapolis Grand Prix Race 1 R1 | 34.00 | -2.00 | 14.00 | 12.00 | 19.00 | -6.00 | 1.00 | 2.00 |
| 2024 Grand Prix of Monterey Race 1 R1 | 34.00 | -8.00 | 14.00 | 7.00 | 18.00 | 1.00 | -11.00 | 2.00 |
| 2025 Grand Prix of Alabama | 35.00 | -7.00 | 11.00 | 8.00 | 17.00 | -8.00 | 1.00 | 0.00 |
| 2025 Indianapolis Grand Prix Race 2 R2 | 35.00 | 5.00 | 11.00 | 15.00 | 20.00 | 5.00 | 2.00 | 1.00 |

Low-volatility races are good examples of steady execution or limited passing opportunity.

| raceLabel | lapSamples | netLapChartGain | positionVolatility | bestRunningPosition | worstRunningPosition |
| --- | --- | --- | --- | --- | --- |
| 2026 Grand Prix of Alabama Race 2 R2 | 30.00 | 0.00 | 0.00 | 7.00 | 7.00 |
| 2024 Detroit Grand Prix | 2.00 | 0.00 | 0.00 | 11.00 | 11.00 |
| 2024 Grand Prix of Portland | 35.00 | 0.00 | 0.00 | 3.00 | 3.00 |
| 2025 Grand Prix at Road America | 20.00 | 1.00 | 1.00 | 9.00 | 10.00 |
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 74.00 | 0.00 | 2.00 | 13.00 | 14.00 |

## Race Story Classifier

This is a first-pass product classifier for UI copy and filtering. It should be reviewed race-by-race before becoming a shipped label.

| primaryStory | races | avgFinish | avgGain | top10Rate |
| --- | --- | --- | --- | --- |
| steady_context_race | 12 | 12.08 | 0.17 | 0.50 |
| recovery_drive | 6 | 10.83 | 5.83 | 0.67 |
| incident_or_reliability_limited | 5 | 20.00 | -10.40 | 0.00 |
| volatile_race_shape | 5 | 12.60 | 1.60 | 0.20 |
| front_running_conversion | 4 | 3.75 | 2.25 | 1.00 |
| position_loss_race | 4 | 18.00 | -8.25 | 0.00 |
| steady_conversion | 4 | 7.50 | -0.75 | 1.00 |
| hidden_pace_bad_outcome | 1 | 21.00 | -6.00 | 0.00 |

## Teammate And Rival Context

These rows are useful for serious users because they put results into local competitive context without inventing a field-strength model.

### Same-team race context

| raceLabel | teamName | finishPosition | bestTeammateFinish | deltaToBestTeammateFinish | teammateFinishRank |
| --- | --- | --- | --- | --- | --- |
| 2026 Detroit Grand Prix | Chip Ganassi Racing | 8 | 18 | -10 | 1 |
| 2026 Grand Prix of Alabama Race 1 R1 | Chip Ganassi Racing | 8 | 17 | -9 | 1 |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | Chip Ganassi Racing | 5 | 12 | -7 | 1 |
| 2025 Grand Prix at Road America | Chip Ganassi Racing | 9 | 15 | -6 | 1 |
| 2026 Music City Grand Prix | Chip Ganassi Racing | 10 | 16 | -6 | 1 |
| 2026 Grand Prix of Alabama Race 2 R2 | Chip Ganassi Racing | 7 | 12 | -5 | 1 |
| 2025 Indianapolis Grand Prix Race 1 R1 | Chip Ganassi Racing | 15 | 18 | -3 | 1 |
| 2026 Grand Prix of St. Petersburg | Chip Ganassi Racing | 18 | 21 | -3 | 1 |
| 2025 Grand Prix at Mid-Ohio | Chip Ganassi Racing | 12 | 14 | -2 | 1 |
| 2026 Indianapolis Grand Prix Race 2 R2 | Chip Ganassi Racing | 12 | 14 | -2 | 1 |

### Repeated head-to-head rivals

| driverName | racesTogether | bryceAhead | bryceBehind | headToHeadWinRate | avgFinishDeltaVsRival | sameTeamRaces |
| --- | --- | --- | --- | --- | --- | --- |
| Hailie Deegan | 14 | 12 | 2 | 0.86 | -3.36 | 1 |
| Alexander Koreiba | 13 | 11 | 2 | 0.85 | -4.15 | 0 |
| Carson Etter | 13 | 10 | 3 | 0.77 | -4.77 | 13 |
| Nicholas Monteiro | 14 | 10 | 4 | 0.71 | -3.79 | 0 |
| Tommy Smith | 14 | 10 | 4 | 0.71 | -3.36 | 1 |
| Colin Kaminsky | 13 | 9 | 4 | 0.69 | -3.31 | 0 |
| Nicolas Stati | 12 | 8 | 4 | 0.67 | -2.00 | 0 |
| Nolan Allaer | 25 | 16 | 9 | 0.64 | -2.32 | 1 |
| Ricardo Escotto | 24 | 15 | 9 | 0.62 | -2.71 | 0 |
| James Roe | 41 | 24 | 17 | 0.59 | -1.39 | 27 |
| Jack William Miller | 28 | 15 | 13 | 0.54 | -1.75 | 0 |
| Jonathan Browne | 15 | 8 | 7 | 0.53 | 0.27 | 0 |

## Section Timing Signals

Best section percentiles can become a 'where he was fast' module. Worst section percentiles can become a preparation/debrief module, but should be handled carefully because section availability and session comparability vary.

### Strongest section rows

| raceLabel | sectionName | bryceRank | fieldRows | rankPercentile | time | speedMph | lapNumber |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 Music City Grand Prix | T1 to T2 | 1.00 | 18 | 1.00 | 00:07.1120 | 186.75 | 3 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | T4 to FS | 1.00 | 16 | 1.00 | 00:03.2841 | 145.12 | 1 |
| 2024 Grand Prix at Road America | I13A to I14 | 1.00 | 21 | 1.00 | 00:01.8200 | 127.00 | 1 |
| 2026 Grand Prix at Road America Race 1 R1 | I9 to I13A | 1.00 | 24 | 1.00 | 00:34.7082 | 138.71 | 16 |
| 2026 Grand Prix at Road America Race 1 R1 | I4 to I9 | 1.00 | 24 | 1.00 | 00:33.7461 | 110.68 | 14 |
| 2026 Grand Prix at Road America Race 1 R1 | I9 to I10 | 1.00 | 24 | 1.00 | 00:06.0866 | 131.74 | 16 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | T4 to SF | 1.00 | 16 | 1.00 | 00:05.1219 | 148.43 | 1 |
| 2024 Grand Prix of Portland | Turn 2 | 1.00 | 18 | 1.00 | 00:02.8927 | 61.75 | 24 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | T3 to T4 | 1.00 | 16 | 1.00 | 00:05.9489 | 140.74 | 5 |
| 2024 Indianapolis Grand Prix Race 1 R1 | I6T to I6 | 1.00 | 21 | 1.00 | 00:00.5066 | 145.36 | 33 |

### Weakest section rows

| raceLabel | sectionName | bryceRank | fieldRows | rankPercentile | time | speedMph | lapNumber |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Grand Prix of Arlington | Lap | 23.00 | 23 | 0.00 | 01:42.6011 | 95.79 | 15 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | Turns 1/2 | 24.00 | 24 | 0.00 | 00:06.7534 | 141.34 | 4 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | Turn 3 | 24.00 | 24 | 0.00 | 00:04.1428 | 159.48 | 3 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | BS - T3 | 24.00 | 24 | 0.00 | 00:03.6336 | 156.87 | 2 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | BS - T2 | 24.00 | 24 | 0.00 | 00:03.8697 | 147.12 | 2 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | Turn 2 | 24.00 | 24 | 0.00 | 00:03.8112 | 136.68 | 3 |
| 2024 Detroit Grand Prix | I1 to I2A | 21.00 | 21 | 0.00 | 00:03.9547 | 51.03 | 2 |
| 2024 Detroit Grand Prix | I10 to SF | 21.00 | 21 | 0.00 | 00:27.2271 | 69.17 | 1 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | Lap | 24.00 | 24 | 0.00 | 00:29.7074 | 151.48 | 4 |
| 2024 Detroit Grand Prix | I4 to I10 | 21.00 | 21 | 0.00 | 00:24.3143 | 90.30 | 1 |

## Weather Context Segments

Weather rows are modeled/non-official, so this should inform UI context rather than driver-performance claims.

| dimension | segment | races | avgFinish | avgGain | top10Rate | dnfOrIssueRate | avgCautionShare |
| --- | --- | --- | --- | --- | --- | --- | --- |
| wetDry | dry | 37 | 11.68 | -0.32 | 0.51 | 0.08 | 0.15 |
| wetDry | wet | 4 | 19.75 | -7.00 | 0.00 | 0.50 | 0.17 |
| thermalStress | cold | 1 | 7.00 | 4.00 | 1.00 | 0.00 | 0.00 |
| thermalStress | cool | 12 | 13.58 | -2.17 | 0.42 | 0.08 | 0.16 |
| thermalStress | hot | 8 | 11.50 | -0.62 | 0.50 | 0.12 | 0.15 |
| thermalStress | moderate | 19 | 12.58 | -0.58 | 0.42 | 0.16 | 0.14 |
| thermalStress | unknown | 1 | 10.00 | -2.00 | 1.00 | 0.00 | 0.17 |
| windRisk | high | 5 | 10.60 | -0.20 | 0.60 | 0.00 | 0.10 |
| windRisk | low | 8 | 11.88 | 1.88 | 0.38 | 0.00 | 0.08 |
| windRisk | medium | 27 | 13.07 | -1.93 | 0.44 | 0.19 | 0.18 |
| windRisk | unknown | 1 | 10.00 | -2.00 | 1.00 | 0.00 | 0.17 |
| weatherConfidence | modeled_medium | 40 | 12.53 | -0.95 | 0.45 | 0.12 | 0.15 |
| weatherConfidence | unavailable | 1 | 10.00 | -2.00 | 1.00 | 0.00 | 0.17 |

## Exploratory Relationship Checks

These are scan lines for product ideation, not causal evidence.

| x | y | label | n | pearson | caution |
| --- | --- | --- | --- | --- | --- |
| startPosition | finishPosition | Lower start vs lower finish | 41 | 0.41 | exploratory_correlation_not_causal |
| qualifyingPosition | finishPosition | Qualifying rank vs finish | 39 | 0.40 | exploratory_correlation_not_causal |
| qualifyingToFinishDelta | finishPosition | Qualifying conversion vs finish | 39 | -0.68 | exploratory_correlation_not_causal |
| positionGain | finishPosition | Position gain vs finish | 41 | -0.68 | exploratory_correlation_not_causal |
| bestLapRank | finishPosition | Best-lap rank vs finish | 39 | 0.46 | exploratory_correlation_not_causal |
| cautionShare | positionGain | Caution share vs gain | 41 | -0.06 | exploratory_correlation_not_causal |
| passesPerLap | positionGain | Race passing density vs gain | 41 | 0.01 | exploratory_correlation_not_causal |
| ambientTempC | finishPosition | Ambient temp vs finish | 40 | -0.12 | exploratory_correlation_not_causal |
| windGustKph | positionGain | Wind gust vs gain | 40 | -0.12 | exploratory_correlation_not_causal |
| precipitationMm | positionGain | Precipitation vs gain | 40 | -0.02 | exploratory_correlation_not_causal |
| pitStops | finishPosition | Pit stops vs finish | 41 | -0.00 | exploratory_correlation_not_causal |

## Exploratory Multivariate Model

This is intentionally framed as a scan, not a claim engine. It is useful for product ideation because it tells us which fields belong in a debrief card together.

| feature | coefficient | sampleSize | rSquared | interpretation |
| --- | --- | --- | --- | --- |
| model | n/a | 36 | 0.36 | Exploratory OLS; finishPosition lower is better; continuous fields are standardized; coefficients are directional, not causal. |
| qualifyingPosition | 0.81 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| startPosition | 0.92 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| bestLapRank | 1.67 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| cautionShare | 0.94 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| pitStops | 0.08 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| ambientTempC | 0.20 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| windGustKph | 0.60 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| track_road | 3.21 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |
| track_street | 2.17 | 36 | 0.36 | Negative coefficient means associated with better finishing position after included controls. |

## Chart-Ready Output Inventory

- `tables/indy_nxt_race_outcomes.csv`: one Bryce row per analyzable INDY NXT race.
- `tables/indy_nxt_lap_shape.csv`: one race-shape row per race with lap-chart availability.
- `tables/indy_nxt_lap_timeline.csv`: lap-position timeline rows for Bryce.
- `tables/indy_nxt_section_strengths.csv`: top-section rank rows for Bryce.
- `tables/indy_nxt_group_summary.csv`: season and track-type rollups.
- `tables/indy_nxt_correlations.csv`: exploratory correlation checks.
- `tables/indy_nxt_head_to_head.csv`: repeated-rival and teammate comparison rows.
- `tables/indy_nxt_weather_segments.csv`: weather-context segment summaries.
- `tables/indy_nxt_exploratory_model.csv`: small-N multivariate scan.

## UI Implications

- Build `RaceDebriefViewModel` before a broad shell: outcome, race shape, section strengths, event context, weather, source states, caveats.
- Use compact fixture extracts rather than loading the full career dataset into the browser.
- Design chart slots around actual analytical jobs: outcome decomposition, lap-position trace, section-strength ranked bars, weather context strip, and source/caveat drawer.
- Keep modeled weather visually distinct from official timing/results. Its value is context; it should never visually compete with official classifications.
- Save teammate/field-strength modeling for a later benchmark model with explicit cohorts and validation.

## Next Deep-Analysis Backlog

1. Build an automated race debrief scorer: classify each race as conversion, recovery, fade, chaos, reliability-limited, or context-heavy.
2. Build a race-shape clustering pass using lap-position features after verifying lap chart completeness labels.
3. Build section archetypes by track and session type: where Bryce tends to over-index by micro-sector.
4. Convert repeated-rival and teammate context into a careful benchmark module with denominator-first language.
5. Add session-level weather cards for race, practice, and qualifying, but keep date-only qualifying rows excluded from hour-level context.
6. Extend the same framework to GB3 and Formula Ford only where metric parity says the comparison is honest.
