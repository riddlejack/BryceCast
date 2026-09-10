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
| best_8_by_finish | 8 | 7.875 | 5 | 2.875 | 0.656 | 0.285 | -3.906 | 0 | 4 | 4 | 0 |
| worst_8_by_finish | 8 | 10.875 | 20.25 | -9.375 | 0.461 | 0.444 | 6.875 | 5 | 1 | 5 | 2 |

The top outcome cohort combines better finishing conversion, lower team-relative penalty, and more oval representation. The worst cohort clusters around conversion losses, incident/reliability-limited statuses, and team-context drag rather than one single pace pattern.

## Race Archetype Summary

| archetype | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top10Rate | avgTeamDelta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline_execution | 17 | 9.765 | 0.588 | 0.542 | 0.3 | 0.765 | -1.191 |
| recovery_drive | 7 | 10.429 | 5.857 | 0.407 | 0.489 | 0.714 | -2.774 |
| team_context_outperformed_teammates | 7 | 14.714 | -0.286 | 0.331 | 0.242 | 0 | -2.429 |
| incident_or_reliability_limited | 5 | 20 | -10.4 | 0.252 | 0.433 | 0 | 6.6 |
| podium_top5_conversion | 4 | 3.75 | 2.25 | 0.662 | 0.23 | 1 | -3.375 |
| conversion_loss | 3 | 17.667 | -8.333 | 0.43 | 0.287 | 0 | 5.667 |
| hidden_pace_bad_result | 2 | 20 | -7 | 0.809 | 0.453 | 0 | 7.125 |

## Track Type Summary

| trackType | races | avgFinish | avgGain | avgPaceIndex | avgChaosExposure | top5Rate | top10Rate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| oval | 11 | 9.091 | 1.273 | 0.496 | 0.378 | 0.182 | 0.818 |
| road | 27 | 12.741 | -1.889 | 0.513 | 0.282 | 0.074 | 0.407 |
| street | 7 | 15.143 | 0.571 | 0.342 | 0.471 | 0 | 0.286 |

## Best Outcome Races

| raceLabel | trackType | teamName | startPosition | finishPosition | positionGain | paceIndex | chaosExposureIndex | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Portland | road | Andretti Global | 6 | 3 | 3 | 0.615 | 0.22 | podium_top5_conversion |
| 2024 Grand Prix of Monterey Race 2 R2 | road | Andretti Global | 5 | 3 | 2 | 0.671 | 0.291 | podium_top5_conversion |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | oval | Andretti Global | 7 | 4 | 3 | 0.792 | 0.237 | podium_top5_conversion |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | oval | Chip Ganassi Racing | 6 | 5 | 1 | 0.572 | 0.172 | podium_top5_conversion |
| 2024 OUTFRONT Showdown | oval | Andretti Global | 13 | 6 | 7 | 0.596 | 0.416 | recovery_drive |
| 2025 Music City Grand Prix | oval | Chip Ganassi Racing | 8 | 6 | 2 | 0.682 | 0.424 | baseline_execution |
| 2026 Grand Prix of Monterey Race 1 R1 | road | Chip Ganassi Racing | 7 | 6 | 1 | 0.674 | 0.474 | baseline_execution |
| 2026 Grand Prix of Alabama Race 2 R2 | road | Chip Ganassi Racing | 11 | 7 | 4 | 0.645 | 0.05 | baseline_execution |

## Worst Outcome Races

