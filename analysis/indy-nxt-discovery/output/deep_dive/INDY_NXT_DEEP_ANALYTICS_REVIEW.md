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
| worst_8_by_finish | 8 | 10.875 | 20.25 | -9.375 | 0.456 | 0.444 | 6.875 | 5 | 1 | 5 | 2 |

The top outcome cohort combines better finishing conversion, lower team-relative penalty, and more oval representation. The worst cohort clusters around conversion losses, incident/reliability-limited statuses, and team-context drag rather than one single pace pattern.

## Race Archetype Summary

| archetype | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top10Rate | avgTeamDelta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline_execution | 14 | 10.071 | 0.714 | 0.525 | 0.291 | 0.714 | 0.089 |
| recovery_drive | 6 | 10.833 | 5.833 | 0.384 | 0.469 | 0.667 | -1.986 |
| team_context_outperformed_teammates | 6 | 14.5 | -0.167 | 0.343 | 0.244 | 0 | -2.542 |
| incident_or_reliability_limited | 5 | 20 | -10.4 | 0.258 | 0.433 | 0 | 6.6 |
| podium_top5_conversion | 4 | 3.75 | 2.25 | 0.645 | 0.23 | 1 | -3.375 |
| conversion_loss | 3 | 17.667 | -8.333 | 0.44 | 0.287 | 0 | 5.667 |
| hidden_pace_bad_result | 2 | 20 | -7 | 0.784 | 0.453 | 0 | 7.125 |

## Track Type Summary

| trackType | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top5Rate | top10Rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| oval | 9 | 9.111 | 1.111 | 0.472 | 0.358 | 0.222 | 0.778 |
| road | 24 | 13.042 | -2.167 | 0.512 | 0.278 | 0.083 | 0.375 |
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
| 2026 Grand Prix at Road America Race 1 R1 | road | Chip Ganassi Racing | 15 | 21 | -6 | 0.767 | 5.25 | hidden_pace_bad_result |
| 2024 Detroit Grand Prix | street | Andretti Global | 11 | 20 | -9 | 0.05 | 7.75 | incident_or_reliability_limited |
| 2025 Grand Prix of Portland | road | Chip Ganassi Racing | 5 | 19 | -14 |  | 6.5 | incident_or_reliability_limited |
| 2024 Grand Prix of St. Petersburg | street | Andretti Global | 8 | 19 | -11 | 0.725 | 4.5 | incident_or_reliability_limited |
| 2024 Indianapolis Grand Prix Race 2 R2 | road | Andretti Global | 11 | 19 | -8 | 0.8 | 9 | hidden_pace_bad_result |
| 2025 Grand Prix of Monterey Race 2 R2 | road | Chip Ganassi Racing | 12 | 19 | -7 |  | 6.5 | incident_or_reliability_limited |

## Hidden Pace Candidates

| raceLabel | finishPosition | positionGain | paceIndex | bestLapRank | medianSectionPercentile | bryceVsTeamAvgFinish | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 Indianapolis Grand Prix Race 2 R2 | 19 | -8 | 0.8 | 5 |  | 9 | hidden_pace_bad_result |
| 2026 Grand Prix at Road America Race 1 R1 | 21 | -6 | 0.767 | 1 | 0.535 | 5.25 | hidden_pace_bad_result |

These are the rows where a normal result table is most likely to miss the story. They need manual review against source caveats before becoming UI copy.

## Race Chaos And Lap Dynamics

