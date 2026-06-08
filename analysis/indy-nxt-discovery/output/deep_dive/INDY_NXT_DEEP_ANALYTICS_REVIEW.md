# INDY NXT Deep Analytics Review

Generated as a second-pass analytics artifact from canonical career data. It reads the first-pass race outcome table and writes only under `analysis/indy-nxt-discovery/output/deep_dive`.

## Executive Takeaways

- The strongest next product surface is a race debrief scorecard, because it can combine official result, lap chart, section, incident, penalty, leader, team, prep-session, and modeled-weather context at one race grain.
- The first-pass analytics were directionally useful. Three high-value source families needed deeper use: full-field lap dynamics, practice/qualifying preparation, and per-lap section results.
- Team context is useful descriptively. It can show Bryce versus teammates and team-year baselines. It cannot diagnose Ganassi engineering causes from this dataset alone.
- Practice and qualifying should feed race-weekend prep. The right claim is readiness/context signal, because session formats and group qualifying make absolute comparisons brittle.
- Weather belongs in prep and debrief context. The current INDY NXT weather enrichment is modeled and exact-window for historical rows, so it should not support causal driver-performance claims.

## What Separates Good And Bad Weekends

| cohort | races | avgStart | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | avgTeamDelta | issueOrReliabilityLimitedRows | ovalRows | roadRows | streetRows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| best_8_by_finish | 8 | 8.25 | 5.125 | 3.125 | 0.631 | 0.262 | -3.062 | 0 | 5 | 3 | 0 |
| worst_8_by_finish | 8 | 11.375 | 19.875 | -8.5 | 0.391 | 0.417 | 5.812 | 5 | 1 | 4 | 3 |

The top outcome cohort combines better finishing conversion, lower team-relative penalty, and more oval representation. The worst cohort clusters around conversion losses, incident/reliability-limited statuses, and team-context drag rather than one single pace pattern.

## Race Archetype Summary

| archetype | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top10Rate | avgTeamDelta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline_execution | 14 | 10.071 | 0.714 | 0.525 | 0.291 | 0.714 | 0.089 |
| recovery_drive | 5 | 11 | 6 | 0.372 | 0.5 | 0.6 | -1.833 |
| incident_or_reliability_limited | 5 | 20 | -10.4 | 0.258 | 0.433 | 0 | 6.6 |
| podium_top5_conversion | 4 | 3.75 | 2.25 | 0.645 | 0.23 | 1 | -3.375 |
| team_context_outperformed_teammates | 4 | 14.25 | 0.25 | 0.384 | 0.294 | 0 | -2.625 |
| conversion_loss | 3 | 17.667 | -8.333 | 0.44 | 0.287 | 0 | 5.667 |
| hidden_pace_bad_result | 1 | 19 | -8 | 0.8 | 0.295 | 0 | 9 |

## Track Type Summary

| trackType | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top5Rate | top10Rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| oval | 9 | 9.111 | 1.111 | 0.472 | 0.358 | 0.222 | 0.778 |
| road | 20 | 12.6 | -2.45 | 0.529 | 0.273 | 0.1 | 0.4 |
| street | 7 | 15.143 | 0.571 | 0.348 | 0.471 | 0 | 0.286 |

## Best Outcome Races

| raceLabel | trackType | teamName | startPosition | finishPosition | positionGain | paceIndex | chaosExposureIndex | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Portland | road | Andretti Global | 6 | 3 | 3 | 0.594 | 0.22 | podium_top5_conversion |
| 2024 Grand Prix of Monterey Race 2 R2 | road | Andretti Global | 5 | 3 | 2 | 0.684 | 0.291 | podium_top5_conversion |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | oval | Andretti Global | 7 | 4 | 3 | 0.804 | 0.237 | podium_top5_conversion |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | oval | Chip Ganassi Racing | 6 | 5 | 1 | 0.5 | 0.172 | podium_top5_conversion |
| 2024 OUTFRONT Showdown | oval | Andretti Global | 13 | 6 | 7 | 0.574 | 0.416 | recovery_drive |
| 2025 Music City Grand Prix | oval | Chip Ganassi Racing | 8 | 6 | 2 | 0.706 | 0.424 | baseline_execution |
| 2026 Grand Prix of Alabama Race 2 R2 | road | Chip Ganassi Racing | 11 | 7 | 4 | 0.63 | 0.05 | baseline_execution |
| 2024 Music City Grand Prix | oval | Andretti Global | 10 | 7 | 3 | 0.559 | 0.289 | baseline_execution |

