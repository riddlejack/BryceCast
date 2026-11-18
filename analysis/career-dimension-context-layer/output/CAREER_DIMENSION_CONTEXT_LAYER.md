# Career Dimension Context Layer

Generated: 2026-11-18T04:22:21Z
Source hash: `79d1a3b5f19910a55afa1ccee7df1ec81cb8884957241eea463499eefcb4289a`

## Source Scope

This lane covers 9866 result rows, 1967 qualifying rows, 84 team rows, 47 tracks, 688 drivers, and 706 cars from the canonical dataset.

## What Became Productized

- Full-field result rows with driver, team, car, series, track, field-size, finish-percentile, status, penalty, incident, and provenance context.
- Qualifying-result rows with same-event race-result conversion joins and source-state labels.
- Team and team-era context across observed cars, qualifying rows, result rows, drivers, and Bryce usage.
- Track venue context, weather/readiness metadata, and metadata-based analog rows.
- Driver cohort context for Bryce, teammate overlap, shared race fields, competitors, co-drivers, and identity-only rows.
- Car/entrant context across series, season, team, class, usage rows, and Bryce observation flags.

## Qualifying Conversion

- One-to-one same-event race-result joins: 1622 of 1967 qualifying rows.
- Ambiguous multi-race same-event joins: 341 qualifying rows.
- Full-field result context rows: 9866.

| seriesName | seasonYear | eventName | sessionName | fieldSize | sameEventRaceJoinRows | bryceBestQualifyingPosition |
| --- | --- | --- | --- | --- | --- | --- |
| INDY NXT | 2026 | Grand Prix of St. Petersburg | Combined Qualifications | 24 | 24 | 19 |
| INDY NXT | 2026 | Grand Prix of Arlington | Combined Qualifications | 24 | 24 | 23 |
| INDY NXT | 2026 | Grand Prix of Alabama Race 1 | Combined Qualifying - Race 1 | 24 | 24 | 5 |
| INDY NXT | 2026 | Grand Prix of Alabama Race 2 | Combined Qualifying - Race 2 | 24 | 24 | 11 |
| INDY NXT | 2026 | Indianapolis Grand Prix Race 1 | Combined Qualifying - Race 1 | 24 | 24 | 13 |
| INDY NXT | 2026 | Indianapolis Grand Prix Race 2 | Combined Qualifying - Race 2 | 24 | 24 | 14 |
| INDY NXT | 2026 | Detroit Grand Prix | Combined Qualifying | 24 | 24 | 14 |
| INDY NXT | 2026 | INDY NXT by Firestone at World Wide Technology Raceway | Qualifying | 24 | 24 | 12 |
| INDY NXT | 2026 | Grand Prix at Road America Race 1 | Combined Qualifying - Race 1 | 24 | 24 | 15 |
| INDY NXT | 2026 | Grand Prix at Road America Race 2 | Combined Qualifying - Race 2 | 24 | 24 | 15 |
| INDY NXT | 2026 | Grand Prix at Mid-Ohio Race 1 | Combined Qualifying - Race 1 | 24 | 24 | 13 |
| INDY NXT | 2026 | Grand Prix at Mid-Ohio Race 2 | Combined Qualifying - Race 2 | 24 | 24 | 15 |

## Team And Entrant Context

| teamName | observedSeriesIds | seasonYears | carCount | driverCount | qualifyingRows | resultRows | bryceObserved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HMD Motorsports | series_indy_nxt | 2024;2025;2026 | 23 | 29 | 513 | 1218 | no |
| Andretti Global | series_indy_nxt | 2024;2025;2026 | 12 | 10 | 305 | 707 | no |
| Abel Motorsports | series_indy_nxt | 2024;2025;2026 | 11 | 9 | 253 | 582 | no |
| Chip Ganassi Racing | series_indy_nxt | 2025;2026 | 6 | 5 | 168 | 370 | no |
| Fortec Motorsports | series_gb3 | 2021;2022 | 8 | 9 | 44 | 332 | no |
| Elite Motorsport | series_gb3 | 2021;2022 | 8 | 6 | 46 | 328 | no |
| Cape Motorsports powered by ECR | series_indy_nxt | 2024;2025;2026 | 6 | 6 | 128 | 308 | no |
| Douglas Motorsport | series_gb3 | 2021;2022 | 5 | 6 | 26 | 277 | no |
| Rodin Carlin | series_gb3 | 2022 | 3 | 3 | 0 | 228 | no |
| Hitech Pulse-Eight | series_gb3 | 2022 | 3 | 3 | 0 | 227 | no |
| Arden VRD | series_gb3 | 2022 | 3 | 3 | 0 | 201 | no |
| Juncos Hollinger Racing | series_indy_nxt | 2024;2026 | 4 | 4 | 85 | 180 | no |