| raceLabel | finishPosition | positionGain | chaosExposureIndex | cautionShare | sessionIncidentCount | sessionPenaltyCount | leaderEntropy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Detroit Grand Prix | 8 | 6 | 0.807 | 0.333 | 6 | 6 | 0.918 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 23 | -11 | 0.619 | 0.227 | 7 | 1 | 0.99 |
| 2026 Grand Prix at Road America Race 1 R1 | 21 | -6 | 0.611 | 0.4 | 5 | 2 | 0.971 |
| 2025 Grand Prix of Monterey Race 2 R2 | 19 | -7 | 0.576 | 0.429 | 8 | 6 | 0 |
| 2026 Grand Prix of Arlington | 18 | 5 | 0.551 | 0.333 | 4 | 4 | 0.672 |
| 2024 INDY NXT by Firestone at Iowa Speedway | 8 | 1 | 0.532 | 0.491 | 5 | 0 | 0.497 |
| 2024 Detroit Grand Prix | 20 | -9 | 0.506 | 0.289 | 7 | 4 | 0 |
| 2026 Indianapolis Grand Prix Race 1 R1 | 22 | -9 | 0.481 | 0.172 | 2 | 2 | 0.579 |

Most stable Bryce lap-chart races:

| raceLabel | fieldLapDrivers | bryceNetLapChartGain | bryceLapGainPercentile | bryceVolatility | bryceStabilityPercentile |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Portland | 17 | 0 | 0.588 | 0 | 1 |
| 2026 Grand Prix of Alabama Race 2 R2 | 24 | 0 | 0.833 | 0 | 1 |
| 2024 Detroit Grand Prix | 21 | 0 | 0.429 | 0 | 1 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 24 | 0 | 0.542 | 2 | 0.958 |
| 2025 Music City Grand Prix | 18 | 0 | 0.444 | 2 | 0.944 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 16 | 3 | 0.938 | 3 | 0.938 |
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 19 | 0 | 0.579 | 2 | 0.895 |
| 2025 Grand Prix at Road America | 19 | 1 | 0.842 | 1 | 0.895 |

Least stable Bryce lap-chart races:

| raceLabel | fieldLapDrivers | bryceNetLapChartGain | bryceLapGainPercentile | bryceVolatility | bryceStabilityPercentile |
| --- | --- | --- | --- | --- | --- |
| 2024 Indianapolis Grand Prix Race 2 R2 | 21 | -3 | 0.095 | 9 | 0.095 |
| 2024 Grand Prix of Monterey Race 1 R1 | 20 | -8 | 0.1 | 14 | 0.1 |
| 2025 Grand Prix of Alabama | 20 | -7 | 0.1 | 11 | 0.15 |
| 2025 Grand Prix of Monterey Race 1 R1 | 17 | -1 | 0.118 | 5 | 0.176 |
| 2025 Indianapolis Grand Prix Race 2 R2 | 21 | 5 | 0.905 | 11 | 0.19 |
| 2025 Indianapolis Grand Prix Race 1 R1 | 21 | 1 | 0.667 | 11 | 0.19 |
| 2026 Grand Prix of St. Petersburg | 24 | -1 | 0.375 | 9 | 0.208 |
| 2026 Indianapolis Grand Prix Race 1 R1 | 24 | -8 | 0.167 | 24 | 0.208 |

## Preparation Signal

| label | n | pearson | interpretation |
| --- | --- | --- | --- |
| Best practice rank vs race finish | 32 | 0.335 | Exploratory correlation; lower ranks are better; direction only. |
| Best practice rank vs race best-lap rank | 31 | 0.473 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race start | 38 | 0.735 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race finish | 38 | 0.193 | Exploratory correlation; lower ranks are better; direction only. |
| Average qualifying rank vs race finish | 38 | 0.346 | Exploratory correlation; lower ranks are better; direction only. |

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
| 2026 | HMD Motorsports | 48 | 8.146 | 0.479 | 0.646 | 0.021 | 0 |  |
| 2026 | Cape Motorsports powered by ECR | 24 | 8.333 | 0.333 | 0.667 | 0 | 0 |  |
| 2026 | Andretti Global | 48 | 10.375 | 0.333 | 0.562 | 0.062 | 0 |  |
| 2026 | Cusick Morgan Motorsports | 24 | 13 | 0.083 | 0.375 | 0.042 | 0 |  |
| 2026 | Abel Motorsports | 48 | 13.208 | 0.125 | 0.417 | 0.083 | 0 |  |
| 2026 | A.J. Foyt Enterprises | 24 | 14.5 | 0.167 | 0.333 | 0.042 | 0 |  |
| 2026 | Chip Ganassi Racing | 48 | 16.396 | 0.021 | 0.167 | 0.104 | 12 | 14.75 |
| 2026 | Juncos Hollinger Racing | 24 | 17.917 | 0 | 0.042 | 0.125 | 0 |  |