| raceLabel | trackType | teamName | startPosition | finishPosition | positionGain | paceIndex | bryceVsTeamAvgFinish | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | oval | Chip Ganassi Racing | 12 | 23 | -11 | 0 | 7.75 | incident_or_reliability_limited |
| 2026 Indianapolis Grand Prix Race 1 R1 | road | Chip Ganassi Racing | 13 | 22 | -9 | 0.391 | 7.75 | conversion_loss |
| 2026 Grand Prix at Road America Race 1 R1 | road | Chip Ganassi Racing | 15 | 21 | -6 | 0.818 | 5.25 | hidden_pace_bad_result |
| 2024 Detroit Grand Prix | street | Andretti Global | 11 | 20 | -9 | 0.05 | 7.75 | incident_or_reliability_limited |
| 2025 Grand Prix of Portland | road | Chip Ganassi Racing | 5 | 19 | -14 |  | 6.5 | incident_or_reliability_limited |
| 2024 Grand Prix of St. Petersburg | street | Andretti Global | 8 | 19 | -11 | 0.706 | 4.5 | incident_or_reliability_limited |
| 2024 Indianapolis Grand Prix Race 2 R2 | road | Andretti Global | 11 | 19 | -8 | 0.8 | 9 | hidden_pace_bad_result |
| 2025 Grand Prix of Monterey Race 2 R2 | road | Chip Ganassi Racing | 12 | 19 | -7 |  | 6.5 | incident_or_reliability_limited |

## Hidden Pace Candidates

| raceLabel | finishPosition | positionGain | paceIndex | bestLapRank | medianSectionPercentile | bryceVsTeamAvgFinish | archetype |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Grand Prix at Road America Race 1 R1 | 21 | -6 | 0.818 | 1 | 0.636 | 5.25 | hidden_pace_bad_result |
| 2024 Indianapolis Grand Prix Race 2 R2 | 19 | -8 | 0.8 | 5 |  | 9 | hidden_pace_bad_result |

These are the rows where a normal result table is most likely to miss the story. They need manual review against source caveats before becoming UI copy.

## Race Chaos And Lap Dynamics

| raceLabel | finishPosition | positionGain | chaosExposureIndex | cautionShare | sessionIncidentCount | sessionPenaltyCount | leaderEntropy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026 Detroit Grand Prix | 8 | 6 | 0.807 | 0.333 | 6 | 6 | 0.918 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 23 | -11 | 0.619 | 0.227 | 7 | 1 | 0.99 |
| 2026 Grand Prix at Road America Race 1 R1 | 21 | -6 | 0.611 | 0.4 | 5 | 2 | 0.971 |
| 2026 INDY NXT by Firestone at Milwaukee Mile | 8 | 6 | 0.609 | 0.233 | 7 | 0 | 0.977 |
| 2025 Grand Prix of Monterey Race 2 R2 | 19 | -7 | 0.576 | 0.429 | 8 | 6 | 0 |
| 2026 Grand Prix of Arlington | 18 | 5 | 0.551 | 0.333 | 4 | 4 | 0.672 |
| 2024 INDY NXT by Firestone at Iowa Speedway | 8 | 1 | 0.532 | 0.491 | 5 | 0 | 0.497 |
| 2024 Detroit Grand Prix | 20 | -9 | 0.506 | 0.289 | 7 | 4 | 0 |

Most stable Bryce lap-chart races:

| raceLabel | fieldLapDrivers | bryceNetLapChartGain | bryceLapGainPercentile | bryceVolatility | bryceStabilityPercentile |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Portland | 17 | 0 | 0.588 | 0 | 1 |
| 2026 Grand Prix of Monterey Race 1 R1 | 24 | 0 | 0.458 | 0 | 1 |
| 2024 Detroit Grand Prix | 21 | 0 | 0.429 | 0 | 1 |
| 2026 Grand Prix of Alabama Race 2 R2 | 24 | 0 | 0.833 | 0 | 1 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 24 | 0 | 0.542 | 2 | 0.958 |
| 2025 Music City Grand Prix | 18 | 0 | 0.444 | 2 | 0.944 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 16 | 3 | 0.938 | 3 | 0.938 |
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
| Best practice rank vs race finish | 36 | 0.285 | Exploratory correlation; lower ranks are better; direction only. |
| Best practice rank vs race best-lap rank | 35 | 0.443 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race start | 43 | 0.71 | Exploratory correlation; lower ranks are better; direction only. |
| Best qualifying rank vs race finish | 43 | 0.165 | Exploratory correlation; lower ranks are better; direction only. |
| Average qualifying rank vs race finish | 43 | 0.341 | Exploratory correlation; lower ranks are better; direction only. |

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
| 2026 | Cape Motorsports powered by ECR | 34 | 8.176 | 0.382 | 0.676 | 0 | 0 |  |
| 2026 | HMD Motorsports | 68 | 8.779 | 0.397 | 0.618 | 0.015 | 0 |  |
| 2026 | Andretti Global | 68 | 10.544 | 0.324 | 0.529 | 0.088 | 0 |  |
| 2026 | Abel Motorsports | 68 | 12.897 | 0.176 | 0.426 | 0.118 | 0 |  |
| 2026 | Cusick Morgan Motorsports | 34 | 13 | 0.118 | 0.353 | 0.059 | 0 |  |
| 2026 | A.J. Foyt Enterprises | 34 | 14.324 | 0.147 | 0.353 | 0.059 | 0 |  |
| 2026 | Chip Ganassi Racing | 68 | 16.265 | 0.029 | 0.191 | 0.103 | 17 | 13.294 |
| 2026 | Juncos Hollinger Racing | 32 | 17.125 | 0 | 0.094 | 0.094 | 0 |  |

Ganassi-specific descriptive rows:

| seasonYear | teamName | raceResultRows | avgFinish | top5Rate | top10Rate | issueLikeStatusRate | bryceRows | bryceAvgFinish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | Chip Ganassi Racing | 28 | 11.357 | 0.071 | 0.5 | 0.107 | 13 | 12.154 |
| 2026 | Chip Ganassi Racing | 68 | 16.265 | 0.029 | 0.191 | 0.103 | 17 | 13.294 |

Team status rows are official-result status summaries. They are evidence for outcome context, not engineering root-cause attribution.

## Opponent And Field Strength Context

This is descriptive same-sample context with empirical shrinkage, designed to help the UI explain field quality without pretending to predict results.

| driverName | raceRows | finishPercentileMean | shrunkStrengthRating | avgStartPercentile | top5Rate | top10Rate | issueLikeStatusRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Louis Foster | 14 | 0.945 | 0.783 | 0.885 | 0.929 | 1 | 0 |
| Dennis Hauger | 14 | 0.875 | 0.739 | 0.969 | 0.857 | 0.929 | 0.071 |
| Nikita Johnson | 20 | 0.795 | 0.71 | 0.744 | 0.5 | 0.9 | 0.05 |
| Caio Collet | 28 | 0.768 | 0.708 | 0.859 | 0.75 | 0.857 | 0.107 |
| Tymek Kucharczyk | 17 | 0.802 | 0.706 | 0.765 | 0.706 | 0.882 | 0 |
| Jacob Abel | 18 | 0.795 | 0.704 | 0.842 | 0.722 | 0.833 | 0 |
| Enzo Fittipaldi | 17 | 0.763 | 0.679 | 0.642 | 0.588 | 0.765 | 0 |
| Lochie Hughes | 31 | 0.707 | 0.665 | 0.781 | 0.581 | 0.742 | 0 |
| Nolan Siegel | 5 | 0.77 | 0.604 | 0.85 | 0.8 | 0.8 | 0 |
| Max Taylor | 23 | 0.629 | 0.596 | 0.666 | 0.435 | 0.696 | 0.087 |
| Alessandro de Tullio | 17 | 0.628 | 0.587 | 0.852 | 0.294 | 0.706 | 0 |
| Christian Brooks | 8 | 0.657 | 0.578 | 0.684 | 0.375 | 1 | 0 |
| Callum Hedge | 28 | 0.599 | 0.577 | 0.612 | 0.357 | 0.679 | 0.036 |
| Jack Beeton | 17 | 0.608 | 0.573 | 0.6 | 0.235 | 0.529 | 0 |
| Salvador de Alba | 42 | 0.583 | 0.57 | 0.533 | 0.357 | 0.595 | 0.095 |