## Worst Outcome Races

| raceLabel | trackType | teamName | startPosition | finishPosition | positionGain | paceIndex | bryceVsTeamAvgFinish | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | oval | Chip Ganassi Racing | 12 | 23 | -11 | 0 | 7.75 | incident_or_reliability_limited |
| 2026 Indianapolis Grand Prix Race 1 R1 | road | Chip Ganassi Racing | 13 | 22 | -9 | 0.391 | 7.75 | conversion_loss |
| 2024 Detroit Grand Prix | street | Andretti Global | 11 | 20 | -9 | 0.05 | 7.75 | incident_or_reliability_limited |
| 2025 Grand Prix of Portland | road | Chip Ganassi Racing | 5 | 19 | -14 |  | 6.5 | incident_or_reliability_limited |
| 2024 Grand Prix of St. Petersburg | street | Andretti Global | 8 | 19 | -11 | 0.725 | 4.5 | incident_or_reliability_limited |
| 2024 Indianapolis Grand Prix Race 2 R2 | road | Andretti Global | 11 | 19 | -8 | 0.8 | 9 | hidden_pace_bad_result |
| 2025 Grand Prix of Monterey Race 2 R2 | road | Chip Ganassi Racing | 12 | 19 | -7 |  | 6.5 | incident_or_reliability_limited |
| 2024 Grand Prix at Mid-Ohio | road | Andretti Global | 14 | 18 | -4 | 0.516 | 6.75 | baseline_execution |

## Hidden Pace Candidates

| raceLabel | finishPosition | positionGain | paceIndex | bestLapRank | medianSectionPercentile | bryceVsTeamAvgFinish | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 Indianapolis Grand Prix Race 2 R2 | 19 | -8 | 0.8 | 5 |  | 9 | hidden_pace_bad_result |

These are the rows where a normal result table is most likely to miss the story. They need manual review against source caveats before becoming UI copy.

## Race Chaos And Lap Dynamics

| raceLabel | finishPosition | positionGain | chaosExposureIndex | cautionShare | sessionIncidentCount | sessionPenaltyCount | leaderEntropy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Detroit Grand Prix | 8 | 6 | 0.807 | 0.333 | 6 | 6 | 0.918 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 23 | -11 | 0.619 | 0.227 | 7 | 1 | 0.99 |
| 2025 Grand Prix of Monterey Race 2 R2 | 19 | -7 | 0.576 | 0.429 | 8 | 6 | 0 |
| 2026 Grand Prix of Arlington | 18 | 5 | 0.551 | 0.333 | 4 | 4 | 0.672 |
| 2024 INDY NXT by Firestone at Iowa Speedway | 8 | 1 | 0.532 | 0.491 | 5 | 0 | 0.497 |
| 2024 Detroit Grand Prix | 20 | -9 | 0.506 | 0.289 | 7 | 4 | 0 |
| 2026 Indianapolis Grand Prix Race 1 R1 | 22 | -9 | 0.481 | 0.172 | 2 | 2 | 0.579 |
| 2025 Music City Grand Prix | 6 | 2 | 0.424 | 0.185 | 2 | 2 | 0.89 |

Most stable Bryce lap-chart races:

| raceLabel | fieldLapDrivers | bryceNetLapChartGain | bryceLapGainPercentile | bryceVolatility | bryceStabilityPercentile |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Portland | 17 | 0 | 0.588 | 0 | 1 |
| 2026 Grand Prix of Alabama Race 2 R2 | 24 | 0 | 0.833 | 0 | 1 |
| 2024 Detroit Grand Prix | 21 | 0 | 0.429 | 0 | 1 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 24 | 0 | 0.542 | 2 | 0.958 |
| 2025 Music City Grand Prix | 18 | 0 | 0.444 | 2 | 0.944 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 16 | 3 | 0.938 | 3 | 0.938 |
| 2025 Grand Prix at Road America | 19 | 1 | 0.842 | 1 | 0.895 |
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 19 | 0 | 0.579 | 2 | 0.895 |

Least stable Bryce lap-chart races:

