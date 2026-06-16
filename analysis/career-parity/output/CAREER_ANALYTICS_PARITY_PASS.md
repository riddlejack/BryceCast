# Career Analytics Parity Pass

Generated from canonical career dataset updated `2026-06-16T18:12:31.143Z`.

## Series Result Summary

| seriesName | raceRows | avgFinish | avgGain | avgFinishPercentile | top5Rate | top10Rate | issueLikeStatusRate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GB3 Championship | 42 | 10.738 | 0.55 | 0.498 | 0.119 | 0.429 | 0 |
| INDY NXT | 36 | 12.222 | -0.972 | 0.459 | 0.111 | 0.472 | 0.139 |
| F1600 Championship Series | 20 | 4.75 |  | 0.745 | 0.7 | 0.95 | 0 |
| Euroformula Open | 17 | 4.176 | -0.588 | 0.631 | 0.706 | 1 | 0 |
| Formula Ford | 15 | 4.733 | 0.8 | 0.862 | 0.8 | 1 | 0 |
| Castrol Toyota Formula Regional Oceania Championship | 6 | 6.167 | -0.5 | 0.676 | 0.333 | 1 | 0 |
| IMSA WeatherTech SportsCar Championship | 1 | 6 |  | 0.918 | 0 | 1 | 0 |

## Metric-Family Parity Matrix

| seriesName | metricFamily | sourceRowsOrSessions | parityStatus | uiUse | caveat |
| --- | --- | --- | --- | --- | --- |
| Euroformula Open | result_conversion | 17 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| Euroformula Open | qualifying_conversion | 6 | production_safe | Use in Career Analytics Lab. | Qualifying rows exist; display session-format and group caveats where applicable. |
| Euroformula Open | track_venue_history | 6 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| Euroformula Open | weather_context | 0 | unavailable | Show unavailable or omit from comparison charts. | No trustworthy source-backed weather rows currently available for this series. |
| Euroformula Open | lap_shape | 0 | unavailable | Show unavailable or omit from comparison charts. | No lap-sample rows currently available for Bryce in this series. |
| Euroformula Open | team_teammate_context | 160 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| Euroformula Open | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| Formula Ford | result_conversion | 15 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| Formula Ford | qualifying_conversion | 0 | unavailable_without_guessing | Show unavailable or omit from comparison charts. | No qualifying rows currently support a start-to-race conversion model for this series. |
| Formula Ford | track_venue_history | 4 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| Formula Ford | weather_context | 46 | source_bounded_partial | Use with coverage badge and denominators. | Use as ambient/session context with source and confidence labels; do not claim causal weather effects. |
| Formula Ford | lap_shape | 282 | source_bounded_partial | Use with coverage badge and denominators. | Lap row grains differ by source family; use within-series first and show coverage denominators. |
| Formula Ford | team_teammate_context | 1070 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| Formula Ford | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| Castrol Toyota Formula Regional Oceania Championship | result_conversion | 6 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| Castrol Toyota Formula Regional Oceania Championship | qualifying_conversion | 0 | unavailable_without_guessing | Show unavailable or omit from comparison charts. | No qualifying rows currently support a start-to-race conversion model for this series. |
| Castrol Toyota Formula Regional Oceania Championship | track_venue_history | 2 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| Castrol Toyota Formula Regional Oceania Championship | weather_context | 0 | unavailable | Show unavailable or omit from comparison charts. | No trustworthy source-backed weather rows currently available for this series. |
| Castrol Toyota Formula Regional Oceania Championship | lap_shape | 0 | unavailable | Show unavailable or omit from comparison charts. | No lap-sample rows currently available for Bryce in this series. |
| Castrol Toyota Formula Regional Oceania Championship | team_teammate_context | 812 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| Castrol Toyota Formula Regional Oceania Championship | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| F1600 Championship Series | result_conversion | 20 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| F1600 Championship Series | qualifying_conversion | 0 | unavailable_without_guessing | Show unavailable or omit from comparison charts. | No qualifying rows currently support a start-to-race conversion model for this series. |
| F1600 Championship Series | track_venue_history | 7 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| F1600 Championship Series | weather_context | 0 | unavailable | Show unavailable or omit from comparison charts. | No trustworthy source-backed weather rows currently available for this series. |
| F1600 Championship Series | lap_shape | 0 | unavailable | Show unavailable or omit from comparison charts. | No lap-sample rows currently available for Bryce in this series. |
| F1600 Championship Series | team_teammate_context | 527 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| F1600 Championship Series | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| GB3 Championship | result_conversion | 42 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| GB3 Championship | qualifying_conversion | 14 | production_safe | Use in Career Analytics Lab. | Qualifying rows exist; display session-format and group caveats where applicable. |
| GB3 Championship | track_venue_history | 6 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| GB3 Championship | weather_context | 39 | source_bounded_partial | Use with coverage badge and denominators. | Use as ambient/session context with source and confidence labels; do not claim causal weather effects. |
| GB3 Championship | lap_shape | 0 | unavailable | Show unavailable or omit from comparison charts. | No lap-sample rows currently available for Bryce in this series. |
| GB3 Championship | team_teammate_context | 2190 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| GB3 Championship | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| IMSA WeatherTech SportsCar Championship | result_conversion | 1 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| IMSA WeatherTech SportsCar Championship | qualifying_conversion | 0 | unavailable_without_guessing | Show unavailable or omit from comparison charts. | No qualifying rows currently support a start-to-race conversion model for this series. |
| IMSA WeatherTech SportsCar Championship | track_venue_history | 1 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| IMSA WeatherTech SportsCar Championship | weather_context | 1 | source_bounded_partial | Use with coverage badge and denominators. | Use as ambient/session context with source and confidence labels; do not claim causal weather effects. |
| IMSA WeatherTech SportsCar Championship | lap_shape | 142 | source_bounded_partial | Use with coverage badge and denominators. | Lap row grains differ by source family; use within-series first and show coverage denominators. |
| IMSA WeatherTech SportsCar Championship | team_teammate_context | 235 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| IMSA WeatherTech SportsCar Championship | section_pace | 0 | unavailable | Show unavailable or omit from comparison charts. | No official section-metric rows currently available for this series. |
| INDY NXT | result_conversion | 36 | production_safe | Use in Career Analytics Lab. | Use percentiles alongside raw finish because field sizes and formats vary by series. |
| INDY NXT | qualifying_conversion | 61 | production_safe | Use in Career Analytics Lab. | Qualifying rows exist; display session-format and group caveats where applicable. |
| INDY NXT | track_venue_history | 13 | production_safe | Use in Career Analytics Lab. | Venue and track-type coverage comes from canonical event and track metadata. |
| INDY NXT | weather_context | 95 | source_bounded_partial | Use with coverage badge and denominators. | INDY NXT weather is modeled non-official; context only. |
| INDY NXT | lap_shape | 1390 | source_bounded_partial | Use with coverage badge and denominators. | Lap row grains differ by source family; use within-series first and show coverage denominators. |
| INDY NXT | team_teammate_context | 2805 | source_bounded_partial | Use with coverage badge and denominators. | Full-field results support descriptive team/teammate context, not engineering root-cause attribution. |
| INDY NXT | section_pace | 291 | source_bounded_partial | Use with coverage badge and denominators. | Section metrics are currently INDY NXT-only and need denominator badges for sparse sessions. |