Bryce race results versus rated field context:

| raceLabel | bryceFinish | bryceFinishPercentile | fieldStrengthMean | resultVsFieldStrength | topRatedRivals |
| --- | --- | --- | --- | --- | --- |
| 2024 Grand Prix of Monterey Race 2 R2 | 3 | 0.9 | 0.506 | 0.394 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Christian Brooks:0.58; Callum Hedge:0.58 |
| 2024 Grand Prix of Portland | 3 | 0.882 | 0.534 | 0.349 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Christian Brooks:0.58; Callum Hedge:0.58 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 4 | 0.833 | 0.523 | 0.31 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Christian Brooks:0.58; Callum Hedge:0.58 |
| 2026 Grand Prix of Monterey Race 1 R1 | 6 | 0.792 | 0.507 | 0.285 | Nikita Johnson:0.71; Tymek Kucharczyk:0.71; Jacob Abel:0.70; Enzo Fittipaldi:0.68; Lochie Hughes:0.66 |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | 5 | 0.778 | 0.503 | 0.275 | Dennis Hauger:0.74; Caio Collet:0.71; Lochie Hughes:0.66; Max Taylor:0.60; Callum Hedge:0.58 |
| 2026 Grand Prix of Alabama Race 2 R2 | 7 | 0.75 | 0.499 | 0.251 | Nikita Johnson:0.71; Tymek Kucharczyk:0.71; Enzo Fittipaldi:0.68; Lochie Hughes:0.66; Max Taylor:0.60 |
| 2025 Music City Grand Prix | 6 | 0.722 | 0.487 | 0.235 | Dennis Hauger:0.74; Caio Collet:0.71; Lochie Hughes:0.66; Callum Hedge:0.58; Salvador de Alba:0.57 |
| 2026 Grand Prix of Alabama Race 1 R1 | 8 | 0.708 | 0.499 | 0.21 | Nikita Johnson:0.71; Tymek Kucharczyk:0.71; Enzo Fittipaldi:0.68; Lochie Hughes:0.66; Max Taylor:0.60 |
| 2026 Detroit Grand Prix | 8 | 0.708 | 0.499 | 0.21 | Nikita Johnson:0.71; Tymek Kucharczyk:0.71; Enzo Fittipaldi:0.68; Lochie Hughes:0.66; Max Taylor:0.60 |
| 2024 OUTFRONT Showdown | 6 | 0.722 | 0.528 | 0.194 | Louis Foster:0.78; Caio Collet:0.71; Jacob Abel:0.70; Christian Brooks:0.58; Callum Hedge:0.58 |

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
| 2026 | 13 | 2026 Music City Grand Prix | 20 | 210 | 17 | Nikita Johnson | 241 |
| 2026 | 14 | 2026 Grand Prix of Portland | 14 | 224 | 15 | Enzo Fittipaldi | 252 |
| 2026 | 15 | 2026 INDY NXT by Firestone at Milwaukee Mile | 24 | 248 | 14 | Nikita Johnson | 257 |
| 2026 | 16 | 2026 Grand Prix of Monterey Race 1 R1 | 28 | 276 | 14 | Nikita Johnson | 269 |
| 2026 | 17 | 2026 Grand Prix of Monterey Race 2 R2 | 22 | 298 | 14 | Nikita Johnson | 287 |

## Official Racecraft Badges

| raceLabel | bryceMostImprovedFlag | bryceRacecraftDescription | sessionMostImprovedDriver | sessionMostImprovedPositions |
| --- | --- | --- | --- | --- |
| 2024 OUTFRONT Showdown | True | Aron, Bryce was listed as Most Improved in the official Event Summary, improving 7 positions from P13 to P6. | Bryce Aron | 7 |

## Deep Section Results

