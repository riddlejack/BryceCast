# GB3 Historic Analytics Deep Dive

## Executive Summary

- **GB3 is now source-ready for result-conversion product modules.** The canonical dataset contains 44 Bryce GB3 race rows across 15 events, with 0.114 top-five rate, 0.409 top-ten rate, and 0.498 average finish percentile.
- **The analysis must keep 2021 and 2022 source families visibly separated.** 2021 TSL PDFs support source-backed starts and official weather/track condition strings; 2022 GB3 JSON supports broader official result volume and pit-stop count fields. A combined GB3 card is safe for result conversion, while detail modules need source-family badges.
- **Qualifying-to-race context is useful but uneven.** The pass finds 22 Bryce qualifying context rows: 14 from 2021 `qualifyingResults` rows and 8 from 2022 qualifying session result rows. Start-to-finish conversion is source-backed only where starts exist.
- **Lap-shape and section-pace claims are unsupported for GB3.** The canonical GB3 slice has zero Bryce lap samples and zero official section metrics, so the UI should omit lap traces, stint shape, sector shape, and section pace modules for this series.

## Source-Bounded Module Readiness

| sourceFamily | events | sessions | bryceRaceRows | qualifyingContextRows | gridStartRaceRows | weatherConditionRows | pitStopCountRaceRows | lapSampleRows | sectionMetricRows | analysisStatus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021 TSL official PDFs | 7 | 39 | 20 | 14 | 369 | 39 | 0 | 0 | 0 | complete_source_bounded |
| 2022 GB3 official JSON | 8 | 77 | 24 | 8 | 0 | 0 | 513 | 0 | 0 | complete_source_bounded |
| GB3 combined | 15 | 116 | 44 | 22 | 369 | 39 | 513 | 0 | 0 | complete_with_source_family_split |

**Product implication:** GB3 can power a Career Analytics Lab section with result conversion, event summaries, source-family badges, team-result context, track profiles, and official 2021 condition context. It should not power lap-position charts, section pace, tire or pit strategy, or engineering-root-cause language.

## Result Conversion And Season Shape

| seasonYear | raceRows | avgFinish | medianFinish | avgFinishPercentile | top5Rate | top10Rate | avgPositionGainWhenStartKnown | startKnownRows | points |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021 | 20 | 9.8 | 10.5 | 0.492 | 0.1 | 0.5 | 0.55 | 20 |  |
| 2022 | 24 | 11.591 | 12 | 0.503 | 0.125 | 0.333 |  | 0 | 215 |

**Interpretation:** The combined GB3 race record is strongest when normalized by field size. Raw finish varies across fields of 16 to 23 cars, so finish percentile should travel with every UI stat. Start-to-finish gain should appear only for 2021 rows, because 2022 official JSON does not expose source-backed grid or start fields.

## Event-Level Readout

| seasonYear | eventName | trackName | raceRows | avgFinish | bestFinish | avgFinishPercentile | avgPositionGainWhenStartKnown | bestQualifyingPosition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022 | GB3 2022 Round 8 - Donington Park | Donington Park | 3 | 7.333 | 3 | 0.683 |  | 3 |
| 2022 | GB3 2022 Round 7 - Brands Hatch | Brands Hatch Circuit | 3 | 8.333 | 7 | 0.667 |  | 9 |
| 2021 | GB3 2021 Round 7 - Donington Park | Donington Park | 3 | 8.333 | 6 | 0.651 | 3.333 | 12 |
| 2021 | GB3 2021 Round 1 - Brands Hatch | Brands Hatch Circuit | 3 | 7.667 | 4 | 0.649 | 2.667 | 12 |
| 2022 | GB3 2022 Round 3 - Donington Park | Donington Park | 3 | 10.667 | 1 | 0.561 |  | 21 |
| 2022 | GB3 2022 Round 4 - Snetterton | Snetterton Circuit | 3 | 12 | 11 | 0.5 |  | 15 |

**UI use:** Event cards can show best finish, average finish percentile, known start conversion, and qualifying context. They need a visible source badge because 2021 and 2022 expose different detail fields.

## Qualifying-To-Race Conversion

| seasonYear | eventName | raceNumber | startPosition | finishPosition | positionGain | qPrimaryPosition | qSecondFastestPosition | qBestToFinishDelta | sourceFamily |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 1 | 12 | 10 | 2 | 12 | 12 | 2 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 2 | 11 | 9 | 2 | 12 | 12 | 3 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 3 | 8 | 4 | 4 | 12 | 12 | 8 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 2 - Silverstone | 1 | 13 | 9 | 4 | 12 | 11 | 2 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 2 - Silverstone | 2 | 11 | 11 | 0 | 12 | 11 | 0 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 3 - Donington Park | 1 | 12 | 13 | -1 | 12 | 12 | -1 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 3 - Donington Park | 2 | 12 | 11 | 1 | 12 | 12 | 1 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 3 - Donington Park | 3 | 6 | 4 | 2 | 12 | 12 | 8 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 1 | 9 | 10 | -1 | 10 | 9 | -1 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 2 | 9 | 11 | -2 | 10 | 9 | -2 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 3 | 7 | 14 | -7 | 10 | 9 | -5 | 2021 TSL official PDFs |
| 2021 | GB3 2021 Round 5 - Snetterton | 1 | 12 | 11 | 1 | 12 | 6 | -5 | 2021 TSL official PDFs |

**Interpretation:** 2021 supports the cleanest conversion story because official grid PDFs back every race start. 2022 supports qualifying rank context from official JSON result rows, but the source does not expose race starts, so any "from grid" claim would be unsupported.

## Track And Venue Profile