## Modeling Priority

| seriesName | raceRows | parityScore | recommendedDepth |
| --- | --- | --- | --- |
| GB3 Championship | 42 | 17 | next_deep_dive_candidate |
| INDY NXT | 36 | 20.6 | reference_model_complete_for_ui_contract |
| Formula Ford | 15 | 13.5 | lap_weather_specialist_pass |
| Euroformula Open | 17 | 12.7 | result_conversion_pass |
| IMSA WeatherTech SportsCar Championship | 1 | 12.1 | standalone_daytona_feature |
| F1600 Championship Series | 20 | 10 | result_conversion_pass |
| Castrol Toyota Formula Regional Oceania Championship | 6 | 8.6 | lightweight_context_only |

## Interpretation

- Production-safe metric-family rows: 17.
- Source-bounded partial metric-family rows: 15.
- GB3 is the best next historic deep-dive candidate because it has the largest non-INDY race-result set plus qualifying and weather support.
- Formula Ford is valuable for weather and lap-shape context, but its source shape differs from INDY NXT and should be labeled separately.
- IMSA should remain a standalone Daytona feature rather than a broad career comparison axis.

## Agent Navigation Notes

- This pass is a metric-family screen, not a full historical deep dive. It identifies which series deserve deeper modeling next.
- Team and teammate context counts use full-field session-result rows, so later UI work should split race-result context from practice/qualifying context.
- Cross-series comparisons should use finish percentiles and coverage badges, because field sizes, source families, and session formats differ.
- Warehouse setup is deferred; this report intentionally reads the canonical local dataset and writes only under `analysis/`.
