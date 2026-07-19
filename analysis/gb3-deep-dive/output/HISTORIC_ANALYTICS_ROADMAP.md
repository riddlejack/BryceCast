# Historic Analytics Roadmap After GB3

## Ranked Roadmap

| seriesName | rankScore | raceRows | qualifyingContextRows | weatherRows | lapSampleRows | gridStartCoveragePct | recommendedDepth | confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Formula Ford | 57.127 | 17 | 7 | 46 | 282 | 0.991 | lap_weather_specialist_pass | high |
| IMSA WeatherTech SportsCar Championship | 32.16 | 1 | 0 | 1 | 142 | 0 | standalone_daytona_feature | high |
| Euroformula Open | 30.86 | 18 | 6 | 0 | 0 | 1 | result_and_qualifying_conversion_pass | high |
| F1600 Championship Series | 22.727 | 21 | 6 | 0 | 0 | 0 | result_conversion_plus_penalty_context_pass | high |
| Castrol Toyota Formula Regional Oceania Championship | 21.804 | 6 | 5 | 0 | 0 | 0.931 | context_only_or_grid_completion_followup | medium |

## Recommended Order

1. **Formula Ford:** Run a specialist pass focused on wet/dry official condition rows, Bryce-only lap-analysis samples, grid/start coverage, and event progression. This is the richest next early-career story, with caveats around Bryce-only lap samples and partial source-asymmetry holdouts.
2. **IMSA Daytona:** Run as a standalone endurance feature, separate from single-seater parity. The value is lap-sample depth, official condition context, pit count rows, and full-field class context for one event.
3. **Euroformula Open:** Run a clean result and qualifying conversion pass. The source shape is strong for result, grid, qualifying, and track context, while weather and lap shape remain unavailable.
4. **FRP F1600:** Run after the higher-signal lanes if early-career chronology needs a fuller bridge. It has more race rows than Euroformula but lacks source-backed starts, weather, and lap samples.
5. **FROC:** Keep as lightweight context until the product needs New Zealand winter-series framing or a specific grid-rule follow-up. Current result depth is small and derived benchmarks remain blocked.

## Product Boundary

Cross-series UI should normalize by finish percentile and carry coverage badges. Field sizes, session formats, and source families differ enough that raw finish comparisons alone are misleading.