| trackName | trackType | layoutLengthKm | direction | raceRows | avgFinish | bestFinish | avgFinishPercentile | startKnownRows |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Brands Hatch Circuit | road |  | clockwise | 6 | 8 | 4 | 0.658 | 3 |
| Circuit de Spa-Francorchamps | road |  | clockwise | 6 | 13.167 | 9 | 0.356 | 3 |
| Donington Park | road |  | clockwise | 12 | 8.917 | 1 | 0.598 | 6 |
| Oulton Park | road |  | clockwise | 6 | 13.167 | 8 | 0.353 | 3 |
| Silverstone Circuit | road |  | clockwise | 8 | 12 | 3 | 0.432 | 2 |
| Snetterton Circuit | road |  | clockwise | 6 | 10.8 | 6 | 0.5 | 3 |

**Interpretation:** Track modules should present venue history as descriptive GB3 sample context. The sample is too small for track-strength claims, but it is useful for upcoming-weekend memory and cross-series career navigation.

## Weather And Track-Condition Context

| wetDry | sessionRows | raceRows | avgRaceFinish | avgRaceFinishPercentile |
| --- | --- | --- | --- | --- |
| dry | 17 | 17 | 9.824 | 0.491 |
| wet | 3 | 3 | 9.667 | 0.498 |

**Interpretation:** Official 2021 TSL weather/track strings are safe as context labels. They contain categorical weather and wet/dry track state, with no ambient temperature, humidity, wind, or precipitation values. The UI should avoid causal weather effects and should show 2022 weather as unavailable.

## Team Context

| seasonYear | eventName | raceNumber | teamName | teamRaceDriverCount | teammateCount | bryceFinishPosition | bryceWithinTeamRank | teamBestFinish | teammateBestFinish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 1 | Carlin | 3 | 2 | 10 | 3 | 3 | 3 |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 2 | Carlin | 3 | 2 | 9 | 2 | 1 | 1 |
| 2021 | GB3 2021 Round 1 - Brands Hatch | 3 | Carlin | 3 | 2 | 4 | 2 | 1 | 1 |
| 2021 | GB3 2021 Round 2 - Silverstone | 1 | Carlin | 3 | 2 | 9 | 3 | 2 | 2 |
| 2021 | GB3 2021 Round 2 - Silverstone | 2 | Carlin | 3 | 2 | 11 | 3 | 2 | 2 |
| 2021 | GB3 2021 Round 3 - Donington Park | 1 | Carlin | 3 | 2 | 13 | 3 | 1 | 1 |
| 2021 | GB3 2021 Round 3 - Donington Park | 2 | Carlin | 3 | 2 | 11 | 3 | 1 | 1 |
| 2021 | GB3 2021 Round 3 - Donington Park | 3 | Carlin | 3 | 2 | 4 | 1 | 4 | 6 |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 1 | Carlin | 3 | 2 | 10 | 3 | 1 | 1 |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 2 | Carlin | 3 | 2 | 11 | 3 | 2 | 2 |
| 2021 | GB3 2021 Round 4 - Spa-Francorchamps | 3 | Carlin | 3 | 2 | 14 | 3 | 5 | 5 |
| 2021 | GB3 2021 Round 5 - Snetterton | 1 | Carlin | 3 | 2 | 11 | 2 | 7 | 7 |

**Interpretation:** Full-field race results support descriptive team context for Carlin in 2021 and Hitech Pulse-Eight in 2022. This context can answer "where did Bryce sit within the team result order" but cannot explain car setup, engineering, reliability, strategy, or teammate parity quality.

## Historic Analytics Roadmap

| seriesName | rankScore | raceRows | qualifyingContextRows | weatherRows | lapSampleRows | gridStartCoveragePct | recommendedDepth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Formula Ford | 57.127 | 17 | 7 | 46 | 282 | 0.991 | lap_weather_specialist_pass |
| IMSA WeatherTech SportsCar Championship | 32.16 | 1 | 0 | 1 | 142 | 0 | standalone_daytona_feature |
| Euroformula Open | 30.86 | 18 | 6 | 0 | 0 | 1 | result_and_qualifying_conversion_pass |
| F1600 Championship Series | 22.727 | 21 | 6 | 0 | 0 | 0 | result_conversion_plus_penalty_context_pass |
| Castrol Toyota Formula Regional Oceania Championship | 21.804 | 6 | 5 | 0 | 0 | 0.931 | context_only_or_grid_completion_followup |

**Recommendation:** Run Formula Ford next if the product wants the richest early-career specialist story, especially because it has official wet/dry condition rows and Bryce-only lap-analysis samples. Keep IMSA as a standalone Daytona feature because the source shape is endurance-specific and one-event deep.

## Caveats And Assumptions

- Source authority: `data/career/career.dataset.json`, `data/career/reports/ingestion-summary.json`, and `data/career/reports/validation-report.json` control this pass.
- Validation state: `validationOk=True`, errors=0, warnings=1, openGaps=10.
- Current canonical counts: events=87, sessions=483, results=8494, qualifyingResults=1739, lapSamples=70061, weatherObservations=199, sourceEvidence=1266.
- GB3 2022 has an open source gap for session 1248 JSON returning 404. Treat row-level missingness there as source-broken rather than model-inferable.
- No GB3 telemetry, setup notes, tire data, pit sequence, lap-position samples, or section metrics exist in the canonical dataset.

## Output Tables

- `tables/gb3_bryce_race_results.csv`
- `tables/gb3_event_summary.csv`
- `tables/gb3_qualifying_context.csv`
- `tables/gb3_track_profile.csv`
- `tables/gb3_weather_context.csv`
- `tables/gb3_team_context.csv`
- `tables/gb3_source_family_audit.csv`
- `tables/historic_analytics_roadmap.csv`
