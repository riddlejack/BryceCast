# Career Dimension Context Layer

Generated: 2026-06-18T10:49:58Z
Source hash: `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`

## Source Scope

This lane covers 8158 result rows, 1547 qualifying rows, 75 team rows, 42 tracks, 555 drivers, and 472 cars from the canonical dataset.

## What Became Productized

- Full-field result rows with driver, team, car, series, track, field-size, finish-percentile, status, penalty, incident, and provenance context.
- Qualifying-result rows with same-event race-result conversion joins and source-state labels.
- Team and team-era context across observed cars, qualifying rows, result rows, drivers, and Bryce usage.
- Track venue context, weather/readiness metadata, and metadata-based analog rows.
- Driver cohort context for Bryce, teammate overlap, shared race fields, competitors, co-drivers, and identity-only rows.
- Car/entrant context across series, season, team, class, usage rows, and Bryce observation flags.

## Qualifying Conversion

- One-to-one same-event race-result joins: 1240 of 1547 qualifying rows.
- Ambiguous multi-race same-event joins: 307 qualifying rows.
- Full-field result context rows: 8158.

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
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Combined Qualifications | 21 | 21 | 8 |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 2 | Combined Qualifications - Race 2 | 21 | 21 | 18 |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Combined Qualifications - Race 1 | 21 | 21 | 18 |
| INDY NXT | 2024 | Grand Prix of Alabama | Combined Qualifications | 20 | 20 | 7 |

## Team And Entrant Context

| teamName | observedSeriesIds | seasonYears | carCount | driverCount | qualifyingRows | resultRows | bryceObserved |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HMD Motorsports | series_indy_nxt | 2024;2025;2026 | 23 | 28 | 449 | 1086 | no |
| Andretti Global | series_indy_nxt | 2024;2025;2026 | 12 | 10 | 241 | 576 | no |
| Abel Motorsports | series_indy_nxt | 2024;2025;2026 | 11 | 9 | 189 | 450 | no |
| Elite Motorsport | series_gb3 | 2021;2022 | 8 | 6 | 40 | 316 | no |
| Fortec Motorsports | series_gb3 | 2021;2022 | 8 | 9 | 38 | 316 | no |
| Douglas Motorsport | series_gb3 | 2021;2022 | 5 | 6 | 22 | 268 | no |
| Cape Motorsports powered by ECR | series_indy_nxt | 2024;2025;2026 | 6 | 6 | 96 | 242 | no |
| Chip Ganassi Racing | series_indy_nxt | 2025;2026 | 6 | 5 | 104 | 238 | no |
| Rodin Carlin | series_gb3 | 2022 | 3 | 3 | 0 | 228 | no |
| Hitech Pulse-Eight | series_gb3 | 2022 | 3 | 3 | 0 | 227 | no |
| Arden VRD | series_gb3 | 2022 | 3 | 3 | 0 | 201 | no |
| Chris Dittmann Racing | series_gb3 | 2022 | 4 | 4 | 0 | 161 | no |

| teamName | seriesName | seasonYear | carCount | driverCount | qualifyingRows | resultRows | bryceRows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HMD Motorsports | INDY NXT | 2024 | 10 | 13 | 221 | 539 | 0 |
| HMD Motorsports | INDY NXT | 2025 | 9 | 14 | 168 | 419 | 5 |
| Rodin Carlin | GB3 Championship | 2022 | 3 | 3 | 0 | 228 | 0 |
| Andretti Global | INDY NXT | 2024 | 4 | 4 | 92 | 227 | 80 |
| Hitech Pulse-Eight | GB3 Championship | 2022 | 3 | 3 | 0 | 227 | 76 |
| Andretti Global | INDY NXT | 2025 | 4 | 4 | 89 | 221 | 0 |
| Fortec Motorsports | GB3 Championship | 2022 | 3 | 3 | 0 | 210 | 0 |
| Douglas Motorsport | GB3 Championship | 2022 | 3 | 3 | 0 | 208 | 0 |
| Elite Motorsport | GB3 Championship | 2022 | 4 | 4 | 0 | 204 | 0 |
| Arden VRD | GB3 Championship | 2022 | 3 | 3 | 0 | 201 | 0 |
| Abel Motorsports | INDY NXT | 2025 | 3 | 3 | 67 | 166 | 0 |
| Chris Dittmann Racing | GB3 Championship | 2022 | 4 | 4 | 0 | 161 | 0 |

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
| Adam FATHERS | shared_race_field | series_formula_ford | 0 | 7 | 0 | 3 | 0 |
| Adrian CAMPFIELD | shared_race_field | series_formula_ford | 0 | 3 | 0 | 2 | 0 |
| Albert Costa | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alec Udell | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessandro Pier Guidi | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessandro de Tullio | shared_race_field | series_indy_nxt | 1 | 32 | 15 | 8 | 0 |
| Alessio Picariello | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alessio Rovera | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alex Connor | shared_race_field | series_gb3 | 2 | 88 | 6 | 32 | 0 |
| Alex Crosbie | shared_race_field | series_froc | 0 | 51 | 0 | 6 | 0 |
| Alex FORES | shared_race_field | series_formula_ford;series_gb3 | 1 | 15 | 4 | 6 | 0 |
| Alex Palou | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |
| Alex Riberas | shared_race_field | series_imsa_weathertech | 1 | 1 | 0 | 1 | 0 |

## Caveats

- Qualifying conversion is descriptive and source-bounded; one qualifying session can map to multiple same-event race sessions.
- Team, driver, and car context should not be used as private setup or engineering attribution.
- Track analogs use metadata similarity only; they are a browsing/prep aid, not a performance-causality model.
- Source format differences remain relevant across series and should stay visible in UI copy and filters.
