# Context Event Narrative Layer

Generated: 2026-07-19T02:51:54Z
Source hash: `900ddfcb701b1977f16e33501302742c328980f5ffcccd190d2e433bba0b5681`

## Source Scope

This lane normalizes canonical non-lap context collections into product-ready artifacts without editing ingestion-owned files. The output covers racecraft events, penalties, incidents, weather observations, media assets, source evidence, source-boundary gaps, and remaining derived metric context.

| collection | rows |
| --- | --- |
| media | 1010 |
| penalty | 86 |
| weather | 199 |
| incident | 144 |
| racecraft | 39 |

## What Became Productized

- A row-level context timeline for every canonical racecraft, penalty, incident, weather, and media row.
- Session and series rollups suitable for prep cards, source drawers, and career lab filtering.
- Weather/condition rows with source confidence and join caveats preserved.
- Media and source-evidence indexes that make rights, source type, parser, raw artifact, and confidence queryable.
- A row-level source-boundary gap index covering every canonical gap row for Source Ops, unavailable states, and caveat routing.
- Derived metric context rows that keep official INDY NXT section/leader/event-summary metrics and career milestones addressable from one semantic layer.

## Context Timeline

| seriesName | seasonYear | eventName | sessionType | totalContextRows | incidentCount | penaltyCount | weatherCount | mediaCount |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INDY NXT | 2025 | Grand Prix of Monterey Race 2 | race | 23 | 8 | 6 | 1 | 7 |
| INDY NXT | 2026 | Detroit Grand Prix | race | 20 | 6 | 6 | 1 | 6 |
| INDY NXT | 2024 | Detroit Grand Prix | race | 19 | 7 | 4 | 1 | 6 |
| INDY NXT | 2025 | Detroit Grand Prix | race | 19 | 7 | 4 | 1 | 6 |
| INDY NXT | 2026 | Grand Prix of St. Petersburg | race | 19 | 8 | 2 | 1 | 7 |
| INDY NXT | 2024 | OUTFRONT Showdown | race | 17 | 8 | 1 | 1 | 6 |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | race | 17 | 8 | 1 | 1 | 6 |
| INDY NXT | 2026 | Grand Prix of Arlington | race | 17 | 4 | 4 | 1 | 7 |
| INDY NXT | 2026 | Indianapolis Grand Prix Race 2 | race | 17 | 1 | 7 | 1 | 7 |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | race | 16 | 2 | 5 | 1 | 7 |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | race | 16 | 5 | 2 | 1 | 7 |
| INDY NXT | 2024 | Grand Prix of Monterey Race 2 | race | 16 | 3 | 4 | 1 | 7 |

## Source Evidence

| sourceType | rows |
| --- | --- |
| official_pdf | 754 |
| official_api | 282 |
| official_page | 117 |
| weather_api | 84 |
| official_html | 16 |
| official_image | 5 |
| official_article | 4 |
| archived_official_page | 2 |
| official_json | 2 |

## Source Boundary Gaps

| status | rows |
| --- | --- |
| open | 7 |
| partial | 2 |
| source_broken_preserved | 1 |

## Derived Metric Context

| metricType | rows |
| --- | --- |
| official_top_section_times | 160 |
| official_section_results | 159 |
| official_event_summary_race_stats | 40 |
| official_leader_lap_summary | 39 |
| karting_championship_milestone | 2 |
| karting_fast_time | 2 |
| career_award | 1 |
| karting_track_record | 1 |
| season_context_milestone | 1 |

## Weather And Media

- Weather/condition rows: 199.
- Media index rows: 1010.
- Source-evidence rows: 1266.
- Source-boundary gap rows: 10.
- Derived metric rows: 405.

## Series Coverage

| seriesName | seasonYears | totalContextRows | racecraftCount | penaltyCount | incidentCount | weatherCount | mediaCount |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INDY NXT | 2024; 2025; 2026 | 1128 | 39 | 80 | 144 | 113 | 752 |
| GB3 Championship | 2021; 2022 | 180 | 0 | 0 | 0 | 39 | 141 |
| Formula Ford | 2020 | 61 | 0 | 4 | 0 | 46 | 11 |
| F1600 Championship Series | 2019 | 39 | 0 | 2 | 0 | 0 | 37 |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | 32 | 0 | 0 | 0 | 0 | 32 |
| Euroformula Open | 2023 | 28 | 0 | 0 | 0 | 0 | 28 |
| Global / career context |  | 5 | 0 | 0 | 0 | 0 | 5 |
| IMSA WeatherTech SportsCar Championship | 2025 | 5 | 0 | 0 | 0 | 1 | 4 |

## Caveats

- These artifacts support context, explainability, and source-backed browsing; they do not turn source notes into private telemetry or point forecasts.
- Rights status must gate media display. Link-only material should be treated as source metadata unless a later product lane adds approved display rules.
- Weather observations inherit their source confidence, time confidence, location confidence, and join notes from the canonical dataset.
- Source-evidence lineage indexes imported sources and raw-artifact references; it does not assert that the outside world has no further sources.
- Gap rows are productized as source-boundary context only; an open gap is not a performance claim.