| teamName | seriesName | seasonYear | carCount | driverCount | qualifyingRows | resultRows | bryceRows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HMD Motorsports | INDY NXT | 2024 | 10 | 13 | 221 | 539 | 0 |
| HMD Motorsports | INDY NXT | 2025 | 9 | 14 | 168 | 419 | 5 |
| Abel Motorsports | INDY NXT | 2026 | 4 | 5 | 124 | 260 | 0 |
| Chip Ganassi Racing | INDY NXT | 2026 | 4 | 4 | 124 | 260 | 96 |
| HMD Motorsports | INDY NXT | 2026 | 4 | 5 | 124 | 260 | 0 |
| Andretti Global | INDY NXT | 2026 | 4 | 4 | 124 | 259 | 0 |
| Rodin Carlin | GB3 Championship | 2022 | 3 | 3 | 0 | 228 | 0 |
| Andretti Global | INDY NXT | 2024 | 4 | 4 | 92 | 227 | 80 |
| Hitech Pulse-Eight | GB3 Championship | 2022 | 3 | 3 | 0 | 227 | 76 |
| Andretti Global | INDY NXT | 2025 | 4 | 4 | 89 | 221 | 0 |
| Fortec Motorsports | GB3 Championship | 2022 | 3 | 3 | 0 | 210 | 0 |
| Douglas Motorsport | GB3 Championship | 2022 | 3 | 3 | 0 | 208 | 0 |

## Track Archetypes

| targetTrackName | analogTrackName | similarityRank | similarityScore | sharedFeatures |
| --- | --- | --- | --- | --- |
| Road America | Circuit Paul Ricard | 1 | 0.9675 | trackType=road;temporary=False;direction=clockwise;surface=asphalt;similar_lengthKm;similar_cornerCount |
| Road America | Circuit de Spa-Francorchamps | 2 | 0.9562 | trackType=road;temporary=False;direction=clockwise;surface=asphalt;similar_lengthKm |
| Road America | Spa GP | 3 | 0.9562 | trackType=road;temporary=False;direction=clockwise;surface=asphalt;similar_lengthKm |
| Road America | Daytona International Speedway | 4 | 0.9556 | trackType=road;temporary=False;direction=clockwise;surface=asphalt;similar_lengthKm;similar_cornerCount |
| Road America | Silverstone GP | 5 | 0.9538 | trackType=road;temporary=False;direction=clockwise;surface=asphalt;similar_lengthKm |

## Driver Cohorts

| driverName | cohortLabel | seriesIds | teamCount | resultRows | qualifyingRows | sharedRaceSessionWithBryceCount | sameTeamAsBryceEventCount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | shared_race_field | series_formula_ford | 0 | 1 | 0 | 1 | 0 |
| Aaron Telitz | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Adam Adelson | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Adam FATHERS | shared_race_field | series_formula_ford | 0 | 16 | 0 | 7 | 0 |
| Adrian CAMPFIELD | shared_race_field | series_formula_ford | 0 | 3 | 0 | 2 | 0 |
| Alan DAVIDSON | shared_race_field | series_formula_ford | 0 | 5 | 0 | 1 | 0 |
| Alan SLATER | shared_race_field | series_formula_ford | 0 | 5 | 0 | 3 | 0 |
| Albert Costa | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alec Udell | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessandro Pier Guidi | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessandro de Tullio | shared_race_field | series_indy_nxt | 1 | 65 | 31 | 17 | 0 |
| Alessio Picariello | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessio Rovera | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alex Connor | shared_race_field | series_gb3 | 2 | 88 | 6 | 33 | 0 |
| Alex Crosbie | shared_race_field | series_froc | 0 | 51 | 0 | 6 | 0 |
| Alex FORES | shared_race_field | series_formula_ford;series_gb3 | 1 | 15 | 4 | 6 | 0 |

## Caveats

- Qualifying conversion is descriptive and source-bounded; one qualifying session can map to multiple same-event race sessions.
- Team, driver, and car context should not be used as private setup or engineering attribution.
- Track analogs use metadata similarity only; they are a browsing/prep aid, not a performance-causality model.
- Source format differences remain relevant across series and should stay visible in UI copy and filters.