Ganassi-specific descriptive rows:

| seasonYear | teamName | raceResultRows | avgFinish | top5Rate | top10Rate | issueLikeStatusRate | bryceRows | bryceAvgFinish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | Chip Ganassi Racing | 28 | 11.357 | 0.071 | 0.5 | 0.107 | 13 | 12.154 |
| 2026 | Chip Ganassi Racing | 48 | 16.396 | 0.021 | 0.167 | 0.104 | 12 | 14.75 |

Team status rows are official-result status summaries. They are evidence for outcome context, not engineering root-cause attribution.

## Opponent And Field Strength Context

This is descriptive same-sample context with empirical shrinkage, designed to help the UI explain field quality without pretending to predict results.

| driverName | raceRows | finishPercentileMean | shrunkStrengthRating | avgStartPercentile | top5Rate | top10Rate | issueLikeStatusRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Louis Foster | 14 | 0.945 | 0.783 | 0.885 | 0.929 | 1 | 0 |
| Dennis Hauger | 14 | 0.875 | 0.739 | 0.969 | 0.857 | 0.929 | 0.071 |
| Tymek Kucharczyk | 12 | 0.87 | 0.722 | 0.746 | 0.833 | 1 | 0 |
| Caio Collet | 28 | 0.768 | 0.708 | 0.859 | 0.75 | 0.857 | 0.107 |
| Jacob Abel | 14 | 0.822 | 0.705 | 0.893 | 0.786 | 0.857 | 0 |
| Nikita Johnson | 15 | 0.767 | 0.674 | 0.754 | 0.4 | 0.867 | 0.067 |
| Enzo Fittipaldi | 12 | 0.786 | 0.672 | 0.685 | 0.75 | 0.75 | 0 |
| Lochie Hughes | 26 | 0.711 | 0.661 | 0.788 | 0.615 | 0.769 | 0 |
| Nolan Siegel | 5 | 0.77 | 0.604 | 0.85 | 0.8 | 0.8 | 0 |
| Myles Rowe | 40 | 0.604 | 0.587 | 0.545 | 0.4 | 0.725 | 0.15 |
| Salvador de Alba | 40 | 0.596 | 0.58 | 0.537 | 0.375 | 0.625 | 0.1 |
| Christian Brooks | 8 | 0.657 | 0.578 | 0.684 | 0.375 | 1 | 0 |
| Callum Hedge | 28 | 0.599 | 0.577 | 0.612 | 0.357 | 0.679 | 0.036 |
| Jack Beeton | 12 | 0.62 | 0.572 | 0.627 | 0.25 | 0.5 | 0 |
| Max Taylor | 18 | 0.595 | 0.566 | 0.686 | 0.389 | 0.667 | 0.111 |

Bryce race results versus rated field context:

| raceLabel | bryceFinish | bryceFinishPercentile | fieldStrengthMean | resultVsFieldStrength | topRatedRivals |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Monterey Race 2 R2 | 3 | 0.9 | 0.509 | 0.391 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2024 Grand Prix of Portland | 3 | 0.882 | 0.537 | 0.346 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 4 | 0.833 | 0.526 | 0.307 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | 5 | 0.778 | 0.506 | 0.272 | Dennis Hauger:0.74; Caio Collet:0.71; Lochie Hughes:0.66; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2026 Grand Prix of Alabama Race 2 R2 | 7 | 0.75 | 0.499 | 0.251 | Tymek Kucharczyk:0.72; Nikita Johnson:0.67; Enzo Fittipaldi:0.67; Lochie Hughes:0.66; Myles Rowe:0.59 |
| 2025 Music City Grand Prix | 6 | 0.722 | 0.491 | 0.231 | Dennis Hauger:0.74; Caio Collet:0.71; Lochie Hughes:0.66; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2026 Detroit Grand Prix | 8 | 0.708 | 0.499 | 0.209 | Tymek Kucharczyk:0.72; Nikita Johnson:0.67; Enzo Fittipaldi:0.67; Lochie Hughes:0.66; Myles Rowe:0.59 |
| 2026 Grand Prix of Alabama Race 1 R1 | 8 | 0.708 | 0.499 | 0.209 | Tymek Kucharczyk:0.72; Nikita Johnson:0.67; Enzo Fittipaldi:0.67; Lochie Hughes:0.66; Myles Rowe:0.59 |
| 2024 OUTFRONT Showdown | 6 | 0.722 | 0.531 | 0.191 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Myles Rowe:0.59; Salvador de Alba:0.58 |
| 2024 Grand Prix at Road America | 8 | 0.667 | 0.512 | 0.155 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Myles Rowe:0.59; Salvador de Alba:0.58 |