| raceLabel | fieldLapDrivers | bryceNetLapChartGain | bryceLapGainPercentile | bryceVolatility | bryceStabilityPercentile |
| --- | --- | --- | --- | --- | --- |
| 2024 Indianapolis Grand Prix Race 2 R2 | 21 | -3 | 0.095 | 9 | 0.095 |
| 2024 Grand Prix of Monterey Race 1 R1 | 20 | -8 | 0.1 | 14 | 0.1 |
| 2025 Grand Prix of Alabama | 20 | -7 | 0.1 | 11 | 0.15 |
| 2025 Grand Prix of Monterey Race 1 R1 | 17 | -1 | 0.118 | 5 | 0.176 |
| 2025 Indianapolis Grand Prix Race 1 R1 | 21 | 1 | 0.667 | 11 | 0.19 |
| 2025 Indianapolis Grand Prix Race 2 R2 | 21 | 5 | 0.905 | 11 | 0.19 |
| 2026 Grand Prix of St. Petersburg | 24 | -1 | 0.375 | 9 | 0.208 |
| 2026 Indianapolis Grand Prix Race 1 R1 | 24 | -8 | 0.167 | 24 | 0.208 |

## Preparation Signal

| label | n | pearson | interpretation |
| --- | --- | --- | --- |
| Best practice rank vs race finish | 30 | 0.262 | Exploratory correlation; lower ranks are better; direction only. |
| Best practice rank vs race best-lap rank | 29 | 0.563 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race start | 34 | 0.736 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race finish | 34 | 0.19 | Exploratory correlation; lower ranks are better; direction only. |
| Average qualifying rank vs race finish | 34 | 0.338 | Exploratory correlation; lower ranks are better; direction only. |

Practice and qualifying are now represented as an event-level prep funnel. The model should display them as contextual evidence, with session format caveats.

## Team Context

| seasonYear | teamName | raceResultRows | avgFinish | top5Rate | top10Rate | issueLikeStatusRate | bryceRows | bryceAvgFinish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 | Cape Motorsports powered by ECR | 21 | 8.667 | 0.286 | 0.667 | 0.048 | 0 |  |
| 2024 | Andretti Global | 56 | 8.696 | 0.429 | 0.643 | 0.107 | 14 | 10.929 |
| 2024 | Abel Motorsports | 39 | 9.872 | 0.385 | 0.538 | 0.051 | 0 |  |
| 2024 | HMD Motorsports | 131 | 10.344 | 0.191 | 0.511 | 0.092 | 0 |  |
| 2024 | Abel Motorsports w/ Miller Vinatieri Motorsports | 14 | 14.571 | 0 | 0.143 | 0.286 | 0 |  |
| 2024 | Juncos Hollinger Racing | 13 | 16.923 | 0 | 0 | 0.077 | 0 |  |
| 2025 | Andretti Global | 56 | 7.107 | 0.554 | 0.732 | 0.089 | 0 |  |
| 2025 | Abel Motorsports | 42 | 8.143 | 0.357 | 0.714 | 0.071 | 0 |  |
| 2025 | Chip Ganassi Racing | 28 | 11.357 | 0.071 | 0.5 | 0.107 | 13 | 12.154 |
| 2025 | HMD Motorsports | 107 | 11.523 | 0.196 | 0.402 | 0.093 | 1 | 13 |
| 2025 | Abel Motorsports w/ Miller Vinatieri Motorsports | 14 | 12.071 | 0 | 0.429 | 0.214 | 0 |  |
| 2025 | Cape Motorsports powered by ECR | 25 | 13 | 0.04 | 0.24 | 0.16 | 0 |  |
| 2026 | HMD Motorsports | 32 | 9.062 | 0.406 | 0.562 | 0.031 | 0 |  |
| 2026 | Cape Motorsports powered by ECR | 16 | 9.312 | 0.25 | 0.625 | 0 | 0 |  |
| 2026 | Andretti Global | 32 | 9.844 | 0.406 | 0.625 | 0.094 | 0 |  |
| 2026 | Abel Motorsports | 32 | 12.5 | 0.156 | 0.438 | 0.062 | 0 |  |
| 2026 | Cusick Morgan Motorsports | 16 | 12.688 | 0.062 | 0.375 | 0.062 | 0 |  |
| 2026 | A.J. Foyt Enterprises | 16 | 14.125 | 0.188 | 0.312 | 0.062 | 0 |  |
| 2026 | Chip Ganassi Racing | 32 | 16.688 | 0.031 | 0.188 | 0.156 | 8 | 14.5 |
| 2026 | Juncos Hollinger Racing | 16 | 17.688 | 0 | 0.062 | 0.062 | 0 |  |

Ganassi-specific descriptive rows:

| seasonYear | teamName | raceResultRows | avgFinish | top5Rate | top10Rate | issueLikeStatusRate | bryceRows | bryceAvgFinish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | Chip Ganassi Racing | 28 | 11.357 | 0.071 | 0.5 | 0.107 | 13 | 12.154 |
| 2026 | Chip Ganassi Racing | 32 | 16.688 | 0.031 | 0.188 | 0.156 | 8 | 14.5 |

Team status rows are official-result status summaries. They are evidence for outcome context, not engineering root-cause attribution.

## Deep Section Results

The headline section tables require at least 50 comparable per-lap section rows. Sparse rows are preserved in CSV for review but suppressed from headline rankings.

Strongest section-result races:

| raceLabel | sectionComparisonRows | medianSectionPercentile | topQuartileShare | bottomQuartileShare | bestSectionFamilies |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Alabama | 190 | 0.7 | 0.421 | 0.111 | FS-PO:0.82; Turn 17:0.79; Turn 7:0.74; Turns 1-3:0.74 |
| 2024 Grand Prix of Monterey Race 2 R2 | 266 | 0.684 | 0.372 | 0.105 | Turn 4:0.85; Turn 3:0.82; Turn 4A:0.78; Turn 5:0.75 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 171 | 0.667 | 0.374 | 0.094 | BS to T3:0.76; SS1 to T2:0.75; T3 to SS2:0.71; T2 to BS:0.68 |
| 2026 Grand Prix of Alabama Race 2 R2 | 190 | 0.652 | 0.326 | 0.079 | Turns 1-3:0.89; Turn 10:0.78; Turns 8-9:0.72; Turns 5-6:0.71 |
| 2024 Grand Prix of St. Petersburg | 189 | 0.65 | 0.349 | 0.063 | Turn 10:0.76; Turn 4:0.75; FS-PO:0.69; Turns 11/12 Turns 13/14:0.67 |
| 2025 Music City Grand Prix | 57 | 0.647 | 0.351 | 0.246 | Turn 1 Entry Turn 1 Exit Turn 2 Entry BackStretch BackStretch:0.59; Turn 3:0.56; Turn 4 Entry Turn 4 Exit:0.54 |
| 2024 Grand Prix of Portland | 247 | 0.625 | 0.324 | 0.186 | Turn 12:0.80; Turn 6:0.71; Turn 2:0.68; Turn 1:0.66 |
| 2024 Grand Prix of Monterey Race 1 R1 | 252 | 0.595 | 0.278 | 0.119 | Turn 3:0.84; Turn 7A:0.74; Turn 7:0.73; Turn 4:0.72 |

Weakest section-result races:

| raceLabel | sectionComparisonRows | medianSectionPercentile | topQuartileShare | bottomQuartileShare | weakestSectionFamilies |
| --- | --- | --- | --- | --- | --- |
| 2025 Grand Prix of St. Petersburg | 190 | 0.236 | 0.137 | 0.511 | FS-PO:0.21; FS-PI:0.22; Turn 9a:0.23; Turn 4:0.26 |
| 2026 Grand Prix of Arlington | 234 | 0.279 | 0.145 | 0.483 | Turn 9:0.10; Turns 8/9:0.24; Turns 3/4:0.30; BS 1:0.30 |
| 2025 Indianapolis Grand Prix Race 2 R2 | 228 | 0.3 | 0.136 | 0.482 | Turn 3:0.21; Turn 14:0.24; Turn 11:0.24; Turn 8/9:0.28 |
| 2025 Grand Prix at Mid-Ohio | 282 | 0.333 | 0.163 | 0.418 | Turn 1A:0.18; Turn 10:0.25; Turn 1B:0.27; Turn 1:0.27 |
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 152 | 0.333 | 0.026 | 0.303 | FS - PI:0.30; FS - PO:0.34; BS - T2:0.34; BS - T3:0.35 |
| 2025 Detroit Grand Prix | 284 | 0.353 | 0.099 | 0.387 | I3 to I4:0.19; I4 to I5:0.21; I11 to 12:0.25; I12 to I13:0.27 |
| 2026 Grand Prix of St. Petersburg | 190 | 0.364 | 0.111 | 0.326 | Turn 4:0.30; Turn 10:0.34; Turn 9a:0.36; Turns 5-8:0.36 |
| 2025 Grand Prix of Alabama | 190 | 0.368 | 0.168 | 0.368 | FS-PO:0.30; Turn 10:0.33; Turn 11:0.33; Turn 7:0.37 |