The headline section tables require at least 50 comparable per-lap section rows. Sparse rows are preserved in CSV for review but suppressed from headline rankings.

Strongest section-result races:

| raceLabel | sectionComparisonRows | medianSectionPercentile | topQuartileShare | bottomQuartileShare | bestSectionFamilies |
| --- | --- | --- | --- | --- | --- |
| 2026 Grand Prix of Alabama Race 2 R2 | 330 | 0.682 | 0.403 | 0.073 | Turns 1-3:0.89; Turns 14-16:0.86; Turn 10:0.80; Turns 5-6:0.78 |
| 2024 Grand Prix of Portland | 455 | 0.667 | 0.376 | 0.149 | Turn 2:0.80; Turn 12:0.77; Turn 6:0.74; Turn 3:0.71 |
| 2024 Grand Prix of Monterey Race 2 R2 | 560 | 0.657 | 0.37 | 0.104 | Turn 3:0.86; Turn 4:0.80; Turn 2:0.75; Turn 1 Exit:0.74 |
| 2024 Grand Prix of Alabama | 385 | 0.65 | 0.366 | 0.179 | Turn 17:0.77; Turns 1-3:0.74; FS-PO:0.73; Turns 5-6:0.66 |
| 2024 INDY NXT By Firestone at The Milwaukee Mile | 810 | 0.643 | 0.378 | 0.142 | SS1 to T2:0.77; T3 to SS2:0.71; BS to T3:0.71; T2 to BS:0.67 |
| 2026 Grand Prix at Road America Race 1 R1 | 430 | 0.636 | 0.412 | 0.293 | I12 to I13:0.74; I13A to I14:0.73; I5 to I6:0.72; I4A to I5:0.72 |
| 2026 Grand Prix of Monterey Race 2 R2 | 480 | 0.619 | 0.302 | 0.125 | Turn 4:0.78; Turn 4A:0.75; Turn 10:0.74; Turn 1 Entry:0.68 |
| 2025 INDY NXT by Firestone at the Milwaukee Mile | 810 | 0.615 | 0.346 | 0.14 | SF to T1:0.80; T3 to SS2:0.76; FS to SF:0.69; T1 to SS1:0.61 |

Weakest section-result races:

| raceLabel | sectionComparisonRows | medianSectionPercentile | topQuartileShare | bottomQuartileShare | weakestSectionFamilies |
| --- | --- | --- | --- | --- | --- |
| 2026 Grand Prix of Arlington | 377 | 0.238 | 0.143 | 0.507 | Turn 9:0.10; Turns 13/14:0.22; Turns 8/9:0.24; Turn 13:0.26 |
| 2025 Grand Prix of St. Petersburg | 484 | 0.27 | 0.138 | 0.494 | FS-PO:0.27; Turn 9a:0.27; Turn 10:0.30; Turn 4:0.30 |
| 2026 Grand Prix of Portland | 452 | 0.304 | 0.119 | 0.396 | Turn 5:0.25; Turn 8:0.26; Turn 9:0.28; Turn 6:0.32 |
| 2025 Detroit Grand Prix | 792 | 0.312 | 0.106 | 0.458 | I12 to I13:0.22; I2 to I3:0.23; I11 to 12:0.23; I9 to I10:0.26 |
| 2025 Indianapolis Grand Prix Race 2 R2 | 455 | 0.316 | 0.163 | 0.415 | Turn 3:0.23; Turn 14:0.27; Turn 8/9:0.28; Turn 11:0.30 |
| 2026 Grand Prix at Mid-Ohio Race 1 R1 | 595 | 0.318 | 0.103 | 0.4 | Turn 1A:0.23; Turn 12C:0.26; Turn 6/7:0.29; Turn 1:0.29 |
| 2025 INDY NXT by Firestone at World Wide Technology Raceway | 592 | 0.343 | 0.062 | 0.358 | FS - PI:0.28; BS - T2:0.35; FS - PO:0.35; BS - T3:0.36 |
| 2026 Grand Prix of St. Petersburg | 462 | 0.356 | 0.143 | 0.37 | Turn 4:0.25; Turn 10:0.27; Turns 5-8:0.31; Turns 11/12:0.37 |