## Championship Progression

| seasonYear | roundIndex | raceLabel | bryceRacePoints | bryceCumulativePoints | bryceStandingRank | leaderDriver | pointsBehindLeader |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 | 1 | 2026 Grand Prix of St. Petersburg | 12 | 12 | 18 | Nikita Johnson | 42 |
| 2026 | 2 | 2026 Grand Prix of Arlington | 12 | 24 | 19 | Max Taylor | 68 |
| 2026 | 3 | 2026 Grand Prix of Alabama Race 1 R1 | 24 | 48 | 15 | Nikita Johnson | 85 |
| 2026 | 4 | 2026 Grand Prix of Alabama Race 2 R2 | 26 | 74 | 12 | Nikita Johnson | 94 |
| 2026 | 5 | 2026 Indianapolis Grand Prix Race 1 R1 | 8 | 82 | 14 | Nikita Johnson | 121 |
| 2026 | 6 | 2026 Indianapolis Grand Prix Race 2 R2 | 18 | 100 | 14 | Nikita Johnson | 131 |
| 2026 | 7 | 2026 Detroit Grand Prix | 24 | 124 | 12 | Enzo Fittipaldi | 142 |
| 2026 | 8 | 2026 INDY NXT by Firestone at World Wide Technology Raceway | 7 | 131 | 14 | Nikita Johnson | 154 |
| 2026 | 9 | 2026 Grand Prix at Road America Race 1 R1 | 9 | 140 | 16 | Nikita Johnson | 174 |
| 2026 | 10 | 2026 Grand Prix at Road America Race 2 R2 | 20 | 160 | 17 | Nikita Johnson | 190 |
| 2026 | 11 | 2026 Grand Prix at Mid-Ohio Race 1 R1 | 14 | 174 | 17 | Tymek Kucharczyk | 210 |
| 2026 | 12 | 2026 Grand Prix at Mid-Ohio Race 2 R2 | 16 | 190 | 17 | Enzo Fittipaldi | 241 |

## Official Racecraft Badges