Sparse section-result rows needing review:

| raceLabel | sectionComparisonRows | medianSectionPercentile | bestSectionFamilies | weakestSectionFamilies |
| --- | --- | --- | --- | --- |
| 2025 Grand Prix of Portland | 4 | 0.69 | FS-PI:0.89; Turn 1:0.71; Turn 12:0.67; FS-PO:0.17 | FS-PO:0.17; Turn 12:0.67; Turn 1:0.71; FS-PI:0.89 |
| 2025 Grand Prix of Monterey Race 2 R2 | 6 | 0 | FS - PI:0.89; Turn 1 Entry Turn 1 Exit:0.39; Turn 2:0.00; Turn 3:0.00 | Turn 2:0.00; Turn 3:0.00; Turn 4:0.00; Turn 4A:0.00 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 40 | 0.087 | FS - PO:0.50; Turn 1:0.28; Turn 4:0.25; Turn 3:0.21 | BS - T3:0.05; BS - T2:0.07; FS - PI:0.16; Turn 2:0.17 |
| 2024 Detroit Grand Prix | 45 | 0.45 | I4 to I5:0.77; I3 to I4:0.70; I2 to I3:0.50; I5 to I6:0.50 | I6 to I7:0.25; Back Str 2:0.25; I2A to I2:0.28; I8 to I9:0.33 |

## Future Race Weekend Prep Inputs

| eventName | eventStartDate | trackName | trackType | bryceIndyNxtRacesAtTrack | sameTrackAvgFinish | sameTrackAvgGain | trackTypeAvgFinish | trackTypeTop10Rate | weatherState |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Grand Prix at Road America Race 1 | 2026-06-19 | Road America | road | 2 | 8.5 | 0 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| Grand Prix at Road America Race 2 | 2026-06-20 | Road America | road | 2 | 8.5 | 0 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| Grand Prix at Mid-Ohio Race 1 | 2026-07-04 | Mid-Ohio Sports Car Course | road | 2 | 15 | -4.5 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| Grand Prix at Mid-Ohio Race 2 | 2026-07-05 | Mid-Ohio Sports Car Course | road | 2 | 15 | -4.5 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| Music City Grand Prix | 2026-07-18 | Nashville Superspeedway | oval | 2 | 6.5 | 2.5 | 9.111 | 0.778 | future_unavailable_in_historical_dataset |
| Grand Prix of Portland | 2026-08-09 | Portland International Raceway | road | 2 | 11 | -5.5 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| INDY NXT by Firestone at Milwaukee Mile | 2026-08-30 | The Milwaukee Mile | oval | 2 | 4.5 | 2 | 9.111 | 0.778 | future_unavailable_in_historical_dataset |
| Grand Prix of Monterey Race 1 | 2026-09-05 | WeatherTech Raceway Laguna Seca | road | 4 | 12 | -2 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |
| Grand Prix of Monterey Race 2 | 2026-09-06 | WeatherTech Raceway Laguna Seca | road | 4 | 12 | -2 | 12.6 | 0.4 | future_unavailable_in_historical_dataset |

## Adversarial Review Of The First Pass

- First-pass result: good descriptive backbone. Weakness: too much attention on Bryce-only rows, leaving field context underused.
- First-pass lap analysis: useful. Weakness: did not compare Bryce lap movement to full-field volatility and movement baselines.
- First-pass section analysis: useful headline rows. Weakness: top-section rows can overstate isolated micro-moments; per-lap section percentiles are stronger for pace consistency.
- First-pass weather analysis: properly caveated. Weakness: weather has to become a prep/context module rather than a performance explanation.
- First-pass model: acceptable as a sanity check. Weakness: OLS on roughly 32 complete races has too little sample for product claims. Use it to pick hypotheses, then visualize debrief evidence.
- First-pass team context: promising. Weakness: needs team-year and race-level teammate baselines, plus explicit caveats against engineering causality.

## Recommended Next Analytics Layer

1. Manual review of every race archetype and hidden-pace label against source caveats.
2. Create a source-state-aware Race Debrief contract from the score table.
3. Add a race-weekend prep contract that uses same-track history, track-type history, practice and qualifying signals, exact-window historical weather, and future-weather placeholders.
4. Build an opponent-strength model only after debrief scoring is stable, using shrinkage and season/team controls.
5. Start full-career expansion by metric family: result conversion, qualifying conversion, weather/context, lap shape where available, then section/pace only where series expose comparable data.