Sparse section-result rows needing review:

| raceLabel | sectionComparisonRows | medianSectionPercentile | bestSectionFamilies | weakestSectionFamilies |
| --- | --- | --- | --- | --- |
| 2025 Grand Prix of Portland | 4 | 0.69 | FS-PI:0.89; Turn 1:0.71; Turn 12:0.67; FS-PO:0.17 | FS-PO:0.17; Turn 12:0.67; Turn 1:0.71; FS-PI:0.89 |
| 2025 Grand Prix of Monterey Race 2 R2 | 7 | 0 | FS - PI:0.89; Turn 1 Entry:0.39; Turn 1 Exit:0.33; Turn 2:0.00 | Turn 2:0.00; Turn 3:0.00; Turn 4:0.00; Turn 4A:0.00 |
| 2024 Detroit Grand Prix | 36 | 0.5 | I16 to SF:0.92; I12 to I13:0.73; I4 to I5:0.65; I5 to I6:0.65 | I15 to I16:0.18; I2A to I2:0.30; I2 to I3:0.30; SF to I1:0.33 |
| 2026 INDY NXT by Firestone at World Wide Technology Raceway | 40 | 0.091 | FS - PO:0.50; Turn 1:0.27; Turn 4:0.25; Turn 3:0.21 | BS - T3:0.05; BS - T2:0.07; FS - PI:0.16; Turn 2:0.18 |

## Future Race Weekend Prep Inputs

_No rows._

## Source Family Completion Audit

| sourceFamily | sourceRows | analysisStatus | primaryArtifacts | auditConclusion |
| --- | --- | --- | --- | --- |
| race_results | 45 | complete | race_debrief_scores.csv | Core result, conversion, points, and status analysis. |
| full_field_results | 952 | complete | driver_strength_ratings.csv; field_strength_by_race.csv; team_context_by_year.csv | Full-field context, team context, and descriptive opponent strength. |
| practice_results | 56 | complete_source_bounded | prep_session_signals.csv | Practice is represented as rank context; no absolute pace claims. |
| qualifying_results | 1620 | complete_source_bounded | prep_session_signals.csv | Qualifying is used for start/prep context; group/combined caveats remain. |
| lap_samples | 37422 | complete_source_bounded | full_field_lap_dynamics_by_driver.csv | Full-field lap movement and volatility analysis with partial-chart caveats. |
| section_results | 44 | complete_source_bounded | section_results_deep_by_race.csv | Per-lap section percentiles with sparse-row suppression. |
| top_section_times | 45 | partial | section_results_deep_by_section.csv | Top-section facts were useful earlier; final pass favors per-lap section results. |
| event_summary_stats | 45 | complete | race_debrief_scores.csv | Cautions, passes, lead-change context folded into debrief scores. |
| leader_lap_summary | 44 | complete | leader_lap_context.csv | Leader entropy and dominance context. |
| incidents | 166 | complete | incident_penalty_context.csv | Incident exposure and type summaries. |
| penalties | 88 | complete | incident_penalty_context.csv | Penalty exposure and type summaries. |
| racecraft_events | 44 | complete_source_bounded | racecraft_context_by_race.csv | Official most-improved badges only; no inferred overtake log. |
| weather_observations | 115 | complete_context_only | race_debrief_scores.csv; future_weekend_prep_inputs.csv | Modeled non-official weather used as context, not causality. |
| future_schedule | 75 | complete_context_only | future_weekend_prep_inputs.csv | Future prep rows exclude forecast claims until current weather source is added. |
| pit_stop_counts | 45 | complete_low_signal | race_debrief_scores.csv | Pit counts are present but low-signal; no pit sequence/tire/service analysis exists. |
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