| raceLabel | bryceMostImprovedFlag | bryceRacecraftDescription | sessionMostImprovedDriver | sessionMostImprovedPositions |
| --- | --- | --- | --- | --- |
| 2024 OUTFRONT Showdown | True | Aron, Bryce was listed as Most Improved in the official Event Summary, improving 7 positions from P13 to P6. | Bryce Aron | 7 |

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
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 152 | 0.333 | 0.026 | 0.303 | FS - PI:0.30; FS - PO:0.34; BS - T2:0.34; BS - T3:0.35 |
| 2025 Grand Prix at Mid-Ohio | 282 | 0.333 | 0.163 | 0.418 | Turn 1A:0.18; Turn 10:0.25; Turn 1B:0.27; Turn 1:0.27 |
| 2026 Grand Prix at Mid-Ohio Race 1 R1 | 285 | 0.348 | 0.133 | 0.323 | Turn 1A:0.30; Turn 11:0.31; Turn 1:0.32; Turn 5:0.34 |
| 2025 Detroit Grand Prix | 284 | 0.353 | 0.099 | 0.387 | I3 to I4:0.19; I4 to I5:0.21; I11 to 12:0.25; I12 to I13:0.27 |
| 2026 Grand Prix of St. Petersburg | 190 | 0.364 | 0.111 | 0.326 | Turn 4:0.30; Turn 10:0.34; Turn 9a:0.36; Turns 5-8:0.36 |

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
| Music City Grand Prix | 2026-07-18 | Nashville Superspeedway | oval | 2 | 6.5 | 2.5 | 9.111 | 0.778 | future_unavailable_in_historical_dataset |
| Grand Prix of Portland | 2026-08-07 | Portland International Raceway | road | 2 | 11 | -5.5 | 13.042 | 0.375 | future_unavailable_in_historical_dataset |
| INDY NXT by Firestone at Milwaukee Mile | 2026-08-30 | The Milwaukee Mile | oval | 2 | 4.5 | 2 | 9.111 | 0.778 | future_unavailable_in_historical_dataset |
| Grand Prix of Monterey Race 1 | 2026-09-05 | WeatherTech Raceway Laguna Seca | road | 4 | 12 | -2 | 13.042 | 0.375 | future_unavailable_in_historical_dataset |
| Grand Prix of Monterey Race 2 | 2026-09-06 | WeatherTech Raceway Laguna Seca | road | 4 | 12 | -2 | 13.042 | 0.375 | future_unavailable_in_historical_dataset |

## Source Family Completion Audit

| sourceFamily | sourceRows | analysisStatus | primaryArtifacts | auditConclusion |
| --- | --- | --- | --- | --- |
| race_results | 40 | complete | race_debrief_scores.csv | Core result, conversion, points, and status analysis. |
| full_field_results | 834 | complete | driver_strength_ratings.csv; field_strength_by_race.csv; team_context_by_year.csv | Full-field context, team context, and descriptive opponent strength. |
| practice_results | 53 | complete_source_bounded | prep_session_signals.csv | Practice is represented as rank context; no absolute pace claims. |
| qualifying_results | 1430 | complete_source_bounded | prep_session_signals.csv | Qualifying is used for start/prep context; group/combined caveats remain. |
| lap_samples | 31894 | complete_source_bounded | full_field_lap_dynamics_by_driver.csv | Full-field lap movement and volatility analysis with partial-chart caveats. |
| section_results | 39 | complete_source_bounded | section_results_deep_by_race.csv | Per-lap section percentiles with sparse-row suppression. |
| top_section_times | 40 | partial | section_results_deep_by_section.csv | Top-section facts were useful earlier; final pass favors per-lap section results. |
| event_summary_stats | 40 | complete | race_debrief_scores.csv | Cautions, passes, lead-change context folded into debrief scores. |
| leader_lap_summary | 39 | complete | leader_lap_context.csv | Leader entropy and dominance context. |
| incidents | 144 | complete | incident_penalty_context.csv | Incident exposure and type summaries. |
| penalties | 80 | complete | incident_penalty_context.csv | Penalty exposure and type summaries. |
| racecraft_events | 39 | complete_source_bounded | racecraft_context_by_race.csv | Official most-improved badges only; no inferred overtake log. |
| weather_observations | 113 | complete_context_only | race_debrief_scores.csv; future_weekend_prep_inputs.csv | Modeled non-official weather used as context, not causality. |
| future_schedule | 87 | complete_context_only | future_weekend_prep_inputs.csv | Future prep rows exclude forecast claims until current weather source is added. |
| pit_stop_counts | 40 | complete_low_signal | race_debrief_scores.csv | Pit counts are present but low-signal; no pit sequence/tire/service analysis exists. |
| telemetry_or_car_engineering | 0 | unavailable |  | No telemetry or engineering-root-cause data in canonical sources. |

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
4. Keep opponent strength as descriptive context until a larger season-controlled model is justified.
5. Start full-career expansion by metric family: result conversion, qualifying conversion, weather/context, lap shape where available, then section/pace only where series expose comparable data.
