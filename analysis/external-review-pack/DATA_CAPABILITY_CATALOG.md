# Data Capability Catalog

This file summarizes categories and granularity. The full canonical dataset is intentionally not duplicated into the review pack.

## Canonical Collection Counts

| Collection | Rows |
| --- | --- |
| drivers | 555 |
| series | 7 |
| teams | 75 |
| cars | 472 |
| tracks | 42 |
| seasons | 10 |
| events | 87 |
| sessions | 469 |
| results | 8158 |
| qualifyingResults | 1547 |
| lapSamples | 67686 |
| racecraftEvents | 35 |
| penalties | 82 |
| incidents | 132 |
| derivedMetrics | 370 |
| weatherObservations | 181 |
| mediaAssets | 940 |
| sourceEvidence | 1199 |
| gaps | 9 |
| broadcastRoutes | 0 |
| notificationEvents | 0 |
| notificationRules | 0 |

## Career Chapter / Series Matrix

| Series | Years | Events | Sessions | Result rows | Bryce result rows | Qualifying rows | Lap samples | Weather rows | Incidents | Penalties |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | 5 | 52 | 832 | 20 | 0 | 0 | 0 | 0 | 0 |
| Euroformula Open | 2023 | 7 | 28 | 178 | 18 | 61 | 0 | 0 | 0 | 0 |
| F1600 Championship Series | 2019 | 7 | 37 | 564 | 37 | 0 | 0 | 0 | 0 | 2 |
| Formula Ford | 2020 | 7 | 46 | 1094 | 24 | 0 | 282 | 46 | 0 | 4 |
| GB3 Championship | 2021, 2022 | 15 | 116 | 2304 | 114 | 248 | 0 | 39 | 0 | 0 |
| IMSA WeatherTech SportsCar Championship | 2025 | 1 | 1 | 236 | 1 | 0 | 37885 | 1 | 0 | 0 |
| INDY NXT | 2024, 2025, 2026 | 45 | 189 | 2950 | 145 | 1238 | 29519 | 95 | 132 | 76 |

## Cross-Cutting Fields

- Track metadata: 42 tracks with coordinates/timezone/length/direction/surface/corner count coverage in the generated matrix; Arlington remains medium-confidence in the handoff because it is a future temporary circuit.
- Weather/track condition: 181 rows total. INDY NXT weather is non-official modeled ambient weather for eligible exact-window sessions with station cross-checks; IMSA includes official Al Kamel/IMSA race condition fields; older series vary.
- Source evidence/media: 1,199 source evidence rows and 940 media assets feed lineage, source drawers, and caveats.
- Incidents/penalties/racecraft: INDY NXT has the strongest official race context. Absence in other series usually means unavailable source family, not proof nothing occurred.
- Lap granularity: INDY NXT has official lap charts and section rows; IMSA Daytona has official time-card laps/stints; Formula Ford has Bryce-labeled lap-analysis blocks; most other series do not expose lap samples.
- USF Pro 2000 / USF2000: no canonical series rows are present in the current `bryce-career.v1` dataset. Treat that coverage as absent unless a future ingestion-owned source is explicitly introduced.

## Source Evidence Mix

| Source type | Rows |
| --- | --- |
| archived_official_page | 2 |
| official_pdf | 711 |
| official_page | 117 |
| official_api | 264 |
| official_html | 16 |
| official_image | 5 |
| official_article | 4 |
| official_json | 2 |
| weather_api | 78 |

| Confidence tier | Rows |
| --- | --- |
| official | 1081 |
| high | 38 |
| medium | 80 |

| Weather source type | Rows |
| --- | --- |
| series_report | 86 |
| grid_reanalysis | 95 |

## Known Validation Caveat

Validation currently has 0 errors and 1 warning. The warning is: 9 physical sessions do not yet have scheduledStart or actualStart. Weather/live joins must wait for session time backfill.

## Machine-Readable Version

See `sample-payloads/data-capability-summary.json` for counts, per-series rows, and coverage categories.
